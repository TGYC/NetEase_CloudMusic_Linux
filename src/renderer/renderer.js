'use strict';

const api = window.app;

const els = {
  titlebar: document.getElementById('titlebar'),
  pageTitle: document.getElementById('pageTitle'),
  progress: document.getElementById('progress'),
  errorOverlay: document.getElementById('errorOverlay'),
  errorDesc: document.getElementById('errorDesc'),
  btnBack: document.getElementById('btnBack'),
  btnForward: document.getElementById('btnForward'),
  btnReload: document.getElementById('btnReload'),
  btnHome: document.getElementById('btnHome'),
  btnMore: document.getElementById('btnMore'),
  btnMini: document.getElementById('btnMini'),
  btnMin: document.getElementById('btnMin'),
  btnMax: document.getElementById('btnMax'),
  btnClose: document.getElementById('btnClose'),
  btnRetry: document.getElementById('btnRetry'),
  btnOpenBrowser: document.getElementById('btnOpenBrowser'),
  toasts: document.getElementById('toasts'),
};

// 当前错误信息（用于“在浏览器中打开”）
let currentErrorUrl = null;

// ---------------------------------------------------------------------------
// 主题 / 平台初始化
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  const effective = theme === 'system' ? 'dark' : theme;
  // 简化处理：system 下以深色为主，若后续需要可结合 nativeTheme。
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

async function init() {
  let info = {};
  try {
    info = await api.getInfo();
  } catch (err) {
    info = { platform: api.platform, theme: 'dark' };
  }
  document.documentElement.setAttribute('data-platform', info.platform || '');
  applyTheme(info.theme || 'dark');
}

// ---------------------------------------------------------------------------
// 导航状态
// ---------------------------------------------------------------------------
function setNavState(state) {
  els.btnBack.disabled = !state.canGoBack;
  els.btnForward.disabled = !state.canGoForward;
}

// ---------------------------------------------------------------------------
// 轻提示
// ---------------------------------------------------------------------------
function showToast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  els.toasts.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity 0.25s ease';
    setTimeout(() => node.remove(), 250);
  }, 2200);
}

// ---------------------------------------------------------------------------
// 错误页面
// ---------------------------------------------------------------------------
function showError(info) {
  if (!info) {
    els.errorOverlay.hidden = true;
    return;
  }
  currentErrorUrl = info.url || null;
  let desc = '无法连接到网易云音乐，请检查网络连接。';
  if (info.desc) desc = info.desc;
  els.errorDesc.textContent = desc;
  els.errorOverlay.hidden = false;
}

// ---------------------------------------------------------------------------
// 事件绑定
// ---------------------------------------------------------------------------
function bindEvents() {
  els.btnBack.addEventListener('click', () => api.back());
  els.btnForward.addEventListener('click', () => api.forward());
  els.btnReload.addEventListener('click', () => api.reload());
  els.btnHome.addEventListener('click', () => api.home());
  els.btnMore.addEventListener('click', () => api.openMenu());
  els.btnMini.addEventListener('click', () => api.toggleMiniPlayer());

  els.btnMin.addEventListener('click', () => api.minimize());
  els.btnMax.addEventListener('click', () => api.maximize());
  els.btnClose.addEventListener('click', () => api.close());

  els.btnRetry.addEventListener('click', () => api.retry());
  els.btnOpenBrowser.addEventListener('click', () => {
    if (currentErrorUrl) api.openExternal(currentErrorUrl);
  });

  // 双击标题栏切换最大化。
  els.titlebar.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tb-btn, .win-btn')) return;
    api.maximize();
  });

  // IPC 事件
  api.on('nav:state', setNavState);
  api.on('page:title', (title) => {
    els.pageTitle.textContent = title || '网易云音乐';
  });
  api.on('loading', (loading) => {
    els.progress.classList.toggle('loading', !!loading);
  });
  api.on('content:error', showError);
  api.on('toast', showToast);
  api.on('theme', applyTheme);
  api.on('window:chrome', ({ visible }) => {
    els.titlebar.style.display = visible ? 'flex' : 'none';
    els.progress.style.display = visible ? 'block' : 'none';
  });
  api.on('window:maximized', (maximized) => {
    // 切换最大化图标（可选，这里保持简单）
  });
}

init();
bindEvents();
