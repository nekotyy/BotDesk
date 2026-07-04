import type { AppState, OpenChatResult } from './types';

declare global {
  interface Window {
    tgManager: {
      getState: () => Promise<AppState>;
      addBot: (payload: { name: string; token: string }) => Promise<AppState>;
      selectBot: (botId: string) => Promise<AppState>;
      syncBot: (botId: string) => Promise<AppState>;
      openChatByUserId: (payload: {
        botId: string;
        userId: string;
      }) => Promise<OpenChatResult>;
      sendMessage: (payload: {
        botId: string;
        chatId: string;
        text: string;
      }) => Promise<AppState>;
    };
  }
}

export {};
