const {test}=require('node:test');
const assert=require('node:assert/strict');
const {weekendCountdown,countWeekendDays,parseDate,initWidget}=require('../weekend.js');

test('weekday countdown targets Saturday midnight in local time',()=>{
 const now=new Date(2026,9,15,16,30); // Thursday
 const result=weekendCountdown(now);
 assert.equal(result.isWeekend,false);
 assert.equal(result.target.getDay(),6);
 assert.equal(result.target.getHours(),0);
 assert.equal(result.days,1);assert.equal(result.hours,7);assert.equal(result.minutes,30);
});
test('Saturday and Sunday show the remaining weekend until Monday',()=>{
 const saturday=weekendCountdown(new Date(2026,9,17,0));
 assert.equal(saturday.isWeekend,true);assert.equal(saturday.days,2);assert.equal(saturday.target.getDay(),1);
 const sunday=weekendCountdown(new Date(2026,9,18,23,59));
 assert.equal(sunday.isWeekend,true);assert.equal(sunday.minutes,1);
 const monday=weekendCountdown(new Date(2026,9,19,0));
 assert.equal(monday.isWeekend,false);assert.equal(monday.days,5);
});
test('date ranges include both endpoints and handle single days',()=>{
 assert.deepEqual(countWeekendDays('2026-10-17','2026-10-18'),{totalDays:2,weekendDays:2,weekdays:0});
 assert.equal(countWeekendDays('2026-10-18','2026-10-18').weekendDays,1);
 assert.equal(countWeekendDays('2026-10-19','2026-10-19').weekendDays,0);
 assert.deepEqual(countWeekendDays('2026-10-12','2026-10-18'),{totalDays:7,weekendDays:2,weekdays:5});
});
test('date range calculation handles leap days, year boundaries, and DST independently of local timezone',()=>{
 assert.equal(countWeekendDays('2024-02-28','2024-03-01').totalDays,3);
 assert.equal(countWeekendDays('2026-12-31','2027-01-02').weekendDays,1);
 assert.deepEqual(countWeekendDays('2026-03-07','2026-03-09'),{totalDays:3,weekendDays:2,weekdays:1});
});
test('invalid, absent, impossible, and reversed dates produce actionable errors',()=>{
 for (const date of ['',null,'2026-02-30','2026-13-01','0000-01-01','2025-02-29','abc']) assert.throws(()=>parseDate(date));
 assert.throws(()=>countWeekendDays('2026-10-18','2026-10-17'),/End date/);
});
test('constant-time range calculation matches an independent day-by-day count',()=>{
 const start=new Date(Date.UTC(2024,0,1));
 for (let shift=0;shift<7;shift++) {
  let expected=0;
  for (let length=1;length<=400;length++) {
   const current=new Date(start.getTime()+(shift+length-1)*86400000);
   if ([0,6].includes(current.getUTCDay()))expected++;
   const from=new Date(start.getTime()+shift*86400000).toISOString().slice(0,10);
   assert.equal(countWeekendDays(from,current.toISOString().slice(0,10)).weekendDays,expected);
  }
 }
});

test('widget displays live countdown, calculates ranges, and clears outdated results',()=>{
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',listeners:{},attributes:{},addEventListener(name,fn){this.listeners[name]=fn},setAttribute(key,value){this.attributes[key]=value}});return elements.get(id)};
 const widget=initWidget({getElementById:get,querySelector:get,querySelectorAll:()=>[],addEventListener(){}},()=>new Date(2026,9,15,16,30));
 assert.equal(get('weekend-days').textContent,'01');assert.equal(get('weekend-hours').textContent,'07');
 assert.equal(get('weekend-start').value,'2026-10-15');assert.equal(get('weekend-end').value,'2026-10-31');
 get('weekend-start').value='2026-10-17';get('weekend-end').value='2026-10-18';
 get('weekend-form').listeners.submit({preventDefault(){}});
 assert.match(get('weekend-result').textContent,/2 weekend days/);
 get('weekend-end').listeners.input();assert.equal(get('weekend-result').textContent,'');
 get('weekend-end').value='2026-10-16';get('weekend-form').listeners.submit({preventDefault(){}});
 assert.match(get('weekend-result').textContent,/End date/);
 assert.equal(typeof widget.update,'function');
});
