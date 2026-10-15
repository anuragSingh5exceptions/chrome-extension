(function (root) {
  'use strict';
  function normalizeItems(items) {
    const seen = new Set();
    return items.flatMap(item => {
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) return [];
        seen.add(url.href);
        return [{ url:url.href, host:url.hostname, title:typeof item.title === 'string' && item.title.trim() ? item.title : url.hostname,
          time:Number.isFinite(item.lastVisitTime) && item.lastVisitTime > 0 && !Number.isNaN(new Date(item.lastVisitTime).getTime()) ? item.lastVisitTime : 0 }];
      } catch { return []; }
    }).sort((a,b) => b.time - a.time);
  }
  function dayLabel(time, now = new Date()) {
    if (!time) return 'Earlier';
    const date = new Date(time);
    if (date.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }
  function initHistory(document, chrome) {
    const $ = id => document.getElementById(id);
    let limit = 20;
    let revision = 0;
    let searchTimer;
    let listening = false;
    const supported = !!chrome?.permissions?.contains && !!chrome?.permissions?.request;
    const reloadInstructions = 'Open chrome://extensions, find My Custom Homepage, click its Reload button, then close this tab and open a new tab.';
    function setupProblem() {
      if (!chrome?.runtime?.getManifest) return '';
      try {
        const manifest = chrome.runtime.getManifest();
        if (![...(manifest.optional_permissions || []), ...(manifest.permissions || [])].includes('history')) {
          return `Chrome has not loaded the new history permission yet. ${reloadInstructions}`;
        }
      } catch { return `This tab is using an outdated extension context. ${reloadInstructions}`; }
      return '';
    }
    function permissionError(error) {
      const detail = typeof error?.message === 'string' ? error.message : 'Chrome did not provide an error message.';
      return `Could not request history access. ${detail} ${reloadInstructions}`;
    }
    function clear() {
      $('history-list').replaceChildren();
      $('history-list').hidden = true;
      $('history-more').hidden = true;
    }
    function locked(message) {
      clear();
      $('history-toolbar').hidden = true;
      $('history-refresh').hidden = true;
      $('history-enable').hidden = !supported;
      $('history-status').textContent = message;
    }
    function render(items) {
      clear();
      let previousDay = '';
      for (const item of items) {
        const day = dayLabel(item.time);
        if (day !== previousDay) {
          const heading = document.createElement('h3'); heading.className = 'history-day'; heading.textContent = day;
          $('history-list').append(heading); previousDay = day;
        }
        const link = document.createElement('a'); link.className = 'history-item'; link.href = item.url; link.title = item.url;
        const icon = document.createElement('span'); icon.className = 'history-site-icon'; icon.textContent = item.host.replace(/^www\./,'').slice(0,1).toUpperCase(); icon.setAttribute('aria-hidden','true');
        const copy = document.createElement('span'); copy.className = 'history-copy';
        const title = document.createElement('strong'); title.textContent = item.title;
        const host = document.createElement('span'); host.textContent = item.host;
        copy.append(title,host);
        const time = document.createElement('time');
        if (item.time) { time.dateTime = new Date(item.time).toISOString(); time.textContent = new Date(item.time).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }
        const arrow = document.createElement('span'); arrow.className='history-arrow'; arrow.textContent='↗'; arrow.setAttribute('aria-hidden','true');
        link.append(icon,copy,time,arrow); $('history-list').append(link);
      }
      $('history-list').hidden = !items.length;
    }
    function listenForHistory() {
      if (listening) return;
      listening = true;
      // No copies of history are written to local storage or exported.
      chrome.history?.onVisited?.addListener(() => scheduleRefresh());
      chrome.history?.onVisitRemoved?.addListener(() => { revision++; clear(); scheduleRefresh(); });
    }
    async function refresh() {
      const request = ++revision;
      if ($('history-panel').hidden) { clear(); return; }
      if (!supported) {
        locked('History is available when this homepage is opened as your Chrome new-tab extension.');
        return;
      }
      const problem = setupProblem();
      if (problem) { locked(problem); return; }
      $('history-status').textContent = 'Loading recent pages…';
      try {
        const allowed = await chrome.permissions.contains({permissions:['history']});
        if (request !== revision) return;
        if (!allowed) { locked('Enable history to see your recent pages here. Chrome will ask for permission.'); return; }
        $('history-enable').hidden = true;
        $('history-toolbar').hidden = false;
        $('history-refresh').hidden = false;
        listenForHistory();
        const results = await chrome.history.search({text:$('history-search').value.trim(),startTime:0,maxResults:limit + 1});
        if (request !== revision) return;
        const items = normalizeItems(results).slice(0,limit);
        render(items);
        $('history-more').hidden = results.length <= limit || limit >= 200;
        $('history-status').textContent = items.length ? `${items.length} recent ${items.length === 1 ? 'page' : 'pages'}${limit >= 200 ? ' · Showing up to 200 matches' : ''}` : $('history-search').value.trim() ? 'No matching pages. Try a different search.' : 'No recent pages yet. Pages you visit will appear here.';
      } catch (error) {
        if (request !== revision) return;
        clear();
        $('history-status').textContent = `Could not load browsing history. ${error?.message || 'Try Refresh.'} ${reloadInstructions}`;
        $('history-refresh').hidden = false; $('history-enable').hidden = false;
      }
    }
    function scheduleRefresh() {
      revision++; // Invalidate old results as soon as the query changes.
      if ($('history-panel').hidden) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(refresh, 250);
    }
    $('history-enable').addEventListener('click', async () => {
      if (!supported) return;
      const problem = setupProblem();
      if (problem) { locked(problem); return; }
      $('history-enable').disabled = true;
      $('history-status').textContent = 'Waiting for Chrome’s history permission…';
      try {
        // Keep the request directly in the click handler for Chrome's user gesture requirement.
        const granted = await chrome.permissions.request({permissions:['history']});
        if (granted) await refresh();
        else locked('History access was not enabled. You can try again whenever you like.');
      } catch (error) { locked(permissionError(error)); }
      finally { $('history-enable').disabled = false; }
    });
    $('history-search').addEventListener('input', () => { limit = 20; scheduleRefresh(); });
    $('history-refresh').addEventListener('click', () => refresh());
    $('history-more').addEventListener('click', () => { limit = Math.min(limit + 20,200); refresh(); });
    chrome?.permissions?.onRemoved?.addListener(removed => {
      if (removed.permissions?.includes('history')) { revision++; clearTimeout(searchTimer); locked('History access was turned off. Enable it to see recent pages again.'); }
    });
    chrome?.permissions?.onAdded?.addListener(added => {
      if (added.permissions?.includes('history')) refresh();
    });
    document.addEventListener('historyvisibilitychange', () => {
      revision++; clearTimeout(searchTimer);
      if ($('history-panel').hidden) clear();
      else refresh();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    return { refresh, ready:refresh() };
  }
  const api = { normalizeItems, dayLabel, initHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else initHistory(root.document, root.chrome);
})(globalThis);
