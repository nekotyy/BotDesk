import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain } from 'electron';
import Store from 'electron-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_BOTS = 15;

const store = new Store({
	name: 'tg-bot-manager-state',
	defaults: {
		bots: [],
		selectedBotId: null,
		chatsByBot: {},
		messagesByBot: {},
	},
});

function readState() {
	return {
		bots: store.get('bots', []),
		selectedBotId: store.get('selectedBotId', null),
		chatsByBot: store.get('chatsByBot', {}),
		messagesByBot: store.get('messagesByBot', {}),
	};
}

function saveState(state) {
	store.set(state);
	return readState();
}

async function telegramCall(token, method, payload = {}, httpMethod = 'POST') {
	const url = `https://api.telegram.org/bot${token}/${method}`;
	const init = {
		method: httpMethod,
		headers: { 'Content-Type': 'application/json' },
	};

	if (httpMethod !== 'GET') {
		init.body = JSON.stringify(payload);
	}

	const res = await fetch(url, init);
	const data = await res.json();
	if (!data.ok) {
		throw new Error(data.description || 'Telegram API error');
	}
	return data.result;
}

function upsertChats(state, botId, incomingChats) {
	const existing = state.chatsByBot[botId] || [];
	const byId = new Map(existing.map((chat) => [chat.id, chat]));

	for (const chat of incomingChats) {
		byId.set(chat.id, {
			...(byId.get(chat.id) || {}),
			...chat,
		});
	}

	const merged = [...byId.values()].sort((a, b) => {
		return Date.parse(b.lastMessageAt || 0) - Date.parse(a.lastMessageAt || 0);
	});

	return {
		...state,
		chatsByBot: {
			...state.chatsByBot,
			[botId]: merged,
		},
	};
}

function pushMessage(state, botId, chatId, message) {
	const byBot = state.messagesByBot[botId] || {};
	const chatMessages = byBot[chatId] || [];

	return {
		...state,
		messagesByBot: {
			...state.messagesByBot,
			[botId]: {
				...byBot,
				[chatId]: [...chatMessages, message],
			},
		},
	};
}

function findBotById(state, botId) {
	const bot = state.bots.find((entry) => entry.id === botId);
	if (!bot) {
		throw new Error('Бот не найден');
	}
	return bot;
}

async function syncChatsByUpdates(bot) {
	const updates = await telegramCall(bot.token, 'getUpdates', {
		offset: -100,
		limit: 100,
	});

	const chats = updates
		.map((update) => update.message)
		.filter(Boolean)
		.filter((message) => message.chat?.type === 'private')
		.map((message) => {
			const from = message.from || {};
			const chat = message.chat || {};
			return {
				id: String(chat.id),
				userId: String(chat.id),
				username: from.username || '',
				firstName: from.first_name || '',
				lastName: from.last_name || '',
				avatarUrl: '',
				lastMessageText: message.text || '[медиа]',
				lastMessageAt: new Date((message.date || Date.now() / 1000) * 1000).toISOString(),
			};
		});

	return chats;
}

async function ensureChatByUserId(bot, userId) {
	const result = await telegramCall(bot.token, 'getChat', { chat_id: userId });
	return {
		id: String(result.id),
		userId: String(result.id),
		username: result.username || '',
		firstName: result.first_name || '',
		lastName: result.last_name || '',
		avatarUrl: '',
		lastMessageText: 'Чат открыт по ID',
		lastMessageAt: new Date().toISOString(),
	};
}

function buildWindow() {
	const win = new BrowserWindow({
		width: 1380,
		height: 920,
		minWidth: 1100,
		minHeight: 700,
		title: 'TG Bot Manager',
		backgroundColor: '#f4efe6',
		webPreferences: {
			preload: path.join(__dirname, 'preload.mjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const devUrl = process.env.VITE_DEV_SERVER_URL;
	if (devUrl) {
		win.loadURL(devUrl);
	} else {
		win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
	}
}

app.whenReady().then(() => {
	ipcMain.handle('state:get', () => readState());

	ipcMain.handle('bot:add', async (_, payload) => {
		const state = readState();
		const currentCount = state.bots.length;
		if (currentCount >= MAX_BOTS) {
			throw new Error('Можно добавить максимум 15 ботов');
		}

		const token = String(payload.token || '').trim();
		const name = String(payload.name || '').trim();

		if (!token || !name) {
			throw new Error('Нужно указать и название, и токен');
		}

		const me = await telegramCall(token, 'getMe', {}, 'GET');
		const id = randomUUID();

		const bot = {
			id,
			name,
			username: me.username ? `@${me.username}` : `bot_${me.id}`,
			token,
			createdAt: new Date().toISOString(),
		};

		const next = {
			...state,
			bots: [...state.bots, bot],
			selectedBotId: id,
			chatsByBot: {
				...state.chatsByBot,
				[id]: state.chatsByBot[id] || [],
			},
			messagesByBot: {
				...state.messagesByBot,
				[id]: state.messagesByBot[id] || {},
			},
		};

		return saveState(next);
	});

	ipcMain.handle('bot:select', (_, botId) => {
		const state = readState();
		findBotById(state, botId);
		return saveState({
			...state,
			selectedBotId: botId,
		});
	});

	ipcMain.handle('bot:sync', async (_, botId) => {
		const state = readState();
		const bot = findBotById(state, botId);
		const synced = await syncChatsByUpdates(bot);
		const merged = upsertChats(state, botId, synced);
		return saveState(merged);
	});

	ipcMain.handle('chat:openByUserId', async (_, payload) => {
		const state = readState();
		const bot = findBotById(state, payload.botId);
		const userId = String(payload.userId || '').trim();

		if (!/^\d+$/.test(userId)) {
			throw new Error('ID пользователя должен быть числом');
		}

		const existing = (state.chatsByBot[payload.botId] || []).find(
			(chat) => chat.userId === userId,
		);

		if (existing) {
			return {
				state,
				chatId: existing.id,
			};
		}

		const opened = await ensureChatByUserId(bot, userId);
		const mergedState = upsertChats(state, payload.botId, [opened]);
		const saved = saveState(mergedState);

		return {
			state: saved,
			chatId: opened.id,
		};
	});

	ipcMain.handle('chat:sendMessage', async (_, payload) => {
		const state = readState();
		const bot = findBotById(state, payload.botId);
		const text = String(payload.text || '').trim();

		if (!text) {
			throw new Error('Сообщение не может быть пустым');
		}

		await telegramCall(bot.token, 'sendMessage', {
			chat_id: payload.chatId,
			text,
		});

		const now = new Date().toISOString();
		const withMessage = pushMessage(state, payload.botId, payload.chatId, {
			id: randomUUID(),
			from: 'bot',
			text,
			createdAt: now,
		});

		const updatedChat = (withMessage.chatsByBot[payload.botId] || []).map((chat) => {
			if (chat.id !== payload.chatId) {
				return chat;
			}

			return {
				...chat,
				lastMessageText: text,
				lastMessageAt: now,
			};
		});

		const finalState = {
			...withMessage,
			chatsByBot: {
				...withMessage.chatsByBot,
				[payload.botId]: updatedChat,
			},
		};

		return saveState(finalState);
	});

	buildWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			buildWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
