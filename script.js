'use strict';
const $ = id => document.getElementById(id);
const { defaults, validate, safeUrl, parseBackup, engines, themes } = HomeSettings;
const storageKey = 'homepage-settings-v1';
const themeNames = { light: 'Sage', dark: 'Forest', ocean: 'Ocean', lavender: 'Lavender', sunset: 'Sunset', midnight: 'Midnight' };
const themeOptions = document.querySelectorAll('input[name="theme"]');
const dialog = $('customize-dialog');
let settings = defaults();
let editingIndex = null;
let backgroundRevision = 0;
const originalIcons = new Map([...document.querySelectorAll('.shortcut-icon')].map(icon => [icon.classList[1], icon.cloneNode(true)]));
const symbols = { star: '✦', code: '⌘', book: '▤', globe: '◎' };

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); return true; } catch { return false; }
}
function feedback(message) { $('theme-feedback').textContent = message; }
function save(message = 'Changes saved.') {
  const saved = persist();
  feedback(saved ? message : 'Changes applied, but could not save. Device storage may be full or unavailable.');
  return saved;
}
try {
  const stored = readPreference(storageKey);
  if (stored) settings = validate(JSON.parse(stored));
  else {
    const previousTheme = readPreference('homepage-theme');
    if (themes.includes(previousTheme)) settings.theme = previousTheme;
    settings.focus = (readPreference('homepage-focus') || '').slice(0, 160);
  }
} catch { feedback('Saved settings could not be read. Using defaults.'); }

