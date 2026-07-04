const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tgManager', {
  getState: () => ipcRenderer.invoke('state:get'),
  addBot: (input) => ipcRenderer.invoke('bot:add', input),
  removeBot: (botId) => ipcRenderer.invoke('bot:remove', botId),
  selectBot: (botId) => ipcRenderer.invoke('bot:select', botId),
  syncBot: (botId) => ipcRenderer.invoke('bot:sync', botId),
  findChat: (botId, userId) => ipcRenderer.invoke('chat:find', botId, userId),
  sendMessage: (botId, chatId, text) => ipcRenderer.invoke('message:send', botId, chatId, text),
  markRead: (botId, chatId) => ipcRenderer.invoke('chat:read', botId, chatId),
  getAvatar: (botId, fileId) => ipcRenderer.invoke('avatar:get', botId, fileId),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  onSyncError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:error', listener);
    return () => ipcRenderer.removeListener('sync:error', listener);
  },
});
