const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeItems,dayLabel,initHistory}=require('../history.js');
function harness(chrome, panelHidden = false) {
 const nodes=new Map();
 function element() {return {children:[],listeners:{},value:'',hidden:false,textContent:'',addEventListener(n,fn){this.listeners[n]=fn},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},setAttribute(){}};}
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const events={};
 get('history-panel').hidden=panelHidden;
 const document={getElementById:get,createElement:element,addEventListener(name,handler){events[name]=handler;}};
 const controller=initHistory(document,chrome);
 return {get,events,...controller};
}
function browser(items=[],allowed=true) {
 const handlers={}; const queries=[];
 const chrome={permissions:{contains:async()=>allowed,request:async()=>allowed,onRemoved:{addListener(fn){handlers.removed=fn}},onAdded:{addListener(fn){handlers.added=fn}}},history:{search:async query=>{queries.push(query);return items},onVisited:{addListener(fn){handlers.visited=fn}},onVisitRemoved:{addListener(fn){handlers.visitRemoved=fn}}}};
 return {chrome,handlers,queries};
}
test('history is newest first, deduplicated, and restricted to safe website URLs',()=>{
 const items=normalizeItems([{url:'https://example.com/',title:'<script>alert(1)</script>',lastVisitTime:1},{url:'javascript:alert(1)'},{url:'chrome://settings'},{url:'file:///private.txt'},{url:'https://user:secret@example.org'},{url:'https://example.com/',lastVisitTime:4},{url:'https://new.example',lastVisitTime:3},{url:'https://old.example',lastVisitTime:Infinity}]);
 assert.equal(items.length,3);assert.equal(items[0].host,'new.example');assert.equal(items[1].title,'<script>alert(1)</script>');assert.equal(items[2].time,0);
});
test('day headings handle today, yesterday, previous years and unknown timestamps',()=>{
 const now=new Date(2026,0,1,10);
 assert.equal(dayLabel(now.getTime(),now),'Today');
 assert.equal(dayLabel(new Date(2025,11,31,20).getTime(),now),'Yesterday');
 assert.match(dayLabel(new Date(2024,3,1).getTime(),now),/2024/);
 assert.equal(dayLabel(0,now),'Earlier');
});
test('standalone preview does not access history and explains extension requirement',async()=>{
 const page=harness();await page.ready;
 assert.equal(page.get('history-enable').hidden,true);
 assert.match(page.get('history-status').textContent,/Chrome new-tab extension/);
});
test('ungranted access needs a button click; a declined request leaves the list hidden',async()=>{
 const b=browser([],false);let requests=0;b.chrome.permissions.request=async()=>{requests++;return false};
 const page=harness(b.chrome);await page.ready;
 assert.equal(b.queries.length,0);assert.equal(requests,0);
 assert.equal(page.get('history-enable').hidden,false);
 await page.get('history-enable').listeners.click();
 assert.equal(requests,1);assert.equal(page.get('history-list').hidden,true);
 assert.match(page.get('history-status').textContent,/not enabled/);
});
test('granted access renders links and supports more results and permission revocation',async()=>{
 const rows=Array.from({length:21},(_,i)=>({url:`https://example.com/${i}`,title:`Page ${i}`,lastVisitTime:Date.now()-i*1000}));
 const b=browser(rows);const page=harness(b.chrome);await page.ready;
 assert.equal(b.queries[0].maxResults,21);assert.equal(b.queries[0].startTime,0);
 assert.equal(page.get('history-list').hidden,false);assert.equal(page.get('history-more').hidden,false);
 const link=page.get('history-list').children.find(x=>x.className==='history-item');
 assert.equal(link.href,'https://example.com/0');assert.equal(link.children[1].children[0].textContent,'Page 0');
 page.get('history-more').listeners.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.queries.at(-1).maxResults,41);
 b.handlers.removed({permissions:['history']});
 assert.equal(page.get('history-list').children.length,0);assert.equal(page.get('history-enable').hidden,false);
});
test('outdated async results cannot overwrite a newer search',async()=>{
 const b=browser();const pending=[];b.chrome.history.search=()=>new Promise(resolve=>pending.push(resolve));
 const page=harness(b.chrome);await new Promise(resolve=>setImmediate(resolve));
 page.get('history-search').value='new';const recent=page.refresh();await new Promise(resolve=>setImmediate(resolve));
 pending[1]([{url:'https://new.example',title:'New'}]);await recent;
 pending[0]([{url:'https://old.example',title:'Old'}]);await page.ready;
 const link=page.get('history-list').children.find(x=>x.className==='history-item');assert.equal(link.href,'https://new.example/');
});
test('API failures and empty searches display useful states',async()=>{
 const b=browser();const page=harness(b.chrome);await page.ready;
 assert.match(page.get('history-status').textContent,/No recent pages/);
 page.get('history-search').value='nothing';await page.refresh();assert.match(page.get('history-status').textContent,/No matching pages/);
 b.chrome.history.search=async()=>{throw Error('Unavailable')};await page.refresh();
 assert.match(page.get('history-status').textContent,/Could not load/);assert.equal(page.get('history-list').hidden,true);
});

