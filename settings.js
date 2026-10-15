(function (root) {
  'use strict';
  const themes = ['light', 'dark', 'ocean', 'lavender', 'sunset', 'midnight'];
  const icons = ['github', 'youtube', 'gmail', 'star', 'code', 'book', 'globe'];
  const engines = {
    google: { name: 'Google', url: 'https://www.google.com/search' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search' }
  };
  function defaults() {
    return { theme: 'light', name: '', clock: 'auto', compact: false, showArt: true,
      showShortcuts: true, showFocus: true, showHistory: false, engine: 'google', background: '', focus: '', focusDone: false,
      shortcuts: [
        { name: 'GitHub', url: 'https://github.com/', description: 'Build something great', icon: 'github' },
        { name: 'YouTube', url: 'https://youtube.com/', description: 'A little inspiration', icon: 'youtube' },
        { name: 'Gmail', url: 'https://gmail.com/', description: 'Keep in touch', icon: 'gmail' }
      ] };
  }
  function text(value, max) { return typeof value === 'string' && value.length <= max; }
  function safeUrl(value) {
    if (!text(value, 2048)) throw new Error('Use a website address under 2,048 characters.');
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || /\s/.test(value) || /^[a-z][\w+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) throw new Error('Use a valid http or https website address.');
    return url.href;
  }
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings.');
    const next = defaults();
    if (!themes.includes(value.theme) || !['auto','12','24'].includes(value.clock) || !Object.hasOwn(engines,value.engine)) throw new Error('Invalid theme, clock, or search engine.');
    for (const key of ['compact','showArt','showShortcuts','showFocus','focusDone']) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid layout settings.');
      next[key] = value[key];
    }
    // Older settings and backups predate the optional sidebar.
    if (value.showHistory !== undefined && typeof value.showHistory !== 'boolean') throw new Error('Invalid history visibility.');
    next.showHistory = value.showHistory ?? false;
    for (const [key,max] of [['name',40],['focus',160],['background',2800000]]) {
      if (!text(value[key], max)) throw new Error(`Invalid ${key}.`);
      next[key] = value[key];
    }
    if (value.background && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.background)) throw new Error('Use a PNG, JPEG, or WebP background.');
    if (!Array.isArray(value.shortcuts) || value.shortcuts.length > 18) throw new Error('Choose up to 18 shortcuts.');
    next.shortcuts = value.shortcuts.map(item => {
      if (!item || !text(item.name,40) || !item.name.trim() || !text(item.description,80) || !icons.includes(item.icon)) throw new Error('Invalid shortcut.');
      return { name:item.name.trim(), url:safeUrl(item.url), description:item.description, icon:item.icon };
    });
    for (const key of ['theme','clock','engine']) next[key] = value[key];
    return next;
  }
  function parseBackup(raw) {
    const backup = JSON.parse(raw);
    if (backup?.app !== 'a-little-space' || backup.version !== 1) throw new Error('Choose an A little space settings backup (version 1).');
    return validate(backup.settings);
  }
  const api = { defaults, validate, safeUrl, parseBackup, engines, themes, icons };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HomeSettings = api;
})(globalThis);
