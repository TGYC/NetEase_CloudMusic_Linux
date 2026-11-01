'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  session,
  shell,
  ipcMain,
  dialog,
  screen,
  powerSaveBlocker,
  globalShortcut,
  Notification,
} = require('electron');

const { Settings } = require('./settings');

const APP_NAME = 'CloudMusic';
const PARTITION = 'persist:cloudmusic';
const TITLEBAR_HEIGHT = 44;
const HOME_URL = 'https://music.163.com/st/webplayer';
const IS_MAC = process.platform === 'darwin';
const IS_DEV = process.argv.includes('--dev');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png');

// Linux 下让窗口的 WM_CLASS 与 .desktop 文件名一致，便于桌面环境关联窗口与图标。
if (process.platform === 'linux') {
  try {
    app.setDesktopName('cloudmusic-desktop');
  } catch (err) {
    /* ignore */
  }
}

// 允许在应用内打开的域名后缀（其余一律交给系统浏览器）。
// 163.com 覆盖 music.163.com / reg.163.com / m.music.163.com 等；
// 126.net 覆盖音乐 CDN（*.music.126.net）；netease.com 覆盖网易其他子站。
const ALLOWED_HOST_SUFFIXES = ['163.com', '126.net', 'netease.com'];

// 拦截的第三方广告 / 数据统计域名（仅拦截通用的第三方追踪，不影响网易自身接口）。
const BLOCK_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googleadservices.com',
  'scorecardresearch.com',
  'admaster.com.cn',
  'miaozhen.com',
  'cnzz.com',
  'umeng.com',
];

// ---------------------------------------------------------------------------
// 全局状态
// ---------------------------------------------------------------------------
let settings;
let mainWindow = null;
let contentView = null;
let tray = null;
let miniWindow = null;
let mpris = null;
let quitting = false;
let currentUrl = HOME_URL;
let isFullscreenUI = false;
let powerBlockerId = null;
let playerState = null; // 最近一次上报的播放状态

// ---------------------------------------------------------------------------
// 单实例锁
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function buildUserAgent() {
  const chrome = process.versions.chrome;
  let os;
  switch (process.platform) {
    case 'darwin':
      os = 'Macintosh; Intel Mac OS X 10_15_7';
      break;
    case 'win32':
      os = 'Windows NT 10.0; Win64; x64';
      break;
    default:
      os = 'X11; Linux x86_64';
      break;
  }
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function isAllowedUrl(url) {
  if (!/^https?:/i.test(url)) return true; // about:blank 等内部地址
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOST_SUFFIXES.some((suffix) => {
      return hostname === suffix || hostname.endsWith('.' + suffix);
    });
  } catch {
    return false;
  }
}

function hostMatches(url, host) {
  try {
    const { hostname } = new URL(url);
    return hostname === host || hostname.endsWith('.' + host);
  } catch {
    return false;
  }
}

function clampZoom(z) {
  return Math.max(-3, Math.min(3, z));
}

// ---------------------------------------------------------------------------
// 外观主题
// ---------------------------------------------------------------------------
function applyTheme() {
  nativeTheme.themeSource = settings.get('theme'); // 'system' | 'dark' | 'light'
}

function isDarkMode() {
  return nativeTheme.shouldUseDarkColors;
}

// ---------------------------------------------------------------------------
// 主窗口 + 内容视图
// ---------------------------------------------------------------------------
function loadWindowBounds() {
  const saved = settings.get('window');
  const { width, height, x, y } = saved;
  const bounds = { width, height };
  if (typeof x === 'number' && typeof y === 'number') {
    const visible = screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      const right = Math.min(x + width, wa.x + wa.width);
      const bottom = Math.min(y + height, wa.y + wa.height);
      const left = Math.max(x, wa.x);
      const top = Math.max(y, wa.y);
      return right - left >= 100 && bottom - top >= 100;
    });
    if (visible) {
      bounds.x = x;
      bounds.y = y;
    }
  }
  return bounds;
}

function layoutContentView() {
  if (!mainWindow || !contentView) return;
  const [w, h] = mainWindow.getContentSize();
  const top = isFullscreenUI ? 0 : TITLEBAR_HEIGHT;
  contentView.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) });
}

