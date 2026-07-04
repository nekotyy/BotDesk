import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tgManager', {
  getState: () => ipcRenderer.invoke('state:get'),
  addBot: (payload) => ipcRenderer.invoke('bot:add', payload),
  selectBot: (botId) => ipcRenderer.invoke('bot:select', botId),
  syncBot: (botId) => ipcRenderer.invoke('bot:sync', botId),
  openChatByUserId: (payload) => ipcRenderer.invoke('chat:openByUserId', payload),
  sendMessage: (payload) => ipcRenderer.invoke('chat:sendMessage', payload),
});