test('stale loaded manifest explains how to reload instead of making an impossible request',async()=>{
 const b=browser([],false);let requests=0;
 b.chrome.runtime={getManifest:()=>({manifest_version:3})};
 b.chrome.permissions.request=async()=>{requests++;return false};
 const page=harness(b.chrome);await page.ready;
 assert.match(page.get('history-status').textContent,/has not loaded the new history permission/);
 assert.match(page.get('history-status').textContent,/chrome:\/\/extensions/);
 await page.get('history-enable').listeners.click();
 assert.equal(requests,0);assert.equal(b.queries.length,0);
 // Once Chrome has the new manifest the request can run normally.
 b.chrome.runtime.getManifest=()=>({optional_permissions:['history']});
 await page.get('history-enable').listeners.click();assert.equal(requests,1);
});
test('request failures show Chrome actual error and reset the enable button',async()=>{
 const b=browser([],false);b.chrome.runtime={getManifest:()=>({optional_permissions:['history']})};
 b.chrome.permissions.request=async()=>{throw Error('This function must be called during a user gesture')};
 const page=harness(b.chrome);await page.ready;
 await page.get('history-enable').listeners.click();
 assert.match(page.get('history-status').textContent,/must be called during a user gesture/);
 assert.equal(page.get('history-enable').disabled,false);
});
test('permission request starts synchronously in the click handler and a grant loads history',async()=>{
 const b=browser([{url:'https://example.com',title:'Example'}],false);let requestStarted=false;
 b.chrome.runtime={getManifest:()=>({optional_permissions:['history']})};
 b.chrome.permissions.request=()=>{requestStarted=true;b.chrome.permissions.contains=async()=>true;return Promise.resolve(true)};
 const page=harness(b.chrome);await page.ready;
 const click=page.get('history-enable').listeners.click();assert.equal(requestStarted,true);
 await click;assert.equal(page.get('history-list').hidden,false);
});
test('outdated extension context shows reload instructions',async()=>{
 const b=browser([],false);b.chrome.runtime={getManifest(){throw Error('Extension context invalidated')}};
 const page=harness(b.chrome);await page.ready;
 assert.match(page.get('history-status').textContent,/outdated extension context/);
});

test('closed sidebar does not query history, opening loads it, and closing clears it',async()=>{
 const b=browser([{url:'https://example.com/',title:'Recent page'}]);
 const page=harness(b.chrome,true);await page.ready;
 assert.equal(b.queries.length,0);
 page.get('history-panel').hidden=false;
 page.events.historyvisibilitychange();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.queries.length,1);assert.equal(page.get('history-list').hidden,false);
 page.get('history-panel').hidden=true;
 page.events.historyvisibilitychange();
 assert.equal(page.get('history-list').children.length,0);
 await page.refresh();assert.equal(b.queries.length,1);
});
test('closing the sidebar invalidates an outstanding history request',async()=>{
 const b=browser();let finish;b.chrome.history.search=()=>new Promise(resolve=>{finish=resolve});
 const page=harness(b.chrome);await new Promise(resolve=>setImmediate(resolve));
 page.get('history-panel').hidden=true;page.events.historyvisibilitychange();
 finish([{url:'https://example.com/',title:'Private result'}]);await page.ready;
 assert.equal(page.get('history-list').children.length,0);assert.equal(page.get('history-list').hidden,true);
});
