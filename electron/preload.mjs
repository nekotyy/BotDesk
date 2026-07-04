import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tgManager', {
  getState: () => ipcRenderer.invoke('state:get'),
  addBot: (input) => ipcRenderer.invoke('bot:add', input),
  removeBot: (botId) => ipcRenderer.invoke('bot:remove', botId),
  selectBot: (botId) => ipcRenderer.invoke('bot:select', botId),
  syncBot: (botId) => ipcRenderer.invoke('bot:sync', botId),
  findChat: (botId, userId) => ipcRenderer.invoke('chat:find', botId, userId),
  sendMessage: (botId, chatId, text) => ipcRenderer.invoke('message:send', botId, chatId, text),
  getAvatar: (botId, fileId) => ipcRenderer.invoke('avatar:get', botId, fileId),
});

