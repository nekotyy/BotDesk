import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import Store from 'electron-store';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_BOTS = 15;
const API_TIMEOUT_MS = 20_000;

const store = new Store({
  name: 'botdesk-state',
  defaults: {
    bots: [],
    selectedBotId: null,
    chatsByBot: {},
    messagesByBot: {},
    updateOffsets: {},
  },
});

function publicState() {
  const bots = store.get('bots', []).map(({ tokenSecret: _secret, token: _legacy, ...bot }) => bot);
  return {
    bots,
    selectedBotId: store.get('selectedBotId', null),
    chatsByBot: store.get('chatsByBot', {}),
    messagesByBot: store.get('messagesByBot', {}),
  };
}

function encryptToken(token) {
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(token).toString('base64')}`;
  }
  return `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
}

function decryptToken(bot) {
  if (bot.tokenSecret?.startsWith('safe:')) {
    return safeStorage.decryptString(Buffer.from(bot.tokenSecret.slice(5), 'base64'));
  }
  if (bot.tokenSecret?.startsWith('plain:')) {
    return Buffer.from(bot.tokenSecret.slice(6), 'base64').toString('utf8');
  }
  if (bot.token) return bot.token;
  throw new Error('Токен бота не найден. Добавьте бота заново.');
}

function getBot(botId) {
  const bot = store.get('bots', []).find((item) => item.id === botId);
  if (!bot) throw new Error('Бот не найден');
  return bot;
}

function setBot(botId, patch) {
  const bots = store.get('bots', []);
  store.set('bots', bots.map((bot) => (bot.id === botId ? { ...bot, ...patch } : bot)));
}

function cleanTelegramError(description = '') {
  if (/terminated by other getUpdates/i.test(description)) return 'Синхронизация уже запущена в другом приложении.';
  if (/webhook is active/i.test(description)) return 'У бота включён webhook. Отключите его перед синхронизацией через getUpdates.';
  if (/unauthorized/i.test(description)) return 'Telegram отклонил токен. Проверьте его в BotFather.';
  if (/chat not found/i.test(description)) return 'Чат не найден или пользователь ещё не начинал диалог с ботом.';
  if (/bot was blocked/i.test(description)) return 'Пользователь заблокировал бота.';
  return description || 'Telegram API вернул ошибку';
}

