import type { TgManagerApi } from './types';

declare global {
  interface Window {
    tgManager: TgManagerApi;
  }
}

export {};
