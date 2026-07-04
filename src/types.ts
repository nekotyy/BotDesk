export type SenderType = 'bot' | 'user';

export interface BotSummary {
  id: string;
  name: string;
  username: string;
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  lastMessageText: string;
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  from: SenderType;
  text: string;
  createdAt: string;
}

export interface AppState {
  bots: BotSummary[];
  selectedBotId: string | null;
  chatsByBot: Record<string, ChatSummary[]>;
  messagesByBot: Record<string, Record<string, ChatMessage[]>>;
}

export interface OpenChatResult {
  state: AppState;
  chatId: string | null;
}