async function telegram(token, method, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(cleanTelegramError(data.description));
    return data.result;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Telegram не ответил вовремя. Проверьте соединение и повторите.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function chatTitle(chat) {
  return chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || `ID ${chat.id}`;
}

function normalizeChat(chat, lastMessage, previous = {}) {
  return {
    ...previous,
    id: String(chat.id),
    telegramId: chat.id,
    type: chat.type,
    title: chatTitle(chat),
    firstName: chat.first_name,
    lastName: chat.last_name,
    username: chat.username,
    lastMessage: lastMessage?.text || lastMessage?.caption || previous.lastMessage || '',
    lastMessageAt: lastMessage?.date ? new Date(lastMessage.date * 1000).toISOString() : previous.lastMessageAt,
    unreadCount: previous.unreadCount || 0,
  };
}

function upsertChat(botId, nextChat) {
  const all = store.get('chatsByBot', {});
  const chats = all[botId] || [];
  const index = chats.findIndex((chat) => chat.id === nextChat.id);
  const merged = index >= 0 ? chats.map((chat, i) => (i === index ? { ...chat, ...nextChat } : chat)) : [nextChat, ...chats];
  merged.sort((a, b) => Date.parse(b.lastMessageAt || '1970-01-01') - Date.parse(a.lastMessageAt || '1970-01-01'));
  store.set('chatsByBot', { ...all, [botId]: merged });
}

function addMessage(botId, chatId, message) {
  const all = store.get('messagesByBot', {});
  const byBot = all[botId] || {};
  const messages = byBot[chatId] || [];
  if (message.telegramId && messages.some((item) => item.telegramId === message.telegramId)) return;
  store.set('messagesByBot', {
    ...all,
    [botId]: { ...byBot, [chatId]: [...messages, message].slice(-2000) },
  });
}

async function profilePhotoFileId(token, userId) {
  try {
    const photos = await telegram(token, 'getUserProfilePhotos', { user_id: userId, offset: 0, limit: 1 });
    return photos.photos?.[0]?.at(-1)?.file_id;
  } catch {
    return undefined;
  }
}

async function syncBot(botId) {
  const bot = getBot(botId);
  const token = decryptToken(bot);
  setBot(botId, { status: 'syncing' });
  try {
    const offsets = store.get('updateOffsets', {});
    const updates = await telegram(token, 'getUpdates', {
      offset: offsets[botId] || 0,
      limit: 100,
      timeout: 0,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
    });
    let maxUpdateId = offsets[botId] || 0;
    const photoQueue = [];

    for (const update of updates) {
      maxUpdateId = Math.max(maxUpdateId, update.update_id + 1);
      const message = update.message || update.edited_message || update.channel_post;
      if (!message?.chat) continue;
      const chatId = String(message.chat.id);
      const existing = (store.get('chatsByBot', {})[botId] || []).find((item) => item.id === chatId);
      const normalized = normalizeChat(message.chat, message, existing);
      normalized.unreadCount = (existing?.unreadCount || 0) + 1;
      upsertChat(botId, normalized);
      addMessage(botId, chatId, {
        id: `${message.chat.id}:${message.message_id}`,
        telegramId: message.message_id,
        chatId,
        text: message.text || message.caption || '[Медиа-сообщение]',
        direction: 'incoming',
        senderName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.chat.title || 'Пользователь',
        sentAt: new Date(message.date * 1000).toISOString(),
        status: 'sent',
      });
      if (message.chat.type === 'private' && !existing?.avatarFileId) {
        photoQueue.push({ chatId, userId: message.chat.id });
      }
    }

    await Promise.all(photoQueue.slice(0, 20).map(async ({ chatId, userId }) => {
      const avatarFileId = await profilePhotoFileId(token, userId);
      if (avatarFileId) {
        const chat = (store.get('chatsByBot', {})[botId] || []).find((item) => item.id === chatId);
        if (chat) upsertChat(botId, { ...chat, avatarFileId });
      }
    }));

    store.set('updateOffsets', { ...offsets, [botId]: maxUpdateId });
    setBot(botId, { status: 'online', lastSyncAt: new Date().toISOString() });
    return publicState();
  } catch (error) {
    setBot(botId, { status: 'offline' });
    throw error;
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 850,
    minWidth: 900,
    minHeight: 620,
    title: 'BotDesk',
    backgroundColor: '#eaf0f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('bot:add', async (_event, input) => {
    const name = String(input?.name || '').trim();
    const token = String(input?.token || '').trim();
    if (!name) throw new Error('Укажите название бота.');
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new Error('Токен выглядит неверно. Скопируйте его целиком из BotFather.');
    const bots = store.get('bots', []);
    if (bots.length >= MAX_BOTS) throw new Error('Можно добавить не больше 15 ботов.');
    if (bots.some((bot) => bot.name.toLowerCase() === name.toLowerCase())) throw new Error('Бот с таким названием уже есть.');
    const me = await telegram(token, 'getMe');
    if (bots.some((bot) => bot.telegramId === me.id)) throw new Error('Этот Telegram-бот уже добавлен.');
    const bot = {
      id: uuid(), name, username: me.username || '', telegramId: me.id,
      tokenSecret: encryptToken(token), createdAt: new Date().toISOString(), status: 'online',
    };
    store.set('bots', [...bots, bot]);
    store.set('selectedBotId', bot.id);
    return publicState();
  });
  ipcMain.handle('bot:remove', (_event, botId) => {
    getBot(botId);
    const bots = store.get('bots', []).filter((bot) => bot.id !== botId);
    const chatsByBot = { ...store.get('chatsByBot', {}) };
    const messagesByBot = { ...store.get('messagesByBot', {}) };
    const offsets = { ...store.get('updateOffsets', {}) };
    delete chatsByBot[botId]; delete messagesByBot[botId]; delete offsets[botId];
    store.set({ bots, chatsByBot, messagesByBot, updateOffsets: offsets, selectedBotId: bots[0]?.id || null });
    return publicState();
  });
  ipcMain.handle('bot:select', (_event, botId) => {
    getBot(botId); store.set('selectedBotId', botId); return publicState();
  });
  ipcMain.handle('bot:sync', (_event, botId) => syncBot(botId));
  ipcMain.handle('chat:find', async (_event, botId, rawUserId) => {
    const userId = String(rawUserId || '').trim();
    if (!/^-?\d+$/.test(userId)) throw new Error('ID должен содержать только цифры.');
    const bot = getBot(botId); const token = decryptToken(bot);
    const chat = await telegram(token, 'getChat', { chat_id: userId });
    const normalized = normalizeChat(chat, undefined);
    if (chat.type === 'private') normalized.avatarFileId = await profilePhotoFileId(token, chat.id);
    upsertChat(botId, normalized);
    return { state: publicState(), chatId: normalized.id };
  });
  ipcMain.handle('message:send', async (_event, botId, chatId, rawText) => {
    const text = String(rawText || '').trim();
    if (!text) throw new Error('Сообщение пустое.');
    if (text.length > 4096) throw new Error('Telegram принимает до 4096 символов в одном сообщении.');
    const bot = getBot(botId); const token = decryptToken(bot);
    const result = await telegram(token, 'sendMessage', { chat_id: chatId, text });
    addMessage(botId, String(chatId), {
      id: `${chatId}:${result.message_id}`, telegramId: result.message_id, chatId: String(chatId), text,
      direction: 'outgoing', senderName: bot.name, sentAt: new Date(result.date * 1000).toISOString(), status: 'sent',
    });
    const current = (store.get('chatsByBot', {})[botId] || []).find((chat) => chat.id === String(chatId));
    if (current) upsertChat(botId, { ...current, lastMessage: text, lastMessageAt: new Date(result.date * 1000).toISOString() });
    return publicState();
  });
  ipcMain.handle('chat:read', (_event, botId, chatId) => {
    getBot(botId);
    const all = store.get('chatsByBot', {});
    const chats = (all[botId] || []).map((chat) => chat.id === String(chatId) ? { ...chat, unreadCount: 0 } : chat);
    store.set('chatsByBot', { ...all, [botId]: chats });
    return publicState();
  });
  ipcMain.handle('avatar:get', async (_event, botId, fileId) => {
    if (!fileId) return null;
    const token = decryptToken(getBot(botId));
    const file = await telegram(token, 'getFile', { file_id: fileId });
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!response.ok) return null;
    const mime = response.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  });

  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
