import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import Store from 'electron-store';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_BOTS = 15;
const API_TIMEOUT_MS = 20_000;
const LONG_POLL_TIMEOUT_SECONDS = 25;
const LONG_POLL_REQUEST_TIMEOUT_MS = LONG_POLL_TIMEOUT_SECONDS * 1000 + 15_000;
const GET_UPDATES_LIMIT = 100;
const MAX_DRAIN_PAGES = 50;
const RETRY_DELAY_MS = 2_000;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow;
const syncInFlight = new Set();
const pollingWorkers = new Map();
const MEDIA_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  tgs: 'application/x-tgsticker',
};

if (!hasSingleInstanceLock) app.quit();

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

function isWebhookActiveError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /webhook is active|включён webhook/i.test(message);
}

function isConcurrentGetUpdatesError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /terminated by other getUpdates|уже запущена в другом/i.test(message);
}

async function telegram(token, method, payload = {}, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : API_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    lastMessage: messagePreview(lastMessage) || previous.lastMessage || '',
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
    [botId]: { ...byBot, [chatId]: [...messages, message] },
  });
}

function mediaLabel(type) {
  const labels = {
    photo: 'Фото',
    sticker: 'Стикер',
    video: 'Видео',
    video_note: 'Кружок',
    voice: 'Голосовое сообщение',
  };
  return labels[type] || 'Медиа';
}

function messagePreview(message) {
  if (!message) return '';
  if (message.text || message.caption) return message.text || message.caption;
  const media = extractMessageMedia(message);
  return media ? mediaLabel(media.type) : '';
}

function extractMessageMedia(message) {
  const photo = message.photo?.at(-1);
  if (photo?.file_id) {
    return {
      type: 'photo',
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      width: photo.width,
      height: photo.height,
      fileSize: photo.file_size,
    };
  }
  if (message.sticker?.file_id) {
    return {
      type: 'sticker',
      fileId: message.sticker.file_id,
      fileUniqueId: message.sticker.file_unique_id,
      width: message.sticker.width,
      height: message.sticker.height,
      fileSize: message.sticker.file_size,
      emoji: message.sticker.emoji,
      setName: message.sticker.set_name,
      mimeType: message.sticker.is_video ? 'video/webm' : message.sticker.is_animated ? 'application/x-tgsticker' : 'image/webp',
      isAnimated: message.sticker.is_animated,
      isVideo: message.sticker.is_video,
    };
  }
  if (message.video?.file_id) {
    return {
      type: 'video',
      fileId: message.video.file_id,
      fileUniqueId: message.video.file_unique_id,
      width: message.video.width,
      height: message.video.height,
      duration: message.video.duration,
      fileName: message.video.file_name,
      mimeType: message.video.mime_type || 'video/mp4',
      fileSize: message.video.file_size,
      thumbnailFileId: message.video.thumbnail?.file_id,
    };
  }
  if (message.video_note?.file_id) {
    return {
      type: 'video_note',
      fileId: message.video_note.file_id,
      fileUniqueId: message.video_note.file_unique_id,
      width: message.video_note.length,
      height: message.video_note.length,
      duration: message.video_note.duration,
      mimeType: 'video/mp4',
      fileSize: message.video_note.file_size,
      thumbnailFileId: message.video_note.thumbnail?.file_id,
    };
  }
  if (message.voice?.file_id) {
    return {
      type: 'voice',
      fileId: message.voice.file_id,
      fileUniqueId: message.voice.file_unique_id,
      duration: message.voice.duration,
      mimeType: message.voice.mime_type || 'audio/ogg',
      fileSize: message.voice.file_size,
    };
  }
  return undefined;
}

function safeMediaName(botId, fileId, filePath = '', mimeType = '') {
  const extension = path.extname(filePath).slice(1) || Object.entries(MEDIA_MIME_BY_EXT).find(([, mime]) => mime === mimeType)?.[0] || 'bin';
  const safeId = `${botId}-${fileId}`.replace(/[^a-z0-9_-]/gi, '_').slice(0, 180);
  return `${safeId}.${extension}`;
}

function mimeFromPath(filePath, fallback = 'application/octet-stream') {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return MEDIA_MIME_BY_EXT[extension] || fallback;
}