function setFullscreenUI(fullscreen) {
  if (isFullscreenUI === fullscreen) return;
  isFullscreenUI = fullscreen;
  layoutContentView();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:chrome', { visible: !fullscreen });
  }
}

function sendNavState() {
  if (!mainWindow || !contentView) return;
  const wc = contentView.webContents;
  const nav = wc.navigationHistory || {};
  mainWindow.webContents.send('nav:state', {
    canGoBack: !!(nav.canGoBack && nav.canGoBack()),
    canGoForward: !!(nav.canGoForward && nav.canGoForward()),
    isLoading: wc.isLoading(),
    url: currentUrl,
  });
}

function showError(info) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (contentView) contentView.setVisible(false);
  mainWindow.webContents.send('content:error', info);
}

function clearError() {
  if (contentView && !contentView.webContents.isDestroyed()) contentView.setVisible(true);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('content:error', null);
  }
}

function wireContentEvents(wc) {
  // 拦截导航：外部链接交给系统浏览器。
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 720,
          autoHideMenuBar: true,
          icon: ICON_PATH,
          backgroundColor: '#18181b',
          webPreferences: {
            session: session.fromPartition(PARTITION),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
          },
        },
      };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('page-title-updated', (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('page:title', title);
      if (tray) tray.setToolTip(`${APP_NAME} · ${title}`);
    }
  });

  wc.on('did-navigate', (_e, url) => {
    currentUrl = url;
    sendNavState();
  });

  wc.on('did-navigate-in-page', (_e, url) => {
    currentUrl = url;
    sendNavState();
  });

  wc.on('did-start-loading', () => {
    clearError();
    sendNavState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading', true);
    }
  });

  wc.on('did-stop-loading', () => {
    sendNavState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('loading', false);
    }
  });

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = 主动中止，忽略
    showError({ code, desc, url });
  });

  wc.on('render-process-gone', (_e, details) => {
    showError({ code: -1, desc: `页面进程异常退出（${details.reason}）`, url: currentUrl });
  });

  // 音乐播放 / 暂停时管理显示器常亮。
  wc.on('media-started-playing', startPowerBlocker);
  wc.on('media-paused', stopPowerBlocker);
  wc.on('destroyed', stopPowerBlocker);

  // 快捷键。
  wc.on('before-input-event', handleInput);
}

