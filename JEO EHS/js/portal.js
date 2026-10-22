(function () {
  const menuEl = document.getElementById("menu");
  const homeGridEl = document.getElementById("homeGrid");
  const homeViewEl = document.getElementById("homeView");
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
          itemBtn.title = "아직 배포 전입니다. 종합업무현황판으로 이동합니다.";
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
    appFrameEl.classList.add("active");

    clearActiveStates();
    if (sourceBtn) sourceBtn.classList.add("active");

    if (window.innerWidth <= 900) closeSidebar();
  }

  function goHome() {
    appFrameEl.classList.remove("active");
    appFrameEl.src = "about:blank";
    homeViewEl.classList.remove("hidden");
    clearActiveStates();
  }

  // 종합업무현황판(별도 앱)을 포털 화면 안에 표시한다.
  function showOverview() {
    appFrameEl.src = EHS_DASHBOARD_URL;
    homeViewEl.classList.add("hidden");
    appFrameEl.classList.add("active");
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

  // 처음 화면을 열었을 때 종합업무현황판이 먼저 보이도록 한다.
  showOverview();
})();