async function profilePhotoFileId(token, userId) {
  try {
    const photos = await telegram(token, 'getUserProfilePhotos', { user_id: userId, offset: 0, limit: 1 });
    return photos.photos?.[0]?.at(-1)?.file_id;
  } catch {
    return undefined;
  }
}

async function telegramFileData(botId, fileId, fallbackMimeType) {
  if (!fileId) return null;
  const token = decryptToken(getBot(botId));
  const file = await telegram(token, 'getFile', { file_id: fileId });
  const mediaDir = path.join(app.getPath('userData'), 'media');
  const mediaPath = path.join(mediaDir, safeMediaName(botId, fileId, file.file_path, fallbackMimeType));
  const mimeType = fallbackMimeType || mimeFromPath(file.file_path);
  const toPayload = (buffer, contentType = mimeType) => {
    if (contentType === 'application/x-tgsticker') {
      const json = gunzipSync(buffer).toString('utf8');
      return {
        kind: 'lottie',
        mimeType: 'application/json',
        json: JSON.parse(json),
      };
    }
    return {
      kind: contentType.startsWith('audio/') ? 'audio' : contentType.startsWith('video/') ? 'video' : 'image',
      mimeType: contentType,
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    };
  };

  try {
    const cached = await readFile(mediaPath);
    return toPayload(cached);
  } catch {
    // Cache miss; download from Telegram and persist for the local history view.
  }

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) return null;
  const headerMimeType = response.headers.get('content-type');
  const responseMimeType = fallbackMimeType || (headerMimeType && headerMimeType !== 'application/octet-stream' ? headerMimeType : mimeType);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(mediaDir, { recursive: true });
  await writeFile(mediaPath, buffer);
  return toPayload(buffer, responseMimeType);
}

async function disableWebhookIfNeeded(token) {
  const info = await telegram(token, 'getWebhookInfo');
  if (!info?.url) return;
  await telegram(token, 'deleteWebhook', { drop_pending_updates: false });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractUpdateMessage(update) {
  return update.message
    || update.edited_message
    || update.channel_post
    || update.edited_channel_post
    || update.business_message
    || update.edited_business_message
    || update.callback_query?.message;
}

async function syncBot(botId, options = {}) {
  const longPoll = options.longPoll === true;
  const markSyncing = options.markSyncing !== false;
  if (syncInFlight.has(botId)) return publicState();
  syncInFlight.add(botId);
  try {
    const bot = getBot(botId);
    const token = decryptToken(bot);
    if (!bot.avatarFileId) {
      const avatarFileId = await profilePhotoFileId(token, bot.telegramId);
      if (avatarFileId) setBot(botId, { avatarFileId });
    }
    if (markSyncing) setBot(botId, { status: 'syncing', lastError: undefined });
    const offsets = store.get('updateOffsets', {});
    const allowedUpdates = [
      'message',
      'edited_message',
      'channel_post',
      'edited_channel_post',
      'business_message',
      'edited_business_message',
      'callback_query',
    ];
    const getUpdates = async (offset, timeoutSeconds) => telegram(token, 'getUpdates', {
      offset,
      limit: GET_UPDATES_LIMIT,
      timeout: timeoutSeconds,
      allowed_updates: allowedUpdates,
    }, { timeoutMs: timeoutSeconds ? LONG_POLL_REQUEST_TIMEOUT_MS : API_TIMEOUT_MS });
    const drainUpdates = async () => {
      const batches = [];
      let nextOffset = offsets[botId] || 0;
      let timeoutSeconds = longPoll ? LONG_POLL_TIMEOUT_SECONDS : 0;

      for (let page = 0; page < MAX_DRAIN_PAGES; page += 1) {
        const batch = await getUpdates(nextOffset, timeoutSeconds);
        batches.push(...batch);
        for (const update of batch) nextOffset = Math.max(nextOffset, update.update_id + 1);
        if (batch.length < GET_UPDATES_LIMIT) break;
        timeoutSeconds = 0;
      }

      return batches;
    };
    let updates;
    try {
      updates = await drainUpdates();
    } catch (error) {
      if (isWebhookActiveError(error)) {
        await disableWebhookIfNeeded(token);
        updates = await drainUpdates();
      } else if (isConcurrentGetUpdatesError(error)) {
        // Another poll request won the race; keep the bot online and try again on next cycle.
        setBot(botId, { status: 'online', lastSyncAt: new Date().toISOString(), lastError: undefined });
        return publicState();
      } else {
        throw error;
      }
    }
    let maxUpdateId = offsets[botId] || 0;
    const photoQueue = [];

    for (const update of updates) {
      maxUpdateId = Math.max(maxUpdateId, update.update_id + 1);
      const message = extractUpdateMessage(update);
      if (!message?.chat) continue;
      const chatId = String(message.chat.id);
      const existing = (store.get('chatsByBot', {})[botId] || []).find((item) => item.id === chatId);
      const normalized = normalizeChat(message.chat, message, existing);
      normalized.unreadCount = (existing?.unreadCount || 0) + 1;
      upsertChat(botId, normalized);
      const media = extractMessageMedia(message);
      addMessage(botId, chatId, {
        id: `${message.chat.id}:${message.message_id}`,
        telegramId: message.message_id,
        chatId,
        text: message.text || message.caption || (media ? mediaLabel(media.type) : '[Медиа-сообщение]'),
        media,
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

    store.set('updateOffsets', { ...store.get('updateOffsets', {}), [botId]: maxUpdateId });
    setBot(botId, { status: 'online', lastSyncAt: new Date().toISOString(), lastError: undefined });
    return publicState();
  } catch (error) {
    setBot(botId, { status: 'offline', lastError: error instanceof Error ? error.message : 'Ошибка синхронизации' });
    throw error;
  } finally {
    syncInFlight.delete(botId);
  }
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state:changed', publicState());
}

function notifySyncError(botId, error) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:error', {
      botId,
      message: error instanceof Error ? error.message : 'Ошибка синхронизации',
    });
  }
}

