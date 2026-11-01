'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 安全起见只暴露白名单 API，不暴露 ipcRenderer 原始对象。
contextBridge.exposeInMainWorld('app', {
  platform: process.platform,

  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // 导航
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  home: () => ipcRenderer.invoke('nav:home'),
  retry: () => ipcRenderer.invoke('content:retry'),
  openExternal: (url) => ipcRenderer.invoke('content:openExternal', url),

  // 功能
  openMenu: () => ipcRenderer.invoke('more:menu'),
  toggleMiniPlayer: () => ipcRenderer.invoke('mini:player'),
  getInfo: () => ipcRenderer.invoke('app:getInfo'),

  // 事件订阅
  on: (channel, callback) => {
    const allowed = [
      'window:chrome',
      'window:maximized',
      'nav:state',
      'page:title',
      'loading',
      'content:error',
      'toast',
      'theme',
    ];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
