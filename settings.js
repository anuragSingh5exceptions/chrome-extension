(function (root) {
  'use strict';
  const themes = ['light', 'dark', 'ocean', 'lavender', 'sunset', 'midnight', 'scifi'];
  const artworks = ['orbit','radar','planet','constellation'];
  const artSpeeds = ['off','slow','normal','fast'];
  const icons = ['github', 'youtube', 'gmail', 'star', 'code', 'book', 'globe'];
  const engines = {
    google: { name: 'Google', url: 'https://www.google.com/search' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search' }
  };
  function defaults() {
    return { artwork: 'orbit', artSpeed: 'slow', artColor: '', theme: 'light', scifiAccent: '#4de3ff', scifiBackground: '#07111f', name: '', clock: 'auto', compact: false, showArt: true,
      showShortcuts: true, showFocus: true, showHistory: false, showWeekend: true, showCalendar: true, engine: 'google', background: '', focus: '', focusDone: false,
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
    if (value.artwork !== undefined && !artworks.includes(value.artwork)) throw new Error('Invalid artwork design.');
    if (value.artSpeed !== undefined && !artSpeeds.includes(value.artSpeed)) throw new Error('Invalid artwork speed.');
    if (value.artColor !== undefined && (typeof value.artColor !== 'string' || value.artColor !== '' && !/^#[0-9a-f]{6}$/i.test(value.artColor))) throw new Error('Invalid artwork color.');
    next.artwork = value.artwork ?? next.artwork;
    next.artSpeed = value.artSpeed ?? next.artSpeed;
    next.artColor = (value.artColor ?? next.artColor).toLowerCase();
    for (const key of ['scifiAccent', 'scifiBackground']) {
      if (value[key] !== undefined && (typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key]))) throw new Error('Use a six-digit hex color for the sci-fi theme.');
      if (value[key] !== undefined) next[key] = value[key].toLowerCase();
    }
    if (!themes.includes(value.theme) || !['auto','12','24'].includes(value.clock) || !Object.hasOwn(engines,value.engine)) throw new Error('Invalid theme, clock, or search engine.');
    for (const key of ['compact','showArt','showShortcuts','showFocus','focusDone']) {
      if (typeof value[key] !== 'boolean') throw new Error('Invalid layout settings.');
      next[key] = value[key];
    }
    // Older settings and backups predate the optional sidebar.
    if (value.showHistory !== undefined && typeof value.showHistory !== 'boolean') throw new Error('Invalid history visibility.');
    next.showHistory = value.showHistory ?? false;
    if (value.showWeekend !== undefined && typeof value.showWeekend !== 'boolean') throw new Error('Invalid weekend calculator visibility.');
    next.showWeekend = value.showWeekend ?? true;
    if (value.showCalendar !== undefined && typeof value.showCalendar !== 'boolean') throw new Error('Invalid calendar visibility.');
    next.showCalendar = value.showCalendar ?? true;
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
  function sciFiPalette(accent, background) {
    const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel,16));
    const hex = channels => '#' + channels.map(channel => Math.round(channel).toString(16).padStart(2,'0')).join('');
    const mix = (a,b,amount) => hex(rgb(a).map((channel,i) => channel + (rgb(b)[i] - channel) * amount));
    const luminance = color => rgb(color).map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum,channel,i) => sum + channel * [.2126,.7152,.0722][i],0);
    const contrast = (a,b) => (Math.max(luminance(a),luminance(b)) + .05) / (Math.min(luminance(a),luminance(b)) + .05);
    const ink = contrast('#ffffff',background) >= contrast('#000000',background) ? '#ffffff' : '#000000';
    let surface = mix(background,ink,.035);
    if (contrast(ink,surface) < 4.5) surface = background;
    let highlight = accent;
    // Keep labels readable even when the chosen neon matches the background.
    for (let step=1; (contrast(highlight,background) < 4.5 || contrast(highlight,surface) < 4.5) && step <= 20; step++) highlight = mix(accent,ink,step / 20);
    let focus = mix(background,highlight,.09);
    if (contrast(ink,focus) < 4.5) focus = background;
    let art = mix(background,highlight,.12);
    if (contrast(highlight,art) < 4.5) art = background;
    let muted = mix(background,ink,.65);
    if (contrast(muted,surface) < 4.5) muted = ink;
    return { background, neon:accent, ink, muted, highlight, surface,
      line:mix(background,highlight,.3), focus, art,
      buttonInk:contrast('#ffffff',highlight) >= contrast('#000000',highlight) ? '#ffffff' : '#000000',
      scheme:ink === '#ffffff' ? 'dark' : 'light' };
  }
  const api = { artworks, artSpeeds, sciFiPalette, defaults, validate, safeUrl, parseBackup, engines, themes, icons };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HomeSettings = api;
})(globalThis);
