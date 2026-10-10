const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function boot(saved = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{ value:'', placeholder:'', style:{setProperty(){}}, dataset:{}, hidden:false, textContent:'', _html:'', listeners:{}, classList:{add(){},remove(){},toggle(){}}, addEventListener(name,fn){this.listeners[name]=fn;}, querySelectorAll(){return [];}, contains(){return false;}, focus(){}, scrollIntoView(){}, get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.textContent=value.replace(/<[^>]+>/g,'');} });
    return elements.get(id);
  };
  const storage = new Map(Object.entries(saved).map(([k,v])=>[k,JSON.stringify(v)]));
  const document={querySelector:selector=>element(selector.replace('#','')),querySelectorAll:()=>[],getElementById:element,body:{dataset:{}},activeElement:null,hidden:false,addEventListener(){},dispatchEvent(){},createElement:()=>element('created')};
  const sandbox={ CB350Data:require('../app/maintenance-items.js'),CB350Parser:require('../app/parser.js'),VehicleProfiles:require('../app/vehicle-profiles.js'),VehicleSync:require('../app/vehicle-sync.js'),document,window:{location:{hostname:'localhost',protocol:'http:',origin:'http://localhost'},scrollTo(){},addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},confirm:()=>true,console,setTimeout:()=>0,clearTimeout(){},setInterval(){},Event,Map,Date,fetch:async()=>{throw Error('Unexpected network call');} };
  const context=vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('app/app.js','utf8'),context);
  return { run:code=>vm.runInContext(code,context),element,storage,document };
}
test('Existing Honda data loads unchanged; fresh EZZY is separate and selected vehicle persists',()=>{
  const original={settings:{currentMileage:21984},records:[{id:'existing',key:'engineOil',item:'機油',mileage:20000,date:'2026-09-01',cost:950}]};
  const app=boot({'cb350-maintenance-app-v1':original});
  assert.equal(app.run('state.records.length'),1);
  app.element('vehicleSelect').value='gogoro';app.run('switchVehicle()');
  assert.equal(app.run('state.records.length'),0);assert.equal(app.run('state.settings.currentMileage'),'');
  assert.equal(app.document.body.dataset.vehicle,'gogoro');
  assert.deepEqual(JSON.parse(app.storage.get('cb350-maintenance-app-v1')),original);
  assert.equal(JSON.parse(app.storage.get('maintenance-selected-vehicle')),'gogoro');
  app.element('vehicleSelect').value='honda';app.run('switchVehicle()');
  assert.equal(app.element('currentMileage').value,21984);assert.equal(app.run('state.records[0].cost'),950);
});
test('New EZZY service supports zero mileage; add, edit, delete and clear stay vehicle-scoped',()=>{
  const app=boot();app.element('vehicleSelect').value='gogoro';app.run('switchVehicle()');
  app.element('addItem').value='ezzyService';app.element('addMileage').value='0';app.element('addDate').value='2026-10-03';app.element('addAction').value='保養';app.element('addCost').value='800';
  app.run('handleManualAdd({preventDefault(){}})');
  assert.equal(app.run('state.records.length'),1);assert.equal(app.run('vehicles.honda.records.length'),0);
  assert.equal(app.run('state.records[0].mileage'),0);
  app.run('editRecord(state.records[0].id)');app.element('addCost').value='900';app.run('handleManualAdd({preventDefault(){}})');
  assert.equal(app.run('state.records.length'),1);assert.equal(app.run('state.records[0].cost'),900);
  app.run('clearRecords()');assert.equal(app.run('state.records.length'),0);assert.equal(app.run('Object.keys(state.tombstones).length'),1);
});
test('Unsaved editing asks before switching and cancelled switch keeps state',()=>{
  const app=boot();app.run('formDirty=true; confirm=()=>false');app.element('vehicleSelect').value='gogoro';app.run('switchVehicle()');
  assert.equal(app.run('vehicleId'),'honda');assert.equal(app.element('vehicleSelect').value,'honda');
});
test('Delivery settings establish first-service reminders and persist across switches',()=>{
  const app=boot();app.element('vehicleSelect').value='gogoro';app.run('switchVehicle()');
  app.element('deliveryDate').value='2026-04-03';app.element('deliveryMileage').value='0';app.run('saveDelivery({preventDefault(){}})');
  assert.equal(app.run('state.settings.currentMileage'),0);
  assert.equal(app.run('getReminders().find(r=>r.key==="ezzyService").nextKm'),5000);
  app.element('vehicleSelect').value='honda';app.run('switchVehicle()');app.element('vehicleSelect').value='gogoro';app.run('switchVehicle()');
  assert.equal(app.element('deliveryDate').value,'2026-04-03');
});
test('Date-based CB350 reminders count from today even when the saved inspection date is stale',()=>{
  const { today, addMonths } = require('../app/vehicle-profiles.js');
  const changed = addMonths(today(), -25);
  const app=boot({'cb350-maintenance-app-v1':{settings:{currentMileage:20000,currentDate:changed},records:[{id:'fluid',key:'brakeFluid',item:'煞車油',action:'更換',mileage:20000,date:changed}]}});
  assert.equal(app.run('getReminders().find(r=>r.key==="brakeFluid").status'),'due');
  app.run('resetAddForm()');
  assert.equal(app.element('addDate').value,today());
});