function startPowerBlocker() {
  if (powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}

function stopPowerBlocker() {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  powerBlockerId = null;
}

// ---------------------------------------------------------------------------
// 广告拦截
// ---------------------------------------------------------------------------
function registerAdBlock(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!settings.get('blockAds')) return callback({});
    let url;
    try {
      url = new URL(details.url);
    } catch {
      return callback({});
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return callback({});
    const blocked = BLOCK_HOSTS.some((host) => hostMatches(url, host));
    callback(blocked ? { cancel: true } : {});
  });

  // 音乐 CDN 需要正确的 Referer，否则可能 403。
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.126.net/*'] },
    (details, callback) => {
      const headers = details.requestHeaders || {};
      headers.Referer = 'https://music.163.com/';
      callback({ requestHeaders: headers });
    },
  );
}

// ---------------------------------------------------------------------------
// 权限请求
// ---------------------------------------------------------------------------
function registerPermissions(ses) {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['fullscreen', 'notifications', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    return ['fullscreen', 'notifications', 'clipboard-sanitized-write'].includes(permission);
  });
}

// ---------------------------------------------------------------------------
// 快捷键
// ---------------------------------------------------------------------------
function handleInput(event) {
  if (event.type !== 'keyDown') return;

  const key = event.key.toLowerCase();
  const mod = IS_MAC ? event.meta : event.control;
  const shift = event.shift;

  if (mod && !shift && key === 'r') {
    event.preventDefault();
    reloadPage();
    return;
  }
  if (mod && shift && key === 'r') {
    event.preventDefault();
    contentView.webContents.reloadIgnoringCache();
    return;
  }
  if (event.alt && key === 'arrowleft') {
    event.preventDefault();
    goBack();
    return;
  }
  if (event.alt && key === 'arrowright') {
    event.preventDefault();
    goForward();
    return;
  }
  if (mod && key === '0') {
    event.preventDefault();
    contentView.webContents.setZoomLevel(0);
    return;
  }
  if (mod && (key === '=' || key === '+')) {
    event.preventDefault();
    contentView.webContents.setZoomLevel(clampZoom(contentView.webContents.getZoomLevel() + 0.5));
    return;
  }
  if (mod && key === '-') {
    event.preventDefault();
    contentView.webContents.setZoomLevel(clampZoom(contentView.webContents.getZoomLevel() - 0.5));
    return;
  }
  if (key === 'f11') {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  if (mod && !shift && key === 'h') {
    event.preventDefault();
    goHome();
    return;
  }
  if (mod && shift && key === 'm') {
    event.preventDefault();
    toggleMiniPlayer();
    return;
  }
  if (mod && shift && key === 'i') {
    event.preventDefault();
    openDevTools();
  }
}

// ---------------------------------------------------------------------------
// 导航动作
// ---------------------------------------------------------------------------
function reloadPage() {
  if (contentView && !contentView.webContents.isDestroyed()) contentView.webContents.reload();
}
function goBack() {
  if (contentView && !contentView.webContents.isDestroyed()) {
    const nav = contentView.webContents.navigationHistory;
    if (nav.canGoBack()) nav.goBack();
  }
}
function goForward() {
  if (contentView && !contentView.webContents.isDestroyed()) {
    const nav = contentView.webContents.navigationHistory;
    if (nav.canGoForward()) nav.goForward();
  }
}
function goHome() {
  if (contentView && !contentView.webContents.isDestroyed()) {
    contentView.webContents.loadURL(settings.get('homeUrl'));
  }
}
function toggleFullscreen() {
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  else mainWindow.setFullScreen(true);
}
function openDevTools() {
  if (contentView && !contentView.webContents.isDestroyed()) {
    contentView.webContents.toggleDevTools();
  }
}

// ---------------------------------------------------------------------------
// 播放器控制 / 媒体键 / 迷你播放器
// ---------------------------------------------------------------------------
function sendPlayerCommand(cmd) {
  if (contentView && !contentView.webContents.isDestroyed()) {
    contentView.webContents.send('player:command', cmd);
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateMpris(state) {
  if (!mpris) return;
  try {
    mpris.playbackStatus = state.playing ? 'Playing' : state.hasSong ? 'Paused' : 'Stopped';
    const artUrl = (state.cover || '').replace(/^http:/, 'https:');
    mpris.metadata = {
      'mpris:trackid': mpris.objectPath('track/0'),
      'mpris:artUrl': artUrl,
      'xesam:title': state.title || '网易云音乐',
      'xesam:artist': state.artist ? [state.artist] : [''],
    };
  } catch (err) {
    /* ignore */
  }
}

function broadcastPlayerState(state) {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('player:state', state);
  }
}

function setupMpris() {
  const Player = require('mpris-service');
  mpris = Player({
    name: 'cloudmusic',
    identity: 'CloudMusic',
    supportedInterfaces: ['player'],
  });
  mpris.desktopEntry = 'cloudmusic-desktop';
  mpris.on('error', (err) => {
    console.error('[mpris]', err && err.message ? err.message : err);
  });
  mpris.on('raise', showMainWindow);
  mpris.on('quit', () => {
    quitting = true;
    app.quit();
  });
  mpris.on('playpause', () => sendPlayerCommand('playpause'));
  mpris.on('play', () => {
    if (playerState && !playerState.playing) sendPlayerCommand('playpause');
  });
  mpris.on('pause', () => {
    if (playerState && playerState.playing) sendPlayerCommand('playpause');
  });
  mpris.on('stop', () => {
    if (playerState && playerState.playing) sendPlayerCommand('playpause');
  });
  mpris.on('next', () => sendPlayerCommand('next'));
  mpris.on('previous', () => sendPlayerCommand('prev'));
}

function setupGlobalMediaKeys() {
  const map = {
    MediaPlayPause: 'playpause',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'prev',
    MediaStop: 'stop',
  };
  for (const [acc, cmd] of Object.entries(map)) {
    try {
      globalShortcut.register(acc, () => {
        if (cmd === 'stop') {
          if (playerState && playerState.playing) sendPlayerCommand('playpause');
        } else {
          sendPlayerCommand(cmd);
        }
      });
    } catch (err) {
      console.error(`[media] register ${acc} failed:`, err);
    }
  }
}

