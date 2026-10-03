const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../app/vehicle-profiles.js");
const parser = require("../app/parser.js");
const { createSync } = require("../app/vehicle-sync.js");
const blank = () => v.normalize(null);
const sample = () => v.normalize({ settings: { currentMileage: 100, deliveryDate: "2026-04-03", deliveryMileage: 0 } });
const get = (state, key, date = "2026-10-03") => v.ezzyReminders(state,date).find(r=>r.key===key);
const record = (key,mileage,date,action="保養",id=key) => ({id,key,mileage,date,action,updatedAt:`${date}T12:00:00Z`});
const response = (body,status=200) => ({ok:status<400,status,json:async()=>body});

test("Honda keeps original catalog and storage key",()=>{
  assert.equal(v.profiles.honda.storageKey,"cb350-maintenance-app-v1");
  assert.equal(v.profiles.honda.items.find(i=>i.key==='engineOil').kmInterval,4000);
  assert.equal(v.profiles.honda.items.find(i=>i.key==='majorService').kmInterval,20000);
  assert.equal(v.profiles.honda.items,require('../app/maintenance-items.js').MAINTENANCE_ITEMS);
});
test("EZZY has no engine oil, filters, spark plugs or Honda major service",()=>{
  assert.equal(v.profiles.gogoro.items.some(i=>['engineOil','oilFilter','sparkPlug','majorService','chain'].includes(i.key)),false);
  assert.notEqual(v.profiles.honda.storageKey,v.profiles.gogoro.storageKey);
});
test("New bike remains unknown until delivery or maintenance baseline",()=>{
  assert.ok(v.ezzyReminders(blank()).every(r=>r.status==='unknown'));
});
test("Zero mileage is valid and retained",()=>{
  assert.equal(v.hasMileage(0),true); assert.equal(v.hasMileage(''),false); assert.equal(v.hasMileage(null),false);
  assert.equal(v.normalize({settings:{currentMileage:0}}).settings.currentMileage,0);
});
test("First service is due by six months even with very low mileage",()=>{
  const r=get(sample(),'ezzyService'); assert.equal(r.status,'due'); assert.equal(r.daysLeft,0); assert.equal(r.nextKm,5000);
});
test("Mileage threshold does not move forward when overdue",()=>{
  const s=sample();s.settings.currentMileage=6000;
  const r=get(s,'ezzyService','2026-05-01');assert.equal(r.status,'due');assert.equal(r.kmLeft,-1000);assert.equal(r.nextKm,5000);
});
test("Full service resets checks but not brake-fluid replacement",()=>{
  const s=sample();s.records=[record('ezzyService',5200,'2026-09-20')];s.settings.currentMileage=5500;
  assert.equal(get(s,'ezzyService').nextKm,10200);
  assert.equal(get(s,'batteryContacts').nextKm,10200);
  assert.equal(get(s,'brakeFluid').nextKm,18000);
  assert.equal(get(s,'brakeFluid').nextDate,'2029-04-03');
});
test("Partial inspection does not reset complete scheduled maintenance",()=>{
  const s=sample();s.records=[record('tires',4000,'2026-09-20','檢查')];
  assert.equal(get(s,'ezzyService').nextKm,5000);assert.equal(get(s,'tires').nextKm,9000);
});
test("Inspecting brake fluid does not reset replacement interval",()=>{
  const s=sample();s.records=[record('brakeFluid',4000,'2026-09-20','檢查')];
  assert.equal(get(s,'brakeFluid').nextKm,18000);
  s.records[0].action='更換';assert.equal(get(s,'brakeFluid').nextKm,22000);
});
test("Backdated record does not supersede later actual service",()=>{
  const s=sample();s.records=[record('ezzyService',100,'2026-04-10'),record('ezzyService',5000,'2026-09-10')];
  assert.equal(get(s,'ezzyService').nextKm,10000);
});
test("End-of-month date is clamped rather than overflowing",()=>{
  assert.equal(v.addMonths('2026-08-31',6),'2027-02-28');
  assert.equal(v.addMonths('2023-08-31',6),'2024-02-29');
});
test("Text parser uses selected vehicle's catalog",()=>{
  const parse=(text,id)=>parser.parseMaintenanceText(text,{items:v.profiles[id].items,fallbackMileage:5000});
  assert.equal(parse('定期保養，費用800元','gogoro').records[0].key,'ezzyService');
  assert.equal(parse('更換機油','gogoro').records.length,0);
  assert.equal(parse('更換機油','honda').records[0].key,'engineOil');
});
test("Blank phone downloads rather than replacing remote mileage",()=>{
  const remote={settings:{currentMileage:21984},records:[record('engineOil',20000,'2026-09-01','更換')],cloudUpdatedAt:'2026-10-01T12:00:00Z'};
  const merged=v.merge(blank(),remote);assert.equal(merged.settings.currentMileage,21984);assert.equal(merged.records.length,1);
});
test("Merge preserves offline additions, newest edits and deletions",()=>{
  const s=sample();s.records=[record('ezzyService',5000,'2026-08-01'),record('tires',6000,'2026-10-01','更換','extra')];
  s.tombstones.deleted='2026-10-01T00:00:00Z';
  const r={settings:{},records:[record('ezzyService',5200,'2026-09-01'),record('brakePads',5000,'2026-09-01','檢查','deleted')]};
  const merged=v.merge(s,r);assert.equal(merged.records.length,2);assert.equal(merged.records.find(r=>r.key==='ezzyService').mileage,5200);assert.equal(merged.dirty,true);
});
test("Switching selection during download cannot apply Honda data to EZZY",async()=>{
  const vehicles={honda:blank(),gogoro:blank()};let finish;const changes=[];
  const sync=createSync({vehicles,getConfig:()=>({key:'test-key',endpoint:'mock'}),save:()=>{},changed:id=>changes.push(id),status:()=>{},request:()=>new Promise(r=>{finish=r;})});
  const pending=sync('honda');
  finish(response({vehicleId:'honda',protocolVersion:2,data:{...v.cloudPayload(blank()),settings:{currentMileage:12345},cloudUpdatedAt:'2026-10-01'}}));
  // The merge may persist upgraded metadata once, so provide a write response too.
  await new Promise(r=>setImmediate(r));
  if (vehicles.honda.dirty) finish(response({vehicleId:'honda',protocolVersion:2,data:{cloudVersion:'v1',cloudUpdatedAt:'2026-10-03'}}));
  await pending;assert.equal(vehicles.honda.settings.currentMileage,12345);assert.equal(vehicles.gogoro.settings.currentMileage,'');assert.deepEqual(changes,['honda']);
});
test("Old backend is rejected before any upload",async()=>{
  let calls=0;const warnings=[];const vehicles={gogoro:sample()};
  const sync=createSync({vehicles,getConfig:()=>({key:'test-key',endpoint:'mock'}),save:()=>{},changed:()=>{},status:(id,text)=>warnings.push(text),request:async()=>{calls++;return response({data:null});}});
  await sync('gogoro');assert.equal(calls,1);assert.match(warnings.at(-1),/尚未更新/);
});
test("Changing sync code cancels stale results",async()=>{
  const vehicles={honda:blank()};let key='first-key',finish;
  const sync=createSync({vehicles,getConfig:()=>({key,endpoint:'mock'}),save:()=>{},changed:()=>{},status:()=>{},request:()=>new Promise(r=>{finish=r;})});
  const pending=sync('honda');key='second-key';
  finish(response({vehicleId:'honda',protocolVersion:2,data:{settings:{currentMileage:9000},records:[]}}));await pending;
  assert.equal(vehicles.honda.settings.currentMileage,'');
});
test("Concurrent edits retry on version conflict; failed requests keep local data",async()=>{
  const vehicles={gogoro:sample()};let posts=0;
  const sync=createSync({vehicles,getConfig:()=>({key:'test-key',endpoint:'mock'}),save:()=>{},changed:()=>{},status:()=>{},request:async(url,options)=>{
    if(options.method==='POST') { posts++;return posts===1 ? response({},409) : response({protocolVersion:2,vehicleId:'gogoro',data:{cloudVersion:'v2',cloudUpdatedAt:'2026-10-03'}}); }
    return response({protocolVersion:2,vehicleId:'gogoro',data:null});
  }});
  await sync('gogoro');assert.equal(posts,2);assert.equal(vehicles.gogoro.dirty,false);
  vehicles.gogoro.dirty=true;
  const fail=createSync({vehicles,getConfig:()=>({key:'test-key',endpoint:'mock'}),save:()=>{},changed:()=>{},status:()=>{},request:async()=>{throw new Error('offline');}});
  await fail('gogoro');assert.equal(vehicles.gogoro.dirty,true);assert.equal(vehicles.gogoro.settings.currentMileage,100);
});
