(function (root) {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
  const ORIGIN = 'https://www.googleapis.com/*';
  const CONNECTION_KEY = 'homepage-calendar-connected';
  function safeLink(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function eventDate(value) {
    if (value?.dateTime) return new Date(value.dateTime);
    if (typeof value?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
      const [year,month,day] = value.date.split('-').map(Number);
      return new Date(year,month - 1,day);
    }
    return new Date(NaN);
  }
  function normalizeEvents(items, now = new Date()) {
    return items.flatMap(event => {
      if (!event || event.status === 'cancelled' || event.attendees?.some(person => person.self && person.responseStatus === 'declined')) return [];
      if (event.eventType && event.eventType !== 'default') return [];
      const start = eventDate(event.start), end = eventDate(event.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= now || end <= start) return [];
      const video = event.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video');
      return [{ title:typeof event.summary === 'string' && event.summary.trim() ? event.summary : 'Untitled event', start, end,
        allDay:!!event.start.date, join:safeLink(video?.uri || event.hangoutLink), url:safeLink(event.htmlLink) }];
    }).sort((a,b) => a.start - b.start);
  }
  async function fetchUpcoming(fetch, token, now = new Date()) {
    const until = new Date(now); until.setHours(24,0,0,0);
    let pageToken = '', meetings = [];
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      for (const [key,value] of Object.entries({ timeMin:now.toISOString(), timeMax:until.toISOString(), singleEvents:'true', orderBy:'startTime', maxResults:'100', showDeleted:'false' })) url.searchParams.set(key,value);
      if (pageToken) url.searchParams.set('pageToken',pageToken);
      const response = await fetch(url.href,{ headers:{Authorization:`Bearer ${token}`}, cache:'no-store', signal:AbortSignal.timeout(20000) });
      if (!response.ok) {
        const error = new Error(response.status === 401 ? 'Calendar sign-in expired. Connect again.' : response.status === 403 ? 'Google denied Calendar access. Check that Calendar API is enabled and read-only event access is approved.' : response.status === 429 ? 'Google Calendar is busy. Try syncing again later.' : 'Could not reach Google Calendar. Try Sync again.');
        error.status = response.status; throw error;
      }
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Google Calendar returned an unexpected response. Try Sync again.');
      meetings.push(...normalizeEvents(data.items,now).filter(meeting => meeting.start < until));
      pageToken = data.nextPageToken || '';
      if (!pageToken) break;
    }
    return meetings.sort((a,b)=>a.start-b.start);
  }
  function initCalendar(document, chrome, storage, fetch, now = () => new Date()) {
    const $ = id => document.getElementById(id);
    const supported = !!chrome?.identity?.getAuthToken && !!chrome?.runtime?.getManifest;
    let connected = false, busy = false, revision = 0;
    try { connected = storage.getItem(CONNECTION_KEY) === '1'; } catch {}
    function remember(value) { connected = value; try { storage.setItem(CONNECTION_KEY,value ? '1' : '0'); } catch {} }
    function status(message) { $('calendar-status').textContent = message; }
    function clear() { $('calendar-events').replaceChildren(); }
    function controls() {
      $('calendar-connect').hidden = connected;
      $('calendar-connected-controls').hidden = !connected;
      $('calendar-connect').disabled = busy;
      $('calendar-refresh').disabled = busy;
    }
    function setupProblem() {
      if (!supported) return 'Reload this extension in Chrome to connect Google Calendar.';
      try {
        const manifest = chrome.runtime.getManifest();
        $('calendar-extension-id').textContent = chrome.runtime.id;
        if (!manifest.permissions?.includes('identity') || !manifest.optional_host_permissions?.includes(ORIGIN)) return 'Reload the extension in chrome://extensions to load Calendar support.';
        if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(manifest.oauth2?.client_id || '') || !manifest.oauth2?.scopes?.includes(SCOPE)) return 'One-time Google setup is needed. Expand Google Calendar setup below.';
      } catch { return 'This tab uses an old extension context. Reload the extension and open a new tab.'; }
      return '';
    }
    function render(meetings) {
      clear();
      const current = now();
      for (const meeting of meetings) {
        const card = document.createElement('article'); card.className = 'calendar-event';
        if (!meeting.allDay && meeting.start <= current && meeting.end > current) {
          const active = document.createElement('span'); active.className = 'calendar-event-now'; active.textContent = 'HAPPENING NOW'; card.append(active);
        }
        const title = document.createElement('h3'); title.textContent = meeting.title;
        const time = document.createElement('time'); time.dateTime = meeting.allDay ? `${meeting.start.getFullYear()}-${String(meeting.start.getMonth()+1).padStart(2,'0')}-${String(meeting.start.getDate()).padStart(2,'0')}` : meeting.start.toISOString();
        const day = meeting.start.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
        const timeOptions = {hour:'numeric',minute:'2-digit'};
        time.textContent = meeting.allDay ? `${day} · All day` : `${day} · ${meeting.start.toLocaleTimeString(undefined,timeOptions)} – ${meeting.end.toLocaleTimeString(undefined,timeOptions)}`;
        card.append(title,time);
        const links = document.createElement('div'); links.className = 'calendar-event-links';
        for (const [text,url] of [['Join meeting',meeting.join],['View event',meeting.url]]) {
          if (!url) continue;
          const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = text; links.append(link);
        }
        card.append(links); $('calendar-events').append(card);
      }
    }
    async function token(interactive) {
      const result = await chrome.identity.getAuthToken({interactive,scopes:[SCOPE]});
      const value = typeof result === 'string' ? result : result?.token;
      if (!value || result?.grantedScopes && !result.grantedScopes.includes(SCOPE)) throw new Error('Read-only Calendar access was not granted. Connect again and approve event access.');
      return value;
    }
    async function refresh(interactive = false) {
      if ($('calendar-widget').hidden || document.hidden || busy) return;
      const problem = setupProblem();
      if (problem) { clear(); status(problem); if (interactive) $('calendar-setup').open = true; controls(); return; }
      if (!interactive && !connected) { clear(); status('Connect Google Calendar to see today’s meetings.'); controls(); return; }
      const request = ++revision;
      busy = true; controls(); status(interactive ? 'Connecting to Google Calendar…' : 'Syncing today’s meetings…');
      try {
        // Only the Connect button requests permissions or displays Google sign-in.
        if (interactive) {
          const granted = await chrome.permissions.request({origins:[ORIGIN]});
          if (request !== revision) return;
          if (!granted) throw new Error('Calendar connection was cancelled. You can connect whenever you like.');
        } else if (!await chrome.permissions.contains({origins:[ORIGIN]})) {
          remember(false); throw new Error('Calendar access was removed. Connect again to restore it.');
        }
        let accessToken;
        try { accessToken = await token(interactive); }
        catch { remember(false); throw new Error('Google sign-in was cancelled or access expired. Connect again to approve read-only Calendar access.'); }
        if (request !== revision) return;
        remember(true); controls();
        let meetings;
        try { meetings = await fetchUpcoming(fetch,accessToken,now()); }
        catch (error) {
          if (error.status !== 401) throw error;
          await chrome.identity.removeCachedAuthToken({token:accessToken});
          try { accessToken = await token(false); }
          catch { remember(false); throw new Error('Calendar sign-in expired. Connect again.'); }
          if (request !== revision) return;
          meetings = await fetchUpcoming(fetch,accessToken,now());
        }
        if (request !== revision) return;
        render(meetings);
        status(meetings.length ? `Synced ${now().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})} · Times are local` : 'You’re all clear. No more meetings today.');
        $('calendar-setup').open = false;
      } catch (error) {
        if (request !== revision) return;
        clear();
        if (error.status === 401) remember(false);
        status(error instanceof TypeError ? 'Could not reach Google Calendar. Check your connection and try Sync again.' : error.message || 'Could not sync Calendar. Try connecting again.');
      } finally { if (request === revision) { busy = false; controls(); } }
    }
    async function disconnect() {
      const request = ++revision; remember(false); clear(); busy = true; controls();
      status('Calendar disconnected from this homepage.');
      try { await chrome.identity.clearAllCachedAuthTokens(); }
      catch { if (request === revision) status('Calendar disconnected. Chrome could not clear its token cache; reload the extension before reconnecting.'); }
      finally { if (request === revision) { busy = false; controls(); } }
    }
    $('calendar-connect').addEventListener('click',()=>refresh(true));
    $('calendar-refresh').addEventListener('click',()=>refresh(false));
    $('calendar-disconnect').addEventListener('click',disconnect);
    document.addEventListener('calendarvisibilitychange',()=>{
      revision++; clear(); busy = false; controls();
      if (!$('calendar-widget').hidden) refresh();
    });
    document.addEventListener('visibilitychange',()=>{ if (!document.hidden) refresh(); });
    function syncConnection() {
      let stored = false;
      try { stored = storage.getItem(CONNECTION_KEY) === '1'; } catch {}
      if (stored === connected) return;
      revision++; connected = stored; clear(); busy = false; controls();
      if (connected) refresh(); else status('Calendar disconnected from this homepage.');
    }
    chrome?.permissions?.onRemoved?.addListener(removed => {
      if (removed.origins?.includes(ORIGIN)) disconnect();
    });
    controls();
    return { refresh, disconnect, syncConnection, ready:refresh() };
  }
  const api = { normalizeEvents, eventDate, safeLink, fetchUpcoming, initCalendar, SCOPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    const calendar = initCalendar(root.document,root.chrome,root.localStorage,root.fetch.bind(root));
    root.setInterval(()=>calendar.refresh(),5*60*1000);
    root.addEventListener('storage',event=>{ if(event.key === CONNECTION_KEY) calendar.syncConnection(); });
  }
})(globalThis);