function setupMediaKeys() {
  // Linux（Ubuntu/GNOME）下媒体键由桌面环境经 MPRIS 转发，注册全局快捷键无效，
  // 因此优先使用 MPRIS；其余平台用 globalShortcut。
  if (process.platform === 'linux') {
    try {
      if (process.env.DBUS_SESSION_BUS_ADDRESS) {
        setupMpris();
        return;
      }
    } catch (err) {
      console.error('[media] MPRIS 初始化失败，回退到全局快捷键:', err);
      mpris = null;
    }
  }
  setupGlobalMediaKeys();
}

// 迷你播放器是否置顶（默认置顶）。
let miniPinned = true;

function setMiniAlwaysOnTop(flag) {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  miniPinned = !!flag;
  // 用较高层级 'screen-saver'，在多数 Linux 窗口管理器上置顶更可靠。
  miniWindow.setAlwaysOnTop(miniPinned, 'screen-saver');
  try {
    miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    /* 平台不支持时忽略 */
  }
  miniWindow.webContents.send('mini:pin-state', miniPinned);
}

function openMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.focus();
    return;
  }
  miniWindow = new BrowserWindow({
    width: 372,
    height: 100,
    minWidth: 300,
    minHeight: 86,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    icon: ICON_PATH,
    show: false,
    title: 'CloudMusic · 迷你播放器',
    webPreferences: {
      preload: path.join(__dirname, 'preload-mini.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  miniWindow.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  miniWindow.webContents.once('did-finish-load', () => {
    if (playerState) miniWindow.webContents.send('player:state', playerState);
    // 告知初始置顶状态
    miniWindow.webContents.send('mini:pin-state', miniPinned);
  });
  miniWindow.once('ready-to-show', () => {
    miniWindow.show();
    // 显示后再应用一次置顶，规避部分 WM 在窗口未显示时忽略置顶的问题。
    setMiniAlwaysOnTop(miniPinned);
  });
  miniWindow.on('show', () => setMiniAlwaysOnTop(miniPinned));
  miniWindow.on('closed', () => {
    miniWindow = null;
  });
}

function toggleMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close();
  } else {
    openMiniPlayer();
  }
}

