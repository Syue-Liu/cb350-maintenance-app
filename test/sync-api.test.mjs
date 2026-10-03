import test from 'node:test';
import assert from 'node:assert/strict';
process.env.KV_REST_API_URL='https://redis.example.invalid';
process.env.KV_REST_API_TOKEN='test-placeholder';
const {default:handler}=await import('../api/sync.js');
const db=new Map();
let commands=[];
globalThis.fetch=async(url,options={})=>{
  let result;
  if(options.method==='POST' && String(url)==='https://redis.example.invalid') {
    const cmd=JSON.parse(options.body);commands.push(cmd);
    assert.equal(cmd[0],'EVAL');assert.equal(cmd[2],'1');
    const old=db.get(cmd[3]);const version=old?.cloudVersion || old?.cloudUpdatedAt || '';
    result=version===cmd[4] ? 1:0;
    if(result)db.set(cmd[3],JSON.parse(cmd[5]));
  } else {
    const parsed=new URL(url);const [op,...keyParts]=parsed.pathname.slice(1).split('/');const key=decodeURIComponent(keyParts.join('/'));
    if(op==='set'){db.set(key,JSON.parse(options.body));result='OK';}
    else result=db.has(key)?JSON.stringify(db.get(key)):null;
  }
  return {ok:true,json:async()=>({result})};
};
async function call(method,values={}) {
  const res={code:0,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;},end(){return this;}};
  await handler({method,query:method==='GET'?values:{},body:method==='POST'?values:undefined},res);return res;
}
const payload={settings:{currentMileage:0},records:[]};
test('API preserves Honda legacy namespace and separates EZZY using the same code',async()=>{
  const a=await call('POST',{key:'test-code',data:{...payload,settings:{currentMileage:21984}}});assert.equal(a.code,200);
  const b=await call('POST',{key:'test-code',vehicleId:'gogoro',expectedVersion:'',data:payload});assert.equal(b.code,200);
  assert.equal(db.get('cb350-maintenance:test-code').settings.currentMileage,21984);
  assert.equal(db.get('garage-gogoro-ezzy500:test-code').settings.currentMileage,0);
  const g=await call('GET',{key:'test-code',vehicleId:'gogoro'});assert.equal(g.data.vehicleId,'gogoro');assert.equal(g.data.protocolVersion,2);
});
test('API conflicts do not overwrite existing data',async()=>{
  const before=JSON.stringify(db.get('garage-gogoro-ezzy500:test-code'));
  const r=await call('POST',{key:'test-code',vehicleId:'gogoro',expectedVersion:'stale',data:payload});assert.equal(r.code,409);
  assert.equal(JSON.stringify(db.get('garage-gogoro-ezzy500:test-code')),before);
});
test('API rejects invalid vehicle IDs, short codes and mismatched payloads',async()=>{
  assert.equal((await call('GET',{key:'test-code',vehicleId:'invalid'})).code,400);
  assert.equal((await call('GET',{key:'x',vehicleId:'gogoro'})).code,400);
  assert.equal((await call('POST',{key:'test-code',vehicleId:'gogoro',data:payload})).code,400);
  assert.equal((await call('POST',{key:'test-code',vehicleId:'gogoro',expectedVersion:'',data:{...payload,vehicleId:'honda'}})).code,400);
});
test('REST GET decodes stored JSON; CORS preflight succeeds',async()=>{
  assert.equal((await call('GET',{key:'test-code'})).data.data.settings.currentMileage,21984);
  assert.equal((await call('OPTIONS')).code,204);
});