function updateClock() {
  const now = new Date();
  const options = { hour: '2-digit', minute: '2-digit' };
  if (settings.clock !== 'auto') options.hour12 = settings.clock === '12';
  const parts = new Intl.DateTimeFormat(undefined, options).formatToParts(now);
  $('clock').textContent = parts.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim();
  $('period').textContent = parts.find(part => part.type === 'dayPeriod')?.value || '';
  $('date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = settings.name.trim() ? `${greeting}, ${settings.name.trim()}.` : `${greeting}.`;
}

function renderAppearance() {
  document.body.dataset.theme = settings.theme;
  document.querySelector('.weekend-widget').hidden = !settings.showWeekend;
  document.body.classList.toggle('weekend-visible', settings.showWeekend);
  const historyChanged = $('history-panel').hidden === settings.showHistory;
  $('history-panel').hidden = !settings.showHistory;
  document.body.classList.toggle('history-open', settings.showHistory);
  $('history-toggle').setAttribute('aria-expanded', String(settings.showHistory));
  $('history-toggle').setAttribute('aria-label', `${settings.showHistory ? 'Hide' : 'Show'} browsing history`);
  $('history-toggle').setAttribute('title', `${settings.showHistory ? 'Hide' : 'Show'} browsing history`);
  $('setting-showHistory').checked = settings.showHistory;
  if (historyChanged) document.dispatchEvent(new Event('historyvisibilitychange'));
  document.body.classList.toggle('compact', settings.compact);
  document.body.classList.toggle('has-background', !!settings.background);
  document.body.style.backgroundImage = settings.background ? `url("${settings.background}")` : '';
  document.querySelector('.art').hidden = !settings.showArt;
  document.querySelector('.shortcut-section').hidden = !settings.showShortcuts;
  document.querySelector('.focus-card').hidden = !settings.showFocus;
  document.querySelector('.focus-card').classList.toggle('completed', settings.focusDone);
  const engine = engines[settings.engine];
  document.querySelector('.search').action = engine.url;
  document.querySelector('.search-provider').textContent = `Search with ${engine.name}`;
  $('search-input').setAttribute('aria-label', `Search ${engine.name}`);
  $('remove-background').disabled = !settings.background;
  updateClock();
}
function syncControls() {
  themeOptions.forEach(option => { option.checked = option.value === settings.theme; });
  for (const key of ['name', 'clock', 'engine']) $(`setting-${key}`).value = settings[key];
  for (const key of ['compact', 'showArt', 'showShortcuts', 'showFocus', 'showHistory', 'showWeekend']) $(`setting-${key}`).checked = settings[key];
  $('daily-focus').value = settings.focus;
  $('focus-done').checked = settings.focusDone;
  $('focus-done').disabled = !settings.focus.trim();
}
function makeIcon(shortcut) {
  if (originalIcons.has(shortcut.icon)) return originalIcons.get(shortcut.icon).cloneNode(true);
  const icon = document.createElement('span');
  icon.className = 'shortcut-icon custom-icon';
  icon.textContent = symbols[shortcut.icon] || '◎';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
function makeButton(text, label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'shortcut-action';
  button.textContent = text; button.setAttribute('aria-label', label); button.title = label;
  button.disabled = disabled; button.addEventListener('click', action);
  return button;
}
function renderShortcuts() {
  const links = document.querySelector('.links');
  const list = $('shortcut-list');
  links.replaceChildren(); list.replaceChildren();
  settings.shortcuts.forEach((shortcut, index) => {
    const link = document.createElement('a');
    link.className = 'shortcut'; link.href = shortcut.url;
    const copy = document.createElement('span'); copy.className = 'shortcut-copy';
    const name = document.createElement('strong'); name.textContent = shortcut.name;
    const description = document.createElement('span');
    description.textContent = shortcut.description || new URL(shortcut.url).hostname;
    copy.append(name, description);
    const arrow = document.createElement('span'); arrow.className = 'shortcut-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
    link.append(makeIcon(shortcut), copy, arrow); links.append(link);
    const row = document.createElement('div'); row.className = 'shortcut-row';
    const title = document.createElement('span'); title.className = 'shortcut-row-name'; title.textContent = shortcut.name;
    row.append(makeIcon(shortcut), title,
      makeButton('↑', `Move ${shortcut.name} up`, () => moveShortcut(index, -1), index === 0),
      makeButton('↓', `Move ${shortcut.name} down`, () => moveShortcut(index, 1), index === settings.shortcuts.length - 1),
      makeButton('Edit', `Edit ${shortcut.name}`, () => openEditor(index)),
      makeButton('×', `Remove ${shortcut.name}`, () => {
        settings.shortcuts.splice(index, 1); closeEditor(); renderShortcuts(); save('Shortcut removed.');
        $('add-shortcut').focus();
      }));
    list.append(row);
  });
  if (!settings.shortcuts.length) {
    const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'shortcut empty-shortcut';
    empty.textContent = '+ Add your first shortcut';
    empty.addEventListener('click', () => { dialog.showModal(); openEditor(null); }); links.append(empty);
    const hint = document.createElement('p'); hint.className = 'settings-help'; hint.textContent = 'Your favorite sites will appear here.'; list.append(hint);
  }
  $('add-shortcut').disabled = settings.shortcuts.length >= 18;
}
function moveShortcut(index, direction) {
  const next = index + direction;
  if (next < 0 || next >= settings.shortcuts.length) return;
  [settings.shortcuts[index], settings.shortcuts[next]] = [settings.shortcuts[next], settings.shortcuts[index]];
  closeEditor(); renderShortcuts(); save('Shortcut order saved.');
  // Keep keyboard focus with the moved shortcut.
  const buttons = $('shortcut-list').children[next].querySelectorAll('button');
  const preferred = buttons[direction < 0 ? 0 : 1];
  (preferred.disabled ? buttons[2] : preferred).focus();
}
function openEditor(index) {
  editingIndex = index;
  const shortcut = index === null ? { name: '', url: '', description: '', icon: 'globe' } : settings.shortcuts[index];
  $('shortcut-editor').hidden = false;
  $('shortcut-editor-title').textContent = index === null ? 'Add shortcut' : 'Edit shortcut';
  for (const key of ['name','url','description','icon']) $(`shortcut-${key}`).value = shortcut[key];
  $('shortcut-error').textContent = '';
  $('shortcut-name').focus();
}
function closeEditor() { editingIndex = null; $('shortcut-editor').hidden = true; }
$('shortcut-editor').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const shortcut = { name: $('shortcut-name').value.trim(), url: safeUrl($('shortcut-url').value.trim()), description: $('shortcut-description').value.trim(), icon: $('shortcut-icon').value };
    const next = { ...settings, shortcuts: settings.shortcuts.slice() };
    if (editingIndex === null) next.shortcuts.push(shortcut); else next.shortcuts[editingIndex] = shortcut;
    settings = validate(next);
    closeEditor(); renderShortcuts(); save('Shortcut saved.'); $('add-shortcut').focus();
  } catch (error) { $('shortcut-error').textContent = error.message || 'Check the shortcut details.'; }
});
$('add-shortcut').addEventListener('click', () => openEditor(null));
$('cancel-shortcut').addEventListener('click', () => { closeEditor(); $('add-shortcut').focus(); });
function setHistoryVisibility(visible) {
  settings.showHistory = visible;
  renderAppearance();
  save(visible ? 'History sidebar shown.' : 'History sidebar hidden.');
  (visible ? $('history-close') : $('history-toggle')).focus();
}
$('history-toggle').addEventListener('click', () => setHistoryVisibility(!settings.showHistory));
$('history-close').addEventListener('click', () => setHistoryVisibility(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !dialog.open && settings.showHistory) {
    setHistoryVisibility(false);
  }
});
$('customize-button').addEventListener('click', () => dialog.showModal());
$('close-customize').addEventListener('click', () => dialog.close());
$('done-customize').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', closeEditor);
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
themeOptions.forEach(option => option.addEventListener('change', () => {
  settings.theme = option.value; renderAppearance(); save(`${themeNames[settings.theme]} theme saved.`);
}));
for (const key of ['name','clock','engine','compact','showArt','showShortcuts','showFocus','showHistory','showWeekend']) {
  const control = $(`setting-${key}`);
  control.addEventListener(key === 'name' ? 'input' : 'change', () => {
    settings[key] = control.type === 'checkbox' ? control.checked : control.value;
    renderAppearance(); save();
  });
}
$('daily-focus').addEventListener('input', () => {
  settings.focus = $('daily-focus').value; settings.focusDone = false;
  $('focus-done').checked = false; $('focus-done').disabled = !settings.focus.trim();
  document.querySelector('.focus-card').classList.remove('completed');
  $('focus-feedback').textContent = save() ? 'Focus saved on this device.' : 'Focus could not be saved.';
});
$('focus-done').addEventListener('change', () => {
  settings.focusDone = $('focus-done').checked;
  document.querySelector('.focus-card').classList.toggle('completed', settings.focusDone);
  $('focus-feedback').textContent = save() ? (settings.focusDone ? 'Focus complete. Nicely done!' : 'Focus marked incomplete.') : 'Could not save focus completion.';
});