// ---------------------------------------------------------------------------
// 托盘
// ---------------------------------------------------------------------------
function createTray() {
  try {
    const img = nativeImage.createFromPath(ICON_PATH).resize({ width: 22, height: 22 });
    tray = new Tray(img);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error('[tray] failed to create tray:', err);
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '显示 / 隐藏主窗口',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '回到首页',
      click: () => {
        if (mainWindow) mainWindow.show();
        goHome();
      },
    },
    {
      label: '迷你播放器',
      click: toggleMiniPlayer,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// 应用菜单（macOS 需要，其余平台提供快捷键兜底）
// ---------------------------------------------------------------------------
function buildAppMenu() {
  if (!IS_MAC) return null;
  return Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `关于 ${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// “更多” 菜单（标题栏 ⋯ 按钮弹出）
// ---------------------------------------------------------------------------
function buildMoreMenu() {
  const theme = settings.get('theme');
  return Menu.buildFromTemplate([
    {
      label: '回到首页',
      accelerator: IS_MAC ? 'Cmd+H' : 'Ctrl+H',
      click: goHome,
    },
    {
      label: '迷你播放器',
      accelerator: IS_MAC ? 'Cmd+Shift+M' : 'Ctrl+Shift+M',
      click: toggleMiniPlayer,
    },
    { type: 'separator' },
    {
      label: '外观',
      submenu: [
        {
          label: '跟随系统',
          type: 'radio',
          checked: theme === 'system',
          click: () => setTheme('system'),
        },
        {
          label: '深色',
          type: 'radio',
          checked: theme === 'dark',
          click: () => setTheme('dark'),
        },
        {
          label: '浅色',
          type: 'radio',
          checked: theme === 'light',
          click: () => setTheme('light'),
        },
      ],
    },
    {
      label: '拦截广告与数据统计',
      type: 'checkbox',
      checked: settings.get('blockAds'),
      click: (item) => settings.set('blockAds', item.checked),
    },
    {
      label: '关闭时最小化到托盘',
      type: 'checkbox',
      checked: settings.get('closeToTray'),
      click: (item) => settings.set('closeToTray', item.checked),
    },
    { type: 'separator' },
    {
      label: '清除浏览数据…',
      click: clearBrowsingData,
    },
    {
      label: '导出 Cookie…',
      click: exportCookies,
    },
    {
      label: '导入 Cookie…',
      click: importCookies,
    },
    {
      label: '开发者工具',
      accelerator: IS_MAC ? 'Cmd+Shift+I' : 'Ctrl+Shift+I',
      click: openDevTools,
    },
    { type: 'separator' },
    {
      label: `关于 ${APP_NAME}`,
      click: showAbout,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function setTheme(theme) {
  settings.set('theme', theme);
  applyTheme();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme', theme);
  }
}

function clearBrowsingData() {
  if (!mainWindow) return;
  const options = ['仅清除缓存', '清除缓存和 Cookie（会退出登录）', '取消'];
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: '清除浏览数据',
    message: '选择要清除的内容',
    detail: '清除 Cookie 会导致当前账号退出登录，需要重新登录。',
    buttons: options,
    defaultId: 0,
    cancelId: 2,
  });
  if (choice === 2) return;
  const ses = session.fromPartition(PARTITION);
  const clear =
    choice === 0 ? ses.clearCache() : Promise.all([ses.clearCache(), ses.clearStorageData()]);
  clear.then(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', '浏览数据已清除');
    }
    goHome();
  });
}

// ---------------------------------------------------------------------------
// Cookie 保存 / 导出 / 导入
// 说明：应用本身使用 persist: 分区，Cookie 会自动持久化到磁盘，重启后仍保持登录。
// 下面的导出 / 导入用于手动备份、迁移或恢复登录状态。
// ---------------------------------------------------------------------------
function isRelevantCookie(cookie) {
  const d = (cookie.domain || '').replace(/^\./, '');
  return ALLOWED_HOST_SUFFIXES.some((s) => d === s || d.endsWith('.' + s));
}

function cookieToUrl(domain) {
  const d = (domain || '').replace(/^\./, '');
  return `https://${d}/`;
}

async function exportCookies() {
  const ses = session.fromPartition(PARTITION);
  const all = await ses.cookies.get({});
  const cookies = all.filter(isRelevantCookie);
  if (cookies.length === 0) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', '当前没有可导出的 Cookie（请先登录）');
    }
    return;
  }
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Cookie',
    defaultPath: path.join(app.getPath('documents'), 'cloudmusic-cookies.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return;
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cookies,
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.error('[cookies] export failed:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', '导出失败：无法写入文件');
    }
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', `已导出 ${cookies.length} 条 Cookie`);
  }
}

async function importCookies() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '导入 Cookie',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', '导入失败：文件不是有效的 JSON');
    }
    return;
  }
  const cookies = Array.isArray(data) ? data : data.cookies;
  if (!Array.isArray(cookies) || cookies.length === 0) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', '导入失败：文件中没有 Cookie 数据');
    }
    return;
  }
  const ses = session.fromPartition(PARTITION);
  let ok = 0;
  for (const c of cookies) {
    if (!c || !c.name || c.value === undefined) continue;
    try {
      await ses.cookies.set({
        url: cookieToUrl(c.domain),
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite || 'unspecified',
        expirationDate: c.expirationDate,
      });
      ok++;
    } catch (err) {
      console.error('[cookies] import item failed:', c.name, err);
    }
  }
  await ses.cookies.flushStore();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', `已导入 ${ok} 条 Cookie，正在刷新…`);
  }
  goHome();
}

