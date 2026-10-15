const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const settingsApi = require('../settings.js');

test('defaults and all palettes survive an export/import round trip', () => {
  for (const theme of settingsApi.themes) {
    const settings = { ...settingsApi.defaults(), theme, name: 'Alex', clock: '24', engine: 'duckduckgo', compact: true, showArt: false, focus: 'Ship it', focusDone: true };
    const backup = JSON.stringify({ app:'a-little-space', version:1, settings });
    assert.deepEqual(settingsApi.parseBackup(backup), settings);
  }
});
test('shortcut URLs allow ordinary websites and reject executable or credentialed URLs', () => {
  assert.equal(settingsApi.safeUrl('example.com/path?q=hello'), 'https://example.com/path?q=hello');
  assert.equal(settingsApi.safeUrl('http://localhost:8080/'), 'http://localhost:8080/');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/file', 'https://user:password@example.com', 'https://bad host.com', 'http:example.com']) assert.throws(() => settingsApi.safeUrl(url));
});
test('invalid backups fail before changes can be applied', () => {
  const backup = settings => JSON.stringify({ app:'a-little-space', version:1, settings });
  for (const changes of [
    { engine:'__proto__' }, { theme:'unknown' }, { clock:'30' }, { compact:'yes' },
    { name:'x'.repeat(41) }, { background:'https://example.com/image.png' },
    { background:'data:image/svg+xml;base64,PHN2Zz4=' },
    { shortcuts:Array(19).fill(settingsApi.defaults().shortcuts[0]) },
    { shortcuts:[{name:'Unsafe',url:'javascript:alert(1)',description:'',icon:'globe'}] }
  ]) assert.throws(() => settingsApi.parseBackup(backup({...settingsApi.defaults(), ...changes})));
  assert.throws(() => settingsApi.parseBackup('{'));
  assert.throws(() => settingsApi.parseBackup(JSON.stringify({app:'another-app',version:1,settings:settingsApi.defaults()})));
  assert.deepEqual(settingsApi.validate({...settingsApi.defaults(),shortcuts:[]}).shortcuts, []);
});

// Exercise application event handlers with a small DOM stand-in. Browser layout
// and native dialog behavior still require a manual extension preview.
function boot(initial = {}, failWrites = false) {
  class Element {
    constructor() { this.children=[]; this.listeners={}; this.attributes={}; this.dataset={}; this.style={}; this.value=''; this.textContent=''; this.hidden=false; this.checked=false; this.type='text'; this.files=[]; this.classList={toggle(){},remove(){}}; }
    addEventListener(name, handler) { this.listeners[name]=handler; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children=children; }
    setAttribute(key,value) { this.attributes[key]=value; }
    cloneNode() { return new Element(); }
    querySelectorAll() { return this.children.filter(child=>child.type==='button'); }
    focus() { this.focused=true; }
    showModal() { this.open=true; }
    close() { this.open=false; this.listeners.close?.(); }
    getBoundingClientRect() { return {left:10,right:500,top:10,bottom:500}; }
  }
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const radios=settingsApi.themes.map(value=>Object.assign(new Element(),{value}));
  for (const key of ['compact','showArt','showShortcuts','showFocus','showHistory','showWeekend']) get('setting-'+key).type='checkbox';
  const store=new Map(Object.entries(initial));
  const context={HomeSettings:settingsApi, document:{addEventListener(name,handler){this.listeners ||= {};this.listeners[name]=handler;},dispatchEvent(event){this.listeners?.[event.type]?.(event);},getElementById:get,querySelector:get,querySelectorAll:selector=>selector.includes('name=')?radios:[],createElement:()=>new Element(),body:new Element()},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(failWrites)throw Error('Quota');store.set(key,value);}},Date,Intl,URL,Event,setInterval(){},setTimeout(){},console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../script.js'),'utf8'),context);
  return {get,store,context,radios,change(id,value,checked){const el=get(id);el.value=value;el.checked=checked;el.listeners.change?.();el.listeners.input?.();},saved(){return JSON.parse(store.get('homepage-settings-v1'));}};
}
test('migrates previous preferences, edits settings, and restores them on next load', () => {
  const page=boot({'homepage-theme':'midnight','homepage-focus':'Finish work'});
  assert.equal(page.context.document.body.dataset.theme,'midnight');
  assert.equal(page.get('daily-focus').value,'Finish work');
  page.change('setting-name','Alex'); page.change('setting-engine','bing'); page.change('setting-clock','24');
  page.change('setting-showArt','',false);
  page.change('focus-done','',true);
  assert.equal(page.saved().focusDone,true);
  assert.equal(page.get('.search').action,settingsApi.engines.bing.url);
  assert.equal(page.get('.art').hidden,true);
  assert.match(page.get('greeting').textContent,/Alex/);
  const next=boot(Object.fromEntries(page.store));
  assert.equal(next.get('setting-name').value,'Alex');
  assert.equal(next.get('focus-done').checked,true);
  page.change('daily-focus','Next task');assert.equal(page.saved().focusDone,false);
});
test('shortcut add, edit, reorder, remove, and validation work through UI handlers', () => {
  const page=boot();const submit=()=>page.get('shortcut-editor').listeners.submit({preventDefault(){}});
  page.get('add-shortcut').listeners.click();
  for (const [key,value] of Object.entries({name:'Docs',url:'example.com/docs',description:'Reference',icon:'book'}))page.get('shortcut-'+key).value=value;
  submit();assert.equal(page.saved().shortcuts.length,4);
  assert.equal(page.saved().shortcuts[3].url,'https://example.com/docs');
  // The row's children are icon, title, up, down, edit, remove.
  page.get('shortcut-list').children[3].children[2].listeners.click();
  assert.equal(page.saved().shortcuts[2].name,'Docs');
  page.get('shortcut-list').children[2].children[4].listeners.click();
  page.get('shortcut-name').value='Reference';submit();
  assert.equal(page.saved().shortcuts[2].name,'Reference');
  page.get('shortcut-list').children[2].children[5].listeners.click();
  assert.equal(page.saved().shortcuts.length,3);
  page.get('add-shortcut').listeners.click();
  page.get('shortcut-name').value='Bad';page.get('shortcut-url').value='javascript:alert(1)';submit();
  assert(page.get('shortcut-error').textContent);assert.equal(page.saved().shortcuts.length,3);
});
test('failed storage is reported and invalid imports leave settings unchanged', async () => {
  const page=boot({},true);page.change('setting-name','Alex');
  assert.match(page.get('theme-feedback').textContent,/could not save/);
  const good=boot();good.change('setting-name','Original');
  await good.get('import-settings').listeners.change({target:{files:[{size:20,text:async()=>'{broken'}],value:''}});
  assert.equal(good.saved().name,'Original');
  assert.match(good.get('theme-feedback').textContent,/not valid JSON/);
  const imported={...settingsApi.defaults(),name:'Imported',engine:'duckduckgo'};
  await good.get('import-settings').listeners.change({target:{files:[{size:100,text:async()=>JSON.stringify({app:'a-little-space',version:1,settings:imported})}],value:''}});
  assert.equal(good.saved().name,'Imported');assert.equal(good.get('setting-engine').value,'duckduckgo');
  await page.get('import-settings').listeners.change({target:{files:[{size:100,text:async()=>JSON.stringify({app:'a-little-space',version:1,settings:imported})}],value:''}});
  assert.equal(page.get('setting-name').value,'Alex');
  assert.match(page.get('theme-feedback').textContent,/current settings are unchanged/);
});

