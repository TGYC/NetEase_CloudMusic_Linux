'use strict';

// 迷你播放器窗口的 preload：接收播放状态、发送控制命令。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  // 控制命令
  command: (cmd) => ipcRenderer.send('mini:command', cmd),
  // 回到主窗口
  restore: () => ipcRenderer.send('mini:restore'),
  // 切换置顶
  togglePin: () => ipcRenderer.send('mini:pin'),
  // 关闭迷你窗口
  close: () => ipcRenderer.send('mini:close'),

  // 订阅播放状态
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('player:state', listener);
    return () => ipcRenderer.removeListener('player:state', listener);
  },
  // 订阅置顶状态
  onPinState: (callback) => {
    const listener = (_event, pinned) => callback(pinned);
    ipcRenderer.on('mini:pin-state', listener);
    return () => ipcRenderer.removeListener('mini:pin-state', listener);
  },
});