function showAbout() {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: `关于 ${APP_NAME}`,
    message: APP_NAME,
    detail:
      `版本 ${app.getVersion()}\n` +
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}\n\n` +
      `一个开源的网易云音乐桌面客户端封装。\n` +
      `本项目为非官方客户端，仅用于个人学习与使用。`,
    buttons: ['确定'],
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('nav:back', () => goBack());
  ipcMain.handle('nav:forward', () => goForward());
  ipcMain.handle('nav:reload', () => reloadPage());
  ipcMain.handle('nav:home', () => goHome());

  ipcMain.handle('content:retry', () => {
    if (contentView && !contentView.webContents.isDestroyed()) {
      clearError();
      const target = currentUrl && currentUrl !== HOME_URL ? currentUrl : HOME_URL;
      contentView.webContents.loadURL(target);
    }
  });

  ipcMain.handle('content:openExternal', (_e, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('more:menu', () => {
    const menu = buildMoreMenu();
    if (mainWindow) {
      const [w] = mainWindow.getContentSize();
      menu.popup({ window: mainWindow, x: w - 8, y: TITLEBAR_HEIGHT - 2 });
    }
  });

  // 播放器状态上报（来自内容页面的 preload）
  ipcMain.on('player:state', (event, state) => {
    if (!contentView || event.sender !== contentView.webContents) return;
    playerState = state;
    updateMpris(state);
    broadcastPlayerState(state);
  });

  // 迷你播放器
  ipcMain.handle('mini:player', () => toggleMiniPlayer());
  ipcMain.on('mini:command', (_e, cmd) => sendPlayerCommand(cmd));
  ipcMain.on('mini:restore', () => showMainWindow());
  ipcMain.on('mini:pin', () => {
    setMiniAlwaysOnTop(!miniPinned);
  });
  ipcMain.on('mini:close', () => {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  });

  ipcMain.handle('app:getInfo', () => ({
    platform: process.platform,
    theme: settings.get('theme'),
    isDark: isDarkMode(),
    version: app.getVersion(),
  }));
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
function createMainWindow() {
  const bounds = loadWindowBounds();
  const opts = {
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0e',
    title: APP_NAME,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (IS_MAC) {
    opts.titleBarStyle = 'hiddenInset';
    opts.trafficLightPosition = { x: 16, y: 14 };
  } else {
    opts.frame = false;
  }

  mainWindow = new BrowserWindow(opts);
  if (settings.get('window').maximized) mainWindow.maximize();

  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(buildUserAgent());

  contentView = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'preload-player.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  contentView.setBackgroundColor('#18181b');
  mainWindow.contentView.addChildView(contentView);
  layoutContentView();

  wireContentEvents(contentView.webContents);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('resize', layoutContentView);
  mainWindow.on('maximize', () => {
    layoutContentView();
    mainWindow.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    layoutContentView();
    mainWindow.webContents.send('window:maximized', false);
  });

  mainWindow.on('enter-full-screen', () => setFullscreenUI(true));
  mainWindow.on('leave-full-screen', () => setFullscreenUI(false));
  contentView.webContents.on('enter-html-full-screen', () => setFullscreenUI(true));
  contentView.webContents.on('leave-html-full-screen', () => setFullscreenUI(false));

  mainWindow.on('close', (event) => {
    if (!quitting && settings.get('closeToTray') && tray) {
      event.preventDefault();
      mainWindow.hide();
      notifyTrayHint();
    }
  });

  mainWindow.on('closed', () => {
    stopPowerBlocker();
    mainWindow = null;
  });

  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) {
      settings.setWindow({ maximized: mainWindow.isMaximized() });
      return;
    }
    const b = mainWindow.getNormalBounds();
    settings.setWindow({
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximized: false,
    });
  };
  mainWindow.on('moved', saveState);
  mainWindow.on('resized', saveState);
  mainWindow.on('close', saveState);

  contentView.webContents.loadURL(HOME_URL);
}

function notifyTrayHint() {
  if (!Notification.isSupported()) return;
  new Notification({
    title: APP_NAME,
    body: '已最小化到系统托盘，点击托盘图标可再次打开。',
    silent: true,
  }).show();
}

app.whenReady().then(() => {
  settings = new Settings();
  applyTheme();

  const ses = session.fromPartition(PARTITION);
  registerAdBlock(ses);
  registerPermissions(ses);

  Menu.setApplicationMenu(buildAppMenu());

  registerIpc();
  createMainWindow();
  createTray();
  setupMediaKeys();

  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme', settings.get('theme'));
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => {
  quitting = true;
  // 注销全局快捷键。
  globalShortcut.unregisterAll();
  // 退出前主动将 Cookie 落盘，确保登录状态完整保存。
  try {
    session.fromPartition(PARTITION).cookies.flushStore();
  } catch (err) {
    console.error('[cookies] flush on quit failed:', err);
  }
});

app.on('window-all-closed', () => {
  if (!IS_MAC || quitting) {
    app.quit();
  }
});

// 防止页面创建 webview 标签（安全考虑）。
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});
