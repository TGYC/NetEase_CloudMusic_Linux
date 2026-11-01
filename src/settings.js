'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  theme: 'system', // 'system' | 'dark' | 'light'
  blockAds: true,
  closeToTray: false,
  homeUrl: 'https://music.163.com/st/webplayer',
  window: {
    width: 1280,
    height: 820,
    maximized: false,
    x: null,
    y: null,
  },
};

class Settings {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.data = { ...DEFAULTS };
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = deepMerge(DEFAULTS, parsed);
    } catch (err) {
      // Missing or corrupt file: fall back to defaults.
      this.data = { ...DEFAULTS };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // Persisting settings is best-effort; never crash the app over it.
      console.error('[settings] save failed:', err);
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  setWindow(bounds) {
    this.data.window = { ...this.data.window, ...bounds };
    this.save();
  }
}

function deepMerge(base, override) {
  if (override === null || typeof override !== 'object') return override;
  if (Array.isArray(override)) return override;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

module.exports = { Settings, DEFAULTS };