$('background-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  const revision = ++backgroundRevision;
  try {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, or WebP up to 2 MB.');
    const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read that image.')); reader.readAsDataURL(file); });
    // Verify the file decodes as an image before saving it.
    const image = new Image(); image.src = data; await image.decode();
    if (revision !== backgroundRevision) return;
    const previous = settings.background; settings = validate({ ...settings, background:data });
    if (!persist()) { settings.background = previous; throw new Error('Not enough storage for this background. Try a smaller image.'); }
    renderAppearance(); feedback('Background saved on this device.');
  } catch (error) { if (revision === backgroundRevision) feedback(error.message || 'Could not load that background.'); }
});
$('remove-background').addEventListener('click', () => {
  backgroundRevision++; settings.background = ''; renderAppearance(); save('Background removed.');
});
$('export-settings').addEventListener('click', () => {
  const backup = { app: 'a-little-space', version:1, settings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'a-little-space-settings.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback('Settings exported.');
});
$('import-settings').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('Choose a settings backup smaller than 4 MB.');
    const imported = parseBackup(await file.text());
    if (imported.background) { const image = new Image(); image.src = imported.background; await image.decode(); }
    // Commit only after the complete backup is validated and can be stored.
    try { localStorage.setItem(storageKey, JSON.stringify(imported)); } catch { throw new Error('Could not save imported settings. Your current settings are unchanged.'); }
    backgroundRevision++; settings = imported; closeEditor(); syncControls(); renderAppearance(); renderShortcuts();
    feedback('Settings imported successfully.');
  } catch (error) { feedback(error.name === 'SyntaxError' ? 'That file is not valid JSON.' : error.message || 'Could not import that backup.'); }
});
syncControls(); renderAppearance(); renderShortcuts();
setInterval(updateClock, 1000);
