(function () {
  const menuEl = document.getElementById("menu");
  const homeGridEl = document.getElementById("homeGrid");
  const homeViewEl = document.getElementById("homeView");
  const overviewViewEl = document.getElementById("overviewView");
  const orgCategoriesEl = document.getElementById("orgCategories");
  const overviewNavBtn = document.getElementById("overviewNavBtn");
  const appFrameEl = document.getElementById("appFrame");
  const sidebarEl = document.getElementById("sidebar");
  const overlayEl = document.getElementById("sidebarOverlay");

  function buildSidebar() {
    EHS_MENU.forEach((category) => {
      const catLi = document.createElement("li");
      catLi.className = "menu-category";

      const catBtn = document.createElement("button");
      catBtn.className = "menu-category-btn";
      catBtn.innerHTML = `<span class="menu-icon">${category.icon}</span><span class="menu-label">${category.label}</span><span class="menu-caret">▾</span>`;
      catBtn.addEventListener("click", () => {
        catLi.classList.toggle("open");
      });
      catLi.appendChild(catBtn);

      const subUl = document.createElement("ul");
      subUl.className = "submenu";

      const items = category.items || [];
      const planned = category.plannedItems || [];

      if (items.length === 0 && planned.length === 0) {
        const emptyLi = document.createElement("li");
        emptyLi.className = "submenu-empty";
        emptyLi.textContent = "준비 중";
        subUl.appendChild(emptyLi);
      } else {
        items.forEach((item) => {
          const itemLi = document.createElement("li");
          const itemBtn = document.createElement("button");
          itemBtn.className = "submenu-item";
          itemBtn.textContent = item.name;
          itemBtn.addEventListener("click", () => openApp(item, itemBtn));
          itemLi.appendChild(itemBtn);
          subUl.appendChild(itemLi);
        });
        // 아직 배포 전(url 없음)인 항목은 클릭 불가로, "계획됨" 표시만 하고 종합화면으로 안내한다.
        planned.forEach((item) => {
          const itemLi = document.createElement("li");
          const itemBtn = document.createElement("button");
          itemBtn.className = "submenu-item submenu-item--planned";
          itemBtn.innerHTML = `${item.name} <span class="submenu-item-tag">계획됨</span>`;
          itemBtn.title = "아직 배포 전입니다. 종합화면에서 진행 상태를 볼 수 있습니다.";
          itemBtn.addEventListener("click", showOverview);
          itemLi.appendChild(itemBtn);
          subUl.appendChild(itemLi);
        });
      }

      catLi.appendChild(subUl);
      menuEl.appendChild(catLi);
    });
  }

  function buildHomeCards() {
    EHS_MENU.forEach((category) => {
      category.items.forEach((item) => {
        const card = document.createElement("button");
        card.className = "home-card";
        card.innerHTML = `<span class="home-card-icon">${category.icon}</span><span class="home-card-cat">${category.label}</span><span class="home-card-name">${item.name}</span>`;
        card.addEventListener("click", () => openApp(item));
        homeGridEl.appendChild(card);
      });
    });
  }

  function flowListHtml(items) {
    return `<ul class="flow-list">${(items || []).map((s) => `<li>${s}</li>`).join("")}</ul>`;
  }

  function flowStepsHtml(items) {
    return `<ol class="flow-steps">${(items || []).map((s) => `<li>${s}</li>`).join("")}</ol>`;
  }

  function flowDetailHtml(category, item, isPlanned) {
    const flow = item.flow || {};
    const isLive = !isPlanned && flow.statusTone !== "design";

    const badges = [];
    if (flow.statusLabel) {
      const tone = flow.statusTone === "design" ? "design" : "live";
      const dot = tone === "live" ? `<span class="flow-live-dot"></span>` : "";
      badges.push(`<span class="flow-badge flow-badge--${tone}">${dot}${flow.statusLabel}</span>`);
    }
    if (flow.access) {
      badges.push(`<span class="flow-badge flow-badge--protected">${flow.access}</span>`);
    }

    const openBtnHtml = !isPlanned && item.url
      ? `<button type="button" class="flow-open-btn">열기 →</button>`
      : "";

    // 운영중 카드에는 점선 테두리가 움직이는(marching ants) SVG 오버레이를 깔아
    // "지금도 자동으로 돌아가고 있다"는 느낌을 준다. 계획 단계 카드는 정적인 채로 둔다.
    const marchingAnts = isLive
      ? `<svg class="flow-card-ants" viewBox="0 0 100 100" preserveAspectRatio="none">
           <rect x="1" y="1" width="98" height="98" rx="11" stroke="url(#rainbowGrad)" />
         </svg>`
      : "";

    const arrow = isLive
      ? `<div class="flow-col-arrow flow-col-arrow--live"><span class="flow-arrow-track"></span><span class="flow-arrow-dot"></span></div>`
      : `<div class="flow-col-arrow">→</div>`;

    return {
      isLive,
      html: `
        <div class="flow-card${isPlanned ? " is-planned" : ""}${isLive ? " is-live" : ""}">
          ${marchingAnts}
          <div class="flow-card-header">
            <div>
              ${flow.stack ? `<div class="flow-card-stack">${flow.stack}</div>` : ""}
            </div>
            <div class="flow-card-badges">${badges.join("")}${openBtnHtml}</div>
          </div>
          <div class="flow-columns">
            <div class="flow-col">
              <div class="flow-col-title">입력</div>
              ${flowListHtml(flow.input)}
            </div>
            ${arrow}
            <div class="flow-col">
              <div class="flow-col-title">처리</div>
              ${flowStepsHtml(flow.processing)}
            </div>
            ${arrow}
            <div class="flow-col">
              <div class="flow-col-title">출력</div>
              ${flowListHtml(flow.output)}
            </div>
          </div>
        </div>
      `,
    };
  }

  /** 세부항목 사이/카테고리 노드 바로 아래에 들어가는 짧은 세로 연결선. */
  function buildConnector() {
    const span = document.createElement("span");
    span.className = "org-connector org-line-v";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  /** 세부항목 1개: 눌러서 입력/처리/출력 상세를 펼치는 트리 노드 */
  function buildOrgItem(category, item, isPlanned) {
    const detail = flowDetailHtml(category, item, isPlanned);

    const li = document.createElement("li");
    li.className = "org-item" + (isPlanned ? " org-item--planned" : "");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "org-item-btn";
    btn.innerHTML = `
      ${detail.isLive ? `<span class="flow-live-dot"></span>` : ""}
      <span class="org-item-name">${item.name}</span>
      <span class="org-item-caret">▾</span>
    `;

    const detailWrap = document.createElement("div");
    detailWrap.className = "org-item-detail";
    detailWrap.innerHTML = item.flow ? detail.html : `<p class="org-item-empty">등록된 흐름 정보가 없습니다.</p>`;

    btn.addEventListener("click", () => {
      const willOpen = !li.classList.contains("open");
      li.classList.toggle("open", willOpen);
    });

    const openBtnEl = detailWrap.querySelector(".flow-open-btn");
    if (openBtnEl) openBtnEl.addEventListener("click", () => openApp(item));

    li.appendChild(btn);
    li.appendChild(detailWrap);
    return li;
  }

  /** 카테고리 노드를 누르면 펼쳐지는 전체 요약(운영중/계획됨 개수 + 항목별 상태 한줄 목록). */
  function buildCategorySummary(category, allItems) {
    const liveCount = allItems.filter(([item, isPlanned]) => !isPlanned && item.flow?.statusTone !== "design").length;
    const designCount = allItems.length - liveCount;

    const wrap = document.createElement("div");
    wrap.className = "org-category-summary";
    wrap.innerHTML = `
      <div class="org-category-summary-stats">
        <span class="flow-badge flow-badge--live">운영중 ${liveCount}</span>
        <span class="flow-badge flow-badge--design">계획·설계 ${designCount}</span>
      </div>
      <ul class="org-category-summary-list">
        ${allItems
          .map(([item, isPlanned]) => {
            const isLive = !isPlanned && item.flow?.statusTone !== "design";
            const dot = isLive ? `<span class="flow-live-dot"></span>` : `<span class="org-summary-dot org-summary-dot--design"></span>`;
            return `<li>${dot}${item.name}</li>`;
          })
          .join("")}
      </ul>
    `;
    return wrap;
  }

  // 카테고리 노드 -> 항목1 -> 항목2 -> ... 를 짧은 세로선으로 잇는 단순 체인 구조.
  // 항목이 몇 개든(0개~N개) 컬럼 한가운데를 그대로 따라가므로 늘어지거나 어긋나지 않고,
  // menu-data.js에 항목을 추가/삭제하면 다음 렌더링에서 선도 자동으로 다시 그려진다.
  function buildOverview() {
    EHS_MENU.forEach((category) => {
      const items = category.items || [];
      const planned = category.plannedItems || [];
      const allItems = [...items.map((i) => [i, false]), ...planned.map((i) => [i, true])];

      const col = document.createElement("div");
      col.className = "org-column";

      const nodeBtn = document.createElement("button");
      nodeBtn.type = "button";
      nodeBtn.className = "org-category-node";
      nodeBtn.innerHTML = `<span class="org-category-icon">${category.icon}</span><span>${category.label}</span><span class="org-category-caret">▾</span>`;

      const summary = buildCategorySummary(category, allItems);
      summary.classList.add("hidden");
      nodeBtn.addEventListener("click", () => {
        summary.classList.toggle("hidden");
        nodeBtn.classList.toggle("open");
      });

      col.appendChild(nodeBtn);
      col.appendChild(summary);

      const itemsWrap = document.createElement("ul");
      itemsWrap.className = "org-items-wrap";

      if (allItems.length === 0) {
        itemsWrap.appendChild(buildConnector());
        const emptyLi = document.createElement("li");
        emptyLi.className = "org-item org-item--empty";
        emptyLi.textContent = "준비 중";
        itemsWrap.appendChild(emptyLi);
      } else {
        allItems.forEach(([item, isPlanned]) => {
          itemsWrap.appendChild(buildConnector());
          itemsWrap.appendChild(buildOrgItem(category, item, isPlanned));
        });
      }

      col.appendChild(itemsWrap);
      orgCategoriesEl.appendChild(col);
    });
  }

  function clearActiveStates() {
    document.querySelectorAll(".submenu-item.active").forEach((el) => el.classList.remove("active"));
    overviewNavBtn.classList.remove("active");
  }

  function openApp(item, sourceBtn) {
    appFrameEl.src = item.url;
    homeViewEl.classList.add("hidden");
    overviewViewEl.classList.add("hidden");
    appFrameEl.classList.add("active");

    clearActiveStates();
    if (sourceBtn) sourceBtn.classList.add("active");

    if (window.innerWidth <= 900) closeSidebar();
  }

  function goHome() {
    appFrameEl.classList.remove("active");
    appFrameEl.src = "about:blank";
    overviewViewEl.classList.add("hidden");
    homeViewEl.classList.remove("hidden");
    clearActiveStates();
  }

  function showOverview() {
    appFrameEl.classList.remove("active");
    appFrameEl.src = "about:blank";
    homeViewEl.classList.add("hidden");
    overviewViewEl.classList.remove("hidden");
    clearActiveStates();
    overviewNavBtn.classList.add("active");
    if (window.innerWidth <= 900) closeSidebar();
  }

  function openSidebar() {
    sidebarEl.classList.add("open");
    overlayEl.classList.add("visible");
  }
  function closeSidebar() {
    sidebarEl.classList.remove("open");
    overlayEl.classList.remove("visible");
  }

  document.getElementById("hamburgerBtn").addEventListener("click", () => {
    sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  overlayEl.addEventListener("click", closeSidebar);
  document.getElementById("homeLink").addEventListener("click", goHome);
  overviewNavBtn.addEventListener("click", showOverview);

  buildSidebar();
  buildHomeCards();
  buildOverview();

  // 처음 화면을 열었을 때 종합화면이 먼저 보이도록 한다.
  showOverview();
})();
