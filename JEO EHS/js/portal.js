(function () {
  const menuEl = document.getElementById("menu");
  const homeGridEl = document.getElementById("homeGrid");
  const homeViewEl = document.getElementById("homeView");
  const overviewViewEl = document.getElementById("overviewView");
  const orgCategoriesEl = document.getElementById("orgCategories");
  const orgSideCategoriesEl = document.getElementById("orgSideCategories");
  // org-trunk-h(로고 아래 가로/세로 점선)는 정확히 3개 컬럼(안전/보건/환경) 폭에 맞춰
  // CSS에 고정 계산돼 있다(.org-drop--1/2/3). 이 3개는 트렁크에 연결해서 그리고,
  // 그 외 카테고리(예: 회의자료 자동화)는 트렁크 폭 계산을 깨뜨리지 않도록 별도
  // 영역(org-side)에 연결선 없이 따로 그린다.
  const TRUNK_CATEGORY_KEYS = ["safety", "health", "environment"];
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

  // 카테고리 1개 -> 컬럼(노드+요약+세부항목 체인) DOM을 만든다. 트렁크에 붙는 카테고리든
  // 옆으로 뺀 독립 카테고리든 컬럼 내부 구조(카테고리 노드 -> 항목1 -> 항목2 -> ...)는 동일하다.
  function buildCategoryColumn(category) {
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
    return col;
  }

  // 안전/보건/환경 3개는 트렁크(로고 아래 가로/세로 점선, .org-drop--1/2/3에 폭이 고정됨)에
  // 이어서 그리고, 그 외 카테고리는 트렁크 폭 계산이 깨지지 않도록 옆(org-side)에 따로 그린다.
  function buildOverview() {
    EHS_MENU.forEach((category) => {
      const col = buildCategoryColumn(category);
      if (TRUNK_CATEGORY_KEYS.includes(category.key)) {
        orgCategoriesEl.appendChild(col);
      } else {
        orgSideCategoriesEl.appendChild(col);
      }
    });
  }

  function clearActiveStates() {
    document.querySelectorAll(".submenu-item.active").forEach((el) => el.classList.remove("active"));
    overviewNavBtn.classList.remove("active");
  }

  function openApp(item, sourceBtn) {
    // 비밀번호로 보호된 일부 하위 앱은 iframe(제3자 쿠키) 안에서 로그인 쿠키가
    // 브라우저에 의해 차단되어 로그인이 계속 풀리는 문제가 있어, 새 탭에서 직접 연다.
    if (item.openInNewTab) {
      window.open(item.url, "_blank", "noopener");
      return;
    }
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
