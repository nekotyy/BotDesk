export type Bot = {
  id: string;
  name: string;
  username: string;
  telegramId: number;
  avatarUrl?: string;
  avatarFileId?: string;
  createdAt: string;
  lastSyncAt?: string;
  lastError?: string;
  status: 'online' | 'offline' | 'syncing';
};

export type Chat = {
  id: string;
  telegramId: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatarUrl?: string;
  avatarFileId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
};

export type Message = {
  id: string;
  telegramId?: number;
  chatId: string;
  text: string;
  media?: MessageMedia;
  direction: 'incoming' | 'outgoing';
  senderName: string;
  sentAt: string;
  status: 'sending' | 'sent' | 'failed';
};

export type MessageMedia = {
  type: 'photo' | 'sticker' | 'video' | 'video_note' | 'voice';
  fileId: string;
  fileUniqueId?: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSize?: number;
  emoji?: string;
  setName?: string;
  isAnimated?: boolean;
  isVideo?: boolean;
  thumbnailFileId?: string;
};

export type AppState = {
  bots: Bot[];
  selectedBotId: string | null;
  chatsByBot: Record<string, Chat[]>;
  messagesByBot: Record<string, Record<string, Message[]>>;
};

export type AddBotInput = { name: string; token: string };

export type TgManagerApi = {
  getState(): Promise<AppState>;
  addBot(input: AddBotInput): Promise<AppState>;
  removeBot(botId: string): Promise<AppState>;
  selectBot(botId: string): Promise<AppState>;
  syncBot(botId: string): Promise<AppState>;
  findChat(botId: string, userId: string): Promise<{ state: AppState; chatId: string }>;
  sendMessage(botId: string, chatId: string, text: string): Promise<AppState>;
  markRead(botId: string, chatId: string): Promise<AppState>;
  getAvatar(botId: string, fileId: string): Promise<string | null>;
  getMedia(botId: string, fileId: string, mimeType?: string): Promise<MediaPayload | null>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  onSyncError(callback: (payload: { botId: string; message: string }) => void): () => void;
};

export type MediaPayload =
  | { kind: 'image' | 'video' | 'audio'; mimeType: string; dataUrl: string }
  | { kind: 'lottie'; mimeType: 'application/json'; json: unknown };
