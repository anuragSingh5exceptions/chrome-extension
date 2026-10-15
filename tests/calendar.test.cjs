const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeEvents,eventDate,safeLink,fetchUpcoming,initCalendar,SCOPE}=require('../calendar.js');
const {configure}=require('../configure-calendar.cjs');
const now=new Date('2026-10-15T10:00:00Z');
const item=(changes={})=>({summary:'Team sync',start:{dateTime:'2026-10-15T10:30:00Z'},end:{dateTime:'2026-10-15T11:00:00Z'},htmlLink:'https://calendar.google.com/event?id=1',...changes});
const response=items=>({ok:true,json:async()=>({items})});
function harness({connected=false,configured=true,hidden=false,fetch=async()=>response([item()])}={}) {
 const nodes=new Map(),events={},store=new Map(connected?[['homepage-calendar-connected','1']]:[]),calls={auth:[],permissions:0,clear:0,remove:0};
 const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,children:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn},replaceChildren(){this.children=[]},append(...items){this.children.push(...items)}});return nodes.get(id)};
 get('calendar-widget').hidden=hidden;
 const document={getElementById:get,createElement:()=>({children:[],append(...items){this.children.push(...items)}}),addEventListener(name,fn){events[name]=fn}};
 const chrome={runtime:{id:'test-extension-id',getManifest:()=>({permissions:['identity'],optional_host_permissions:['https://www.googleapis.com/*'],...(configured?{oauth2:{client_id:'123456-clientid.apps.googleusercontent.com',scopes:[SCOPE]}}:{})})},permissions:{request:async()=>{calls.permissions++;return true},contains:async()=>true,onRemoved:{addListener(fn){events.permissionRemoved=fn}}},identity:{getAuthToken:async options=>{calls.auth.push(options);return {token:'test-token',grantedScopes:[SCOPE]}},removeCachedAuthToken:async()=>{calls.remove++},clearAllCachedAuthTokens:async()=>{calls.clear++}}};
 const storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
 const controller=initCalendar(document,chrome,storage,fetch,()=>now);
 return {get,events,store,calls,chrome,...controller};
}
test('OAuth configuration validates public client IDs and only adds read-only scope',()=>{
 const original={manifest_version:3,optional_permissions:['history']};
 const next=configure('123456-clientid.apps.googleusercontent.com',original);
 assert.deepEqual(next.oauth2.scopes,[SCOPE]);assert.equal(original.oauth2,undefined);
 for(const value of ['',null,'client-secret','https://example.com'])assert.throws(()=>configure(value,original));
});
test('events normalize safely, exclude cancelled, declined, ended, and special events',()=>{
 const list=normalizeEvents([item(),item({status:'cancelled'}),item({attendees:[{self:true,responseStatus:'declined'}]}),item({end:{dateTime:'2026-10-15T09:00:00Z'}}),item({eventType:'outOfOffice'}),item({start:{dateTime:'invalid'}})],now);
 assert.equal(list.length,1);assert.equal(list[0].title,'Team sync');
 assert.equal(safeLink('javascript:alert(1)'),'');assert.equal(safeLink('https://user:secret@example.com'),'');
 assert.equal(safeLink('https://meet.google.com/abc-defg-hij'),'https://meet.google.com/abc-defg-hij');
});
test('all-day events stay on their calendar date and conference links are safe',()=>{
 const date=eventDate({date:'2026-10-16'});assert.equal(date.getDate(),16);assert.equal(date.getHours(),0);
 const [event]=normalizeEvents([item({summary:'<script>hello</script>',start:{date:'2026-10-16'},end:{date:'2026-10-17'},conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc'}]}})],now);
 assert.equal(event.allDay,true);assert.equal(event.title,'<script>hello</script>');assert.equal(event.join,'https://meet.google.com/abc');
});
test('Calendar request bounds time, expands recurring events, and keeps token out of URL',async()=>{
 let target,options;
 await fetchUpcoming(async(url,init)=>{target=new URL(url);options=init;return response([item()])},'token',now);
 assert.equal(target.searchParams.get('singleEvents'),'true');assert.equal(target.searchParams.get('orderBy'),'startTime');assert.equal(target.searchParams.get('timeMin'),now.toISOString());
 assert(target.pathname.endsWith('/primary/events'));assert.equal(options.headers.Authorization,'Bearer token');assert(!target.href.includes('token'));
 const endOfToday=new Date(now);endOfToday.setHours(24,0,0,0);
 assert.equal(target.searchParams.get('timeMax'),endOfToday.toISOString());
});
test('pagination skips declined events and includes all of today’s meetings',async()=>{
 let count=0;
 const meetings=await fetchUpcoming(async()=>{count++;return count===1?{ok:true,json:async()=>({items:[item({status:'cancelled'})],nextPageToken:'next'})}:response(Array(8).fill(item()))},'token',now);
 assert.equal(count,2);assert.equal(meetings.length,8);
});
test('missing configuration explains setup and never starts authorization',async()=>{
 const page=harness({configured:false});await page.ready;
 await page.get('calendar-connect').listeners.click();
 assert.equal(page.calls.auth.length,0);assert.equal(page.get('calendar-setup').open,true);
 assert.match(page.get('calendar-status').textContent,/One-time Google setup/);
});
test('connection is explicit, read-only, and stored separately from homepage backups',async()=>{
 const page=harness();await page.ready;assert.equal(page.calls.auth.length,0);
 await page.get('calendar-connect').listeners.click();
 assert.equal(page.calls.permissions,1);assert.equal(page.calls.auth[0].interactive,true);assert.deepEqual(page.calls.auth[0].scopes,[SCOPE]);
 assert.equal(page.store.get('homepage-calendar-connected'),'1');assert.equal(page.store.size,1);
 assert.equal(page.get('calendar-events').children.length,1);assert.equal(page.get('calendar-connect').hidden,true);
 await page.disconnect();assert.equal(page.calls.clear,1);assert.equal(page.get('calendar-events').children.length,0);
 assert.equal(page.store.get('homepage-calendar-connected'),'0');
});
test('automatic refresh never prompts and hidden cards never fetch',async()=>{
 const page=harness({connected:true});await page.ready;
 assert.equal(page.calls.auth[0].interactive,false);assert.equal(page.calls.permissions,0);
 const hidden=harness({connected:true,hidden:true});await hidden.ready;assert.equal(hidden.calls.auth.length,0);
});
test('a 401 evicts the stale token and retries once non-interactively',async()=>{
 let calls=0;
 const page=harness({connected:true,fetch:async()=>++calls===1?{ok:false,status:401}:response([item()])});await page.ready;
 assert.equal(page.calls.remove,1);assert.equal(calls,2);assert(page.calls.auth.every(call=>call.interactive===false));
 assert.equal(page.get('calendar-events').children.length,1);
});
test('API errors produce useful states without exposing tokens',async()=>{
 const page=harness({connected:true,fetch:async()=>({ok:false,status:403})});await page.ready;
 assert.match(page.get('calendar-status').textContent,/Calendar API is enabled/);
 assert.equal(page.get('calendar-events').children.length,0);assert(!page.get('calendar-status').textContent.includes('test-token'));
});
test('closing the card invalidates pending sync results',async()=>{
 let finish;const page=harness({connected:true,fetch:()=>new Promise(resolve=>{finish=resolve})});
 await new Promise(resolve=>setImmediate(resolve));
 page.get('calendar-widget').hidden=true;page.events.calendarvisibilitychange();
 finish(response([item()]));await page.ready;
 assert.equal(page.get('calendar-events').children.length,0);
});
test('a disconnect in another tab clears this card without reloading the homepage',async()=>{
 const page=harness({connected:true});await page.ready;
 page.store.set('homepage-calendar-connected','0');page.syncConnection();
 assert.equal(page.get('calendar-events').children.length,0);assert.equal(page.get('calendar-connect').hidden,false);
});

test('today filter excludes tomorrow while retaining ongoing and cross-midnight meetings',async()=>{
 const localNow=new Date(2026,9,15,17,0);
 const timed=(start,end)=>item({start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}});
 const meetings=await fetchUpcoming(async()=>response([
  timed(new Date(2026,9,15,18),new Date(2026,9,15,19)),
  timed(new Date(2026,9,16,0),new Date(2026,9,16,1)),
  timed(new Date(2026,9,15,16),new Date(2026,9,15,18)),
  timed(new Date(2026,9,15,23,30),new Date(2026,9,16,0,30)),
  timed(new Date(2026,9,15,15),new Date(2026,9,15,17)),
  item({start:{date:'2026-10-16'},end:{date:'2026-10-17'}}),
  item({start:{date:'2026-10-15'},end:{date:'2026-10-16'}})
 ]),'token',localNow);
 assert.equal(meetings.length,4);
 assert(meetings.every(meeting=>meeting.start<new Date(2026,9,16)));
 assert(meetings.some(meeting=>meeting.allDay));
});
test('empty today state does not refer to the week',async()=>{
 const page=harness({connected:true,fetch:async()=>response([])});await page.ready;
 assert.match(page.get('calendar-status').textContent,/No more meetings today/);
});
test('daily boundary uses the next local midnight across daylight saving changes',async()=>{
 for(const date of [new Date(2026,2,8,0,30),new Date(2026,10,1,0,30)]) {
  let query;
  await fetchUpcoming(async url=>{query=new URL(url);return response([])},'token',date);
  const end=new Date(query.searchParams.get('timeMax'));
  assert.equal(end.getHours(),0);assert.equal(end.getDate(),date.getDate()+1);
  assert.equal(end.getMonth(),date.getMonth());
 }
});