async function startPollingWorker(botId) {
  if (pollingWorkers.has(botId)) return;
  const worker = { stopped: false };
  pollingWorkers.set(botId, worker);

  while (!worker.stopped) {
    try {
      await syncBot(botId, { longPoll: true, markSyncing: false });
      broadcastState();
    } catch (error) {
      notifySyncError(botId, error);
      broadcastState();
      await delay(RETRY_DELAY_MS);
    }
  }

  pollingWorkers.delete(botId);
}

function stopPollingWorker(botId) {
  const worker = pollingWorkers.get(botId);
  if (worker) worker.stopped = true;
}

function syncPollingWorkers() {
  const botIds = new Set(store.get('bots', []).map((bot) => bot.id));
  for (const botId of botIds) void startPollingWorker(botId);
  for (const botId of pollingWorkers.keys()) {
    if (!botIds.has(botId)) stopPollingWorker(botId);
  }
}

async function disableAllWebhooks() {
  const bots = store.get('bots', []);
  await Promise.all(bots.map(async (bot) => {
    try {
      const token = decryptToken(bot);
      await disableWebhookIfNeeded(token);
    } catch { /* best-effort */ }
  }));
}

function startBackgroundPolling() {
  syncPollingWorkers();
}

function stopBackgroundPolling() {
  for (const botId of pollingWorkers.keys()) stopPollingWorker(botId);
}

async function createWindow() {
  const windowIcon = path.join(__dirname, '../assets/logo.png');
  const window = new BrowserWindow({
    width: 1360,
    height: 850,
    minWidth: 900,
    minHeight: 620,
    title: 'BotDesk',
    icon: windowIcon,
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
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = undefined; });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
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
    await disableWebhookIfNeeded(token);
    const avatarFileId = await profilePhotoFileId(token, me.id);
    if (bots.some((bot) => bot.telegramId === me.id)) throw new Error('Этот Telegram-бот уже добавлен.');
    const bot = {
      id: uuid(), name, username: me.username || '', telegramId: me.id,
      avatarFileId, tokenSecret: encryptToken(token), createdAt: new Date().toISOString(), status: 'online',
    };
    store.set('bots', [...bots, bot]);
    store.set('selectedBotId', bot.id);
    syncPollingWorkers();
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
    stopPollingWorker(botId);
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
  ipcMain.handle('media:get', (_event, botId, fileId, mimeType) => telegramFileData(botId, fileId, mimeType));

  await createWindow();
  await disableAllWebhooks();
  startBackgroundPolling();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => { stopBackgroundPolling(); if (process.platform !== 'darwin') app.quit(); });
