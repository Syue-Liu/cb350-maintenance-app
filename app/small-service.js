/* Interactive 6,000 km minor-service checklist. */
(() => {
  const STORAGE_KEY = "cb350-small-service-checklist-v1";
  const INTERVAL_KM = 6000;
  const ITEMS = [
    { key: "oil", title: "機油", detail: "確認距離上次更換是否接近 4,000 km；需要時更換。" },
    { key: "chain", title: "傳動鏈條", detail: "清洗鍊條、潤滑，並檢查鍊條鬆緊。" },
    { key: "pads", title: "煞車皮", detail: "檢查前後煞車皮剩餘厚度與磨耗是否平均。" },
    { key: "tires", title: "輪胎／輪框", detail: "檢查胎壓、胎紋、龜裂、異常磨耗與輪框狀況。" },
    { key: "electric", title: "電瓶／電系", detail: "確認電瓶電壓、大燈、方向燈、煞車燈與喇叭。" },
    { key: "chassis", title: "螺絲／避震／側柱", detail: "巡視重要固定螺絲、避震作動與側柱是否正常。" },
    { key: "fluid", title: "煞車油", detail: "目視油量、顏色與是否滲漏；正式更換仍依 2 年週期。" },
  ];

  function ensureStylesheet() {
    if (document.querySelector('link[data-small-service-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./small-service.css";
    link.dataset.smallServiceStyle = "true";
    document.head.appendChild(link);
  }

  ensureStylesheet();

  const mileageInput = document.querySelector("#currentMileage");
  const bikeForm = document.querySelector("#bikeForm");
  const schedule = document.querySelector("#schedule");
  const scheduleList = document.querySelector("#scheduleList");
  if (!schedule || !scheduleList) return;

  const title = schedule.querySelector(".view-head h2");
  if (title) title.textContent = "保養週期";

  function number(value) {
    return Number(value).toLocaleString("zh-TW");
  }

  function nextCycle(current) {
    return Math.ceil((current + 1) / INTERVAL_KM) * INTERVAL_KM;
  }

  function currentMilestone() {
    const mileage = Number(mileageInput?.value) || 0;
    return mileage ? nextCycle(mileage) : INTERVAL_KM;
  }

  function readAll() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function writeAll(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function getChecked(milestone) {
    const all = readAll();
    return Array.isArray(all[String(milestone)]) ? all[String(milestone)] : [];
  }

  function setChecked(milestone, checked) {
    const all = readAll();
    all[String(milestone)] = checked;
    writeAll(all);
  }

  function ensureCard() {
    let card = document.querySelector("#minorServiceChecklist");
    if (card) return card;
    card = document.createElement("section");
    card.id = "minorServiceChecklist";
    card.className = "minor-service-card";
    card.setAttribute("aria-label", "小保養檢查清單");
    schedule.insertBefore(card, scheduleList);
    return card;
  }

  function render() {
    const card = ensureCard();
    const mileage = Number(mileageInput?.value) || 0;
    const milestone = currentMilestone();
    const checked = new Set(getChecked(milestone));
    const done = ITEMS.filter((item) => checked.has(item.key)).length;
    const percent = Math.round((done / ITEMS.length) * 100);

    card.innerHTML = `
      <div class="minor-service-head">
        <div>
          <span class="minor-service-kicker">自己做・每 6,000 km</span>
          <h3>小保養 Checklist</h3>
          <p>${mileage ? `下一次目標 ${number(milestone)} km` : "更新目前里程後會自動計算下一次目標"}</p>
        </div>
        <div class="minor-service-score" aria-label="完成 ${done} 項，共 ${ITEMS.length} 項">
          <strong>${done}/${ITEMS.length}</strong>
          <span>完成</span>
        </div>
      </div>
      <div class="minor-service-progress" aria-hidden="true"><span style="width:${percent}%"></span></div>
      <div class="minor-service-list">
        ${ITEMS.map((item) => `
          <label class="minor-service-item${checked.has(item.key) ? " is-done" : ""}">
            <input type="checkbox" value="${item.key}" ${checked.has(item.key) ? "checked" : ""} />
            <span class="minor-service-check" aria-hidden="true"></span>
            <span class="minor-service-copy">
              <strong>${item.title}</strong>
              <small>${item.detail}</small>
            </span>
          </label>`).join("")}
      </div>
      <div class="minor-service-foot">
        <p>空氣濾芯、火星塞、機油濾芯不固定每次小保養更換，依各自週期提醒處理。</p>
        <button class="btn quiet minor-service-reset" type="button">重設本次清單</button>
      </div>`;

    card.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        const selected = [...card.querySelectorAll('input[type="checkbox"]:checked')].map((box) => box.value);
        setChecked(milestone, selected);
        render();
      });
    });

    card.querySelector(".minor-service-reset")?.addEventListener("click", () => {
      setChecked(milestone, []);
      render();
    });
  }

  bikeForm?.addEventListener("submit", () => requestAnimationFrame(render));
  mileageInput?.addEventListener("change", render);
  render();
})();
