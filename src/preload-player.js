'use strict';

// 运行在内容页面（网易云音乐）的 preload：
// 1) 每秒读取一次播放状态（歌名/歌手/封面/是否播放中）并上报主进程；
// 2) 接收主进程发来的控制命令（播放/暂停/上一首/下一首），点击对应按钮。

const { ipcRenderer } = require('electron');

function q(sel, root = document) {
  return root.querySelector(sel);
}

function getState() {
  const state = { title: '', artist: '', cover: '', playing: false, hasSong: false };
  try {
    // 歌名 / 歌手：播放条下方的 .words 区域
    const words = q('.m-playbar .j-flag.words');
    if (words) {
      const nameEl = q('.name', words) || q('a[href*="/song"]', words);
      const byEl = q('.by a', words) || q('a[href*="/artist"]', words);
      let title = nameEl ? (nameEl.textContent || '').trim() : '';
      let artist = byEl ? (byEl.textContent || '').trim() : '';
      if (!title || !artist) {
        const text = (words.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) {
          const parts = text.split(' ').filter(Boolean);
          if (!title && parts[0]) title = parts[0];
          if (!artist && parts.length > 1) artist = parts.slice(1).join(' ');
        }
      }
      state.title = title;
      state.artist = artist;
    }

    // 封面
    const cover = q('.m-playbar .head img');
    if (cover && cover.src && !cover.src.startsWith('data:')) state.cover = cover.src;

    // 播放状态：优先检测 audio 元素
    const audios = Array.from(document.querySelectorAll('audio'));
    for (const a of audios) {
      if (!a.paused && a.currentTime > 0) {
        state.playing = true;
        break;
      }
    }
    state.hasSong = !!(state.title || state.artist || audios.length > 0);
  } catch (err) {
    /* 页面尚未就绪时忽略 */
  }
  return state;
}

function control(cmd) {
  try {
    const action = { playpause: 'play', next: 'next', prev: 'prev' }[cmd];
    if (!action) return;
    const btn = q(`a[data-action="${action}"]`);
    if (btn) btn.click();
  } catch (err) {
    /* ignore */
  }
}

ipcRenderer.on('player:command', (_event, cmd) => control(cmd));

// 每秒检测一次，仅在状态变化时上报，避免无谓的 IPC 开销。
let lastJson = '';
setInterval(() => {
  try {
    const s = getState();
    const json = JSON.stringify(s);
    if (json !== lastJson) {
      lastJson = json;
      ipcRenderer.send('player:state', s);
    }
  } catch (err) {
    /* ignore */
  }
}, 1000);
