(function (global) {
  "use strict";
  const data = typeof module === "object" && module.exports ? require("./vehicle-profiles.js") : global.VehicleProfiles;
  function createSync({ vehicles, getConfig, save, changed, status, request = fetch }) {
    const pending = new Map();
    return function sync(id) {
      const { key, endpoint } = getConfig();
      if (!key || !endpoint) { status(id,"僅儲存在此裝置",""); return Promise.resolve(); }
      const scope = JSON.stringify([id,key,endpoint]);
      if (pending.has(scope)) return pending.get(scope);
      const valid = () => getConfig().key === key && getConfig().endpoint === endpoint;
      const task = (async () => {
        status(id,"正在同步…","busy");
        try {
          for (let attempt=0;attempt<4;attempt++) {
            const response = await request(`${endpoint}?key=${encodeURIComponent(key)}&vehicleId=${id}`,{cache:"no-store",signal:AbortSignal.timeout(20000)});
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
            if (result.protocolVersion !== 2 || result.vehicleId !== id) throw new Error("雲端尚未更新雙車版本，紀錄已保留在本機");
            if (result.data != null && (!Array.isArray(result.data.records) || !result.data.settings || typeof result.data.settings !== "object")) throw new Error("雲端資料格式不正確，沒有覆蓋本機紀錄");
            if (!valid()) return;
            Object.assign(vehicles[id],data.merge(vehicles[id],result.data));
            save(id); changed(id);
            if (!vehicles[id].dirty) { status(id,"已同步","ok"); return; }
            const revision = vehicles[id].revision;
            const upload = await request(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(20000),body:JSON.stringify({key,vehicleId:id,expectedVersion:result.data?.cloudVersion || result.data?.cloudUpdatedAt || "",data:data.cloudPayload(vehicles[id])})});
            const reply = await upload.json();
            if (!valid()) return;
            if (upload.status === 409) continue;
            if (!upload.ok) throw new Error(reply.error || `HTTP ${upload.status}`);
            if (reply.protocolVersion !== 2 || reply.vehicleId !== id || !reply.data?.cloudVersion) throw new Error("同步回應不完整，紀錄已保留在本機");
            if (vehicles[id].revision === revision) {
              vehicles[id].dirty=false;
              vehicles[id].cloudVersion=reply.data.cloudVersion;
              vehicles[id].cloudUpdatedAt=reply.data.cloudUpdatedAt;
              vehicles[id].settings.lastCloudSyncAt=reply.data.cloudUpdatedAt;
              save(id); status(id,"已同步","ok"); return;
            }
          }
          throw new Error("變更已保存在本機，稍後會再同步");
        } catch(error) { if(valid()) status(id,`同步暫停：${error.message}`,"warn"); }
      })().finally(()=>pending.delete(scope));
      pending.set(scope,task);
      return task;
    };
  }
  if (typeof module === "object" && module.exports) module.exports = { createSync };
  else global.VehicleSync = { createSync };
})(typeof globalThis !== "undefined" ? globalThis : this);