test('background uploads validate file type, size, decode, and persistence', async () => {
  const page=boot();
  page.context.FileReader=class { readAsDataURL(file) {this.result=file.data;this.onload();} };
  page.context.Image=class { async decode() { if(this.src.includes('broken'))throw Error('Invalid image'); } };
  const upload=file=>page.get('background-file').listeners.change({target:{files:[file],value:''}});
  await upload({type:'image/svg+xml',size:10});assert.match(page.get('theme-feedback').textContent,/Choose a PNG/);
  await upload({type:'image/png',size:3*1024*1024});assert.match(page.get('theme-feedback').textContent,/up to 2 MB/);
  const image='data:image/png;base64,aGVsbG8=';
  await upload({type:'image/png',size:10,data:image});
  assert.equal(page.saved().background,image);
  assert.equal(page.context.document.body.style.backgroundImage,`url("${image}")`);
  await upload({type:'image/png',size:10,data:'broken'});
  assert.equal(page.saved().background,image);
  page.get('remove-background').listeners.click();assert.equal(page.saved().background,'');
  const full=boot({},true);full.context.FileReader=page.context.FileReader;full.context.Image=page.context.Image;
  await full.get('background-file').listeners.change({target:{files:[{type:'image/png',size:10,data:image}],value:''}});
  assert.match(full.get('theme-feedback').textContent,/Not enough storage/);
  assert.equal(full.context.document.body.style.backgroundImage,'');
});

test('history sidebar can be toggled, closed, restored, and controlled from Customize', () => {
  const page=boot();
  assert.equal(page.get('history-panel').hidden,true);
  page.get('history-toggle').listeners.click();
  assert.equal(page.get('history-panel').hidden,false);
  assert.equal(page.get('history-toggle').attributes['aria-expanded'],'true');
  assert.equal(page.get('setting-showHistory').checked,true);
  assert.equal(page.saved().showHistory,true);
  const restored=boot(Object.fromEntries(page.store));
  assert.equal(restored.get('history-panel').hidden,false);
  page.get('history-close').listeners.click();
  assert.equal(page.get('history-panel').hidden,true);
  assert.equal(page.get('history-toggle').focused,true);
  assert.equal(page.saved().showHistory,false);
  page.change('setting-showHistory','',true);
  assert.equal(page.get('history-panel').hidden,false);
  page.context.document.listeners.keydown({key:'Escape'});
  assert.equal(page.get('history-panel').hidden,true);
  // Escape in Customize closes that dialog without also hiding the sidebar.
  page.change('setting-showHistory','',true);
  page.get('customize-dialog').open=true;
  page.context.document.listeners.keydown({key:'Escape'});
  assert.equal(page.get('history-panel').hidden,false);
});
test('old backups default to a hidden sidebar without losing preferences', () => {
  const old={...settingsApi.defaults(),name:'Existing user'};delete old.showHistory;
  assert.equal(settingsApi.validate(old).showHistory,false);
  assert.equal(settingsApi.validate(old).name,'Existing user');
  assert.throws(()=>settingsApi.validate({...old,showHistory:'yes'}));
});

test('weekend visibility saves and old backups keep the widget enabled', () => {
  const page=boot();assert.equal(page.get('.weekend-widget').hidden,false);
  page.change('setting-showWeekend','',false);
  assert.equal(page.get('.weekend-widget').hidden,true);
  assert.equal(page.saved().showWeekend,false);
  assert.equal(boot(Object.fromEntries(page.store)).get('setting-showWeekend').checked,false);
  const old=settingsApi.defaults();delete old.showWeekend;
  assert.equal(settingsApi.validate(old).showWeekend,true);
  assert.throws(()=>settingsApi.validate({...old,showWeekend:'yes'}));
});
