'use strict';

// ── 일마감 상태 ──────────────────────────────────────────────
const dailyState = {
  year:            new Date().getFullYear(),
  month:           new Date().getMonth() + 1,
  days:            [],   // 해당 월 일별 데이터
  purchasePrices:  [],   // [{ date, fuel, price }] — 직접 입력
  fifoDailyMap:    {},   // { 'YYYY-MM-DD': { 경유: {price,remaining}, ... } } — 마감자료 기준
  bankDeposits:    {},   // { "2026-05-08": { "신한카드": 9637628, ... } }
};

// ── 지출목록 상태 ─────────────────────────────────────────────
let expenseList = [];

// ── 상태 ─────────────────────────────────────────────────────
const PRINT_METHODS = ['유종별', '판매일자순', '차량별-판매일자순', '차량별-유종별'];

const state = {
  vendors:             [],
  customers:           [],
  files:               [],
  monthlyStatus:       {},   // { "05": true, "06": false, ... }
  year:                new Date().getFullYear(),
  month:               new Date().getMonth() + 1,
  issueDate:           '',
  emailStatus:         {},   // { 업체명: 'sent'|'fail'|'sending' }
  hometaxStatus:       {},   // { 업체명: 'done'|'fail'|'running' }
  completion:          { statements: [], emails: [], taxInvoices: [] }, // 영구 완료 상태
  sort:                { col: 'name', dir: 'asc' },
  vendorPrintMethods:   {},   // { 업체명: 출력방법 } — 세션 내
  vendorSplitDelivery: {},   // { 업체명: true|false } — 배달/주유 분리 발행
  vendorStatementScopes: {}, // { 업체명: 'nonfuel'|'fuel'|'all' } — 유가보조금 업체 명세서 품목
  hometaxMethods:      {},   // { 업체명: '통합'|'분리' } — 세션 내 (구 자동화용)
  taxIssuanceMethods:  {},   // { 업체명: '합산'|'분리' } — 세션 내 (일괄발행용)
  monthlyProfit:       null, // /api/monthly-profit 응답
};

// ── 초기화 ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/version').then(r => r.json()).then(d => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${d.version}`;
  });
  initYearMonth();
  initDailyYearMonth();
  initSummaryYearMonth();
  initVendorPriceYearMonth();
  initTabs();
  // URL 파라미터로 시작 그룹 지정 가능 (?group=summary 등)
  const startGroup = new URLSearchParams(location.search).get('group') || 'today';
  switchGroup(startGroup);
  initFileUpload();
  initDailyUpload();
  initUploadModal();
  initEmailPreview();
  loadAll();
  loadDailyPurchasePrices();
  loadPurchaseLots();
  loadBankDeposits();
});

function initYearMonth() {
  const selYear  = document.getElementById('sel-year');
  const selMonth = document.getElementById('sel-month');
  const now = new Date();

  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    selYear.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === now.getMonth() + 1) opt.selected = true;
    selMonth.appendChild(opt);
  }

  state.year  = Number(selYear.value);
  state.month = Number(selMonth.value);
  updateIssueDate();

  selYear.addEventListener('change', () => {
    state.year = Number(selYear.value);
    updateIssueDate();
    loadForMonth();
  });
  selMonth.addEventListener('change', () => {
    state.month = Number(selMonth.value);
    updateIssueDate();
    loadForMonth();
  });

  document.getElementById('issue-date').addEventListener('change', e => {
    state.issueDate = e.target.value;
  });
}

function updateIssueDate() {
  // 발행일자 기본값: 선택 월의 마지막 주 평일 (금요일 또는 그 이전 평일)
  const lastDay = new Date(state.year, state.month, 0); // 해당 월 마지막 날
  // 마지막 날부터 거슬러 올라가며 평일(월~금) 찾기
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  const iso = lastDay.toISOString().split('T')[0];
  document.getElementById('issue-date').value = iso;
  state.issueDate = iso;
}

function initTabs() {
  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => switchGroup(btn.dataset.group));
  });
  // 일마감 subnav 버튼은 switchDailySubTab으로, 나머지는 switchSubTab으로
  document.querySelectorAll('#subnav-daily .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDailySubTab(btn.dataset.tab));
  });
  document.querySelectorAll('#subnav-monthly .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSubTab(btn.dataset.tab));
  });
  document.querySelectorAll('#subnav-summary .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSummarySubTab(btn.dataset.tab));
  });
}

function switchGroup(group) {
  // 모든 그룹 숨기기 (inline style 사용 — CSS보다 우선순위 확실)
  ['group-today', 'group-usage', 'group-summary', 'group-daily', 'group-monthly', 'group-vat', 'group-price'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.remove('active'); }
  });

  // 선택 그룹만 표시
  const target = document.getElementById(`group-${group}`);
  if (target) { target.style.display = 'block'; target.classList.add('active'); }

  // 메인 탭 버튼
  document.querySelectorAll('.main-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.group === group);
  });

  // subnav
  const subnav        = document.getElementById('subnav');
  const subnavDaily   = document.getElementById('subnav-daily');
  const subnavMonthly = document.getElementById('subnav-monthly');
  const subnavSummary = document.getElementById('subnav-summary');
  if (group === 'daily' || group === 'monthly' || group === 'summary') {
    subnav.classList.remove('hidden');
    if (subnavDaily)   subnavDaily.style.display   = group === 'daily'   ? '' : 'none';
    if (subnavMonthly) subnavMonthly.style.display = group === 'monthly' ? '' : 'none';
    if (subnavSummary) subnavSummary.style.display = group === 'summary' ? '' : 'none';
  } else {
    subnav.classList.add('hidden');
  }

  // 그룹별 초기화
  if (group === 'daily') {
    const activeTab = document.querySelector('#subnav-daily .tab-btn.active')?.dataset.tab || 'daily-main';
    switchDailySubTab(activeTab);
    loadDailyMonth();
  } else if (group === 'monthly') {
    const activeTab = document.querySelector('#subnav-monthly .tab-btn.active')?.dataset.tab || 'statements';
    switchSubTab(activeTab);
  } else if (group === 'summary') {
    const activeTab = document.querySelector('#subnav-summary .tab-btn.active')?.dataset.tab || 'summary-main';
    switchSummarySubTab(activeTab);
  } else if (group === 'today') {
    loadToday();
  } else if (group === 'vat') {
    loadVat();
  } else if (group === 'price') {
    const f = document.getElementById('price-frame');
    if (!f.src) f.src = 'board.html';
  }
}

function switchSummarySubTab(tab) {
  document.querySelectorAll('#subnav-summary .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const gs = document.getElementById('group-summary');
  if (gs) { gs.style.display = 'block'; gs.classList.add('active'); }
  ['summary-main', 'summary-assets'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (!el) return;
    const show = t === tab;
    el.style.display = show ? 'block' : 'none';
    el.classList.toggle('active', show);
  });
  if (tab === 'summary-main')   loadSummary();
  if (tab === 'summary-assets') loadAssetOverview();
}

function switchDailySubTab(tab) {
  // subnav 버튼
  document.querySelectorAll('#subnav-daily .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // 일마감 그룹이 보이도록 강제
  const gd = document.getElementById('group-daily');
  if (gd) { gd.style.display = 'block'; gd.classList.add('active'); }
  // 탭 콘텐츠: inline style로 확실하게 제어
  ['daily-main', 'daily-expense', 'daily-customer', 'daily-deposit'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (!el) return;
    const show = t === tab;
    el.style.display = show ? 'block' : 'none';
    el.classList.toggle('active', show);
  });
  if (tab === 'daily-expense')  window.location.href = '/expenses.html';
  if (tab === 'daily-customer') loadCustomerSales();
  if (tab === 'daily-deposit')  { loadDepositMatch(); loadOilbankSupports(); }
}

function switchSubTab(tab) {
  // subnav 버튼
  document.querySelectorAll('#subnav-monthly .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // 월마감 탭 콘텐츠만 제어
  document.querySelectorAll('#group-monthly .tab-content').forEach(t => {
    t.style.display = 'none'; t.classList.remove('active');
  });
  const section = document.getElementById(`tab-${tab}`);
  if (section) { section.style.display = 'block'; section.classList.add('active'); }
  if (tab === 'vendorprices') loadVendorPrices();
  if (tab === 'archeck')      loadArSummary();
  renderAll();
}

function initFileUpload() {
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) uploadExcel(e.target.files[0]);
  });
  document.getElementById('delivery-file-input').addEventListener('change', e => {
    if (e.target.files[0]) uploadDeliveryExcel(e.target.files[0]);
  });
  document.getElementById('customer-file-input').addEventListener('change', e => {
    if (e.target.files[0]) importCustomers(e.target.files[0]);
  });
}

async function loadAll() {
  const [vRes, cRes, fRes, mRes, sRes, compRes, profRes] = await Promise.all([
    api('GET', `/api/vendors?year=${state.year}&month=${state.month}`),
    api('GET', '/api/customers'),
    api('GET', '/api/files'),
    api('GET', `/api/monthly-status?year=${state.year}`),
    api('GET', '/api/settings'),
    api('GET', `/api/completion?year=${state.year}&month=${state.month}`),
    api('GET', `/api/monthly-profit?year=${state.year}&month=${state.month}`),
  ]);
  if (vRes.ok)    state.vendors       = vRes.vendors;
  if (cRes.ok) {
    state.customers = cRes.customers;
    cRes.customers.forEach(c => {
      if (c.splitDelivery) state.vendorSplitDelivery[c.name] = true;
    });
  }
  if (fRes.ok)    state.files         = fRes.files;
  if (mRes.ok)    state.monthlyStatus = mRes.months;
  if (compRes.ok) state.completion    = compRes.completion;
  if (profRes.ok) state.monthlyProfit = profRes;
  if (sRes.ok && sRes.smtpUser) {
    document.getElementById('smtp-user').value = sRes.smtpUser;
    if (sRes.hasPass) document.getElementById('smtp-pass').placeholder = '저장됨 (변경 시 입력)';
    const certStatus = document.getElementById('cert-pass-status');
    if (certStatus) certStatus.textContent = sRes.hasCertPass ? '✅ 공동인증서 비밀번호 저장됨' : '';
  }

  // 현재 월에 데이터가 없으면 가장 최근 데이터 있는 달로 자동 전환
  if (state.vendors.length === 0 && mRes.ok) {
    const latestMonth = Object.entries(state.monthlyStatus)
      .filter(([, has]) => has)
      .map(([mo]) => Number(mo))
      .sort((a, b) => b - a)[0];
    if (latestMonth && latestMonth !== state.month) {
      switchMonth(latestMonth);
      return; // switchMonth → loadForMonth → renderAll 호출함
    }
  }

  renderAll();
  loadStaleStatements();
}

async function loadForMonth() {
  const [vRes, mRes, fRes, compRes, profRes] = await Promise.all([
    api('GET', `/api/vendors?year=${state.year}&month=${state.month}`),
    api('GET', `/api/monthly-status?year=${state.year}`),
    api('GET', '/api/files'),
    api('GET', `/api/completion?year=${state.year}&month=${state.month}`),
    api('GET', `/api/monthly-profit?year=${state.year}&month=${state.month}`),
  ]);
  if (vRes.ok)    state.vendors       = vRes.vendors;
  if (mRes.ok)    state.monthlyStatus = mRes.months;
  if (fRes.ok)    state.files         = fRes.files;
  if (compRes.ok) state.completion    = compRes.completion;
  if (profRes.ok) state.monthlyProfit = profRes;
  renderAll();
  loadStaleStatements();
}

// ── 렌더링 ──────────────────────────────────────────────────
function renderAll() {
  renderMonthlyChips();
  renderMonthlyProfit();
  renderVendors();
  renderCustomers();
  renderEmail();
  renderTaxInvoice();
}

// 출력방법 드롭다운 options HTML
function printMethodOptions(current) {
  const opts = [['', '기본(차량별-유종별)'], ...PRINT_METHODS.map(m => [m, m])];
  return opts.map(([val, label]) =>
    `<option value="${val}"${current === val ? ' selected' : ''}>${label}</option>`
  ).join('');
}

// 업체 출력방법 변경 → customers.json 자동 저장
function updateVendorPrintMethod(name, value) {
  state.vendorPrintMethods[name] = value;
  const existing = state.customers.find(c => c.name === name) || { name };
  api('POST', '/api/customers', { ...existing, printMethod: value });
}

// 발행방식 변경 → customers.json 자동 저장
function updateVendorSplitDelivery(name, value) {
  state.vendorSplitDelivery[name] = value === 'true';
  const existing = state.customers.find(c => c.name === name) || { name };
  api('POST', '/api/customers', { ...existing, splitDelivery: state.vendorSplitDelivery[name] });
  renderVendors();
}

// 유가보조금 업체 명세서 품목 변경 → customers.json 자동 저장
function updateVendorStatementScope(name, value) {
  state.vendorStatementScopes[name] = value;
  let existing = state.customers.find(c => c.name === name);
  if (!existing) { existing = { name }; state.customers.push(existing); }
  existing.statementScope = value;
  api('POST', '/api/customers', { ...existing });
  renderVendors();
}

// 파일명 생성 (서버와 동일한 규칙)
function getFilename(name, suffix = '') {
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const mo   = String(state.month).padStart(2, '0');
  const sfx  = suffix ? `_${suffix}` : '';
  return `${state.year}년${mo}월_거래명세서_${safe}${sfx}.xlsx`;
}

// ── 월별 현황 칩 ─────────────────────────────────────────────
function renderMonthlyChips() {
  const container = document.getElementById('monthly-chips');
  const curMo = String(state.month).padStart(2, '0');
  container.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m  = i + 1;
    const mo = String(m).padStart(2, '0');
    const hasData = !!state.monthlyStatus[mo];
    const isActive = mo === curMo;
    const classes = ['month-chip', hasData ? 'has-data' : '', isActive ? 'active' : ''].join(' ');
    return `<span class="${classes}" onclick="switchMonth(${m})">${m}월${hasData ? ' ✅' : ''}</span>`;
  }).join('');
}

function switchMonth(m) {
  state.month = m;
  document.getElementById('sel-month').value = m;
  updateIssueDate();
  loadForMonth();
}

// ── 정렬 ─────────────────────────────────────────────────────
function setSort(col) {
  if (state.sort.col === col) {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.col = col;
    state.sort.dir = col === 'name' ? 'asc' : 'desc';
  }
  renderVendors();
}

function sortedVendors() {
  const { col, dir } = state.sort;
  return [...state.vendors].sort((a, b) => {
    if (col === 'name') {
      return dir === 'asc'
        ? a.name.localeCompare(b.name, 'ko')
        : b.name.localeCompare(a.name, 'ko');
    }
    const map = { credit: 'totalCredit', other: 'totalOther', total: 'total' };
    const key = map[col] || 'total';
    const va  = a[key] || 0;
    const vb  = b[key] || 0;
    return dir === 'asc' ? va - vb : vb - va;
  });
}

function updateSortIcons() {
  ['name', 'credit', 'other', 'total'].forEach(col => {
    const th   = document.querySelector(`th[data-col="${col}"]`);
    const icon = document.getElementById(`sort-${col}`);
    if (!th || !icon) return;
    if (state.sort.col === col) {
      th.classList.add('sort-active');
      icon.textContent = state.sort.dir === 'asc' ? '↑' : '↓';
    } else {
      th.classList.remove('sort-active');
      icon.textContent = '⇅';
    }
  });
}

// ── 월 영업이익 분석 ─────────────────────────────────────────
function renderMonthlyProfit() {
  const card  = document.getElementById('monthly-profit-card');
  const body  = document.getElementById('monthly-profit-body');
  const label = document.getElementById('monthly-profit-month');
  if (!card || !body) return;

  const p = state.monthlyProfit;
  if (!p || !p.fuelTotals) { card.style.display = 'none'; return; }

  card.style.display = '';
  if (label) label.textContent = `${state.year}년 ${state.month}월`;

  const FUEL_ORDER = ['휘발유', '경유', '등유', '세차', '유외상품'];
  const FUEL_TYPES = new Set(['휘발유', '경유', '등유']);
  const won  = v => v != null ? v.toLocaleString() + '원' : '-';
  const litL = v => v > 0    ? Math.floor(v).toLocaleString() + 'L' : '-';
  const pct  = (profit, amount) => (profit != null && amount > 0)
    ? ((profit / amount) * 100).toFixed(1) + '%' : '-';

  const keys = FUEL_ORDER.filter(k => p.fuelTotals[k]);
  // FUEL_ORDER에 없는 유종도 추가
  Object.keys(p.fuelTotals).forEach(k => { if (!keys.includes(k)) keys.push(k); });

  let totalAmt = 0, totalCost = 0, totalProfit = 0, allHasPrice = true;

  const rowsHtml = keys.map(prod => {
    const t = p.fuelTotals[prod];
    if (!t) return '';
    totalAmt    += t.amount;
    totalCost   += t.cost || 0;
    if (t.profit != null) totalProfit += t.profit;
    if (FUEL_TYPES.has(prod) && !t.hasPrice) allHasPrice = false;

    const profitCls = t.profit == null ? '' : t.profit >= 0 ? 'profit-pos' : 'profit-neg';
    return `<tr>
      <td><strong>${prod}</strong></td>
      <td style="text-align:right;">${FUEL_TYPES.has(prod) ? litL(t.qty) : '-'}</td>
      <td style="text-align:right;">${won(t.amount)}</td>
      <td style="text-align:right;">${FUEL_TYPES.has(prod) && t.hasPrice ? won(Math.round(t.cost)) : (FUEL_TYPES.has(prod) ? '<span style="color:#f59e0b">단가 미등록</span>' : '-')}</td>
      <td style="text-align:right;" class="${profitCls}">${won(t.profit)}</td>
      <td style="text-align:right;">${pct(t.profit, t.amount)}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:8px 12px;text-align:left;">유종</th>
          <th style="padding:8px 12px;text-align:right;">판매량</th>
          <th style="padding:8px 12px;text-align:right;">판매금액</th>
          <th style="padding:8px 12px;text-align:right;">매입원가</th>
          <th style="padding:8px 12px;text-align:right;">매출이익</th>
          <th style="padding:8px 12px;text-align:right;">수익률</th>
        </tr>
      </thead>
      <tbody style="border-bottom:2px solid #e2e8f0;">${rowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold;">
          <td style="padding:8px 12px;">합계</td>
          <td></td>
          <td style="padding:8px 12px;text-align:right;">${won(totalAmt)}</td>
          <td style="padding:8px 12px;text-align:right;">${allHasPrice ? won(Math.round(totalCost)) : '-'}</td>
          <td style="padding:8px 12px;text-align:right;" class="${totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}">${won(totalProfit)}</td>
          <td style="padding:8px 12px;text-align:right;">${pct(totalProfit, totalAmt)}</td>
        </tr>
      </tfoot>
    </table>
    ${!p.hasPrices ? '<p style="font-size:12px;color:#f59e0b;margin:8px 12px 0;">매입단가를 등록하면 연료 매출이익을 계산할 수 있습니다. (일마감 → 매입단가 관리)</p>' : ''}
  `;
}

// ── 업체 목록 ────────────────────────────────────────────────
function renderVendors() {
  const tbody = document.getElementById('vendor-tbody');
  if (!state.vendors.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Excel 파일을 업로드하면 업체 목록이 표시됩니다</td></tr>';
    return;
  }

  updateSortIcons();

  let sumCredit = 0, sumOther = 0, sumAll = 0;

  const rows = sortedVendors().map(v => {
    const filename      = getFilename(v.name);
    const splitFile1    = getFilename(v.name, '스탠드');
    const splitFile2    = getFilename(v.name, '배달');
    const isSplit       = !!state.vendorSplitDelivery[v.name];
    const hasFile       = isSplit
      ? state.files.some(f => f.name === splitFile1) && state.files.some(f => f.name === splitFile2)
      : state.files.some(f => f.name === filename);
    const credit   = v.totalCredit || 0;
    const other    = v.totalOther  || 0;
    const total    = v.total || 0;

    sumCredit += credit;
    sumOther  += other;
    sumAll    += total;

    // 외상 업체: 체크박스 + 거래명세서 생성 가능
    // 카드/현금 업체: 체크박스 없음 (판매량 확인용)
    // 업체 통합: 합쳐지는 업체(예: 명신)는 받는 업체(현대스크랩) 거래명세서에 포함 → 따로 발행 안 함
    const mergedInto = v.statementMergedInto;
    const mergedFrom = v.statementMergedFrom || [];
    const checkCell = (canStatement(v) && !mergedInto)
      ? `<input type="checkbox" class="vendor-check" value="${esc(v.name)}">`
      : '';

    const mergedAdd = mergedFrom.reduce((s, x) => s + x.credit, 0);
    const creditCell = (credit > 0
      ? `<strong>${credit.toLocaleString()}원</strong>`
      : `<span style="color:#94a3b8">-</span>`)
      + (mergedAdd ? `<div style="font-size:11px;color:#7c3aed;">+ ${mergedFrom.map(x => `${esc(x.name)} ${x.credit.toLocaleString()}`).join(', ')}<br>= 명세서 ${(credit + mergedAdd).toLocaleString()}원</div>` : '')
      + (v.statementCardAmount ? `<div style="font-size:11px;color:#0369a1;" title="BOS에 신용카드로 입력된 거래도 거래명세서에 포함">+ 카드 ${v.statementCardAmount.toLocaleString()}원 = ${(v.statementAllAmount || 0).toLocaleString()}원</div>` : '')
      + (v.statementNonFuelOnly ? statementScopeCell(v) : '');

    const otherCell = other > 0
      ? `${other.toLocaleString()}원`
      : `<span style="color:#94a3b8">-</span>`;

    const stmtDone = state.completion.statements.includes(v.name);
    const statCell = mergedInto
      ? `<span class="badge" style="background:#ede9fe;color:#6d28d9" title="이 업체 외상 거래는 ${esc(mergedInto)} 거래명세서에 합산됩니다">${esc(mergedInto)}에 합산</span>`
      : canStatement(v)
      ? (hasFile
          ? (stmtDone
              ? '<span class="badge badge-done">완료</span>'
              : '<span class="badge badge-ok">생성됨</span>')
            + (state.staleStatements?.[v.name]
              ? `<span class="badge-stale" title="명세서 파일 ${state.staleStatements[v.name].fileTotal.toLocaleString()}원 / 지금 데이터 ${state.staleStatements[v.name].dataTotal.toLocaleString()}원 — BOS 자료가 바뀌었습니다">⚠ 다시 생성</span>`
              : '')
          : '<span class="badge badge-no">미생성</span>')
      : '<span class="badge" style="background:#f1f5f9;color:#94a3b8">해당없음</span>';

    const dlCell = (canStatement(v) && hasFile && !mergedInto)
      ? (isSplit
          ? `<a href="/api/download/${encodeURIComponent(splitFile1)}" class="btn-link" download>주유</a>
             <a href="/api/download/${encodeURIComponent(splitFile2)}" class="btn-link" download style="margin-left:4px">배달</a>`
          : `<a href="/api/download/${encodeURIComponent(filename)}" class="btn-link" download>다운로드</a>`)
      : '-';

    const savedMethod = state.vendorPrintMethods[v.name]
      ?? (state.customers.find(c => c.name === v.name)?.printMethod ?? '');
    const methodCell = canStatement(v)
      ? `<select class="select-method" onchange="updateVendorPrintMethod('${esc(v.name)}', this.value)">${printMethodOptions(savedMethod)}</select>`
      : dash();

    const hasDeliveryTxs = v.txs && v.txs.some(t => t.isDelivery) && v.txs.some(t => !t.isDelivery);
    const splitCell = (canStatement(v) && hasDeliveryTxs)
      ? `<select class="select-method" onchange="updateVendorSplitDelivery('${esc(v.name)}', this.value)">
           <option value=""${!isSplit ? ' selected' : ''}>통합 (1부)</option>
           <option value="true"${isSplit ? ' selected' : ''}>배달/주유 분리 (2부)</option>
         </select>`
      : dash();

    const errorBadge = v.hasError
      ? `<button class="btn-error" onclick="showErrorModal('${esc(v.name)}')">⚠ 오류확인</button>`
      : '';

    return `<tr>
      <td class="col-chk">${checkCell}</td>
      <td>${esc(v.name)}${errorBadge}${mergedInto ? `<div style="font-size:11px;color:#6d28d9;">→ ${esc(mergedInto)} 거래명세서에 포함</div>` : ''}</td>
      <td class="col-num">${creditCell}</td>
      <td class="col-num">${otherCell}</td>
      <td class="col-num">${total.toLocaleString()}원</td>
      <td class="col-method">${methodCell}</td>
      <td class="col-method">${splitCell}</td>
      <td class="col-status">${statCell}</td>
      <td class="col-action">${dlCell}</td>
    </tr>`;
  });

  // 총합계 행
  const totalRow = `<tr class="total-row">
    <td></td>
    <td>총합계 (${state.vendors.length}개 업체)</td>
    <td class="col-num">${sumCredit.toLocaleString()}원</td>
    <td class="col-num">${sumOther.toLocaleString()}원</td>
    <td class="col-num">${sumAll.toLocaleString()}원</td>
    <td></td>
    <td></td>
    <td></td>
  </tr>`;

  tbody.innerHTML = rows.join('') + totalRow;
}

// ── 고객 목록 ────────────────────────────────────────────────
function renderCustomers() {
  const tbody = document.getElementById('customer-tbody');
  const count = document.getElementById('customer-count');
  count.textContent = `${state.customers.length}명`;

  if (!state.customers.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">등록된 고객이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = state.customers.map(c => `<tr>
    <td>${esc(c.name)}</td>
    <td>${esc(c.bizNo) || dash()}</td>
    <td>${esc(c.contactName) || dash()}</td>
    <td>${esc(c.email) || dash()}</td>
    <td>${esc(c.phone) || dash()}</td>
    <td>${c.bizType ? `<span class="badge badge-info">${esc(c.bizType)}</span>` : dash()}</td>
    <td>${c.bizItem ? `<span class="badge badge-info">${esc(c.bizItem)}</span>` : dash()}</td>
    <td class="col-method">${c.printMethod ? `<span class="badge badge-no">${esc(c.printMethod)}</span>` : dash()}</td>
    <td class="col-action">
      <button class="btn-sm" onclick='editCustomer(${JSON.stringify(c.name)})'>수정</button>
      <button class="btn-sm btn-danger" onclick='deleteCustomer(${JSON.stringify(c.name)})'>삭제</button>
    </td>
  </tr>`).join('');
}

// ── 메일 발송 목록 ───────────────────────────────────────────
function renderEmail() {
  const tbody = document.getElementById('email-tbody');
  // 외상 업체만 표시 (카드 결제분도 명세서 받는 업체 포함)
  const creditVendors = state.vendors.filter(canStatement);

  if (!creditVendors.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Excel 파일을 업로드하면 목록이 표시됩니다</td></tr>';
    return;
  }
  tbody.innerHTML = creditVendors.map(v => {
    const customer = state.customers.find(c => c.name === v.name);
    const filename  = getFilename(v.name);
    const hasFile   = state.files.some(f => f.name === filename);
    const hasEmail  = !!customer?.email;
    const canSelect = hasFile && hasEmail;
    const status      = state.emailStatus[v.name];
    const emailRecord = state.completion.emails.find(t => t.name === v.name);

    let statusBadge;
    if (emailRecord) {
      statusBadge = `<span class="badge badge-done">완료</span><div style="font-size:11px;color:#64748b;margin-top:2px;">${esc(emailRecord.date)}</div>`;
    } else if (status === 'sent') {
      statusBadge = '<span class="badge badge-done">완료</span>';
    } else if (status === 'sending') {
      statusBadge = '<span class="badge badge-sending">발송중...</span>';
    } else if (status === 'fail') {
      statusBadge = '<span class="badge badge-fail">실패</span>';
    } else {
      statusBadge = '<span class="badge badge-no">대기</span>';
    }

    return `<tr>
      <td class="col-chk">
        <input type="checkbox" class="email-check" value="${esc(v.name)}" ${canSelect ? '' : 'disabled'}>
      </td>
      <td>${esc(v.name)}</td>
      <td>${hasEmail ? esc(customer.email) : '<span class="badge badge-warn">이메일 미등록</span>'}</td>
      <td class="col-status">${hasFile
        ? '<span class="badge badge-ok">생성됨</span>'
        : '<span class="badge badge-warn">미생성</span>'}</td>
      <td class="col-status">${statusBadge}</td>
    </tr>`;
  }).join('');
}

// ── 세금계산서 발행구분 → customers.json 자동 저장 ─────────────
function getTaxIssuance(vendorName) {
  if (state.taxIssuanceMethods[vendorName] !== undefined)
    return state.taxIssuanceMethods[vendorName];
  return state.customers.find(c => c.name === vendorName)?.taxIssuance || '합산';
}
function updateTaxIssuance(name, value) {
  state.taxIssuanceMethods[name] = value;
  const existing = state.customers.find(c => c.name === name) || { name };
  api('POST', '/api/customers', { ...existing, taxIssuance: value });
  renderTaxInvoice();
}

// 유종 제품 (그 외는 유외상품으로 합산)
const FUEL_PRODUCTS = new Set(['휘발유', '경유', '등유']);

// 품목 집계 (브라우저 계산용 — taxInvoiceGenerator.js와 동일 로직)
function calcProductsForVendor(vendor) {
  const fuelMap = {};
  let nonFuelSupply = 0, nonFuelTax = 0;

  (vendor.txs || []).forEach(t => {
    const supply = t.taxType === '면세' ? t.amount : Math.round(t.amount / 1.1);
    const tax    = t.taxType === '면세' ? 0        : t.amount - supply;
    const qty    = Math.floor(t.qty);

    if (FUEL_PRODUCTS.has(t.product)) {
      if (!fuelMap[t.product]) fuelMap[t.product] = { qty: 0, supply: 0, tax: 0 };
      fuelMap[t.product].qty    += qty;
      fuelMap[t.product].supply += supply;
      fuelMap[t.product].tax    += tax;
    } else {
      nonFuelSupply += supply;
      nonFuelTax    += tax;
    }
  });

  const result = Object.entries(fuelMap).map(([name, d]) => ({ name, ...d }));
  if (nonFuelSupply > 0) {
    result.push({ name: '유외상품', qty: 0, supply: nonFuelSupply, tax: nonFuelTax });
  }
  return result;
}

// ── 세금계산서 일괄발행 목록 ──────────────────────────────────
function renderTaxInvoice() {
  const tbody = document.getElementById('tax-tbody');
  if (!tbody) return;
  const creditVendors = state.vendors.filter(v => v.hasCredit);

  if (!creditVendors.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Excel 파일을 업로드하면 목록이 표시됩니다</td></tr>';
    return;
  }

  tbody.innerHTML = creditVendors.map(v => {
    const customer  = state.customers.find(c => c.name === v.name);
    const hasBizNo  = !!customer?.bizNo;
    const products  = calcProductsForVendor(v);
    const method    = getTaxIssuance(v.name);

    const totalSupply = products.reduce((s, p) => s + p.supply, 0);
    const totalTax    = products.reduce((s, p) => s + p.tax,    0);

    // 예상 장수 계산
    let invoiceCount;
    if (method === '분리') {
      invoiceCount = products.length;
    } else {
      invoiceCount = Math.ceil(products.length / 4) || 1;
    }

    // 유종/품목 태그
    const productTags = products.map(p =>
      `<span class="product-tag">${esc(p.name)}</span>`
    ).join('');

    const methodSel = `<select class="select-method" onchange="updateTaxIssuance('${esc(v.name)}', this.value)">
      <option value="합산" ${method === '합산' ? 'selected' : ''}>합산 (${Math.ceil(products.length/4)||1}장)</option>
      <option value="분리" ${method === '분리' ? 'selected' : ''}>분리 (${products.length}장)</option>
    </select>`;

    const taxRecord  = state.completion.taxInvoices.find(t => t.name === v.name);
    const countBadge = taxRecord
      ? `<span class="badge badge-done">완료</span><div style="font-size:11px;color:#64748b;margin-top:2px;">${esc(taxRecord.date)}</div>`
      : `<span class="badge ${invoiceCount > 1 ? 'badge-warn' : 'badge-ok'}">${invoiceCount}장</span>`;

    return `<tr class="${hasBizNo ? '' : 'row-disabled'}">
      <td class="col-chk">
        <input type="checkbox" class="tax-check" value="${esc(v.name)}" ${hasBizNo ? '' : 'disabled'}>
      </td>
      <td>${esc(v.name)}</td>
      <td>${hasBizNo
        ? `<span class="bizno">${esc(customer.bizNo)}</span>`
        : '<span class="badge badge-warn">사업자번호 미등록</span>'}</td>
      <td class="col-num">${totalSupply.toLocaleString()}원</td>
      <td class="col-num">${totalTax.toLocaleString()}원</td>
      <td class="col-num">${v.totalCredit.toLocaleString()}원</td>
      <td class="col-products">${productTags}</td>
      <td class="col-method">${methodSel}</td>
      <td class="col-status">${countBadge}</td>
    </tr>`;
  }).join('');
}

// ── 세금계산서 일괄발행 Excel 생성 ───────────────────────────
async function generateTaxExcel() {
  const names = getChecked('tax-check');
  if (!names.length) return toast('업체를 선택하세요.', 'warn');

  // 선택한 업체의 발행구분만 전달
  const taxMethods = {};
  names.forEach(n => { taxMethods[n] = getTaxIssuance(n); });

  toast('일괄발행 Excel 생성 중...', '');

  const res = await api('POST', '/api/generate-tax-excel', {
    issueDate: state.issueDate,
    year:      state.year,
    month:     state.month,
    taxMethods,
  });

  if (!res.ok) return toast(`오류: ${res.error}`, 'error');

  const panel = document.getElementById('tax-result-panel');
  const body  = document.getElementById('tax-result-body');
  const skipMsg = res.skipped?.length
    ? `<p style="margin-top:8px; color:#92400e; font-size:13px;">⚠️ 사업자번호 미등록으로 제외된 업체: ${res.skipped.map(esc).join(', ')}</p>`
    : '';

  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
      <div style="font-size:15px; font-weight:700; color:#15803d;">✅ 생성 완료</div>
      <div>총 <strong>${res.count}행</strong> (세금계산서 ${res.count}장)</div>
    </div>
    <a href="/api/download/${encodeURIComponent(res.filename)}"
       class="btn-primary"
       style="display:inline-block; padding:10px 20px; text-decoration:none; border-radius:6px; font-weight:700;"
       download>
      ⬇ ${esc(res.filename)} 다운로드
    </a>
    <p style="margin-top:12px; font-size:12px; color:#64748b;">
      홈택스 → 전자세금계산서 → 발급 → <strong>Excel 일괄발급</strong> → 파일 업로드
    </p>
    ${skipMsg}`;

  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth' });
  toast(`✅ ${res.count}건 일괄발행 Excel 생성 완료`, 'success');

  const [fRes, compRes] = await Promise.all([
    api('GET', '/api/files'),
    api('GET', `/api/completion?year=${state.year}&month=${state.month}`),
  ]);
  if (fRes.ok)    state.files      = fRes.files;
  if (compRes.ok) state.completion = compRes.completion;
  renderTaxInvoice();
}

// 거래명세서 발행 가능: 외상 거래가 있거나, 카드 결제분도 명세서에 넣는 업체
function canStatement(v) { return !!(v.hasCredit || v.statementCardAmount); }

// 유가보조금 업체: 명세서에 넣을 품목 선택 (유외상품만 / 유류만 / 전체)
function statementScopeCell(v) {
  const scope = state.vendorStatementScopes[v.name] || v.statementScope || 'nonfuel';
  const amt = { nonfuel: v.statementNonFuelAmount || 0, fuel: v.statementFuelAmount || 0, all: v.statementAllAmount ?? v.totalCredit ?? 0 };
  const opt = (val, label) => `<option value="${val}"${scope === val ? ' selected' : ''}>${label} ${amt[val].toLocaleString()}원</option>`;
  return `<div style="font-size:11px;color:#0369a1;margin-top:2px;" title="유가보조금 업체 — 거래명세서에 넣을 품목 선택">명세서:
    <select class="select-method" style="font-size:11px;" onchange="updateVendorStatementScope('${esc(v.name)}', this.value)">
      ${opt('nonfuel', '유외상품만')}${opt('fuel', '유류만')}${opt('all', '전체')}
    </select></div>`;
}

// ── 거래명세서 생성 ─────────────────────────────────────────
async function generateSelected() {
  const names = getChecked('vendor-check');
  if (!names.length) return toast('업체를 선택하세요.', 'warn');

  const issueDate      = state.issueDate.replace(/-/g, '/');
  const printMethods   = {};
  const splitDelivery  = {};
  const statementScopes = {};
  names.forEach(n => {
    const v = state.vendors.find(x => x.name === n);
    if (v?.statementNonFuelOnly) statementScopes[n] = state.vendorStatementScopes[n] || v.statementScope || 'nonfuel';
    if (state.vendorPrintMethods[n]) printMethods[n] = state.vendorPrintMethods[n];
    splitDelivery[n] = !!state.vendorSplitDelivery[n]; // 통합이어도 false로 명시 전달
  });
  toast(`${names.length}개 업체 거래명세서 생성 중...`, '');

  const res = await api('POST', '/api/generate', {
    vendorNames: names,
    issueDate,
    year:  state.year,
    month: state.month,
    printMethods,
    splitDelivery,
    statementScopes,
  });

  if (res.ok) {
    toast(`✅ ${res.files.length}개 파일 생성 완료`, 'success');
    const [fRes, compRes] = await Promise.all([
      api('GET', '/api/files'),
      api('GET', `/api/completion?year=${state.year}&month=${state.month}`),
    ]);
    if (fRes.ok)    state.files      = fRes.files;
    if (compRes.ok) state.completion = compRes.completion;
    renderAll();
    loadStaleStatements();
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

// ── 메일 공통 문구 미리보기 ─────────────────────────────────
function initEmailPreview() {
  const textarea = document.getElementById('email-extra-memo');
  if (textarea) {
    textarea.addEventListener('input', updateEmailPreview);
    updateEmailPreview();
  }
}

function getEmailMemo() {
  return document.getElementById('email-extra-memo')?.value.trim() || '';
}

function updateEmailPreview() {
  const el = document.getElementById('email-preview');
  if (!el) return;
  const memo = getEmailMemo();
  const mo   = state.month;
  el.textContent = [
    `안녕하세요, [업체명] 담당자님.`,
    ``,
    `(주)미소주유소 ${mo}월 거래명세서를 첨부파일로 보내드립니다.`,
    `확인 후 문의사항이 있으시면 연락 주시기 바랍니다.`,
    memo ? `` : null,
    memo || null,
    ``,
    `감사합니다.`,
    `(주)미소주유소 드림`,
  ].filter(l => l !== null).join('\n');
}

// ── 메일 발송 ───────────────────────────────────────────────
async function sendSelectedEmails() {
  const names = getChecked('email-check');
  if (!names.length) return toast('업체를 선택하세요.', 'warn');

  const extraMemo = getEmailMemo();

  for (const name of names) {
    const customer = state.customers.find(c => c.name === name);
    if (!customer?.email) continue;
    const filename = getFilename(name);

    state.emailStatus[name] = 'sending';
    renderEmail();

    const res = await api('POST', '/api/send-email', {
      vendorName: name,
      email:      customer.email,
      filename,
      year:       state.year,
      month:      state.month,
      extraMemo,
    });

    state.emailStatus[name] = res.ok ? 'sent' : 'fail';
    renderEmail();
    if (!res.ok) toast(`${name} 발송 실패: ${res.error}`, 'error');
  }

  const sent = names.filter(n => state.emailStatus[n] === 'sent').length;
  if (sent) {
    const compRes = await api('GET', `/api/completion?year=${state.year}&month=${state.month}`);
    if (compRes.ok) state.completion = compRes.completion;
    renderEmail();
    toast(`✅ ${sent}개 업체 메일 발송 완료`, 'success');
  }
}


// ── 고객 Excel 일괄 업로드 ─────────────────────────────────────
async function importCustomers(file) {
  const label = document.getElementById('customer-import-label');
  label.textContent = `업로드 중: ${file.name}`;

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch('/api/import-customers', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      label.textContent = `✅ 완료`;
      toast(`✅ 신규 ${data.added}개 추가, ${data.updated}개 업데이트 (총 ${data.total}개)`, 'success');
      const cRes = await api('GET', '/api/customers');
      if (cRes.ok) state.customers = cRes.customers;
      renderAll();
    } else {
      label.textContent = '업로드 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch {
    label.textContent = '업로드 실패';
    toast('서버 연결 오류', 'error');
  }
  document.getElementById('customer-file-input').value = '';
}

// ── 고객 관리 ───────────────────────────────────────────────
async function saveCustomer() {
  const name          = document.getElementById('c-name').value.trim();
  const bizNo         = document.getElementById('c-bizno').value.trim();
  const ceoName       = document.getElementById('c-ceoname').value.trim();
  const contactName   = document.getElementById('c-contact').value.trim();
  const email         = document.getElementById('c-email').value.trim();
  const taxEmail      = document.getElementById('c-taxemail').value.trim();
  const phone         = document.getElementById('c-phone').value.trim();
  const address       = document.getElementById('c-address').value.trim();
  const bizType       = document.getElementById('c-biztype').value.trim();
  const bizItem       = document.getElementById('c-bizitem').value.trim();
  const printMethod   = document.getElementById('c-print-method').value;
  const taxIssuance   = document.getElementById('c-tax-issuance').value;
  const splitDelivery = document.getElementById('c-split-delivery').value === 'true';
  const mergeGasoline = document.getElementById('c-merge-gasoline').value === 'true';
  if (!name) return toast('업체명을 입력하세요.', 'warn');

  const res = await api('POST', '/api/customers', { name, bizNo, ceoName, contactName, email, taxEmail, phone, address, bizType, bizItem, printMethod, taxIssuance, splitDelivery, mergeGasoline });
  if (res.ok) {
    toast(`✅ ${name} 저장 완료`, 'success');
    closeCustomerForm();
    const cRes = await api('GET', '/api/customers');
    if (cRes.ok) state.customers = cRes.customers;
    renderAll();
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

function editCustomer(name) {
  const c = state.customers.find(c => c.name === name);
  if (!c) return;
  document.getElementById('c-name').value          = c.name;
  document.getElementById('c-bizno').value         = c.bizNo || '';
  document.getElementById('c-ceoname').value       = c.ceoName || '';
  document.getElementById('c-contact').value       = c.contactName || '';
  document.getElementById('c-email').value         = c.email || '';
  document.getElementById('c-taxemail').value      = c.taxEmail || '';
  document.getElementById('c-phone').value         = c.phone || '';
  document.getElementById('c-address').value       = c.address || '';
  document.getElementById('c-biztype').value       = c.bizType || '';
  document.getElementById('c-bizitem').value       = c.bizItem || '';
  document.getElementById('c-print-method').value   = c.printMethod || '';
  document.getElementById('c-tax-issuance').value   = c.taxIssuance || '합산';
  document.getElementById('c-split-delivery').value = c.splitDelivery ? 'true' : '';
  document.getElementById('c-merge-gasoline').value = c.mergeGasoline ? 'true' : '';
  document.querySelector('[data-tab="customers"]').click();
  document.getElementById('customer-form-card').style.display = '';
  document.getElementById('customer-form-title').textContent  = `수정: ${name}`;
  document.getElementById('customer-form-card').scrollIntoView({ behavior: 'smooth' });
}

function closeCustomerForm() {
  document.getElementById('customer-form-card').style.display = 'none';
  ['c-name','c-bizno','c-ceoname','c-contact','c-email','c-taxemail','c-phone','c-address','c-biztype','c-bizitem'].forEach(id =>
    document.getElementById(id).value = ''
  );
  document.getElementById('c-print-method').value   = '';
  document.getElementById('c-tax-issuance').value   = '합산';
  document.getElementById('c-split-delivery').value = '';
  document.getElementById('c-merge-gasoline').value = '';
}

async function deleteCustomer(name) {
  if (!confirm(`${name}을(를) 삭제하시겠습니까?`)) return;
  const res = await api('DELETE', `/api/customers/${encodeURIComponent(name)}`);
  if (res.ok) {
    toast('삭제 완료', 'success');
    const cRes = await api('GET', '/api/customers');
    if (cRes.ok) state.customers = cRes.customers;
    renderAll();
  }
}


// ── 설정 ────────────────────────────────────────────────────
async function saveSettings() {
  const smtpUser = document.getElementById('smtp-user').value.trim();
  const smtpPass = document.getElementById('smtp-pass').value;
  if (!smtpUser) return toast('이메일을 입력하세요.', 'warn');

  const res = await api('POST', '/api/settings', { smtpUser, smtpPass: smtpPass || undefined });
  if (res.ok) {
    toast('✅ 설정 저장 완료', 'success');
    document.getElementById('smtp-pass').value = '';
    document.getElementById('smtp-pass').placeholder = '저장됨 (변경 시 입력)';
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

async function saveCertPass() {
  const certPass = document.getElementById('cert-pass').value;
  if (!certPass) return toast('비밀번호를 입력하세요.', 'warn');
  const res = await api('POST', '/api/settings', { certPass });
  if (res.ok) {
    toast('✅ 공동인증서 비밀번호 저장 완료', 'success');
    document.getElementById('cert-pass').value = '';
    const certStatus = document.getElementById('cert-pass-status');
    if (certStatus) certStatus.textContent = '✅ 공동인증서 비밀번호 저장됨';
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

// ── Excel 업로드 ─────────────────────────────────────────────
async function uploadExcel(file) {
  const label = document.getElementById('file-label');
  label.textContent = `업로드 중: ${file.name}`;

  const form = new FormData();
  form.append('file',  file);
  form.append('year',  state.year);
  form.append('month', state.month);

  try {
    const res  = await fetch('/api/parse-excel', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      state.vendors = data.vendors;
      label.textContent = `✅ ${file.name} (${data.vendors.length}개 업체)`;

      const creditCount = data.vendors.filter(v => v.hasCredit).length;
      const errorCount  = data.vendors.filter(v => v.hasError).length;
      toast(`✅ 전체 ${data.vendors.length}개 업체 로드 (외상 ${creditCount}개)`, 'success');
      if (errorCount > 0) {
        setTimeout(() => toast(`⚠ ${errorCount}개 업체에서 오류 가능성이 발견됐습니다. 업체명 옆 [오류확인] 버튼을 확인하세요.`, 'warn'), 1000);
      }
      // 업로드한 파일에 여러 달치가 섞여 있으면 자동으로 각 달에 나눠 저장됨
      if (data.savedMonths && data.savedMonths.length > 1) {
        setTimeout(() => toast(`📅 파일에 여러 달 데이터가 있어 ${data.savedMonths.join(', ')} 각각에 자동 반영했습니다.`, 'success'), 1800);
      }
      // 부분 기간·옛 파일이라 건너뛴 달
      (data.warnings || []).forEach((w, i) => setTimeout(() => toast(`⚠ ${w}`, 'warn'), 2600 + i * 1500));

      const [mRes, fRes, profRes] = await Promise.all([
        api('GET', `/api/monthly-status?year=${state.year}`),
        api('GET', '/api/files'),
        api('GET', `/api/monthly-profit?year=${state.year}&month=${state.month}`),
      ]);
      if (mRes.ok)   state.monthlyStatus = mRes.months;
      if (fRes.ok)   state.files         = fRes.files;
      if (profRes.ok) state.monthlyProfit = profRes;
      renderAll();
    } else {
      label.textContent = '업로드 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch {
    label.textContent = '업로드 실패';
    toast('서버 연결 오류', 'error');
  }
}

async function uploadDeliveryExcel(file) {
  const label = document.getElementById('delivery-file-label');
  label.textContent = `확인 중: ${file.name}`;

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch('/api/parse-delivery-excel', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      const amt = data.totalAmt.toLocaleString();
      label.textContent = `✅ 배달 ${data.delivCount}개 업체 / ${data.txCount}건 확인`;
      toast(`✅ 배달 확인 완료 — ${data.delivCount}개 업체, ${data.txCount}건, ${amt}원 (BOS에 포함된 내역)`, 'success');
    } else {
      label.textContent = '확인 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch {
    label.textContent = '확인 실패';
    toast('서버 연결 오류', 'error');
  }
}

// ── 유틸 ─────────────────────────────────────────────────────
function calcTax(vendor) {
  let supply = 0, tax = 0;
  (vendor.txs || []).forEach(t => {
    if (t.taxType === '면세') {
      supply += t.amount;
    } else {
      const s = Math.round(t.amount / 1.1);
      supply += s;
      tax    += t.amount - s;
    }
  });
  return { supply, tax };
}

function getChecked(className) {
  return Array.from(document.querySelectorAll(`.${className}:checked`)).map(el => el.value);
}

function selectAll(className, checked) {
  document.querySelectorAll(`.${className}`).forEach(el => {
    if (!el.disabled) el.checked = checked;
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dash() { return '<span style="color:#94a3b8">-</span>'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ── 일마감 ───────────────────────────────────────────────────

function initDailyYearMonth() {
  const selYear  = document.getElementById('daily-year');
  const selMonth = document.getElementById('daily-month');
  if (!selYear || !selMonth) return;
  const now = new Date();
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    selYear.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === now.getMonth() + 1) opt.selected = true;
    selMonth.appendChild(opt);
  }
  dailyState.year  = Number(selYear.value);
  dailyState.month = Number(selMonth.value);

  selYear.addEventListener('change', () => { dailyState.year  = Number(selYear.value);  loadDailyMonth(); });
  selMonth.addEventListener('change', () => { dailyState.month = Number(selMonth.value); loadDailyMonth(); });

  // 고객판매현황 탭 — 연도 선택기 + 1~12월 탭
  const custY = document.getElementById('cust-year');
  if (custY) {
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      const o = document.createElement('option'); o.value = y; o.textContent = y;
      if (y === now.getFullYear()) o.selected = true;
      custY.appendChild(o);
    }
    custY.addEventListener('change', () => { custSalesState.month = custSalesState.month || now.getMonth()+1; renderCustMonthTabs(); loadCustomerSales(); });
  }
  // 월 탭 생성
  const custMonthTabs = document.getElementById('cust-month-tabs');
  if (custMonthTabs) {
    for (let m = 1; m <= 12; m++) {
      const btn = document.createElement('button');
      btn.textContent = m + '월';
      btn.dataset.month = m;
      btn.className = 'btn-filter' + (m === now.getMonth()+1 ? ' active' : '');
      btn.style.cssText = 'padding:3px 8px;font-size:12px;';
      btn.onclick = () => { custSalesState.month = m; renderCustMonthTabs(); loadCustomerSales(); };
      custMonthTabs.appendChild(btn);
    }
  }
  custSalesState.month = now.getMonth() + 1;

  // 고객관리 탭 연도 선택기 초기화
  const cSelYear = document.getElementById('customer-sales-year');
  if (cSelYear) {
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === now.getFullYear()) opt.selected = true;
      cSelYear.appendChild(opt);
    }
  }

  // 고객매출현황 탭 년월 선택기 초기화
  const csYear  = document.getElementById('cs-year');
  const csMonth = document.getElementById('cs-month');
  if (csYear) {
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === now.getFullYear()) opt.selected = true;
      csYear.appendChild(opt);
    }
  }
  if (csMonth) {
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === now.getMonth() + 1) opt.selected = true;
      csMonth.appendChild(opt);
    }
  }
}

function initDailyUpload() {
  document.getElementById('bos-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBos(e.target.files[0]);
  });
  document.getElementById('card-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadCard(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('nice-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadCard(e.target.files[0], null, 'nice');
    e.target.value = '';
  });
  document.getElementById('bank-expense-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBankExpenses(e.target.files[0]);
    e.target.value = '';
  });

  // 입금검증은 label onchange(uploadDepositBos/Easy 전역함수)로 처리
}

function switchToUploadedMonth(dateStr) {
  if (!dateStr) return;
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return;
  if (dailyState.year !== y || dailyState.month !== m) {
    dailyState.year  = y;
    dailyState.month = m;
    const selYear  = document.getElementById('daily-year');
    const selMonth = document.getElementById('daily-month');
    if (selYear)  selYear.value  = y;
    if (selMonth) selMonth.value = m;
  }
}

async function uploadBos(file) {
  toast('BOS 데이터 업로드 중...', '');
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/daily/upload-bos', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      const label = data.count > 1 ? `${data.count}일치` : data.date;
      toast(`✅ BOS 데이터 업로드 완료 (${label})`, 'success');
      (data.warnings || []).forEach((w, i) => setTimeout(() => toast(`⚠ ${w}`, 'warn'), 1500 + i * 1500));
      switchToUploadedMonth(data.date);
      await loadDailyMonth();
    } else {
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); console.error(e); }
  document.getElementById('bos-file-input').value = '';
}

// source: 'easyshop' = 이지샵(세차·유외), 'nice' = 나이스정보통신(유류) — 서버에 출처별로 따로 저장됨
async function uploadCard(file, labelId, source = 'easyshop') {
  const srcName  = source === 'nice' ? '나이스' : '이지샵';
  const endpoint = source === 'nice' ? '/api/daily/upload-nice' : '/api/daily/upload-card';
  toast(`${srcName} 카드내역 업로드 중...`, '');
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch(endpoint, { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      const labelText = `✅ ${data.count > 1 ? data.count+'일치' : data.date} 업로드 완료`;
      const lbl = document.getElementById(labelId || 'deposit-card-label');
      if (lbl) lbl.textContent = labelText;
      toast(`✅ ${srcName} 카드내역 업로드 완료`, 'success');
      switchToUploadedMonth(data.date);
      await loadDailyMonth();
      renderDepositVerification();
    } else {
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); console.error(e); }
}

async function uploadBank(file) {
  toast('계좌 입금내역 업로드 중...', '');
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/daily/upload-bank', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      const label = document.getElementById('bank-file-label');
      if (label) label.textContent = `✅ ${data.dateCount}일치 입금내역 로드 완료`;
      toast(`✅ 은행 입금내역 ${data.dateCount}일치 업로드 완료`, 'success');
      await loadBankDeposits();
      renderDailyTable();
      renderDepositVerification();
    } else {
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); console.error(e); }
  document.getElementById('bank-file-input').value = '';
}

async function loadBankDeposits() {
  const res = await api('GET', '/api/daily/bank-deposits');
  dailyState.bankDeposits = (res.ok && res.deposits) ? res.deposits : {};
}

function calcBankMatch(day) {
  const expected = day.card?.depositExpected;
  const deposits = dailyState.bankDeposits || {};
  if (!expected || !Object.keys(deposits).length) return null;

  const errors = [];
  for (const [depDate, cards] of Object.entries(expected)) {
    const actual = deposits[depDate] || {};
    for (const [cardCo, expAmt] of Object.entries(cards)) {
      const actAmt = actual[cardCo] || 0;
      if (expAmt !== actAmt) {
        errors.push({ depDate, cardCo, expected: expAmt, actual: actAmt, diff: actAmt - expAmt });
      }
    }
    // 실제 입금에는 있는데 예정에 없는 카드사
    for (const [cardCo, actAmt] of Object.entries(actual)) {
      if (!cards[cardCo]) {
        errors.push({ depDate, cardCo, expected: 0, actual: actAmt, diff: actAmt });
      }
    }
  }
  return { errors, hasError: errors.length > 0 };
}


// ── 입금내역 검증 렌더링 ─────────────────────────────────────
function renderDepositVerification() {
  const body   = document.getElementById('deposit-verify-body');
  const badge  = document.getElementById('deposit-summary-badge');
  if (!body) return;

  const hasBankData = Object.keys(dailyState.bankDeposits).length > 0;

  // 이지샵 depositExpected 집계 (판매일별로 어떤 카드사가 어느 날 입금예정인지)
  const depositMap = {};  // { depositDate: { cardCo: { expected, salesDays[] } } }
  for (const day of dailyState.days) {
    if (!day.card?.depositExpected) continue;
    for (const [depDate, cardAmounts] of Object.entries(day.card.depositExpected)) {
      if (!depositMap[depDate]) depositMap[depDate] = {};
      for (const [cardCo, amt] of Object.entries(cardAmounts)) {
        if (!depositMap[depDate][cardCo]) depositMap[depDate][cardCo] = { expected: 0, salesDays: [] };
        depositMap[depDate][cardCo].expected += amt;
        const md = day.date.slice(5).replace('-', '/');
        if (!depositMap[depDate][cardCo].salesDays.includes(md))
          depositMap[depDate][cardCo].salesDays.push(md);
      }
    }
  }

  if (!Object.keys(depositMap).length) {
    body.innerHTML = '<div class="empty-row" style="padding:24px;text-align:center;color:#94a3b8;">이지샵 카드내역 업로드 후 조회 가능합니다.</div>';
    if (badge) badge.textContent = '';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let totalExpected = 0, totalActual = 0, totalRows = 0, matchedRows = 0;

  // 날짜 오름차순 정렬
  const sortedDates = Object.keys(depositMap).sort();
  const rows = [];

  for (const depDate of sortedDates) {
    const cardMap  = depositMap[depDate];
    const actualDay = (dailyState.bankDeposits || {})[depDate] || {};
    const isFuture  = depDate > today;

    // 해당 입금일의 모든 카드사 (예정 + 실제 모두 포함)
    const allCos = new Set([...Object.keys(cardMap), ...Object.keys(actualDay)]);
    let isFirstOfDate = true;

    for (const cardCo of [...allCos].sort()) {
      const exp = cardMap[cardCo]?.expected || 0;
      const act = actualDay[cardCo] || 0;
      const diff = act - exp;
      const salesDays = cardMap[cardCo]?.salesDays?.join(', ') || '-';

      totalExpected += exp;
      totalActual   += act;
      totalRows++;

      let statusHtml;
      if (isFuture && act === 0) {
        statusHtml = '<span style="color:#64748b;">예정</span>';
      } else if (act === 0 && exp > 0) {
        statusHtml = '<span style="color:#dc2626;font-weight:700;">미입금</span>';
      } else if (exp === 0 && act > 0) {
        statusHtml = '<span style="color:#f59e0b;">예정 외 입금</span>';
      } else if (diff === 0) {
        statusHtml = '<span style="color:#16a34a;font-weight:700;">✅ 일치</span>';
        matchedRows++;
      } else {
        statusHtml = `<span style="color:#dc2626;font-weight:700;">⚠ ${diff > 0 ? '+' : ''}${diff.toLocaleString()}원</span>`;
      }

      rows.push(`<tr>
        <td style="white-space:nowrap;">${isFirstOfDate ? depDate : ''}</td>
        <td><strong>${esc(cardCo)}</strong></td>
        <td style="color:#64748b;font-size:12px;">${salesDays}</td>
        <td style="text-align:right;">${exp > 0 ? exp.toLocaleString() + '원' : '-'}</td>
        <td style="text-align:right;">${act > 0 ? act.toLocaleString() + '원' : (isFuture ? '-' : '<span style="color:#dc2626">미입금</span>')}</td>
        <td style="text-align:right;">${statusHtml}</td>
      </tr>`);
      isFirstOfDate = false;
    }
    // 날짜 구분선
    rows.push('<tr class="deposit-date-sep"><td colspan="6"></td></tr>');
  }

  const diffTotal = totalActual - totalExpected;
  const summaryColor = Math.abs(diffTotal) < 1 ? '#16a34a' : '#dc2626';

  if (badge) {
    if (!hasBankData) {
      badge.textContent = '계좌 입금내역 미업로드';
      badge.style.color = '#f59e0b';
    } else {
      badge.textContent = `예정 ${totalExpected.toLocaleString()}원 / 실제 ${totalActual.toLocaleString()}원`;
      badge.style.color = summaryColor;
    }
  }

  body.innerHTML = `
    ${!hasBankData ? '<div class="notice notice-warn" style="margin:0 0 12px;">계좌 입금내역을 업로드하면 실제 입금액과 비교할 수 있습니다.</div>' : ''}
    <div class="daily-table-wrap">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:8px 10px;text-align:left;white-space:nowrap;">입금예정일</th>
          <th style="padding:8px 10px;text-align:left;">카드사</th>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;">판매일</th>
          <th style="padding:8px 10px;text-align:right;">예정금액</th>
          <th style="padding:8px 10px;text-align:right;">실제입금</th>
          <th style="padding:8px 10px;text-align:right;">상태</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #e2e8f0;">
          <td colspan="3" style="padding:8px 10px;">합계</td>
          <td style="padding:8px 10px;text-align:right;">${totalExpected.toLocaleString()}원</td>
          <td style="padding:8px 10px;text-align:right;">${hasBankData ? totalActual.toLocaleString() + '원' : '-'}</td>
          <td style="padding:8px 10px;text-align:right;color:${summaryColor};">
            ${hasBankData ? (Math.abs(diffTotal) < 1 ? '✅ 전체 일치' : (diffTotal > 0 ? '+' : '') + diffTotal.toLocaleString() + '원') : '-'}
          </td>
        </tr>
      </tfoot>
    </table>
    </div>`;
}

async function loadDailyPurchasePrices() {
  const [pRes, fRes] = await Promise.all([
    api('GET', '/api/daily/purchase-prices'),
    api('GET', '/api/daily/fifo-prices'),
  ]);
  if (pRes.ok) dailyState.purchasePrices = Array.isArray(pRes.prices) ? pRes.prices : [];
  if (fRes.ok && Array.isArray(fRes.prices)) {
    dailyState.fifoDailyMap = {};
    for (const e of fRes.prices) { if (!dailyState.fifoDailyMap[e.date]) dailyState.fifoDailyMap[e.date] = e; }
  }
}

function updatePpBadge() {
  const badge = document.getElementById('pp-summary-badge');
  if (!badge) return;
  const cnt = _allLots.length;
  const months = cnt ? [...new Set(_allLots.map(l=>l.date.slice(0,7)))].length : 0;
  badge.textContent = cnt ? `${months}개월 · ${cnt}건` : '입고 이력 없음';
  badge.style.color = cnt ? '#22c55e' : '#f59e0b';
}

// 날짜 기준으로 해당 유종의 적용 단가 찾기
// 1순위: fifo_daily_prices (마감자료 기준 정확한 단가), 2순위: purchase_prices (fallback)
function getPriceForDate(date, fuel) {
  const fifoEntry = dailyState.fifoDailyMap[date];
  if (fifoEntry && fifoEntry[fuel]?.price) return fifoEntry[fuel].price;
  const list = dailyState.purchasePrices.filter(e => e.fuel === fuel && e.date <= date);
  if (!list.length) return 0;
  return list[list.length - 1].price;
}

// ── 입고 이력 ────────────────────────────────────────────────
let _allLots = [];
let _lotFilterMonth = 'all';

async function loadPurchaseLots() {
  const res = await api('GET', '/api/daily/lots');
  if (res.ok) {
    _allLots = res.lots || [];
    renderLotMonthTabs(_allLots);
    renderLotTable(_allLots, _lotFilterMonth);
    updatePpBadge();
  }
}

function renderLotMonthTabs(lots) {
  const tabs = document.getElementById('lot-month-tabs');
  if (!tabs) return;
  const months = [...new Set(lots.map(l => l.date.slice(0,7)))].sort().reverse();
  tabs.innerHTML = `<button class="lot-month-btn ${_lotFilterMonth==='all'?'active':''}" onclick="filterLotMonth('all')">전체</button>`
    + months.map(m => {
        const label = m.replace('-','년 ')+'월';
        return `<button class="lot-month-btn ${_lotFilterMonth===m?'active':''}" onclick="filterLotMonth('${m}')">${label}</button>`;
      }).join('');
}

function filterLotMonth(month) {
  _lotFilterMonth = month;
  renderLotMonthTabs(_allLots);
  renderLotTable(_allLots, month);
}

function renderLotTable(lots, filterMonth) {
  const tbody = document.getElementById('lot-tbody');
  if (!tbody) return;

  const filtered = filterMonth === 'all' ? [...lots] : lots.filter(l => l.date.startsWith(filterMonth));
  const sorted = [...filtered].sort((a,b) => b.date.localeCompare(a.date) || b.fuel.localeCompare(a.fuel));

  if (!sorted.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">입고 이력이 없습니다</td></tr>';
    return;
  }

  // 월별로 그룹핑해서 표시
  let html = '';
  let lastMonth = '';
  for (const l of sorted) {
    const ym = l.date.slice(0,7);
    if (ym !== lastMonth) {
      const [y, m] = ym.split('-');
      const totQty = sorted.filter(x => x.date.startsWith(ym)).reduce((s,x)=>s+x.qty,0);
      html += `<tr style="background:#f1f5f9;">
        <td colspan="3" style="font-weight:700;color:#334155;padding:6px 10px;">${y}년 ${+m}월</td>
        <td colspan="3" style="font-size:11px;color:#64748b;text-align:right;padding-right:10px;">총 입고 ${totQty.toLocaleString()}L</td>
      </tr>`;
      lastMonth = ym;
    }
    html += `<tr>
      <td>${l.date}</td>
      <td><span class="fuel-badge fuel-${l.fuel}">${l.fuel}</span></td>
      <td class="col-num">${l.qty.toLocaleString()}</td>
      <td class="col-num">${l.price.toLocaleString()}원</td>
      <td class="col-num" style="${l.stock!=null?'color:#0ea5e9;font-weight:600;':'color:#cbd5e1;'}">${l.stock!=null?l.stock.toLocaleString():'-'}</td>
      <td class="col-action"><button class="btn-delete" onclick="deletePurchaseLot('${l.date}','${l.fuel}',${l.price})">✕</button></td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

async function addPurchaseLot() {
  const date  = document.getElementById('lot-date').value;
  const fuel  = document.getElementById('lot-fuel').value;
  const qty   = Number(document.getElementById('lot-qty').value);
  const price = Number(document.getElementById('lot-price').value);
  const stockEl = document.getElementById('lot-stock');
  const stock = stockEl.value !== '' ? Number(stockEl.value) : undefined;

  if (!date || !fuel || !qty || !price) { toast('날짜/유종/입고량/단가를 모두 입력하세요', 'error'); return; }
  const body = { date, fuel, qty, price };
  if (stock !== undefined) body.stock = stock;

  const res = await api('POST', '/api/daily/lots', body);
  if (res.ok) {
    _allLots = res.lots || [];
    _lotFilterMonth = date.slice(0,7);
    renderLotMonthTabs(_allLots);
    renderLotTable(_allLots, _lotFilterMonth);
    updatePpBadge();
    document.getElementById('lot-qty').value = '';
    document.getElementById('lot-price').value = '';
    stockEl.value = '';
    renderDailyTable();
    toast('입고 등록 완료', 'success');
  }
}

async function uploadOrderList(file) {
  const btn  = document.getElementById('order-list-btn');
  const info = document.getElementById('order-list-info');
  btn.disabled = true; btn.textContent = '⏳ 처리 중…';
  info.textContent = `처리 중: ${file.name}`;

  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/daily/lots/upload-orders', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      _allLots = data.lots || [];
      _lotFilterMonth = 'all';
      renderLotMonthTabs(_allLots);
      renderLotTable(_allLots, _lotFilterMonth);
      updatePpBadge();
      renderDailyTable();
      info.textContent = `✅ 신규 ${data.count}건 반영` + (data.skipped ? ` · 기존 ${data.skipped}건 유지` : '');
      toast(data.count ? `주문목록 ${data.count}건 입고 반영 완료` : '신규 입고 항목 없음 (이미 반영됨)', data.count ? 'success' : '');
    } else {
      info.textContent = '❌ ' + data.error;
      toast(data.error || '업로드 실패', 'error');
    }
  } catch (e) {
    info.textContent = '❌ 서버 연결 실패';
    toast(e.message, 'error');
  }
  btn.disabled = false; btn.textContent = '📥 주문목록 업로드';
}

document.getElementById('order-list-input')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) uploadOrderList(file);
  e.target.value = '';
});

async function deletePurchaseLot(date, fuel, price) {
  if (!confirm(`${date} ${fuel} 입고를 삭제하시겠습니까?`)) return;
  const res = await api('DELETE', '/api/daily/lots', { date, fuel, price });
  if (res.ok) {
    _allLots = res.lots || [];
    renderLotMonthTabs(_allLots);
    renderLotTable(_allLots, _lotFilterMonth);
    updatePpBadge();
    renderDailyTable();
    toast('삭제 완료', 'success');
  }
}

async function loadDailyMonth() {
  const ym  = `${dailyState.year}-${String(dailyState.month).padStart(2,'0')}`;
  const res = await api('GET', `/api/daily/month/${ym}`);
  if (res.ok) {
    dailyState.days = res.days;
    renderDailyTable();
    renderDepositVerification();
  }
  // 해당 월 말일 기준으로 탱크 현황 갱신
  const lastDay = new Date(dailyState.year, dailyState.month, 0).getDate();
  const lastDate = `${dailyState.year}-${String(dailyState.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  const tankInput = document.getElementById('tank-date-input');
  if (tankInput) tankInput.value = lastDate;
  loadTankStatus(lastDate);

  await refreshOpeningStockBar();
}

// 기초재고 표시 (해당 월 1일 기준 — 당일 판매 전 잔량)
let _openingTanks = null; // 편집 입력창 프리필용 캐시
async function refreshOpeningStockBar() {
  const firstDate = `${dailyState.year}-${String(dailyState.month).padStart(2,'0')}-01`;
  const bar = document.getElementById('opening-stock-bar');
  try {
    const stockRes = await api('GET', `/api/daily/tank-status?date=${firstDate}`);
    if (stockRes.ok && stockRes.tanks && bar) {
      _openingTanks = stockRes.tanks;
      bar.style.display = '';
      document.getElementById('opening-month-label').textContent = `(${dailyState.month}/1)`;
      const fuels = [
        { fuel: '휘발유', id: 'opening-휘발유' },
        { fuel: '경유',   id: 'opening-경유' },
        { fuel: '등유',   id: 'opening-등유' },
      ];
      for (const { fuel, id } of fuels) {
        const el = document.getElementById(id);
        const t  = stockRes.tanks[fuel];
        if (el && t) {
          el.textContent = `${fuel} ${t.totalRemaining.toLocaleString()}L@${t.currentPrice?.toLocaleString()}원`;
        }
      }
    }
  } catch(e) { if (bar) bar.style.display = 'none'; }
}

function toggleOpeningStockEdit() {
  const row = document.getElementById('opening-edit-row');
  if (!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'inline-flex' : 'none';
  if (show && _openingTanks) {
    for (const fuel of ['휘발유', '경유', '등유']) {
      const input = document.getElementById(`opening-input-${fuel}`);
      const t = _openingTanks[fuel];
      if (input && t) input.value = t.totalRemaining;
    }
  }
}

async function saveOpeningStock() {
  const date = `${dailyState.year}-${String(dailyState.month).padStart(2,'0')}-01`;
  const stocks = {
    '휘발유': Number(document.getElementById('opening-input-휘발유')?.value) || 0,
    '경유':   Number(document.getElementById('opening-input-경유')?.value)   || 0,
    '등유':   Number(document.getElementById('opening-input-등유')?.value)   || 0,
  };
  if (!stocks['휘발유'] && !stocks['경유'] && !stocks['등유']) {
    toast('최소 1개 유종의 기초재고를 입력하세요', 'error'); return;
  }
  toast('기초재고 저장 중...');
  const r = await api('POST', '/api/base-stock', { date, stocks });
  if (r.ok) {
    toast(`✅ ${date} 기초재고 저장 완료`, 'success');
    toggleOpeningStockEdit();
    await refreshOpeningStockBar();
    const tankDate = document.getElementById('tank-date-input')?.value;
    if (tankDate) loadTankStatus(tankDate);
  } else {
    toast('❌ ' + r.error, 'error');
  }
}

// ── 탱크 현황 ────────────────────────────────────────────────
function selectDailyRow(tr, date) {
  document.querySelectorAll('#daily-tbody tr.row-selected').forEach(r => r.classList.remove('row-selected'));
  tr.classList.add('row-selected');
  const input = document.getElementById('tank-date-input');
  if (input) input.value = date;
  loadTankStatus(date);
  document.getElementById('tank-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function loadTankStatus(date) {
  const res = await api('GET', `/api/daily/tank-status?date=${date}`);
  if (!res.ok) return;
  renderTankStatus(res.tanks, date);
}

function renderTankStatus(tanks, date) {
  const tankInput = document.getElementById('tank-date-input');
  if (tankInput && tankInput.value !== date) tankInput.value = date;

  const COLORS = {
    '휘발유': { new: '#f97316', old: '#fed7aa', bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
    '경유':   { new: '#3b82f6', old: '#bfdbfe', bg: '#eff6ff', text: '#1e3a8a', border: '#60a5fa' },
    '등유':   { new: '#16a34a', old: '#bbf7d0', bg: '#f0fdf4', text: '#14532d', border: '#4ade80' },
  };

  const ID_MAP = { '휘발유': 'gasoline', '경유': 'diesel', '등유': 'kerosene' };

  for (const [fuel, t] of Object.entries(tanks)) {
    const el = document.getElementById(`tank-${fuel}`);
    if (!el) continue;
    const col  = COLORS[fuel];
    const cap  = t.capacity;
    const total   = Math.min(t.totalRemaining, cap);
    const oldQty  = Math.min(t.currentLotRemaining, total);  // 현재단가 전체 잔량 (아래)
    const newQty  = Math.min(t.nextLotQty || 0, total - oldQty); // 다음단가 수량 (위)
    const totalPct = cap > 0 ? (total / cap * 100) : 0;
    const fmtN = n => n >= 10000 ? (n/10000).toFixed(1)+'만L' : n >= 1000 ? (n/1000).toFixed(1)+'천L' : n+'L';

    // 원형 액체 채움: 클립패스로 원 안에 rect 채움
    const R = 68, CX = 80, CY = 80;
    const clipId = `tc-${ID_MAP[fuel] || fuel}`;
    const diameter = R * 2;           // 136
    const bottomY  = CY + R;          // 148 (원의 맨 아래)

    // 채움 높이 (픽셀)
    const totalFillH = diameter * (totalPct / 100);
    const oldFillH   = total > 0 ? totalFillH * (oldQty / total) : 0;
    const newFillH   = totalFillH - oldFillH;

    // rect의 y 좌표 (아래에서 위로 채움)
    const oldRectY = bottomY - oldFillH;          // 전재고 rect top
    const newRectY = oldRectY - newFillH;         // 신규재고 rect top
    const totalRectY = bottomY - totalFillH;      // 전체 채움 top

    // 수면선 y (흔들리는 선 효과 없이 깔끔한 직선)
    const waterLineY = totalRectY;

    el.innerHTML = `
      <div style="text-align:center;padding:10px 12px 12px;background:${col.bg};border-radius:12px;min-width:170px;">
        <div style="font-weight:700;font-size:15px;color:${col.text};margin-bottom:6px;">${fuel}</div>
        <svg width="160" height="160" viewBox="0 0 160 160" style="overflow:visible;">
          <defs>
            <clipPath id="${clipId}">
              <circle cx="${CX}" cy="${CY}" r="${R}"/>
            </clipPath>
          </defs>
          <!-- 빈 탱크 배경 -->
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="#f1f5f9"/>
          <!-- 전재고 (아래 — 현재 소비 중) -->
          ${oldFillH > 0.5 ? `<rect x="${CX-R}" y="${oldRectY}" width="${diameter}" height="${oldFillH}"
            fill="${col.old}" clip-path="url(#${clipId})"/>` : ''}
          <!-- 신규재고 (위 — 새 입고분) -->
          ${newFillH > 0.5 ? `<rect x="${CX-R}" y="${newRectY}" width="${diameter}" height="${newFillH}"
            fill="${col.new}" opacity="0.85" clip-path="url(#${clipId})"/>` : ''}
          <!-- 단색 채움 (신구재고 구분 없을 때) -->
          ${(oldFillH <= 0.5 && newFillH <= 0.5 && totalFillH > 0.5) ? `<rect x="${CX-R}" y="${totalRectY}" width="${diameter}" height="${totalFillH}"
            fill="${col.new}" opacity="0.85" clip-path="url(#${clipId})"/>` : ''}
          <!-- 경계선 (전재고↔신규재고 구분) -->
          ${oldFillH > 0.5 && newFillH > 0.5 ? `<line x1="${CX-R}" y1="${oldRectY}" x2="${CX+R}" y2="${oldRectY}"
            stroke="white" stroke-width="1.5" stroke-dasharray="4,2" clip-path="url(#${clipId})"/>` : ''}
          <!-- 원 테두리 -->
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${col.border}" stroke-width="2"/>
          <!-- 중앙 텍스트 (흰색 배경으로 가독성 확보) -->
          <text x="${CX}" y="${CY-6}" text-anchor="middle" font-size="20" font-weight="800"
            fill="${totalPct > 40 ? 'white' : col.text}" stroke="${totalPct > 40 ? col.text : 'none'}" stroke-width="0.3">
            ${Math.round(totalPct)}%
          </text>
          <text x="${CX}" y="${CY+13}" text-anchor="middle" font-size="11" font-weight="600"
            fill="${totalPct > 40 ? 'white' : col.text}">
            ${fmtN(total)}
          </text>
          <text x="${CX}" y="${CY+27}" text-anchor="middle" font-size="9"
            fill="${totalPct > 55 ? '#e2e8f0' : '#94a3b8'}">
            / ${fmtN(cap)}
          </text>
        </svg>
        <!-- 범례 -->
        <div style="font-size:11px;margin-top:6px;line-height:1.7;text-align:left;">
          ${newQty > 0 && t.nextLotPrice ? `
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="display:inline-block;width:10px;height:10px;background:${col.new};border-radius:2px;flex-shrink:0;"></span>
            <span style="color:${col.text};font-weight:600;">신규 ${t.nextLotPrice.toLocaleString()}원</span>
            <span style="color:#64748b;margin-left:auto;">${newQty.toLocaleString()}L</span>
          </div>` : ''}
          ${oldQty > 0 ? `
          <div style="display:flex;align-items:center;gap:5px;margin-top:2px;">
            <span style="display:inline-block;width:10px;height:10px;background:${col.old};border-radius:2px;flex-shrink:0;"></span>
            <span style="color:${col.text};">전재고 ${t.currentPrice?.toLocaleString() ?? ''}원</span>
            <span style="color:#64748b;margin-left:auto;">${oldQty.toLocaleString()}L</span>
          </div>` : ''}
          ${!t.nextLotPrice && total > 0 ? `
          <div style="display:flex;align-items:center;gap:5px;margin-top:2px;">
            <span style="display:inline-block;width:10px;height:10px;background:${col.new};border-radius:2px;flex-shrink:0;"></span>
            <span style="color:${col.text};font-weight:600;">${t.currentPrice?.toLocaleString() ?? ''}원</span>
            <span style="color:#64748b;margin-left:auto;">${total.toLocaleString()}L</span>
          </div>` : ''}
          ${t.stockCorrected ? `
          <div style="margin-top:4px;padding-top:4px;border-top:1px dashed #cbd5e1;font-size:10px;color:#94a3b8;text-align:center;">
            기준: ${t.stockDate}
          </div>` : ''}
        </div>
      </div>`;
  }
}

// 일별 영업이익을 구성요소별로 분해해서 반환
//   fuel  : 유종(휘발유/경유/등유) 판매이익 = 매출 − 판매량×FIFO매입단가
//   etc   : 유외상품 이익(매출−수기원가) + 세차 매출(원가 없음)
//   cardFee: 카드 수수료(차감 항목)
//   total : 영업이익 = fuel + etc − cardFee
// 화면에서 유종이익과 유외·세차이익을 따로 보여주기 위해 분해 형태로 돌려준다.
function calcDailyProfitBreakdown(day) {
  const bos = day.bos;
  if (!bos || !bos.date) return null;
  if (!dailyState.purchasePrices.length) return null;   // 매입단가 없으면 계산 불가

  let fuel = 0;
  ['휘발유', '경유', '등유'].forEach(f => {
    const fd  = bos.fuels?.[f];
    const buy = getPriceForDate(bos.date, f);
    if (fd && buy) fuel += fd.amount - (fd.qty * buy);
  });

  const etc     = (bos.carwash?.amount || 0) + (bos.others?.amount || 0) - (day.otherCost || 0);
  const cardFee = day.card?.totalFee || 0;

  // 반올림하지 않은 원값도 함께 반환 — 합계 행은 원값으로 누적한 뒤 마지막에 한 번만
  // 반올림해야 종합현황 탭의 월 영업이익과 원 단위까지 정확히 일치한다
  // (일별로 반올림해서 더하면 한 달치가 쌓여 몇 원씩 어긋남)
  return {
    fuel:    Math.round(fuel),
    etc:     Math.round(etc),
    cardFee: Math.round(cardFee),
    total:   Math.round(fuel + etc - cardFee),
    rawFuel: fuel,
    rawEtc:  etc,
    rawCardFee: cardFee,
  };
}

function calcDailyProfit(day) {
  const b = calcDailyProfitBreakdown(day);
  return b ? b.total : null;
}

// ── 일마감 표 ────────────────────────────────────────────────
// 열 정의(DAILY_COLS) 한 곳에서 머리글·행·합계를 만든다.
// 기본은 요약 열만(detail:false) 보여주고, [상세 열 보기]를 켜면 드럼·매출·매입가·카드수수료 등 전체 열.
// 행의 ▸ 를 누르면 그날 유종별 상세가 표 아래로 펼쳐진다.
const DAILY_FUELS = [
  { name: '휘발유', group: 'group-gasoline' },
  { name: '경유',   group: 'group-diesel' },
  { name: '등유',   group: 'group-kerosene' },
];

const dailyView = {
  showDetail: (() => { try { return localStorage.getItem('dailyShowDetail') === '1'; } catch (_) { return false; } })(),
  expanded: new Set(),   // 펼친 날짜
};

const dFmt = {
  drum:  v => v > 0 ? Math.floor(v / 200).toLocaleString() : '-',
  lit:   v => v > 0 ? Math.floor(v).toLocaleString() : '-',
  won:   v => v > 0 ? v.toLocaleString() : '-',
  price: (a, q) => q > 0 ? Math.round(a / q).toLocaleString() : '-',
  money: v => v != null ? `<span class="${v >= 0 ? 'profit-pos' : 'profit-neg'}">${v.toLocaleString()}</span>` : '-',
};

// group: 머리글 1행 묶음 이름(없으면 2행 합침), cls: 머리글·셀 색 클래스
const DAILY_COLS = [
  { key: 'date',   label: '날짜', cls: 'daily-col-date sticky-col' },
  { key: 'sales',  label: '판매금액', cls: 'group-summary', cellCls: 'group-summary-cell strong' },
  { key: 'drum',   label: '합계 드럼', cls: 'group-summary', cellCls: 'group-summary-cell', detail: true },
  { key: 'pfFuel', label: '유종 이익', cls: 'group-summary daily-col-profit', cellCls: 'group-summary-cell daily-col-profit',
    title: '휘발유+경유+등유 판매이익 (매출 − 판매량×FIFO매입단가)' },
  { key: 'pfEtc',  label: '유외·세차 이익', cls: 'group-summary daily-col-profit', cellCls: 'group-summary-cell daily-col-profit',
    title: '세차 매출 + (유외상품 매출 − 수기 원가)' },
  { key: 'pf',     label: '영업이익', cls: 'group-summary daily-col-profit', cellCls: 'group-summary-cell daily-col-profit strong',
    title: '영업이익 = 유종이익 + 유외·세차이익 − 카드수수료' },
  ...DAILY_FUELS.flatMap(f => [
    { key: `${f.name}L`,  group: f.name, gcls: f.group, label: 'L' },
    { key: `${f.name}D`,  group: f.name, gcls: f.group, label: '드럼', detail: true },
    { key: `${f.name}A`,  group: f.name, gcls: f.group, label: '매출', detail: true },
    { key: `${f.name}P`,  group: f.name, gcls: f.group, label: '판매가' },
    { key: `${f.name}B`,  group: f.name, gcls: f.group, label: '매입가', detail: true },
  ]),
  { key: 'otA',    group: '유외상품', gcls: 'group-other', label: '매출' },
  { key: 'otC',    group: '유외상품', gcls: 'group-other', label: '원가(수기)', detail: true },
  { key: 'cwA',    group: '세차', gcls: 'group-carwash', label: '매출' },
  { key: 'fee',    group: '카드(이지샵+나이스)', gcls: 'group-card', label: '수수료', detail: true },
  { key: 'depDate', group: '카드(이지샵+나이스)', gcls: 'group-card', label: '입금예정일', detail: true },
  { key: 'match',  label: '카드대사', cls: 'group-match', cellCls: 'center' },
];

function dailyVisibleCols() {
  return DAILY_COLS.filter(c => dailyView.showDetail || !c.detail);
}

function toggleDailyDetail(on) {
  dailyView.showDetail = on;
  try { localStorage.setItem('dailyShowDetail', on ? '1' : '0'); } catch (_) {}
  renderDailyTable();
}

function toggleDailyExpand(ev, date) {
  ev.stopPropagation();   // 행 클릭(탱크현황 날짜 선택)과 분리
  if (dailyView.expanded.has(date)) dailyView.expanded.delete(date); else dailyView.expanded.add(date);
  renderDailyTable();
}

function renderDailyHead(cols) {
  const thead = document.getElementById('daily-thead');
  if (!thead) return;
  const top = [], sub = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.group) {
      top.push(`<th rowspan="2" class="${c.cls || ''}"${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`);
      continue;
    }
    let n = 1;
    while (cols[i + n]?.group === c.group) n++;
    top.push(`<th colspan="${n}" class="${c.gcls}">${esc(c.group)}</th>`);
    for (let k = 0; k < n; k++) sub.push(`<th class="${cols[i + k].gcls}">${esc(cols[i + k].label)}</th>`);
    i += n - 1;
  }
  thead.innerHTML = `<tr>${top.join('')}</tr><tr>${sub.join('')}</tr>`;
  // 머리글 2행 고정 위치 = 1행 실제 높이 (글자 크기에 따라 달라짐)
  const h = thead.rows[1]?.offsetTop;
  if (h) document.getElementById('daily-table').style.setProperty('--daily-head-row1', `${h}px`);
}

// 그날 유종별 상세 (행 펼침)
function dailyExpandRow(day, v, span) {
  const fuelRows = DAILY_FUELS.map(f => {
    const L = v[`${f.name}Lraw`], A = v[`${f.name}Araw`];
    return `<tr><th class="${f.group}">${f.name}</th><td>${dFmt.lit(L)}</td><td>${dFmt.drum(L)}</td><td>${dFmt.won(A)}</td>
      <td>${dFmt.price(A, L)}</td><td>${v[`${f.name}B`]}</td></tr>`;
  }).join('');
  return `<tr class="daily-expand-row"><td colspan="${span}">
    <div class="daily-expand">
      <table class="daily-expand-table">
        <thead><tr><th></th><th>L</th><th>드럼</th><th>매출</th><th>판매가</th><th>매입가</th></tr></thead>
        <tbody>${fuelRows}</tbody>
      </table>
      <div class="daily-expand-side">
        <div><span class="muted">유외상품 매출</span> ${dFmt.won(v.otAraw)}원</div>
        <div><span class="muted">유외상품 원가(수기)</span>
          <input class="input-other-cost" type="number" value="${day.otherCost || ''}" placeholder="0"
                 onclick="event.stopPropagation()" onchange="saveOtherCost('${day.date}', this.value)"></div>
        <div><span class="muted">세차 매출</span> ${dFmt.won(v.cwAraw)}원</div>
        <div><span class="muted">카드 수수료</span> ${v.feeRaw > 0 ? v.feeRaw.toLocaleString() + '원' : '-'}
             <span class="muted">· 입금예정일</span> ${esc(day.card?.depositDate || '-')}</div>
      </div>
    </div>
  </td></tr>`;
}

function renderDailyTable() {
  const tbody = document.getElementById('daily-tbody');
  if (!tbody) return;
  const cols = dailyVisibleCols();
  renderDailyHead(cols);
  const toggle = document.getElementById('daily-detail-toggle');
  if (toggle) toggle.checked = dailyView.showDetail;

  if (!dailyState.days.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">BOS 데이터를 업로드하면 현황이 표시됩니다</td></tr>`;
    updateDailySummary(null);
    return;
  }

  let totals = { 휘발유L: 0, 경유L: 0, 등유L: 0, 휘발유A: 0, 경유A: 0, 등유A: 0, otherA: 0, carwashA: 0,
                 profit: 0, cardFee: 0, profitFuel: 0, profitEtc: 0 };

  const cell = (c, html) => `<td class="${c.cellCls || c.gcls || ''}${c.cls?.includes('sticky-col') ? ' sticky-col' : ''}">${html}</td>`;

  const rows = dailyState.days.map(day => {
    const bos  = day.bos;
    const card = day.card;
    const date = day.date || '';

    const q = f => bos?.fuels?.[f]?.qty    || 0;
    const a = f => bos?.fuels?.[f]?.amount || 0;
    const otA = bos?.others?.amount  || 0;  // 유외상품
    const cwA = bos?.carwash?.amount || 0;  // 세차
    const otC = day.otherCost || 0;
    const cardFee = card?.totalFee || 0;
    const brk     = calcDailyProfitBreakdown(day);
    const profit  = brk ? brk.total : null;

    DAILY_FUELS.forEach(f => { totals[`${f.name}L`] += q(f.name); totals[`${f.name}A`] += a(f.name); });
    totals.otherA   += otA;
    totals.carwashA += cwA;
    totals.cardFee  += cardFee;
    // 합계는 원값(raw)으로 누적 → 표시할 때 한 번만 반올림 (종합현황 월 영업이익과 정확히 일치)
    totals.profit     += brk?.rawFuel != null ? (brk.rawFuel + brk.rawEtc - brk.rawCardFee) : 0;
    totals.profitFuel += brk?.rawFuel ?? 0;
    totals.profitEtc  += brk?.rawEtc  ?? 0;

    const m      = day.matching;
    const bm     = calcBankMatch(day);
    const hasBankData = Object.keys(dailyState.bankDeposits).length > 0 && day.card?.depositExpected;

    // 카드대사 배지 — 조정 후 남은 차이 계산
    let cardBadge = '';
    if (m) {
      if (m.totalMatch) {
        cardBadge = `<span class="badge-match-ok">✅</span>`;
      } else {
        const adjs = day.cardAdjustments || [];
        const adjTotal = adjs.reduce((s, x) => s + (x.amount || 0), 0);
        const remaining = Math.abs(m.totalDiff) - adjTotal;
        if (remaining <= 0 && adjs.length > 0) {
          cardBadge = `<button class="btn-match-adj" onclick="event.stopPropagation();showMatchingModal('${date}')">✅ 조정</button>`;
        } else {
          const diffStr = m.totalDiff ? ` ${Math.abs(m.totalDiff).toLocaleString()}원` : '';
          cardBadge = `<button class="btn-match-err" onclick="event.stopPropagation();showMatchingModal('${date}')">⚠${diffStr}</button>`;
        }
      }
    }
    const bankBadge = !hasBankData ? '' :
      (!bm || !bm.hasError)
        ? `<span class="badge-match-ok" title="카드사 입금 일치">🏦✅</span>`
        : `<button class="btn-match-err" onclick="event.stopPropagation();showMatchingModal('${date}')">🏦 ⚠ ${bm.errors.length}건</button>`;

    const totalL = q('휘발유') + q('경유') + q('등유');
    const totalSales = a('휘발유') + a('경유') + a('등유') + otA + cwA;
    const open = dailyView.expanded.has(date);

    const v = {
      date: `<button class="daily-expand-btn" onclick="toggleDailyExpand(event, '${date}')" title="유종별 상세">${open ? '▾' : '▸'}</button> ${date.slice(5)}`,
      sales:  totalSales > 0 ? totalSales.toLocaleString() : '-',
      drum:   dFmt.drum(totalL),
      pfFuel: brk ? dFmt.money(brk.fuel) : '-',   // 유종(휘발유·경유·등유) 이익만
      pfEtc:  brk ? dFmt.money(brk.etc)  : '-',   // 유외상품 + 세차 이익
      pf:     profit != null ? dFmt.money(profit) : '-',
      otA: dFmt.won(otA), otAraw: otA,
      otC: `<input class="input-other-cost" type="number" value="${otC || ''}" placeholder="0"
             onclick="event.stopPropagation()" onchange="saveOtherCost('${date}', this.value)">`,
      cwA: dFmt.won(cwA), cwAraw: cwA,
      fee: cardFee > 0 ? cardFee.toLocaleString() : '-', feeRaw: cardFee,
      depDate: esc(card?.depositDate || '-'),
      match: `${cardBadge}${bankBadge ? ' ' + bankBadge : ''}`,
    };
    DAILY_FUELS.forEach(f => {
      const L = q(f.name), A = a(f.name), bp = getPriceForDate(date, f.name);
      Object.assign(v, {
        [`${f.name}L`]: dFmt.lit(L), [`${f.name}D`]: dFmt.drum(L), [`${f.name}A`]: dFmt.won(A),
        [`${f.name}P`]: dFmt.price(A, L), [`${f.name}B`]: bp ? bp.toLocaleString() : '-',
        [`${f.name}Lraw`]: L, [`${f.name}Araw`]: A,
      });
    });

    const tr = `<tr data-date="${date}" class="${open ? 'row-open' : ''}" onclick="selectDailyRow(this, '${date}')">
      ${cols.map(c => cell(c, v[c.key])).join('')}
    </tr>`;
    return open ? tr + dailyExpandRow(day, v, cols.length) : tr;
  });

  const hasPriceData = dailyState.purchasePrices.length > 0;
  // 원값 누적분을 여기서 한 번만 반올림
  totals.profit     = Math.round(totals.profit);
  totals.profitFuel = Math.round(totals.profitFuel);
  totals.profitEtc  = Math.round(totals.profitEtc);
  const totalAllL     = totals.휘발유L + totals.경유L + totals.등유L;
  const totalAllSales = totals.휘발유A + totals.경유A + totals.등유A + totals.otherA + totals.carwashA;

  const t = {
    date: '합계', sales: totalAllSales.toLocaleString(), drum: Math.floor(totalAllL / 200).toLocaleString(),
    pfFuel: hasPriceData ? dFmt.money(totals.profitFuel) : '-',
    pfEtc:  hasPriceData ? dFmt.money(totals.profitEtc)  : '-',
    pf:     hasPriceData ? dFmt.money(totals.profit) : '단가 미입력',
    otA: totals.otherA.toLocaleString(), otC: '-', cwA: totals.carwashA.toLocaleString(),
    fee: totals.cardFee.toLocaleString(), depDate: '-', match: '-',
  };
  DAILY_FUELS.forEach(f => {
    const L = totals[`${f.name}L`], A = totals[`${f.name}A`];
    Object.assign(t, { [`${f.name}L`]: Math.floor(L).toLocaleString(), [`${f.name}D`]: Math.floor(L / 200).toLocaleString(),
      [`${f.name}A`]: A.toLocaleString(), [`${f.name}P`]: dFmt.price(A, L), [`${f.name}B`]: '-' });
  });
  const totalRow = `<tr class="total-row">${cols.map(c => cell(c, t[c.key])).join('')}</tr>`;

  tbody.innerHTML = rows.join('') + totalRow;
  updateDailySummary(totals);
}

function updateDailySummary(totals) {
  const el = document.getElementById('daily-summary-label');
  if (!el) return;
  if (!totals) { el.textContent = ''; return; }
  const totalSales = totals.휘발유A + totals.경유A + totals.등유A + totals.otherA + totals.carwashA;
  el.textContent = `총매출 ${totalSales.toLocaleString()}원 | 영업이익 ${totals.profit.toLocaleString()}원`;
}

async function saveOtherCost(date, value) {
  const cost = Number(value) || 0;
  const idx  = dailyState.days.findIndex(d => d.date === date);
  if (idx !== -1) dailyState.days[idx].otherCost = cost;
  await api('POST', `/api/daily/${date}/other-cost`, { cost });
  renderDailyTable();
}

// ── 카드 대사 모달 ───────────────────────────────────────────
function buildMatchingModal(date) {
  const day = dailyState.days.find(d => d.date === date);
  if (!day) return '';
  const m    = day.matching;
  const adjs = day.cardAdjustments || [];
  const adjTotal   = adjs.reduce((s, a) => s + (a.amount || 0), 0);
  const remaining  = m ? Math.abs(m.totalDiff) - adjTotal : 0;
  const isResolved = m && !m.totalMatch && remaining <= 0 && adjs.length > 0;

  // ── 카드 대사 섹션 (BOS ↔ 이지샵) ───────────────────────────
  let cardMatchSection = '';
  if (!m) {
    cardMatchSection = '<p style="color:#94a3b8; font-size:12px; margin-top:8px;">BOS 또는 카드(이지샵/나이스) 데이터가 없어 카드 대사를 수행할 수 없습니다.</p>';
  } else {
    const summaryClass = m.totalMatch ? 'match-summary-ok' : 'match-summary-err';
    const summaryIcon  = m.totalMatch ? '✅' : '⚠';
    const totalDiffStr = m.totalDiff !== 0
      ? `<span class="price-diff">&nbsp;(차액 ${Math.abs(m.totalDiff).toLocaleString()}원)</span>` : '';

    // 출처(이지샵/나이스) 구분이 저장된 날짜만 출처 칸 표시 — 예전 업로드 데이터는 출처 정보 없음
    const hasSource = m.bySource && Object.keys(m.bySource).length > 0;
    const sourceTag = src => src
      ? `<span style="border-radius:4px;padding:1px 6px;font-size:11px;${src === '나이스' ? 'background:#e0e7ff;color:#4338ca;' : 'background:#ccfbf1;color:#0f766e;'}">${esc(src)}</span>`
      : '-';
    // 재확인 결과 — 세차·유외상품도 나이스로 결제될 수 있어 상품과 무관하게 이지샵·나이스 둘 다 + 앞뒤 날짜까지 확인
    const md = d => d ? d.slice(5).replace('-', '/') : '';
    const recheckCell = e => {
      const r = e.recheck;
      if (!r) return '-';
      const c = r.crossDay;
      if (e.type === 'bos_only') {
        if (c && c.inBos) return `<span style="color:#b45309;">BOS 중복입력 의심 — ${md(c.date)} ${esc(c.source)}에 결제, BOS ${md(c.date)}에도 입력됨</span>`;
        if (c) return `<span style="color:#0369a1;">날짜 차이 — 카드는 ${md(c.date)} ${esc(c.source)}</span>`;
        const checked = (r.checkedSources || []).join('·') || '카드';
        const miss = (r.notUploaded || []).length ? ` <span style="color:#b45309;">(${r.notUploaded.join('·')} 자료 미업로드)</span>` : '';
        return `<span style="color:#dc2626;font-weight:600;">${esc(checked)} 모두 없음</span>${miss}`;
      }
      if (e.type === 'easy_only') {
        if (c) return `<span style="color:#0369a1;">날짜 차이 — BOS ${md(c.date)}에 입력됨${c.inCard ? ' (그날 카드에도 있음)' : ''}</span>`;
        return '<span style="color:#dc2626;font-weight:600;">BOS 앞뒤 3일에도 없음</span>';
      }
      return '-';
    };
    const typeOrder = ['bos_only', 'easy_only', 'amount_mismatch'];
    let errSections = '';
    typeOrder.forEach(type => {
      const list = m.errors.filter(e => e.type === type);
      if (!list.length) return;
      errSections += `<p class="error-section-title" style="margin-top:16px;">${
        type === 'bos_only' ? '① BOS에만 있는 거래' :
        type === 'easy_only' ? '② 카드(VAN)에만 있는 거래' : '③ 금액 불일치'
      }</p>
      <table class="error-table">
        <thead><tr>
          <th>승인번호</th>${hasSource && type !== 'bos_only' ? '<th>출처</th>' : ''}<th>카드사</th><th>카드번호</th><th>유종</th>
          ${type === 'easy_only' ? '<th>결제시간</th>' : ''}
          ${type === 'amount_mismatch'
            ? '<th>BOS 금액</th><th>카드 금액</th><th>차액</th>'
            : `<th>${type === 'bos_only' ? 'BOS' : '카드'} 금액</th>`}
          ${type !== 'amount_mismatch' ? '<th>재확인 결과</th>' : ''}
        </tr></thead>
        <tbody>${list.map(e => `<tr>
          <td><code>${esc(e.approvalNo)}</code></td>
          ${hasSource && type !== 'bos_only' ? `<td>${sourceTag(e.source)}</td>` : ''}
          <td>${esc(e.cardCompany)}</td>
          <td><code>${esc(e.cardNo)}</code></td>
          <td>${esc(e.product || e.fuel || '')}</td>
          ${type === 'easy_only' ? `<td style="color:#64748b;font-size:12px;">${esc(e.transTime || '-')}</td>` : ''}
          ${type === 'amount_mismatch'
            ? `<td>${e.bosAmount.toLocaleString()}원</td>
               <td>${e.easyAmount.toLocaleString()}원</td>
               <td class="price-diff">${e.diff > 0 ? '+' : ''}${e.diff.toLocaleString()}원</td>`
            : `<td>${(e.bosAmount ?? e.easyAmount).toLocaleString()}원</td>`}
          ${type !== 'amount_mismatch' ? `<td style="font-size:12px;">${recheckCell(e)}</td>` : ''}
        </tr>`).join('')}</tbody>
      </table>`;
    });

    // 승인번호가 한 자리만 다르고 금액이 같은 쌍 → 같은 거래로 보고 정상 처리 (BOS 승인번호 입력 오타)
    const notes = m.notes || [];
    if (notes.length) {
      errSections += `<p class="error-section-title" style="margin-top:16px;color:#64748b;">ℹ 승인번호 상이 — 금액 일치로 정상 처리 (BOS 승인번호 확인 권장)</p>
      <table class="error-table">
        <thead><tr><th>BOS 승인번호</th><th>카드 승인번호</th><th>출처</th><th>카드사</th><th>상품</th><th>금액</th></tr></thead>
        <tbody>${notes.map(n => `<tr>
          <td><code>${esc(n.approvalNo)}</code></td>
          <td><code>${esc(n.cardApprovalNo)}</code></td>
          <td>${sourceTag(n.source)}</td>
          <td>${esc(n.cardCompany)}</td>
          <td>${esc(n.product || '')}</td>
          <td>${n.amount.toLocaleString()}원</td>
        </tr>`).join('')}</tbody>
      </table>`;
    }

    // ── 카드사별 차이 요약 테이블 ──────────────────────────────
    const byCo = {};
    for (const e of m.errors) {
      const co = e.cardCompany || '기타';
      if (!byCo[co]) byCo[co] = { easyOnly: 0, bosOnly: 0, mismatch: 0 };
      if (e.type === 'easy_only')       byCo[co].easyOnly  += e.easyAmount || 0;
      else if (e.type === 'bos_only')   byCo[co].bosOnly   += e.bosAmount  || 0;
      else if (e.type === 'amount_mismatch') {
        const d = (e.easyAmount || 0) - (e.bosAmount || 0);
        byCo[co].mismatch += d;
      }
    }
    let coRows = '';
    for (const [co, v] of Object.entries(byCo)) {
      const diff = v.easyOnly - v.bosOnly + v.mismatch;
      coRows += `<tr>
        <td><strong>${esc(co)}</strong></td>
        <td style="text-align:right;">${v.easyOnly > 0 ? v.easyOnly.toLocaleString()+'원' : '-'}</td>
        <td style="text-align:right;">${v.bosOnly > 0  ? v.bosOnly.toLocaleString()+'원'  : '-'}</td>
        <td style="text-align:right;" class="price-diff">${diff > 0 ? '+' : ''}${diff.toLocaleString()}원</td>
      </tr>`;
    }

    const coTable = Object.keys(byCo).length ? `
      <p class="error-section-title" style="margin-top:12px;">카드사별 차이 요약</p>
      <table class="error-table" style="margin-bottom:4px;">
        <thead><tr><th>카드사</th><th>카드만</th><th>BOS만</th><th>차액</th></tr></thead>
        <tbody>${coRows}</tbody>
      </table>` : '';

    if (!m.errors.length) {
      errSections = errSections + '<p style="color:#15803d; font-weight:600; margin-top:12px;">✅ 모든 카드 거래가 정상 매칭됩니다.</p>';
    }

    // ── 차이 조정 섹션 ──────────────────────────────────────
    const adjList = adjs.map((a, i) => `<tr>
      <td>${esc(a.cardCompany || '-')}</td>
      <td>${esc(a.reason)}</td>
      <td style="text-align:right;">${a.amount.toLocaleString()}원</td>
      <td style="color:#64748b;font-size:11px;">${a.createdAt}</td>
      <td><button class="btn-sm btn-danger" onclick="deleteCardAdj('${date}',${i})">삭제</button></td>
    </tr>`).join('');

    const remainingColor = remaining <= 0 ? '#16a34a' : '#dc2626';
    const adjSection = !m.totalMatch ? `
      <div style="margin-top:18px;padding:12px;background:#fefce8;border:1px solid #fde047;border-radius:6px;">
        <p style="font-weight:700;margin:0 0 8px;color:#854d0e;">📝 차이 사유 등록</p>
        <p style="font-size:12px;margin:0 0 10px;color:#92400e;">
          총 차이: <strong>${Math.abs(m.totalDiff).toLocaleString()}원</strong>
          | 조정된 금액: <strong>${adjTotal.toLocaleString()}원</strong>
          | 남은 차이: <strong style="color:${remainingColor};">${remaining.toLocaleString()}원</strong>
          ${remaining <= 0 && adjs.length > 0 ? '<span style="color:#16a34a;margin-left:8px;">✅ 처리 완료</span>' : ''}
        </p>
        ${adjs.length ? `<table class="error-table" style="margin-bottom:10px;">
          <thead><tr><th>카드사</th><th>사유</th><th style="text-align:right;">금액</th><th>등록일</th><th></th></tr></thead>
          <tbody>${adjList}</tbody>
        </table>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:#64748b;">카드사</label>
            <select id="adj-card-co" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
              <option value="">선택</option>
              ${[...new Set(m.errors.map(e=>e.cardCompany).filter(Boolean))].map(co=>`<option>${esc(co)}</option>`).join('')}
              <option value="기타">기타</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px;">
            <label style="font-size:11px;color:#64748b;">사유 <span style="color:#dc2626;">*</span></label>
            <input id="adj-reason" type="text" placeholder="예) 카드단말기 결제 (연료 무관)" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:#64748b;">금액 <span style="color:#dc2626;">*</span></label>
            <input id="adj-amount" type="number" placeholder="금액" style="width:110px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
          </div>
          <button class="btn-primary" style="height:28px;font-size:12px;" onclick="addCardAdj('${date}')">등록</button>
        </div>
      </div>` : '';

    cardMatchSection = `
      <div class="${summaryClass}">
        ${summaryIcon} BOS <strong>${m.bosTotal.toLocaleString()}원</strong>
        &nbsp;/&nbsp; ${hasSource
          ? Object.entries(m.bySource).map(([src, amt]) => `${esc(src)} ${amt.toLocaleString()}원`).join(' + ') + ` = 카드 <strong>${m.easyTotal.toLocaleString()}원</strong>`
          : `카드 <strong>${m.easyTotal.toLocaleString()}원</strong>`}
        ${totalDiffStr}
        ${isResolved ? '&nbsp;<span style="color:#16a34a;font-size:12px;">✅ 사유 처리됨</span>' : ''}
      </div>
      ${coTable}
      <details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:#64748b;">상세 거래 오류 보기</summary>${errSections}</details>
      ${adjSection}`;
  }

  return `
    <div class="modal-overlay" id="matching-modal" onclick="if(event.target===this)closeMatchingModal()">
      <div class="modal-box" style="width:720px;">
        <div class="modal-head">📋 대사 현황 — <span>${date}</span></div>
        <div class="modal-body">
          <p class="error-section-title">💳 카드 대사 (BOS ↔ 이지샵+나이스)</p>
          ${cardMatchSection}
        </div>
        <div class="modal-foot">
          <button class="btn-primary" onclick="closeMatchingModal()">닫기</button>
        </div>
      </div>
    </div>`;
}

function showMatchingModal(date) {
  const html = buildMatchingModal(date);
  if (html) document.body.insertAdjacentHTML('beforeend', html);
}

function closeMatchingModal() {
  document.getElementById('matching-modal')?.remove();
}

async function addCardAdj(date) {
  const reason    = document.getElementById('adj-reason')?.value?.trim();
  const amount    = Number(document.getElementById('adj-amount')?.value);
  const cardCo    = document.getElementById('adj-card-co')?.value;
  if (!reason) return toast('사유를 입력하세요.', 'warn');
  if (!amount) return toast('금액을 입력하세요.', 'warn');
  const res = await api('POST', `/api/daily/${date}/card-adjustments`, { reason, amount, cardCompany: cardCo });
  if (res.ok) {
    const idx = dailyState.days.findIndex(d => d.date === date);
    if (idx >= 0) dailyState.days[idx].cardAdjustments = res.adjustments;
    closeMatchingModal();
    showMatchingModal(date);
    renderDailyTable();
    toast('✅ 조정 내역 등록 완료', 'success');
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

async function deleteCardAdj(date, idx) {
  const res = await api('DELETE', `/api/daily/${date}/card-adjustments/${idx}`);
  if (res.ok) {
    const di = dailyState.days.findIndex(d => d.date === date);
    if (di >= 0) dailyState.days[di].cardAdjustments = res.adjustments;
    closeMatchingModal();
    showMatchingModal(date);
    renderDailyTable();
  }
}

// ── 오류 상세 모달 ───────────────────────────────────────────
function showErrorModal(name) {
  const vendor = state.vendors.find(v => v.name === name);
  if (!vendor || !vendor.errors?.length) return;

  const priceErrors = vendor.errors.filter(e => e.type === 'price');
  const dupErrors   = vendor.errors.filter(e => e.type === 'duplicate');

  let body = '';

  if (priceErrors.length) {
    body += `<p class="error-section-title">1. 일일단가 불일치</p>
    <table class="error-table">
      <thead><tr><th>날짜</th><th>유종</th><th>입력된 단가</th></tr></thead>
      <tbody>${priceErrors.map(e => `
        <tr>
          <td>${esc(e.date)}</td>
          <td>${esc(e.product)}</td>
          <td>${e.prices.map(p => `<span class="price-diff">${p.toLocaleString()}원</span>`).join(' / ')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  if (dupErrors.length) {
    body += `<p class="error-section-title" style="margin-top:18px;">2. 중복주유 의심</p>
    <table class="error-table">
      <thead><tr><th>날짜</th><th>차량번호</th><th>유종</th><th>주유량</th><th>건수</th></tr></thead>
      <tbody>${dupErrors.map(e => `
        <tr>
          <td>${esc(e.date)}</td>
          <td>${esc(e.vehicle)}</td>
          <td>${esc(e.product)}</td>
          <td>${Number(e.qty).toLocaleString()}L</td>
          <td class="dup-count">${e.count}건 중복</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  const html = `
    <div class="modal-overlay" id="error-modal" onclick="if(event.target===this)closeErrorModal()">
      <div class="modal-box" style="width:620px;">
        <div class="modal-head">⚠ 오류 상세 <span>${esc(name)}</span></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button class="btn-primary" onclick="closeErrorModal()">닫기</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeErrorModal() {
  document.getElementById('error-modal')?.remove();
}

async function api(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  } catch {
    return { ok: false, error: '서버 연결 오류' };
  }
}

// ════════════════════════════════════════════════════════════
// 종합 탭 — 월별 판매/매입/지출/순이익 대시보드
// ════════════════════════════════════════════════════════════

const summaryState = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,
};

function initSummaryYearMonth() {
  const selYear  = document.getElementById('summary-year');
  const selMonth = document.getElementById('summary-month');
  if (!selYear || !selMonth) return;
  const now = new Date();
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    selYear.appendChild(opt);
  }
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m + '월';
    if (m === now.getMonth() + 1) opt.selected = true;
    selMonth.appendChild(opt);
  }
  summaryState.year  = now.getFullYear();
  summaryState.month = now.getMonth() + 1;
  selYear.addEventListener('change',  () => { summaryState.year  = +selYear.value;  loadSummary(); });
  selMonth.addEventListener('change', () => { summaryState.month = +selMonth.value; loadSummary(); });
  // expense 파일 업로드
  document.getElementById('expense-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadExpenses(e.target.files[0]);
    e.target.value = '';
  });

  // 연간 보고서 연도 selector 초기화
  const rptYr = document.getElementById('report-year');
  if (rptYr && !rptYr.options.length) {
    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y + '년';
      if (y === now.getFullYear()) o.selected = true;
      rptYr.appendChild(o);
    }
  }
}

// ── 고객판매현황 ──────────────────────────────────────────────
let custSalesState = { filter: '전체', data: [], avgBuy: {}, sortKey: 'totalAmount', sortDir: 'desc', month: 0 };

function setCustFilter(payType, btn) {
  custSalesState.filter = payType;
  document.querySelectorAll('.btn-filter').forEach(b => b.classList.toggle('active', b.dataset.pay === payType));
  renderCustomerSales(custSalesState.data, custSalesState.avgBuy);
}

function sortCustBy(key) {
  if (custSalesState.sortKey === key) {
    custSalesState.sortDir = custSalesState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    custSalesState.sortKey = key;
    custSalesState.sortDir = 'desc';
  }
  renderCustomerSales(custSalesState.data, custSalesState.avgBuy);
}

function calcCustProfit(c, avgBuy) {
  let profit = 0;
  for (const [fuel, fd] of Object.entries(c.fuels || {})) {
    const buy = avgBuy[fuel] || 0;
    if (buy && fd.qty > 0) profit += fd.amount - fd.qty * buy;
  }
  return Math.round(profit);
}

function sortCustomers(list, avgBuy) {
  const key = custSalesState.sortKey;
  const dir = custSalesState.sortDir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'name')    return dir * a.name.localeCompare(b.name);
    if (key === 'payType') return dir * a.payType.localeCompare(b.payType);
    if (key === 'totalAmount') return dir * ((a.totalAmount||0) - (b.totalAmount||0));
    if (key === 'totalQty')    return dir * ((a.totalQty||0) - (b.totalQty||0));
    if (key === 'totalProfit') return dir * (calcCustProfit(a,avgBuy) - calcCustProfit(b,avgBuy));
    // 유종별: '경유_qty', '경유_profit', '경유_price' 형식
    const [fuel, field] = key.split('_');
    const af = a.fuels?.[fuel] || {};
    const bf = b.fuels?.[fuel] || {};
    if (field === 'qty')    return dir * ((af.qty||0) - (bf.qty||0));
    if (field === 'price')  return dir * ((af.avgPrice||0) - (bf.avgPrice||0));
    if (field === 'profit') {
      const buy = avgBuy[fuel] || 0;
      const ap = buy ? Math.round((af.amount||0) - (af.qty||0)*buy) : 0;
      const bp = buy ? Math.round((bf.amount||0) - (bf.qty||0)*buy) : 0;
      return dir * (ap - bp);
    }
    return 0;
  });
}

function renderCustMonthTabs() {
  document.querySelectorAll('#cust-month-tabs .btn-filter').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.month) === custSalesState.month);
  });
}

async function loadCustomerSales() {
  const y = document.getElementById('cust-year')?.value;
  const m = custSalesState.month || (new Date().getMonth() + 1);
  if (!y) return;
  const ym = `${y}-${String(m).padStart(2,'0')}`;
  const body = document.getElementById('cust-sales-body');
  if (body) body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">불러오는 중...</div>';

  const [custRes, sumRes] = await Promise.all([
    api('GET', `/api/daily/customer-sales?month=${ym}`),
    api('GET', `/api/summary/${ym}`),
  ]);

  const avgBuy = sumRes.ok ? (sumRes.avgBuyPriceByFuel || {}) : {};
  custSalesState.data   = custRes.ok ? custRes.customers : [];
  custSalesState.avgBuy = avgBuy;
  custSalesState.ym     = ym;
  custSalesState.marginMeta = null;
  if (custSalesState.marginView) await loadCustMarginMeta();
  renderCustomerSales(custSalesState.data, avgBuy);
}

// ── 거래처 마진 분석 ─────────────────────────────────────────
// 거래처×유종별로 L당 마진을 계산: 판매단가 − 월평균 매입원가(FIFO) − 카드수수료(카드결제만)
// 오일뱅크 지원금(입고량 기준)은 모든 판매 L에 공통으로 붙으므로 "지원금 포함 기여" 칸에 따로 표시
const MARGIN_FUELS = ['휘발유', '경유', '등유'];
const GENERAL_CUSTOMER = '현금고객';   // 이름 없는 일반 고객 묶음 → 일반가(게시가) 기준

async function toggleCustMarginView() {
  custSalesState.marginView = !custSalesState.marginView;
  const btn = document.getElementById('cust-margin-btn');
  if (btn) btn.textContent = custSalesState.marginView ? '📋 판매현황 보기' : '📊 마진 분석';
  if (custSalesState.marginView && !custSalesState.marginMeta) await loadCustMarginMeta();
  renderCustomerSales(custSalesState.data, custSalesState.avgBuy);
}

async function loadCustMarginMeta() {
  if (!custSalesState.ym) return;
  const [meta, sup] = await Promise.all([
    api('GET', `/api/customer-margin-meta?month=${custSalesState.ym}`),
    api('GET', `/api/summary/${custSalesState.ym}`),
  ]);
  custSalesState.marginMeta = meta.ok ? meta : { cardFeeRate: 0, ar: {} };
  // 오일뱅크 지원금 L당 환산 = 월 지원금 ÷ 월 유류 판매량
  const q = sup.ok ? MARGIN_FUELS.reduce((s, f) => s + (sup.qty?.[f] || 0), 0) : 0;
  custSalesState.marginMeta.supportPerL = q > 0 ? (sup.oilbankSupport || 0) / q : 0;
}

function setCustMarginFloor(v) {
  custSalesState.marginFloor = Number(v) || 0;
  renderCustomerSales(custSalesState.data, custSalesState.avgBuy);
}

function sortCustMarginBy(key) {
  if (custSalesState.marginSort === key) custSalesState.marginDir = custSalesState.marginDir === 'asc' ? 'desc' : 'asc';
  else { custSalesState.marginSort = key; custSalesState.marginDir = key === 'netL' ? 'asc' : 'desc'; }
  renderCustomerSales(custSalesState.data, custSalesState.avgBuy);
}

function buildCustMarginRows(customers, avgBuy, meta) {
  // 일반가: 현금고객(이름 없는 일반 고객) 평균 판매단가
  const general = {};
  MARGIN_FUELS.forEach(f => {
    let q = 0, a = 0;
    customers.filter(c => c.name === GENERAL_CUSTOMER).forEach(c => { q += c.fuels?.[f]?.qty || 0; a += c.fuels?.[f]?.amount || 0; });
    general[f] = q > 0 ? a / q : null;
  });
  const rows = [];
  for (const c of customers) {
    for (const f of MARGIN_FUELS) {
      const fd = c.fuels?.[f];
      if (!fd || !(fd.qty > 0) || !avgBuy[f]) continue;
      const price  = fd.amount / fd.qty;
      const grossL = price - avgBuy[f];
      const feeL   = c.payType === '신용카드' ? price * (meta.cardFeeRate || 0) : 0;
      const netL   = grossL - feeL;
      rows.push({
        name: c.name, payType: c.payType, fuel: f, qty: fd.qty, price,
        discL: general[f] != null && c.name !== GENERAL_CUSTOMER ? general[f] - price : null,
        cost: avgBuy[f], grossL, feeL, netL,
        contribL: netL + (meta.supportPerL || 0),
        netTotal: netL * fd.qty,
        ar: meta.ar?.[c.name] || null,
      });
    }
  }
  return { rows, general };
}

function renderCustMargin(customers, avgBuy) {
  const body = document.getElementById('cust-sales-body');
  const meta = custSalesState.marginMeta;
  if (!meta) { body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">불러오는 중...</div>'; return; }
  if (!Object.values(avgBuy || {}).some(Boolean)) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">해당 월 매입단가 정보가 없어 마진을 계산할 수 없습니다.</div>';
    return;
  }
  const floor  = custSalesState.marginFloor ?? 50;
  const filter = custSalesState.filter;
  const { rows: allRows, general } = buildCustMarginRows(customers, avgBuy, meta);
  let rows = filter === '전체' ? allRows : allRows.filter(r => r.payType === filter);
  if (!rows.length) { body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">해당 월/업체구분 데이터 없음</div>'; return; }

  const key = custSalesState.marginSort || 'netL';
  const dir = (custSalesState.marginDir || 'asc') === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => key === 'name' ? dir * a.name.localeCompare(b.name) : dir * ((a[key] ?? -1e9) - (b[key] ?? -1e9)));

  // 구간 요약 (카드수수료 차감 후 L당 마진 기준, 판매량 비중)
  const totQ = rows.reduce((s, r) => s + r.qty, 0);
  const bands = [[-Infinity, 0, '손해'], [0, 30, '0~30원'], [30, 60, '30~60원'], [60, 90, '60~90원'], [90, Infinity, '90원 이상']];
  const bandHtml = bands.map(([lo, hi, label]) => {
    const list = rows.filter(r => r.netL >= lo && r.netL < hi);
    const q = list.reduce((s, r) => s + r.qty, 0);
    if (!list.length) return '';
    const warn = hi <= floor;
    return `<span style="display:inline-block;margin:2px 4px;padding:4px 10px;border-radius:12px;font-size:12px;${warn ? 'background:#fee2e2;color:#b91c1c;' : 'background:#f1f5f9;color:#334155;'}">
      ${label} · ${Math.round(q).toLocaleString()}L (${(q / totQ * 100).toFixed(1)}%) · ${list.length}건</span>`;
  }).join('');
  const below = rows.filter(r => r.netL < floor);
  // 기준 미달 거래처를 기준선까지 올렸을 때 월 개선액 (판매량 유지 가정)
  const upside = below.reduce((s, r) => s + (floor - r.netL) * r.qty, 0);

  const rateTxt = meta.cardFeeRate ? `${(meta.cardFeeRate * 100).toFixed(2)}%${meta.cardFeeRateSource === 'all' ? ' (해당 월 수수료 데이터 없음 → 전체 기간 평균)' : ''}` : '데이터 없음';
  const won  = v => v == null ? '-' : Math.round(v).toLocaleString();
  const sgn  = v => v == null ? '-' : (v > 0 ? '+' : '') + Math.round(v).toLocaleString();
  const arrow = k => key === k ? (dir === 1 ? ' ▲' : ' ▼') : '';
  const th = (label, k, align = 'right', title = '') =>
    `<th onclick="${k ? `sortCustMarginBy('${k}')` : ''}" title="${title}" style="padding:8px 8px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;white-space:nowrap;font-size:12px;text-align:${align};${k ? 'cursor:pointer;' : ''}">${label}${k ? arrow(k) : ''}</th>`;

  const trs = rows.map(r => {
    const bad = r.netL < floor;
    const netColor = r.netL < 0 ? '#b91c1c' : bad ? '#dc2626' : '#16a34a';
    const ar = r.payType === '외상' && r.ar ? r.ar : null;
    const lateTxt = ar && ar.avgLag != null
      ? `<span style="${ar.avgLag >= 2 ? 'color:#dc2626;font-weight:600;' : 'color:#64748b;'}">평균 ${ar.avgLag}개월</span>${ar.overdue > 0 ? `<br><span style="font-size:11px;color:#b45309;">미수 ${won(ar.overdue)}원</span>` : ''}`
      : '-';
    return `<tr style="border-bottom:1px solid #f1f5f9;${bad ? 'background:#fef2f2;' : ''}">
      <td style="padding:6px 8px;font-weight:600;white-space:nowrap;">${esc(r.name)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;">${r.payType === '신용카드' ? '카드' : esc(r.payType)}</td>
      <td style="padding:6px 8px;text-align:center;font-size:12px;">${r.fuel}</td>
      <td style="padding:6px 8px;text-align:right;">${Math.floor(r.qty).toLocaleString()}</td>
      <td style="padding:6px 8px;text-align:right;">${won(r.price)}</td>
      <td style="padding:6px 8px;text-align:right;color:#7c3aed;">${r.discL == null ? '-' : sgn(r.discL)}</td>
      <td style="padding:6px 8px;text-align:right;color:#64748b;">${won(r.cost)}</td>
      <td style="padding:6px 8px;text-align:right;">${won(r.grossL)}</td>
      <td style="padding:6px 8px;text-align:right;color:#64748b;">${r.feeL ? '-' + won(r.feeL) : '-'}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:${netColor};">${won(r.netL)}</td>
      <td style="padding:6px 8px;text-align:right;color:#0f766e;">${won(r.contribL)}</td>
      <td style="padding:6px 8px;text-align:right;">${won(r.netTotal)}</td>
      <td style="padding:6px 8px;text-align:right;font-size:12px;white-space:nowrap;">${lateTxt}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="padding:10px 14px;font-size:12px;color:#475569;line-height:1.8;">
      <div>
        <strong>최저마진 기준</strong>
        <input type="number" value="${floor}" onchange="setCustMarginFloor(this.value)" style="width:60px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:4px;">원/L
        (카드수수료 차감 후) · 카드수수료율 ${rateTxt}
        · 오일뱅크 지원금 L당 ${meta.supportPerL ? Math.round(meta.supportPerL) + '원' : '없음'}
        · 일반가(현금고객) ${MARGIN_FUELS.filter(f => general[f]).map(f => `${f} ${won(general[f])}원`).join(' / ') || '-'}
      </div>
      <div>${bandHtml}</div>
      <div style="color:#b91c1c;">기준 미달 <strong>${below.length}건</strong> · 기준선까지 올리면 월 약 <strong>${won(upside)}원</strong> 개선 (판매량 유지 가정)</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        ${th('업체명', 'name', 'left')}${th('구분', '', 'center')}${th('유종', '', 'center')}
        ${th('판매량(L)', 'qty')}${th('평균단가', 'price')}
        ${th('일반가 대비 할인', 'discL', 'right', '현금고객 평균단가 − 이 거래처 평균단가')}
        ${th('매입원가', '')}${th('총마진/L', 'grossL')}${th('카드수수료/L', '')}
        ${th('순마진/L', 'netL', 'right', '판매단가 − 매입원가 − 카드수수료')}
        ${th('지원금 포함 기여/L', 'contribL', 'right', '순마진 + 오일뱅크 지원금(L당). 이 거래처가 빠지면 사라지는 L당 이익')}
        ${th('월 순마진(원)', 'netTotal')}${th('결제지연(외상)', '')}
      </tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

function renderCustomerSales(customers, avgBuy) {
  const body = document.getElementById('cust-sales-body');
  if (!body) return;
  if (custSalesState.marginView) return renderCustMargin(customers, avgBuy);

  const filter = custSalesState.filter;
  let filtered = filter === '전체' ? customers
    : customers.filter(c => c.payType === filter);

  if (!filtered.length) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">해당 월/업체구분 데이터 없음<br><small>BOS 상세거래내역을 업로드하거나 전체 재분석을 실행하세요.</small></div>';
    return;
  }

  // 정렬
  filtered = sortCustomers(filtered, avgBuy);

  const sk = custSalesState.sortKey;
  const sd = custSalesState.sortDir;
  const arrow = (key) => sk === key ? (sd === 'desc' ? ' ▼' : ' ▲') : '';
  const th = (label, key, align='right') =>
    `<th class="cust-th" onclick="sortCustBy('${key}')" style="padding:8px 10px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;white-space:nowrap;font-size:12px;text-align:${align};cursor:pointer;">${label}${arrow(key)}</th>`;

  let totQty = 0, totAmt = 0, totProfit = 0;

  const rows = filtered.map((c, idx) => {
    const custProfit = calcCustProfit(c, avgBuy);
    const totalQty   = c.totalQty || 0;
    const avgSell    = totalQty > 0 ? Math.round(c.totalAmount / totalQty) : null;
    totQty    += totalQty;
    totAmt    += c.totalAmount;
    totProfit += custProfit;

    const pfColor = custProfit >= 0 ? '#16a34a' : '#dc2626';
    const pfPct   = c.totalAmount > 0 ? (custProfit/c.totalAmount*100).toFixed(1) : '-';
    const badge   = c.payType === '외상'
      ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;font-weight:600;">외상</span>'
      : c.payType === '신용카드'
      ? '<span style="background:#fce7f3;color:#9d174d;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;font-weight:600;">카드</span>'
      : '<span style="background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;font-weight:600;">현금</span>';

    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="text-align:center;color:#94a3b8;font-size:11px;padding:7px 6px;">${idx+1}</td>
      <td style="font-weight:600;white-space:nowrap;padding:7px 10px;font-size:13px;">${c.name}</td>
      <td style="text-align:center;padding:7px 8px;">${badge}</td>
      <td style="text-align:right;padding:7px 10px;">${totalQty > 0 ? Math.floor(totalQty).toLocaleString()+'L' : '-'}</td>
      <td style="text-align:right;padding:7px 10px;">${avgSell ? avgSell.toLocaleString()+'원' : '-'}</td>
      <td style="text-align:right;padding:7px 10px;font-weight:600;">${Math.round(c.totalAmount).toLocaleString()}원</td>
      <td style="text-align:right;padding:7px 10px;font-weight:700;color:${pfColor};">${Math.round(custProfit).toLocaleString()}원</td>
      <td style="text-align:right;padding:7px 10px;font-size:12px;color:${pfColor};">${pfPct}%</td>
    </tr>`;
  });

  const totPfColor = totProfit >= 0 ? '#16a34a' : '#dc2626';
  const totPct = totAmt > 0 ? (totProfit/totAmt*100).toFixed(1) : '-';
  const totAvgSell = totQty > 0 ? Math.round(totAmt/totQty) : null;

  body.innerHTML = `
    <div style="font-size:12px;color:#64748b;padding:6px 14px 3px;">${filtered.length}개 업체</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr>
          <th style="padding:8px 6px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:11px;text-align:center;">#</th>
          ${th('업체명','name','left')}
          ${th('구분','payType','center')}
          ${th('판매량(L)','totalQty')}
          ${th('평균판매가','totalAmount')}
          ${th('매출액','totalAmount')}
          ${th('영업이익','totalProfit')}
          ${th('이익률','totalProfit')}
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot>
        <tr style="background:#f1f5f9;border-top:2px solid #94a3b8;font-weight:700;">
          <td colspan="3" style="padding:8px 10px;">합계</td>
          <td style="text-align:right;padding:8px 10px;">${totQty > 0 ? Math.floor(totQty).toLocaleString()+'L' : '-'}</td>
          <td style="text-align:right;padding:8px 10px;">${totAvgSell ? totAvgSell.toLocaleString()+'원' : '-'}</td>
          <td style="text-align:right;padding:8px 10px;">${Math.round(totAmt).toLocaleString()}원</td>
          <td style="text-align:right;padding:8px 10px;color:${totPfColor};">${Math.round(totProfit).toLocaleString()}원</td>
          <td style="text-align:right;padding:8px 10px;font-size:12px;color:${totPfColor};">${totPct}%</td>
        </tr>
      </tfoot>
    </table>`;
}

async function rebuildCustomerSales() {
  const btn = document.getElementById('rebuild-cust-btn');
  if (btn) btn.textContent = '재분석 중...';
  const res = await api('POST', '/api/daily/rebuild-customer-sales');
  if (btn) btn.textContent = '🔄 전체 재분석';
  if (res.ok) {
    toast(`✅ 재분석 완료 (${res.months?.join(', ')})`, 'success');
    loadCustomerSales();
  } else {
    toast('재분석 실패', 'error');
  }
}

async function loadSummary() {
  const ym = `${summaryState.year}-${String(summaryState.month).padStart(2,'0')}`;
  loadConsistency(ym);
  const res = await api('GET', `/api/summary/${ym}`);
  if (res.ok) renderSummary(res);
  loadStockVariance();
}

// ── 탱크현황 Excel 내보내기 ──────────────────────────────────────
function exportTankStatus() {
  const dateEl = document.getElementById('tank-date-input');
  const to = dateEl?.value || new Date().toISOString().slice(0, 10);
  const from = '2026-06-01';
  const url = `/api/export-tank-status?from=${from}&to=${to}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast(`📥 탱크현황 Excel 다운로드 중... (${from} ~ ${to})`);
}

// ── 입금검증 ─────────────────────────────────────────────────────

async function uploadDepositBos(input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  toast('BOS 시재현황 업로드 중...');
  try {
    const r = await fetch('/api/deposit/upload-bos', { method:'POST', body:fd });
    const d = await r.json();
    if (d.ok) {
      const lbl = document.getElementById('deposit-bos-label');
      if (lbl) lbl.textContent = `✓ ${d.count}건 (${d.from}~${d.to})`;
      toast(`✅ BOS 시재현황 ${d.count}건 업로드 완료`, 'success');
      loadDepositMatch();
    } else toast('❌ ' + d.error, 'error');
  } catch(e) { toast('❌ 오류: ' + e.message, 'error'); }
  input.value = '';
}

async function uploadDepositEasy(input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  toast('이지샵 입금내역 업로드 중...');
  try {
    const r = await fetch('/api/deposit/upload-easy', { method:'POST', body:fd });
    const d = await r.json();
    if (d.ok) {
      const lbl = document.getElementById('deposit-easy-label');
      if (lbl) lbl.textContent = `✓ 누적 ${d.total}건`;
      toast(`✅ 이지샵 입금내역 ${d.count}건 추가 (총 ${d.total}건)`, 'success');
      loadDepositMatch();
    } else toast('❌ ' + d.error, 'error');
  } catch(e) { toast('❌ 오류: ' + e.message, 'error'); }
  input.value = '';
}

async function loadDepositMatch() {
  const params = new URLSearchParams();
  if (_depositFilter.month) params.set('month', _depositFilter.month);
  if (_depositFilter.card)  params.set('card',  _depositFilter.card);
  try {
    const r = await fetch('/api/deposit/match?' + params);
    const d = await r.json();
    if (!d.ok) return;
    _depositRows = d.rows || [];
    renderDepositSummary(d.summary);
    renderDepositFilterBtns(d.allMonths || [], d.cards || []);
    renderDepositTable(_depositRows);
  } catch(e) { console.error('[loadDepositMatch]', e); }
}

// ── 입금검증 필터 상태 ─────────────────────────────────────────
let _depositFilter = { month: '', card: '' };

function setDepositMonth(month) {
  _depositFilter.month = _depositFilter.month === month ? '' : month;
  loadDepositMatch();
}
function setDepositCard(card) {
  _depositFilter.card = _depositFilter.card === card ? '' : card;
  loadDepositMatch();
}

function renderDepositFilterBtns(months, cards) {
  // 월별 버튼
  const mEl = document.getElementById('deposit-month-btns');
  if (mEl) {
    // 데이터에서 월 목록 자동 추출
    const availMonths = [...new Set(_depositRows.map(r=>(r.입금일||r.bosFrom||'').slice(0,7)).filter(Boolean))].sort();
    const allMonths = months.length ? months : availMonths;
    const btnStyle = (active) => `padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;` +
      (active ? 'background:#1e293b;color:#f8fafc;border-color:#1e293b;' : 'background:white;color:#475569;border-color:#cbd5e1;');
    mEl.innerHTML =
      `<button style="${btnStyle(!_depositFilter.month)}" onclick="setDepositMonth('')">전체</button>` +
      allMonths.map(m => {
        const label = m.slice(5).replace(/^0/, '') + '월';
        return `<button style="${btnStyle(_depositFilter.month===m)}" onclick="setDepositMonth('${m}')">${label}</button>`;
      }).join('');
  }
  // 카드사 버튼
  const cEl = document.getElementById('deposit-card-btns');
  if (cEl) {
    const allCards = cards.length ? cards : [...new Set(_depositRows.map(r=>r.card).filter(Boolean))].sort();
    const btnStyle = (active) => `padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;white-space:nowrap;` +
      (active ? 'background:#0369a1;color:white;border-color:#0369a1;' : 'background:white;color:#475569;border-color:#cbd5e1;');
    cEl.innerHTML =
      `<button style="${btnStyle(!_depositFilter.card)}" onclick="setDepositCard('')">전체</button>` +
      allCards.map(c => `<button style="${btnStyle(_depositFilter.card===c)}" onclick="setDepositCard('${c}')">${c}</button>`).join('');
  }
}

function renderDepositSummary(s) {
  const el = document.getElementById('deposit-summary');
  if (!el || !s) return;
  const chip = (label, val, color) =>
    `<div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;text-align:center;">
      <div style="font-size:11px;color:#64748b;">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${color};">${val ?? 0}</div>
    </div>`;
  el.innerHTML =
    chip('전체',       s.total,    '#1e293b') +
    chip('매칭완료',   s.match,    '#16a34a') +
    chip('미매칭',     s.mismatch, '#dc2626') +
    chip('이지샵만',   s.ez_only,  '#7c3aed') +
    chip('BOS만',     s.bos_only, '#0369a1') +
    (s.pending ? chip('미입금예정', s.pending, '#94a3b8') : '');
}

// ── 입금검증 정렬 상태 ────────────────────────────────────────
let _depositRows = [];
let _depositSort = { col: '입금일', asc: true };

function sortDepositBy(col) {
  if (_depositSort.col === col) _depositSort.asc = !_depositSort.asc;
  else { _depositSort.col = col; _depositSort.asc = true; }
  renderDepositTable(_depositRows);
}

function renderDepositTable(rows) {
  const el = document.getElementById('deposit-result');
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">데이터 없음 — 파일을 업로드해 주세요</div>';
    return;
  }
  const fmt  = v => v != null ? Math.round(v).toLocaleString() : '-';
  const STATUS = {
    match:    { bg:'#f0fdf4', text:'✅ 매칭',     color:'#16a34a' },
    mismatch: { bg:'#fef2f2', text:'❌ 불일치',   color:'#dc2626' },
    ez_only:  { bg:'#faf5ff', text:'🟣 입금만',  color:'#7c3aed' },
    bos_only: { bg:'#eff6ff', text:'🔵 발생만',  color:'#0369a1' },
    pending:  { bg:'#f8fafc', text:'⏳ 미입금예정', color:'#94a3b8' },
  };

  // 정렬
  const { col, asc } = _depositSort;
  const getVal = r => {
    if (col === '입금일')   return r.입금일   || r.bosFrom || '';
    if (col === '발생일')   return r.bosFrom  || '';
    if (col === '카드사')   return r.card     || '';
    if (col === '발생금액') return r.발생금액 ?? (asc ? Infinity : -Infinity);
    if (col === '접수금액') return r.접수금액 ?? (asc ? Infinity : -Infinity);
    if (col === '수수료')   return r.수수료   ?? (asc ? Infinity : -Infinity);
    if (col === '입금예정액') return r.입금예정액 ?? (asc ? Infinity : -Infinity);
    if (col === '금액차이') return r.금액차이 ?? (asc ? Infinity : -Infinity);
    return '';
  };
  const sorted = [...rows].sort((a, b) => {
    const va = getVal(a), vb = getVal(b);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return asc ? cmp : -cmp;
  });

  const thStyle = `padding:8px 10px;white-space:nowrap;cursor:pointer;user-select:none;`;
  const arrow = c => _depositSort.col === c ? (_depositSort.asc ? ' ▲' : ' ▼') : ' ⇅';

  let html = `<table style="font-size:13px;border-collapse:collapse;min-width:950px;width:100%;">
    <thead style="position:sticky;top:0;z-index:1;background:#1e293b;color:#f8fafc;">
      <tr>
        <th style="${thStyle}text-align:center;" onclick="sortDepositBy('상태')">상태${arrow('상태')}</th>
        <th style="${thStyle}text-align:left;"   onclick="sortDepositBy('카드사')">카드사${arrow('카드사')}</th>
        <th style="${thStyle}text-align:center;" onclick="sortDepositBy('발생일')">발생일(BOS)${arrow('발생일')}</th>
        <th style="${thStyle}text-align:right;"  onclick="sortDepositBy('발생금액')">발생금액${arrow('발생금액')}</th>
        <th style="${thStyle}text-align:center;background:#1e3a5f;" onclick="sortDepositBy('입금일')">실입금일${arrow('입금일')}</th>
        <th style="${thStyle}text-align:right;background:#1e3a5f;"  onclick="sortDepositBy('접수금액')">접수금액(이지샵)${arrow('접수금액')}</th>
        <th style="${thStyle}text-align:right;"  onclick="sortDepositBy('수수료')">수수료${arrow('수수료')}</th>
        <th style="${thStyle}text-align:right;"  onclick="sortDepositBy('입금예정액')">입금예정액${arrow('입금예정액')}</th>
        <th style="${thStyle}text-align:right;"  onclick="sortDepositBy('금액차이')">금액차이${arrow('금액차이')}</th>
      </tr>
    </thead><tbody>`;

  let prevMonth = '';
  for (const r of sorted) {
    const st = STATUS[r.status] || { bg:'', text:'-', color:'#64748b' };
    // 월 구분선
    const rowMonth = (r.입금일||r.bosFrom||'').slice(0, 7);
    if (rowMonth && rowMonth !== prevMonth) {
      html += `<tr style="background:#e2e8f0;">
        <td colspan="9" style="padding:4px 12px;font-size:11px;font-weight:700;color:#475569;">${rowMonth}</td>
      </tr>`;
      prevMonth = rowMonth;
    }
    // 발생일: 범위이면 MM/DD~MM/DD, 단일이면 YYYY-MM-DD 전체
    let 발생일표시 = '-';
    if (r.발생일) {
      if (r.발생일.includes('~')) {
        const [f, t] = r.발생일.split('~');
        발생일표시 = `${f.slice(5).replace('-','/')}~${t.slice(5).replace('-','/')}`;
      } else {
        발생일표시 = r.발생일;
      }
    }
    const 입금일표시 = r.입금일 || '-';
    const diff = r.금액차이 != null
      ? `<span style="color:${Math.abs(r.금액차이)>10000?'#dc2626':Math.abs(r.금액차이)>0?'#d97706':'#16a34a'};font-weight:600;">${r.금액차이>0?'+':''}${fmt(r.금액차이)}</span>`
      : '-';
    html += `<tr style="background:${st.bg};border-bottom:1px solid #f1f5f9;">
      <td style="padding:5px 8px;text-align:center;font-weight:600;color:${st.color};font-size:11px;white-space:nowrap;">${st.text}</td>
      <td style="padding:5px 8px;font-weight:600;color:#1e293b;white-space:nowrap;">${r.card}</td>
      <td style="padding:5px 8px;text-align:center;color:#475569;font-family:monospace;white-space:nowrap;">${발생일표시}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:600;">${fmt(r.발생금액)}</td>
      <td style="padding:5px 8px;text-align:center;color:#0369a1;font-weight:700;font-family:monospace;white-space:nowrap;">${입금일표시}</td>
      <td style="padding:5px 8px;text-align:right;color:#0369a1;font-weight:600;">${fmt(r.접수금액)}</td>
      <td style="padding:5px 8px;text-align:right;color:#64748b;">${fmt(r.수수료)}</td>
      <td style="padding:5px 8px;text-align:right;color:#0f766e;font-weight:600;">${fmt(r.입금예정액)}</td>
      <td style="padding:5px 8px;text-align:right;">${diff}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function resetDepositData() {
  if (!confirm('업로드된 입금검증 데이터를 모두 초기화하시겠습니까?')) return;
  await fetch('/api/deposit/reset', { method:'DELETE' });
  const bLbl = document.getElementById('deposit-bos-label');
  const eLbl = document.getElementById('deposit-easy-label');
  if (bLbl) bLbl.textContent = '';
  if (eLbl) eLbl.textContent = '';
  const sum = document.getElementById('deposit-summary');
  if (sum) sum.innerHTML = '';
  const res = document.getElementById('deposit-result');
  if (res) res.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">초기화 완료</div>';
  toast('입금검증 데이터 초기화 완료');
}

// ── BOS PostgreSQL 연결 테스트 ──────────────────────────────────
async function testBosDb() {
  const btn = document.getElementById('btn-test-bos-db');
  if (btn) { btn.disabled = true; btn.textContent = '접속 시도 중...'; }
  try {
    toast('BOS DB 접속 조합을 시도 중입니다 (최대 30초)...');
    const r = await fetch('/api/test-bos-db', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      const tbl = d.tables.join(', ') || '(없음)';
      toast(`✅ DB 접속 성공! user=${d.user} db=${d.database}\n테이블: ${tbl}`, 'success');
      console.log('[BOS DB 접속 성공]', d);
      alert(`✅ BOS DB 접속 성공!\n\n접속 정보:\n  user: ${d.user}\n  password: ${d.password}\n  database: ${d.database}\n\n테이블 목록:\n  ${d.tables.join('\n  ')}\n\n이 정보를 개발자에게 전달하면 DB 동기화 기능을 완성할 수 있습니다.`);
    } else {
      toast('❌ ' + d.error, 'error');
    }
  } catch (err) {
    toast('❌ 테스트 오류: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔌 DB 연결 테스트'; }
  }
}

// ── 바탕화면 탱크 파일 자동 동기화 ──────────────────────────────
async function syncTankActuals() {
  const btn = document.getElementById('btn-sync-tank');
  if (btn) { btn.disabled = true; btn.textContent = '동기화 중...'; }
  try {
    const r = await fetch('/api/sync-tank-actuals', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      toast(`✅ 탱크 실재고 반영 완료 — ${d.count}일치 (${d.from} ~ ${d.to})`);
      loadStockVariance();
    } else {
      toast('❌ ' + d.error, 'error');
    }
  } catch (err) {
    toast('❌ 동기화 오류: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 바탕화면 파일 자동 반영'; }
  }
}

// ── 탱크 실재고 업로드 ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const tankInput = document.getElementById('tank-actual-input');
  if (tankInput) {
    tankInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        toast('탱크 실재고 업로드 중...');
        const r = await fetch('/api/upload-tank-actuals', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.ok) {
          toast(`탱크 실재고 ${d.count}일치 업로드 완료 (${d.from} ~ ${d.to})`);
          loadStockVariance();
        } else {
          toast('업로드 실패: ' + d.error, 'error');
        }
      } catch (err) { toast('업로드 오류: ' + err.message, 'error'); }
      e.target.value = '';
    });
  }
});

// ── 재고 오차 조회 및 렌더링 ─────────────────────────────────
async function loadStockVariance() {
  const body = document.getElementById('stock-variance-body');
  if (!body) return;
  try {
    const r = await api('GET', '/api/tank-variance');
    if (!r.ok || !r.rows || !r.rows.length) {
      body.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;">탱크 실재고 데이터 없음 — 파일을 업로드해 주세요</div>';
      return;
    }
    renderStockVariance(r.rows, r.monthTotal, r.byMonth);
  } catch (e) {
    body.innerHTML = '<div style="padding:12px;text-align:center;color:#ef4444;font-size:13px;">오차 데이터 로드 오류: ' + e.message + '</div>';
  }
}

function renderStockVariance(rows, totalAll, byMonth) {
  const body = document.getElementById('stock-variance-body');
  if (!rows || !rows.length) {
    body.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;">탱크 실재고 데이터 없음 — 파일을 업로드해 주세요</div>';
    return;
  }

  const fmt  = v => v != null ? Math.round(v).toLocaleString() : '-';
  const fmtL = v => v != null ? (Math.round(v * 10) / 10).toLocaleString() : '-';
  // 표시용: 이익(+) = 초록, 손실(-) = 빨강
  const gainStyle = v => v > 0 ? 'color:#16a34a;font-weight:600;' : (v < 0 ? 'color:#dc2626;font-weight:600;' : 'color:#64748b;');
  const gainBg    = v => v > 0 ? '#f0fdf4' : (v < 0 ? '#fff1f2' : '');
  const fmtGain   = v => { const r = Math.round(v); return (r > 0 ? '+' : '') + r.toLocaleString(); };
  const fmtGainL  = v => { const r = Math.round(v * 10) / 10; return (r > 0 ? '+' : '') + r.toLocaleString(); };
  const FUELS = ['경유', '휘발유', '등유'];

  // 역순 표시 (최신→과거)
  const revRows = [...rows].reverse();
  const from = rows[0]?.date || '';
  const to   = rows[rows.length - 1]?.date || '';

  let html = `<div style="padding:8px 16px 4px;font-size:12px;color:#64748b;">📅 기간: ${from} ~ ${to} · ${rows.length}일 · BOS있는날만 집계</div>`;
  html += '<div style="overflow-x:auto;max-height:520px;overflow-y:auto;">';
  html += '<table style="font-size:13px;min-width:900px;border-collapse:collapse;">';

  // 헤더
  html += '<thead style="position:sticky;top:0;z-index:1;">';
  html += '<tr style="background:#1e293b;color:#f8fafc;">';
  html += '<th rowspan="2" style="padding:8px 10px;text-align:center;border-right:1px solid #334155;">날짜</th>';
  html += '<th rowspan="2" style="padding:8px 10px;text-align:center;border-right:2px solid #475569;white-space:nowrap;background:#1e3a5f;min-width:90px;">일별 손익</th>';
  for (const f of FUELS) {
    html += `<th colspan="7" style="padding:6px 8px;text-align:center;border-right:1px solid #334155;border-bottom:1px solid #334155;">${f}</th>`;
  }
  html += '</tr><tr style="background:#334155;color:#cbd5e1;font-size:11px;">';
  for (let i = 0; i < 3; i++) {
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;">전일ATG</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;">당일ATG</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;">당일입고</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;background:#1e3a5f;">재고차(L)</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;background:#1e3a5f;">BOS판매</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;background:#0f172a;">오차(L)</th>';
    html += '<th style="padding:5px 6px;text-align:right;white-space:nowrap;border-right:1px solid #334155;background:#0f172a;">금액(원)</th>';
  }
  html += '</tr></thead><tbody>';

  let currentMonth = '';
  for (const row of revRows) {
    const rowMonth = row.date.substr(0, 7);
    // 월 소계 구분선
    if (rowMonth !== currentMonth) {
      currentMonth = rowMonth;
      const [y, m] = rowMonth.split('-');
      const mSub = byMonth?.[rowMonth] || {};
      const mTot = mSub.total || 0;
      html += `<tr style="background:#dbeafe;">`;
      html += `<td style="padding:6px 10px;font-weight:700;font-size:12px;color:#1d4ed8;" colspan="23">`;
      html += `▸ ${y}년 ${parseInt(m)}월 소계&nbsp;&nbsp;`;
      html += `경유: <span style="${gainStyle(-(mSub.경유||0))}">${fmtGain(-(mSub.경유||0))}원</span>&nbsp;&nbsp;`;
      html += `휘발유: <span style="${gainStyle(-(mSub.휘발유||0))}">${fmtGain(-(mSub.휘발유||0))}원</span>&nbsp;&nbsp;`;
      html += `등유: <span style="${gainStyle(-(mSub.등유||0))}">${fmtGain(-(mSub.등유||0))}원</span>&nbsp;&nbsp;`;
      html += `합계: <span style="${gainStyle(-mTot)};font-size:13px;">${fmtGain(-mTot)}원</span>`;
      html += '</td></tr>';
    }

    const noBos = !row.hasBos;
    const rowBg = noBos ? 'background:#fef3c7;' : (revRows.indexOf(row) % 2 === 0 ? '' : 'background:#f8fafc;');
    // 일별 합계: 3개 유종 금액 합산 (표시값 = -(amount))
    const dayTotal = FUELS.reduce((s, f) => s - (row.fuels[f]?.amount || 0), 0);
    html += `<tr style="${rowBg}border-bottom:1px solid #f1f5f9;">`;
    html += `<td style="padding:5px 8px;white-space:nowrap;color:${noBos?'#92400e':'#475569'};font-size:11px;">`;
    html += `${row.date}${noBos ? ' <span style="font-size:10px;color:#d97706;">⚠BOS없음</span>' : ''}</td>`;
    html += `<td style="padding:5px 10px;text-align:right;font-weight:700;font-size:12px;border-right:2px solid #e2e8f0;${gainStyle(dayTotal)}background:${gainBg(dayTotal)}">`;
    html += `${fmtGain(dayTotal)}원</td>`;

    for (const f of FUELS) {
      const fd = row.fuels[f] || {};
      // 이익/손실 = BOS판매 - 재고차 = -(오차) → 양수=이익(초록), 음수=손실(빨강)
      const dispV = -(fd.variance || 0);
      const dispA = -(fd.amount   || 0);
      const vs  = gainStyle(dispV);
      const bg  = gainBg(dispV);
      html += `<td style="padding:5px 6px;text-align:right;color:#64748b;">${fmt(fd.atgPrev)}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;color:#64748b;">${fmt(fd.atgCurr)}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;color:#0369a1;">${fd.receipts > 0 ? '+'+fmt(fd.receipts) : '-'}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;color:#1e40af;background:#eff6ff;">${fmtL(fd.tankDiff)}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;color:#475569;background:#f8fafc;">${fmtL(fd.bosSales)}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;${vs}background:${bg}">${fmtGainL(dispV)}</td>`;
      html += `<td style="padding:5px 6px;text-align:right;${vs}border-right:1px solid #e2e8f0;background:${bg}">${fmtGain(dispA)}원</td>`;
    }
    html += '</tr>';
  }

  // 전체 합계
  if (totalAll) {
    const dispTotal = -(totalAll.total || 0);
    html += '<tr style="background:#fef9c3;border-top:2px solid #e2e8f0;font-weight:700;">';
    html += `<td style="padding:7px 10px;color:#92400e;">전체합계</td>`;
    html += `<td style="padding:7px 10px;text-align:right;font-size:13px;border-right:2px solid #e2e8f0;${gainStyle(dispTotal)}">${fmtGain(dispTotal)}원</td>`;
    for (const f of FUELS) {
      const dv = -(totalAll[f] || 0);
      html += `<td colspan="5" style="padding:7px 6px;text-align:center;color:#64748b;font-size:11px;">${f}</td>`;
      html += `<td colspan="2" style="padding:7px 6px;text-align:right;${gainStyle(dv)};border-right:1px solid #e2e8f0;">${fmtGain(dv)}원</td>`;
    }
    html += '</tr>';
    html += `<tr style="background:#fef9c3;"><td colspan="23" style="padding:7px 14px;font-size:12px;color:#78350f;">`;
    html += `재고 손익 합계: <strong style="${gainStyle(dispTotal)};font-size:14px;">${fmtGain(dispTotal)}원</strong>`;
    html += `&nbsp;&nbsp;<span style="color:#94a3b8;font-weight:400;">(영업이익 미반영 · 온도·증발·ATG오차 모니터링용)</span>`;
    html += `&nbsp;&nbsp;오차해석: <span style="color:#16a34a;">+(초록)</span>=BOS판매>탱크소모(이익) `;
    html += `<span style="color:#dc2626;">-(빨강)</span>=탱크소모>BOS판매(손실·증발·누출)`;
    html += '</td></tr>';
  }

  html += '</tbody></table></div>';
  body.innerHTML = html;
}

function renderSummary(data) {
  const won  = v => v != null ? Math.round(v).toLocaleString() + '원' : '-';
  const pct  = (a, b) => (a != null && b > 0) ? ((a/b)*100).toFixed(1)+'%' : '-';

  // KPI 카드
  document.getElementById('kpi-revenue-val').textContent = won(data.revenue);
  const cost = data.profit != null ? data.revenue - data.profit : null;
  document.getElementById('kpi-cost-val').textContent    = won(cost);
  document.getElementById('kpi-profit-val').textContent  = won(data.profit);
  document.getElementById('kpi-expense-val').textContent = won(data.expense);
  const obEl = document.getElementById('kpi-oilbank-val');
  if (obEl) obEl.textContent = won(data.oilbankSupport || 0);
  document.getElementById('kpi-net-val').textContent     = won(data.netProfit);
  document.getElementById('kpi-margin-val').textContent  = pct(data.netProfit, data.revenue);

  // 색상
  const profitEl = document.getElementById('kpi-profit');
  const netEl    = document.getElementById('kpi-net');
  if (profitEl) profitEl.style.borderTopColor = data.profit >= 0 ? '#22c55e' : '#ef4444';
  if (netEl)    netEl.style.borderTopColor    = (data.netProfit ?? 0) >= 0 ? '#22c55e' : '#ef4444';

  // 유종별 판매 테이블
  const salesBody = document.getElementById('summary-sales-body');
  if (salesBody) {
    const FUELS = ['경유','휘발유','등유'];
    const th = (t, right) => `<th style="padding:7px 10px;text-align:${right?'right':'left'};white-space:nowrap;">${t}</th>`;
    const td = (v, right, bold) => `<td style="padding:6px 10px;text-align:${right?'right':'left'};${bold?'font-weight:700;':''}">${v}</td>`;
    const rows = FUELS.map(fuel => {
      const amt    = data.sales?.[fuel] || 0;
      const qty    = data.qty?.[fuel]   || 0;
      const drums  = Math.floor(qty / 200);
      const avgSell = qty > 0 ? Math.round(amt / qty) : null;
      const avgBuy  = data.avgBuyPriceByFuel?.[fuel] || null;
      const profit  = data.profitByFuel?.[fuel] ?? null;
      const pct     = amt > 0 && profit != null ? (profit/amt*100).toFixed(1)+'%' : '-';
      return `<tr>
        ${td(`<strong>${fuel}</strong>`)}
        ${td(qty > 0 ? Math.floor(qty).toLocaleString()+'L ('+drums+'드럼)' : '-', true)}
        ${td(avgSell ? avgSell.toLocaleString()+'원' : '-', true)}
        ${td(avgBuy  ? avgBuy.toLocaleString()+'원'  : '-', true)}
        ${td(profit != null ? `<span style="color:${profit>=0?'#16a34a':'#dc2626'};font-weight:700;">${profit.toLocaleString()}원 (${pct})</span>` : '-', true)}
        ${td(amt > 0 ? amt.toLocaleString()+'원' : '-', true)}
      </tr>`;
    });
    // 유종 소계 → 세차·유외 이익 → 카드수수료 차감 → 합계 순으로 보여줘야
    // "유종 합 ≠ 총 영업이익"으로 보이던 혼란이 없어진다 (셋을 더하면 정확히 합계가 됨)
    const fuelProfit = data.fuelProfit ?? null;
    rows.push(`<tr style="background:#f8fafc;border-top:1px solid #e2e8f0;">
      ${td('<span style="color:#64748b;">유종 소계</span>')} ${td('-',true)} ${td('-',true)} ${td('-',true)}
      ${td(fuelProfit != null ? `<span style="color:${fuelProfit>=0?'#16a34a':'#dc2626'};font-weight:700;">${fuelProfit.toLocaleString()}원</span>` : '-', true)}
      ${td('-',true)}
    </tr>`);

    const etcAmt    = (data.sales?.carwash||0) + (data.sales?.others||0);
    const etcProfit = data.etcProfit ?? null;
    const otherCost = data.otherCost || 0;
    rows.push(`<tr style="background:#f8fafc;">
      ${td(`세차+유외${otherCost ? `<span style="font-size:11px;color:#94a3b8;"> (원가 ${otherCost.toLocaleString()}원 차감)</span>` : ''}`)}
      ${td('-',true)} ${td('-',true)} ${td('-',true)}
      ${td(etcProfit != null ? `<span style="color:${etcProfit>=0?'#16a34a':'#dc2626'};font-weight:700;">${etcProfit.toLocaleString()}원</span>` : '-', true)}
      ${td(etcAmt > 0 ? etcAmt.toLocaleString()+'원' : '-', true)}
    </tr>`);

    const cardFee = data.cardFee || 0;
    rows.push(`<tr style="background:#f8fafc;">
      ${td('<span style="color:#64748b;">카드 수수료</span>')} ${td('-',true)} ${td('-',true)} ${td('-',true)}
      ${td(cardFee ? `<span style="color:#dc2626;font-weight:700;">-${cardFee.toLocaleString()}원</span>` : '-', true)}
      ${td('-',true)}
    </tr>`);

    rows.push(`<tr style="background:#f1f5f9;border-top:2px solid #e2e8f0;">
      ${td('영업이익 합계',false,true)} ${td('-',true,true)} ${td('-',true,true)} ${td('-',true,true)}
      ${td(data.profit!=null?`<span style="color:${data.profit>=0?'#16a34a':'#dc2626'};font-weight:700;">${data.profit.toLocaleString()}원</span>`:'-',true,true)}
      ${td((data.revenue||0).toLocaleString()+'원',true,true)}
    </tr>`);
    salesBody.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
        ${th('유종')}${th('판매량',true)}${th('평균판매가',true)}${th('평균매입가',true)}${th('영업이익',true)}${th('매출액',true)}
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  // 지출 Top5
  const expTop5El = document.getElementById('summary-expense-top5');
  if (expTop5El) {
    if (!data.expenseTop5?.length) {
      expTop5El.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;">지출 데이터 없음</div>';
    } else {
      const maxAmt = data.expenseTop5[0].amount;
      const rows = data.expenseTop5.map((e, i) => {
        const barPct = maxAmt > 0 ? (e.amount / maxAmt * 100).toFixed(0) : 0;
        return `<div style="padding:8px 14px;${i>0?'border-top:1px solid #f1f5f9;':''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:13px;font-weight:600;">${i+1}. ${e.name}</span>
            <span style="font-size:13px;color:#1e40af;font-weight:700;">${e.amount.toLocaleString()}원</span>
          </div>
          <div style="background:#e2e8f0;border-radius:4px;height:5px;">
            <div style="background:#3b82f6;border-radius:4px;height:5px;width:${barPct}%;"></div>
          </div>
        </div>`;
      });
      expTop5El.innerHTML = rows.join('');
    }
  }

  // 고객 Top5 렌더 공통 함수
  function renderTop5(list, el) {
    if (!list?.length) {
      el.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px;">데이터 없음</div>';
      return;
    }
    el.innerHTML = list.map((c, i) => {
      const pfColor = c.profit >= 0 ? '#16a34a' : '#dc2626';
      return `<div style="padding:8px 14px;${i>0?'border-top:1px solid #f1f5f9;':''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <span style="font-size:13px;font-weight:600;">${i+1}. ${c.name}</span>
          <span style="font-size:13px;font-weight:700;">${c.amount.toLocaleString()}원</span>
        </div>
        <div style="display:flex;gap:10px;font-size:11px;color:#64748b;flex-wrap:wrap;">
          <span>${c.qty.toLocaleString()}L</span>
          <span>${c.avgSellPrice ? c.avgSellPrice.toLocaleString()+'원/L' : '-'}</span>
          <span style="color:${pfColor};font-weight:600;">${c.profit!=null?c.profit.toLocaleString()+'원 ('+c.profitPct+'%)':'-'}</span>
        </div>
      </div>`;
    }).join('');
  }

  const custTop5El = document.getElementById('summary-customer-top5');
  if (custTop5El) renderTop5(data.customerTop5, custTop5El);

  const cardTop5El = document.getElementById('summary-card-top5');
  if (cardTop5El) renderTop5(data.cardTop5, cardTop5El);

}

async function uploadExpenses(file) {
  const label = document.getElementById('expense-file-label');
  if (label) label.textContent = '업로드 중...';
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/upload-expenses', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      if (label) label.textContent = `✅ ${data.count}건 임포트 완료`;
      toast(`✅ 지출내역 ${data.count}건 임포트 완료`, 'success');
      loadAllExpenses();
    } else {
      if (label) label.textContent = '업로드 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch { toast('서버 연결 오류', 'error'); }
}

// ── 지출목록 탭 ──────────────────────────────────────────────

async function loadAllExpenses() {
  // 탭 강제 표시
  ['tab-daily-expense', 'group-daily'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; el.style.visibility = 'visible'; el.style.opacity = '1'; }
  });

  const countEl = document.getElementById('expense-list-count');
  if (countEl) countEl.textContent = '불러오는 중…';

  const diagEl = document.getElementById('expense-diag');
  if (diagEl) { diagEl.style.display = 'block'; diagEl.textContent = 'API 호출 중…'; }

  const res = await api('GET', '/api/expenses');
  if (res.ok) {
    expenseList = res.expenses || [];
    if (diagEl) diagEl.textContent = `✅ API 응답: ${expenseList.length}건 수신됨`;
    toast(`지출목록 ${expenseList.length}건 로드`, expenseList.length ? 'success' : '');
    renderExpenseList();
  } else {
    if (diagEl) diagEl.textContent = `❌ API 실패: ${res.error}`;
    toast('지출 내역 조회 실패: ' + (res.error || '서버 오류'), 'error');
    if (countEl) countEl.textContent = '조회 실패';
  }
}

function renderExpenseList() {
  const countEl = document.getElementById('expense-list-count');
  const diagEl  = document.getElementById('expense-diag');
  const listDiv = document.getElementById('expense-simple-list');

  if (countEl) countEl.textContent = `${expenseList.length}건`;

  if (!listDiv) {
    if (diagEl) diagEl.textContent += ' | ❌ expense-simple-list 없음!';
    return;
  }

  if (!expenseList.length) {
    listDiv.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">지출 내역이 없습니다. 수시입출예금 파일을 업로드하세요.</div>';
    if (diagEl) diagEl.textContent += ' | 빈 목록 표시';
    return;
  }

  const sorted = [...expenseList].sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));

  // 카드 외부에 직접 렌더링 (overflow:hidden 우회)
  const tabEl2 = document.getElementById('tab-daily-expense');
  let directList = document.getElementById('expense-direct-list');
  if (!directList && tabEl2) {
    directList = document.createElement('div');
    directList.id = 'expense-direct-list';
    directList.style.cssText = 'margin-top:8px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;';
    tabEl2.appendChild(directList);
  }

  const target = directList || listDiv;
  target.innerHTML = '<div style="padding:6px 16px;background:#f1f5f9;font-size:12px;color:#475569;font-weight:600;">날짜 | 계정과목 | 업체 | 금액</div>' +
    sorted.map((e, i) => `<div style="padding:8px 16px;border-top:1px solid #f1f5f9;font-size:13px;color:#1e293b;">
      <span style="color:#64748b;margin-right:12px;">${esc(e.date || e.month || '')}</span>
      <span style="margin-right:12px;">${esc(e.subCategory || '')}</span>
      <span style="margin-right:12px;">${esc(e.vendor || '')}</span>
      <strong>${(e.amount || 0).toLocaleString()}원</strong>
    </div>`).join('');

  if (diagEl) diagEl.textContent = `✅ ${expenseList.length}건 렌더링 완료`;
}

async function deleteExpenseItem(idx) {
  const e = expenseList[idx];
  if (!e) return;
  if (!confirm(`${e.vendor} ${(e.amount || 0).toLocaleString()}원을 삭제하시겠습니까?`)) return;
  const res = await api('DELETE', '/api/expenses/delete', {
    month: e.month, date: e.date || '', vendor: e.vendor, amount: e.amount,
  });
  if (res.ok) {
    expenseList.splice(idx, 1);
    renderExpenseList();
    toast('삭제 완료', 'success');
  } else {
    toast('삭제 실패: ' + (res.error || ''), 'error');
  }
}

async function uploadBankExpenses(file) {
  const label = document.getElementById('bank-expense-label');
  label.textContent = `업로드 중: ${file.name}`;
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/upload-bank-expenses', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      label.textContent = `✅ ${data.count}건 (${(data.months || []).join(', ')})`;
      toast(`✅ 지출 ${data.count}건 · 미수 입금 ${data.ar?.count || 0}건 · 카드사 입금 ${data.cardDeposits?.dateCount || 0}일 반영`, 'success');
      loadAllExpenses();
      loadBankDeposits();
    } else {
      label.textContent = '업로드 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch {
    label.textContent = '서버 연결 오류';
    toast('서버 연결 오류', 'error');
  }
}

// ── 연간 결과보고서 ──────────────────────────────────────────
async function loadAnnualReport() {
  const year = document.getElementById('report-year')?.value || new Date().getFullYear();
  const body = document.getElementById('annual-report-body');
  body.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;">불러오는 중...</div>';
  const res = await api('GET', `/api/annual-summary?year=${year}`);
  if (!res.ok) { body.innerHTML = `<div style="padding:16px;color:#ef4444;">${res.error}</div>`; return; }
  renderAnnualReport(res);
}

function renderAnnualReport({ year, months, hasPrices }) {
  const body = document.getElementById('annual-report-body');

  // 데이터 있는 월만 컬럼으로 표시
  const validMonths = months.filter(m => m !== null);
  if (!validMonths.length) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">해당 연도 데이터가 없습니다.</div>';
    return;
  }

  const W = v => v != null ? Math.round(v).toLocaleString() : '-';
  const L = v => v > 0 ? Math.floor(v).toLocaleString() : '-';
  const P = v => v != null ? `<span class="${v>=0?'profit-pos':'profit-neg'}">${Math.round(v).toLocaleString()}</span>` : '-';

  // 연간 합계 계산
  function sumField(arr, fn) { return arr.reduce((s,m) => m ? s + (fn(m)||0) : s, 0); }

  const fuels = ['휘발유','경유','등유'];
  const totQty   = {}; fuels.forEach(f => totQty[f]   = sumField(validMonths, m=>m.qty[f]));
  const totSales = {}; fuels.forEach(f => totSales[f]  = sumField(validMonths, m=>m.sales[f]));
  const totFuelP = {}; fuels.forEach(f => totFuelP[f]  = hasPrices ? sumField(validMonths, m=>m.fuelProfit[f]) : null);
  const totCarwash = sumField(validMonths, m=>m.sales.carwash);
  const totOthers  = sumField(validMonths, m=>m.sales.others);
  const totProfit  = hasPrices ? sumField(validMonths, m=>m.profit||0)    : null;
  const totExpense = sumField(validMonths, m=>m.expense||0);
  const totNet     = hasPrices ? sumField(validMonths, m=>m.netProfit||0) : null;

  // 컬럼 헤더 (월 + 합계)
  const colHeaders = validMonths.map(m=>`<th class="rpt-num">${m.month}월</th>`).join('') + '<th class="rpt-num rpt-total">합계</th>';

  // 행 생성 헬퍼
  function dataRow(label, vals, totVal, formatFn, cls='') {
    const cells = validMonths.map(m=>`<td class="rpt-num ${cls}">${formatFn(vals(m))}</td>`).join('');
    return `<tr><td class="rpt-label ${cls}">${label}</td>${cells}<td class="rpt-num rpt-total ${cls}">${formatFn(totVal)}</td></tr>`;
  }
  function profitRow(label, vals, totVal) {
    const cells = validMonths.map(m=>`<td class="rpt-num">${P(vals(m))}</td>`).join('');
    return `<tr><td class="rpt-label">${label}</td>${cells}<td class="rpt-num rpt-total">${P(totVal)}</td></tr>`;
  }
  function sepRow(colspan) { return `<tr class="rpt-sep"><td colspan="${colspan}"></td></tr>`; }

  const colspan = validMonths.length + 2; // 구분 + 월들 + 합계

  let html = `
  <table id="annual-report-table" style="font-size:13px;border-collapse:collapse;min-width:600px;width:100%;">
    <colgroup>
      <col style="width:110px;">
      ${validMonths.map(()=>'<col style="min-width:80px;">').join('')}
      <col style="min-width:90px;">
    </colgroup>
    <thead>
      <tr>
        <th class="rpt-head" colspan="${colspan}" style="text-align:center;font-size:14px;padding:10px 6px;background:#1e293b;color:#fff;letter-spacing:1px;">
          ${year}년 영업 결과보고서 &nbsp;·&nbsp; (주)미소주유소
        </th>
      </tr>
      <tr class="rpt-sub-head">
        <th class="rpt-label">구분</th>${colHeaders}
      </tr>
    </thead>
    <tbody>`;

  // 유종별 블록
  for (const fuel of fuels) {
    html += `<tr class="rpt-group-head"><td colspan="${colspan}">${fuel}</td></tr>`;
    html += dataRow(`  판매량(L)`, m=>m.qty[fuel],       totQty[fuel],    L);
    html += dataRow(`  매출금액`,  m=>m.sales[fuel],     totSales[fuel],  W);
    html += profitRow(`  영업이익`, m=>hasPrices?m.fuelProfit[fuel]:null, totFuelP[fuel]);
  }

  html += sepRow(colspan);

  // 유외·세차
  html += dataRow('유외상품 매출', m=>m.sales.others,  totOthers,  W);
  html += dataRow('세차 매출',     m=>m.sales.carwash, totCarwash, W);

  html += sepRow(colspan);

  // 합계·순이익
  html += profitRow('총 영업이익', m=>m.profit,    totProfit);
  html += dataRow(  '지출 합계',   m=>m.expense,   totExpense, W, 'rpt-expense');
  html += profitRow('순이익',      m=>m.netProfit, totNet);

  html += `</tbody></table>`;
  if (!hasPrices) html += `<p style="font-size:11px;color:#f59e0b;margin:6px 0 0;">* 매입단가 미등록 — 영업이익/순이익 계산 불가</p>`;

  body.innerHTML = html;
}

// ── 모바일 공유 ───────────────────────────────────────────────
let _mobileUrl = null;

async function showMobileShare() {
  const panel = document.getElementById('mobile-share-panel');
  if (!panel) return;
  panel.style.display = 'block';
  if (_mobileUrl) {
    document.getElementById('mobile-url-display').textContent = _mobileUrl;
    return;
  }
  const res = await api('GET', '/api/server-info');
  if (res.ok) {
    _mobileUrl = `http://${res.ip}:${res.port}/mobile.html?v=${Date.now()}`;
    document.getElementById('mobile-url-display').textContent = _mobileUrl;
  } else {
    document.getElementById('mobile-url-display').textContent = 'IP 조회 실패';
  }
}

function copyMobileUrl() {
  if (!_mobileUrl) return;
  navigator.clipboard.writeText(_mobileUrl).then(() => {
    toast('📋 주소가 복사되었습니다', 'success');
  }).catch(() => {
    prompt('아래 주소를 복사하세요:', _mobileUrl);
  });
}

async function exportMonthlyReport() {
  const btn = document.getElementById('export-report-btn');
  const year  = dailyState.year  || new Date().getFullYear();
  const month = String(dailyState.month || (new Date().getMonth() + 1)).padStart(2, '0');
  const ym    = `${year}-${month}`;
  if (btn) btn.textContent = '⏳ 생성 중...';
  try {
    const response = await fetch(`/api/export-html/${ym}`);
    if (!response.ok) throw new Error('서버 오류');
    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `미소주유소_${year}년${month}월_보고서.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`✅ ${year}년 ${month}월 보고서 저장 완료`, 'success');
  } catch(e) {
    toast('보고서 생성 실패: ' + e.message, 'error');
  } finally {
    if (btn) btn.textContent = '📤 보고서 저장 (카카오톡 공유용)';
  }
}

// ── 고객매출현황 탭: 월별 업체별 매출 리스트 ───────────────────
async function loadCustomerSalesMonth() {
  const year  = parseInt(document.getElementById('cs-year')?.value)  || dailyState.year;
  const month = parseInt(document.getElementById('cs-month')?.value) || dailyState.month;
  const label = document.getElementById('cs-label');
  const tbody = document.getElementById('cs-tbody');
  if (!tbody) return;

  const res = await api('GET', `/api/vendors?year=${year}&month=${month}`);
  if (!res.ok || !res.vendors) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">데이터 없음</td></tr>';
    return;
  }

  const vendors = res.vendors.filter(v => v.txs && v.txs.length > 0);
  if (!vendors.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">해당 월 거래 데이터가 없습니다 (월마감 BOS 업로드 필요)</td></tr>';
    return;
  }

  if (label) label.textContent = `${year}년 ${month}월`;

  const rows = vendors.map(v => {
    const qty    = v.txs.reduce((s, t) => s + (t.qty    || 0), 0);
    const amount = v.txs.reduce((s, t) => s + (t.amount || 0), 0);
    return { name: v.name, qty, amount, avgPrice: qty > 0 ? Math.round(amount / qty) : 0 };
  }).sort((a, b) => b.amount - a.amount);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0);

  tbody.innerHTML = rows.map(r => {
    const pct = totalAmt > 0 ? (r.amount / totalAmt * 100).toFixed(1) : '0.0';
    return `<tr>
      <td>${esc(r.name)}</td>
      <td class="col-num">${r.qty.toLocaleString()}</td>
      <td class="col-num">${r.amount.toLocaleString()}</td>
      <td class="col-num">${r.avgPrice.toLocaleString()}</td>
      <td class="col-num">${pct}%</td>
    </tr>`;
  }).join('') + `
  <tr style="font-weight:700;background:#f1f5f9;">
    <td>합계</td>
    <td class="col-num">${totalQty.toLocaleString()}</td>
    <td class="col-num">${totalAmt.toLocaleString()}</td>
    <td class="col-num"></td>
    <td class="col-num">100%</td>
  </tr>`;
}

// ── 고객관리 탭: 연간 고객별 월별 판매 피벗 ─────────────────────
const customerSalesState = { year: new Date().getFullYear(), data: null };

async function loadCustomerSalesTab() {
  const selYear = document.getElementById('customer-sales-year');
  if (!selYear) return;
  customerSalesState.year = parseInt(selYear.value) || new Date().getFullYear();

  const res = await api('GET', `/api/customer-sales?year=${customerSalesState.year}`);
  if (!res.ok) { toast('고객 판매 현황 조회 실패', 'error'); return; }
  customerSalesState.data = res;
  renderCustomerSalesPivot(res);
}

function renderCustomerSalesPivot({ year, customers }) {
  const thead = document.getElementById('customer-sales-thead');
  const tbody = document.getElementById('customer-sales-tbody');
  const label = document.getElementById('customer-sales-label');
  if (!thead || !tbody) return;

  if (label) label.textContent = `${year}년 · 월마감 BOS 기준 (외상 거래)`;

  const allMos = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const moLabels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const activeMos = allMos.filter(mo => customers.some(c => c.months[mo]));

  if (!customers.length || !activeMos.length) {
    thead.innerHTML = '<tr><th colspan="5">데이터 없음</th></tr>';
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">월마감 탭에서 BOS 거래내역서를 업로드하면 표시됩니다</td></tr>';
    return;
  }

  const stickyLeft = 'position:sticky;left:0;background:inherit;z-index:1;';

  // 헤더 행 1: 고객명 + 월 그룹 + 합계
  let h1 = `<tr><th rowspan="2" style="${stickyLeft}min-width:130px;">고객명</th>`;
  for (const mo of activeMos) {
    h1 += `<th colspan="4" style="text-align:center;">${moLabels[parseInt(mo)-1]}</th>`;
  }
  h1 += `<th colspan="3" style="text-align:center;background:#e2e8f0;">합계</th></tr>`;

  // 헤더 행 2: 서브 컬럼 (판매단가, 수량, 매출액, 전월비%)
  let h2 = `<tr>`;
  for (let i = 0; i < activeMos.length; i++) {
    h2 += `<th class="col-num" style="min-width:68px;font-size:11px;">판매단가</th>
      <th class="col-num" style="min-width:78px;font-size:11px;">수량(L)</th>
      <th class="col-num" style="min-width:88px;font-size:11px;">매출액</th>
      <th class="col-num" style="min-width:58px;font-size:11px;">전월비</th>`;
  }
  h2 += `<th class="col-num" style="min-width:78px;font-size:11px;background:#e2e8f0;">수량(L)</th>
    <th class="col-num" style="min-width:88px;font-size:11px;background:#e2e8f0;">매출액</th>
    <th class="col-num" style="min-width:68px;font-size:11px;background:#e2e8f0;">평균단가</th>
    </tr>`;

  thead.innerHTML = h1 + h2;

  const totals = { months: {}, qty: 0, amount: 0 };
  for (const mo of activeMos) totals.months[mo] = { qty: 0, amount: 0 };

  function pctCell(curr, prev) {
    if (!prev || !curr) return `<td class="col-num" style="color:#cbd5e1;font-size:11px;">−</td>`;
    const pct = ((curr - prev) / prev * 100).toFixed(1);
    const color = pct > 0 ? '#16a34a' : pct < 0 ? '#dc2626' : '#64748b';
    const sign  = pct > 0 ? '+' : '';
    return `<td class="col-num" style="color:${color};font-size:11px;font-weight:600;">${sign}${pct}%</td>`;
  }

  let rowsHtml = '';
  for (const c of customers) {
    let tQty = 0, tAmt = 0;
    let row = `<tr><td style="${stickyLeft}font-weight:500;">${esc(c.name)}</td>`;
    for (let i = 0; i < activeMos.length; i++) {
      const mo   = activeMos[i];
      const prev = i > 0 ? activeMos[i - 1] : null;
      const d    = c.months[mo];
      const dp   = prev ? c.months[prev] : null;
      if (d && d.amount > 0) {
        const avg = d.qty > 0 ? Math.round(d.amount / d.qty) : 0;
        row += `<td class="col-num" style="font-size:12px;">${avg.toLocaleString()}</td>
          <td class="col-num" style="font-size:12px;">${d.qty.toLocaleString()}</td>
          <td class="col-num" style="font-size:12px;">${d.amount.toLocaleString()}</td>`;
        row += pctCell(d.amount, dp?.amount);
        tQty += d.qty; tAmt += d.amount;
        totals.months[mo].qty += d.qty; totals.months[mo].amount += d.amount;
      } else {
        row += `<td class="col-num" style="color:#cbd5e1;">−</td>
          <td class="col-num" style="color:#cbd5e1;">−</td>
          <td class="col-num" style="color:#cbd5e1;">−</td>`;
        row += pctCell(null, null);
      }
    }
    const avg = tQty > 0 ? Math.round(tAmt / tQty) : 0;
    row += `<td class="col-num" style="background:#f8fafc;font-weight:600;">${tQty.toLocaleString()}</td>
      <td class="col-num" style="background:#f8fafc;font-weight:600;">${tAmt.toLocaleString()}</td>
      <td class="col-num" style="background:#f8fafc;font-weight:600;">${avg.toLocaleString()}</td>
      </tr>`;
    rowsHtml += row;
    totals.qty += tQty; totals.amount += tAmt;
  }

  // 합계 행
  let totalRow = `<tr style="font-weight:700;background:#e2e8f0;">
    <td style="${stickyLeft}background:#e2e8f0;">합계</td>`;
  for (let i = 0; i < activeMos.length; i++) {
    const mo   = activeMos[i];
    const prev = i > 0 ? activeMos[i - 1] : null;
    const d    = totals.months[mo];
    const dp   = prev ? totals.months[prev] : null;
    const avg  = d.qty > 0 ? Math.round(d.amount / d.qty) : 0;
    totalRow += `<td class="col-num">${avg.toLocaleString()}</td>
      <td class="col-num">${d.qty.toLocaleString()}</td>
      <td class="col-num">${d.amount.toLocaleString()}</td>`;
    totalRow += pctCell(d.amount, dp?.amount);
  }
  const overallAvg = totals.qty > 0 ? Math.round(totals.amount / totals.qty) : 0;
  totalRow += `<td class="col-num" style="background:#cbd5e1;">${totals.qty.toLocaleString()}</td>
    <td class="col-num" style="background:#cbd5e1;">${totals.amount.toLocaleString()}</td>
    <td class="col-num" style="background:#cbd5e1;">${overallAvg.toLocaleString()}</td>
    </tr>`;

  tbody.innerHTML = rowsHtml + totalRow;
}

function printAnnualReport() {
  const el = document.getElementById('annual-report-table');
  if (!el) { toast('먼저 연간보고서를 조회하세요.', 'warn'); return; }
  const year = document.getElementById('report-year')?.value || '';
  const w = window.open('', '_blank', 'width=1000,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${year}년 영업 결과보고서</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; margin: 20px; font-size:11px; }
    table { border-collapse: collapse; width:100%; }
    th, td { border:1px solid #ccc; padding:4px 6px; white-space:nowrap; }
    .rpt-head { background:#1e293b!important; color:#fff!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .rpt-sub-head th { background:#f1f5f9; font-weight:600; }
    .rpt-group-head td { background:#e2e8f0; font-weight:700; padding:3px 6px; }
    .rpt-label { text-align:left; }
    .rpt-num { text-align:right; }
    .rpt-total { background:#fef9c3; font-weight:700; }
    .rpt-sep td { height:4px; background:#f8fafc; border:none; }
    .rpt-expense { color:#ef4444; }
    .profit-pos { color:#16a34a; }
    .profit-neg { color:#dc2626; }
    @page { size: A4 landscape; margin:15mm; }
  </style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(()=>{ w.print(); }, 300);
}

// ════════════════════════════════════════════════════════════
// 업체별 단가 현황 (월마감)
//   게시가 = 할인단가(BOS 실제 판매단가) + 할인가(수기 입력)
// ════════════════════════════════════════════════════════════

const vendorPriceState = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  fuels: ['휘발유', '경유', '등유'],
  vendors: [],
};

function initVendorPriceYearMonth() {
  const selYear  = document.getElementById('vp-year');
  const selMonth = document.getElementById('vp-month');
  if (!selYear || !selMonth) return;
  const now = new Date();

  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === vendorPriceState.year) o.selected = true;
    selYear.appendChild(o);
  }
  for (let m = 1; m <= 12; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    if (m === vendorPriceState.month) o.selected = true;
    selMonth.appendChild(o);
  }
  selYear.addEventListener('change',  e => { vendorPriceState.year  = +e.target.value; loadVendorPrices(); });
  selMonth.addEventListener('change', e => { vendorPriceState.month = +e.target.value; loadVendorPrices(); });
}

async function loadVendorPrices() {
  const { year, month } = vendorPriceState;
  const res = await api('GET', `/api/vendor-prices?year=${year}&month=${month}`);
  if (!res.ok) { toast(res.error || '단가 조회 실패', 'error'); return; }
  vendorPriceState.fuels   = res.fuels;
  vendorPriceState.vendors = res.vendors;
  renderVendorPrices();
}

// 상단: 업체별 할인가 입력칸
function renderVendorDiscountInputs() {
  const box = document.getElementById('vp-discount-body');
  if (!box) return;
  const { fuels, vendors } = vendorPriceState;

  box.innerHTML = vendors.map(v => `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <strong style="min-width:150px;">${v.name}</strong>
      ${!v.found ? '<span class="badge badge-warn">이 달 거래 없음</span>' : ''}
      ${fuels.map(f => `
        <label class="label-sm" style="display:flex;align-items:center;gap:4px;">
          ${f}
          <input type="number" step="1" style="width:80px;text-align:right;"
                 value="${v.discounts[f] ?? 0}"
                 data-vp-keyword="${v.keyword}" data-vp-fuel="${f}">
          <span>원</span>
        </label>`).join('')}
      <button class="btn-primary" onclick="saveVendorDiscount('${v.keyword}')">저장</button>
      <button onclick="exportVendorPrices('${v.keyword}')"
              ${v.found ? '' : 'disabled'}>📤 이 업체 Excel</button>
    </div>`).join('');
}

// 하단: 일별 단가 변동 표 (날짜별 1행, 업체×유종 셀)
function renderVendorPrices() {
  renderVendorDiscountInputs();
  const thead = document.getElementById('vp-thead');
  const tbody = document.getElementById('vp-tbody');
  if (!thead || !tbody) return;

  const { fuels, vendors } = vendorPriceState;

  thead.innerHTML = `
    <tr>
      <th rowspan="3">날짜</th>
      ${vendors.map(v => `<th colspan="${fuels.length * 2}">${v.name}</th>`).join('')}
    </tr>
    <tr>
      ${vendors.map(() =>
        `<th colspan="${fuels.length}">게시가</th><th colspan="${fuels.length}">할인단가</th>`).join('')}
    </tr>
    <tr>
      ${vendors.map(() => fuels.map(f => `<th>${f}</th>`).join('').repeat(2)).join('')}
    </tr>`;

  // 전체 날짜 합집합
  const allDates = [...new Set(vendors.flatMap(v => v.daily.map(d => d.date)))].sort();
  if (!allDates.length) {
    tbody.innerHTML = `<tr><td colspan="${1 + vendors.length * fuels.length * 2}"
      style="text-align:center;padding:24px;color:#64748b;">
      해당 월의 BOS 데이터가 없습니다. [거래명세서 발행] 탭에서 먼저 업로드하세요.</td></tr>`;
    return;
  }

  const num = n => (n == null ? '<span style="color:#cbd5e1;">-</span>' : n.toLocaleString());
  // 직전 행 대비 단가가 바뀌면 강조
  const prev = {};

  tbody.innerHTML = allDates.map(date => {
    const cells = vendors.map(v => {
      const d = v.daily.find(x => x.date === date);
      const posted = fuels.map(f => {
        const val = d?.posted[f] ?? null;
        const k = `${v.keyword}|${f}|p`;
        const changed = val != null && prev[k] != null && prev[k] !== val;
        if (val != null) prev[k] = val;
        return `<td style="text-align:right;${changed ? 'font-weight:700;color:#b45309;' : ''}">${num(val)}</td>`;
      }).join('');
      const sold = fuels.map(f => {
        const val = d?.sold[f] ?? null;
        return `<td style="text-align:right;">${num(val)}</td>`;
      }).join('');
      return posted + sold;
    }).join('');
    return `<tr><td style="text-align:center;white-space:nowrap;">${date}</td>${cells}</tr>`;
  }).join('');
}

async function saveVendorDiscount(keyword) {
  const inputs = document.querySelectorAll(`[data-vp-keyword="${keyword}"]`);
  const discounts = {};
  inputs.forEach(i => { discounts[i.dataset.vpFuel] = Number(i.value) || 0; });

  const { year, month } = vendorPriceState;
  const res = await api('POST', '/api/vendor-discounts', { year, month, keyword, discounts });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  vendorPriceState.vendors = res.vendors;
  renderVendorPrices();
  toast(`${keyword} 할인가 저장 완료`, 'success');
}

// 업체 1곳만 내보내기 — 타사 단가가 섞이지 않도록 keyword 필수
function exportVendorPrices(keyword) {
  if (!keyword) { toast('업체를 지정하세요', 'error'); return; }
  const { year, month } = vendorPriceState;
  location.href = `/api/export-vendor-prices?year=${year}&month=${month}`
                + `&keyword=${encodeURIComponent(keyword)}`;
}

// ════════════════════════════════════════════════════════════
// 현대오일뱅크 지원금 (입금검증 탭 우측)
//   지원기간 + 지원단가만 입력 → 그 기간 입고량으로 지원금 자동 산정
// ════════════════════════════════════════════════════════════

async function loadOilbankSupports() {
  const res = await api('GET', '/api/oilbank-supports');
  if (!res.ok) { toast(res.error || '지원 목록 조회 실패', 'error'); return; }
  renderOilbankSupports(res.supports || []);
}

function renderOilbankSupports(list) {
  const box = document.getElementById('ob-list');
  if (!box) return;

  if (!list.length) {
    box.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;">
      등록된 지원 내역이 없습니다.</div>`;
    return;
  }

  const n = v => (v || 0).toLocaleString();
  const totQty = list.reduce((s, x) => s + (x.qty || 0), 0);
  const totAmt = list.reduce((s, x) => s + (x.amount || 0), 0);

  box.innerHTML = `
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px;text-align:center;">지원기간</th>
          <th style="padding:6px;text-align:right;">지원단가</th>
          <th style="padding:6px;text-align:right;">지원수량</th>
          <th style="padding:6px;text-align:right;">지원금액</th>
          <th style="padding:6px;"></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(s => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px;text-align:center;white-space:nowrap;">
              ${s.from} ~ ${s.to}
              ${s.memo ? `<div style="color:#64748b;font-size:11px;">${s.memo}</div>` : ''}
              <div style="font-size:10px;margin-top:2px;">
                ${(s.fuels || []).map(f =>
                  `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;border-radius:3px;padding:0 4px;margin-right:2px;">${f}</span>`).join('')}
              </div>
              <div style="color:#94a3b8;font-size:10px;">
                ${Object.entries(s.byFuel || {}).map(([f, q]) => `${f} ${n(Math.round(q))}L`).join(' · ') || '해당 유종 입고 없음'}
              </div>
            </td>
            <td style="padding:6px;text-align:right;white-space:nowrap;">${n(s.unitAmount)}원</td>
            <td style="padding:6px;text-align:right;white-space:nowrap;">${n(Math.round(s.qty))}L</td>
            <td style="padding:6px;text-align:right;white-space:nowrap;font-weight:700;color:#0f766e;">${n(s.amount)}원</td>
            <td style="padding:6px;text-align:center;white-space:nowrap;">
              <button style="padding:2px 6px;font-size:11px;" onclick='editOilbankSupport(${JSON.stringify(s).replace(/'/g, "&#39;")})'>수정</button>
              <button style="padding:2px 6px;font-size:11px;color:#dc2626;" onclick="deleteOilbankSupport('${s.id}')">삭제</button>
            </td>
          </tr>`).join('')}
        <tr style="background:#f8fafc;font-weight:700;">
          <td style="padding:6px;text-align:center;">합계</td>
          <td></td>
          <td style="padding:6px;text-align:right;">${n(Math.round(totQty))}L</td>
          <td style="padding:6px;text-align:right;color:#0f766e;">${n(totAmt)}원</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:11px;color:#64748b;margin:8px 4px 0;">
      * 입고이력(입고 등록분) 기준이며, 재고 스냅샷은 제외됩니다. 종합 탭 순이익에 가산됩니다.
    </p>`;
}

async function saveOilbankSupport() {
  const id   = document.getElementById('ob-id').value;
  const from = document.getElementById('ob-from').value;
  const to   = document.getElementById('ob-to').value;
  const unitAmount = Number(document.getElementById('ob-unit').value) || 0;
  const memo = document.getElementById('ob-memo').value.trim();
  const fuels = [...document.querySelectorAll('.ob-fuel:checked')].map(x => x.value);

  if (!from || !to)  return toast('지원기간을 입력하세요.', 'warn');
  if (from > to)     return toast('시작일이 종료일보다 늦습니다.', 'warn');
  if (!unitAmount)   return toast('지원단가를 입력하세요.', 'warn');
  if (!fuels.length) return toast('지원 유종을 1개 이상 선택하세요.', 'warn');

  const res = await api('POST', '/api/oilbank-supports', { id, from, to, unitAmount, memo, fuels });
  if (!res.ok) return toast(res.error || '저장 실패', 'error');
  resetOilbankForm();
  renderOilbankSupports(res.supports || []);
  toast('지원 내역 저장 완료', 'success');
}

function editOilbankSupport(s) {
  document.getElementById('ob-id').value   = s.id;
  document.getElementById('ob-from').value = s.from;
  document.getElementById('ob-to').value   = s.to;
  document.getElementById('ob-unit').value = s.unitAmount;
  document.getElementById('ob-memo').value = s.memo || '';
  const sel = new Set(s.fuels || []);
  document.querySelectorAll('.ob-fuel').forEach(x => { x.checked = sel.has(x.value); });
}

function resetOilbankForm() {
  ['ob-id', 'ob-from', 'ob-to', 'ob-unit', 'ob-memo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.querySelectorAll('.ob-fuel').forEach(x => { x.checked = true; });
}

async function deleteOilbankSupport(id) {
  if (!confirm('이 지원 내역을 삭제할까요?')) return;
  const res = await api('DELETE', `/api/oilbank-supports/${id}`);
  if (!res.ok) return toast(res.error || '삭제 실패', 'error');
  renderOilbankSupports(res.supports || []);
  toast('삭제 완료', 'success');
}

// ════════════════════════════════════════════════════════════
// 외상 미수금 입금 확인 (월마감 → 설정 탭 우측)
// ════════════════════════════════════════════════════════════

const arState = {
  months: [], vendors: [], unmatched: [], unresolvedAllocations: [],
  cardCandidates: [], cardMatched: [], cardMin: 300000,
  expandedVendor: null, splitFormFor: null,
  sortField: 'remaining', sortDir: 'desc',
  showAllMonths: false,   // false = 최근 AR_RECENT_MONTHS개월만 펼치고 이전 달은 "이전" 한 칸으로
};
const AR_RECENT_MONTHS = 6;

function toggleArAllMonths() {
  arState.showAllMonths = !arState.showAllMonths;
  renderArVendorTable();
}

function setArSort(field) {
  if (arState.sortField === field) {
    arState.sortDir = arState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    arState.sortField = field;
    arState.sortDir = field === 'name' ? 'asc' : 'desc';
  }
  renderArVendorTable();
}

async function loadArSummary() {
  const res = await api('GET', '/api/ar/summary');
  if (!res.ok) { toast(res.error || '외상 입금 현황 조회 실패', 'error'); return; }
  arState.months               = res.months;
  arState.vendors               = res.vendors;
  arState.unmatched             = res.unmatched;
  arState.unresolvedAllocations = res.unresolvedAllocations || [];
  renderArSummaryCards();
  renderArVendorTable();
  renderArUnmatchedBadge();
  renderArUnresolvedBadge();
  await loadArCardCandidates();
  loadArCardAuto();   // 카드결제 금액 대조는 오래 걸릴 수 있어 표를 먼저 보여주고 끝나면 다시 그림
}

// 미입금 월 ↔ 이지샵·나이스 카드결제 금액 일치 판단 결과
async function loadArCardAuto() {
  arState.cardAutoLoading = true;
  const res = await api('GET', '/api/ar/card-auto-match');
  arState.cardAutoLoading = false;
  if (res.ok) arState.cardAuto = { targets: res.targets, byCell: res.byCell };
  renderArVendorTable();
  if (arState.openCell && document.getElementById('ar-deposit-modal').style.display === 'flex') {
    showArDepositModal(...arState.openCell);
  }
}

// 현장 카드결제 후보(카드에만 있는 큰 결제) — 배지 건수 + 모달 목록
async function loadArCardCandidates() {
  const res = await api('GET', `/api/ar/card-candidates?min=${arState.cardMin}`);
  if (!res.ok) return;
  arState.cardCandidates = res.candidates;
  arState.cardMatched    = res.matched;
  const badge = document.getElementById('ar-card-badge');
  if (badge) {
    badge.textContent   = res.candidates.length;
    badge.style.display = res.candidates.length ? '' : 'none';
  }
}

function arNum(v) { return (v || 0).toLocaleString() + '원'; }

function renderArSummaryCards() {
  const box = document.getElementById('ar-summary-cards');
  if (!box) return;
  const totalCharge = arState.vendors.reduce((s, v) => s + v.totalCharge, 0);
  const totalPaid   = arState.vendors.reduce((s, v) => s + v.totalPaid, 0);
  const totalRemain = arState.vendors.reduce((s, v) => s + v.remaining, 0);
  const totalDisc   = arState.vendors.reduce((s, v) => s + (v.totalDiscount || 0), 0);

  const card = (label, val, color) => `
    <div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
      <div style="font-size:11px;color:#64748b;">${label}</div>
      <div style="font-size:14px;font-weight:700;${color ? `color:${color};` : ''}">${arNum(val)}</div>
    </div>`;

  const sumOf = k => arState.vendors.reduce((s, v) => s + (v[k] || 0), 0);
  box.innerHTML =
    card('총 거래대금', totalCharge) +
    card('총 입금액', totalPaid, '#0f766e') +
    (totalDisc ? card('할인 처리', totalDisc, '#64748b') : '') +
    card('미수 (입금 기한 지남)', sumOf('overdue'), sumOf('overdue') > 0 ? '#dc2626' : '#16a34a') +
    card('확인 필요', sumOf('review'), '#c2410c') +
    card('입금 대기 (기한 전)', sumOf('waiting'), '#2563eb') +
    card('카드 받음 체크 전', sumOf('cardWait'), '#be185d') +
    `<div style="flex:1;min-width:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
       <div style="font-size:11px;color:#64748b;">미매칭 입금</div>
       <div style="font-size:14px;font-weight:700;${arState.unmatched.length ? 'color:#d97706;' : ''}">${arState.unmatched.length}건</div>
     </div>`;
}

function renderArUnmatchedBadge() {
  const badge = document.getElementById('ar-unmatched-badge');
  if (!badge) return;
  if (arState.unmatched.length) {
    badge.textContent = arState.unmatched.length;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// 미수확인 표: 상단=월, 왼쪽=업체명. 칸에는 매출금액 + 완료/미수만 간단히 표시하고
// 부족·초과·입금내역·카드결제 확인은 칸을 눌러 상세 창에서 처리
// 서버 status: done 완료 | discount 할인 완료 | waiting 입금 대기(기한 전) | partial-wait 일부 입금(기한 전)
//   short 부족 | overdue 미수(기한 지남) | review 확인 필요(맞춰 볼 입금 있음) | card-wait 현장카드 받음 체크 전
const AR_STATUS_STYLE = {
  done:           { text: '완료',      color: '#16a34a', bg: '#f0fdf4' },
  discount:       { text: '할인 완료', color: '#16a34a', bg: '#f0fdf4' },
  waiting:        { text: '입금 대기', color: '#2563eb', bg: '#eff6ff' },
  'partial-wait': { text: '일부 입금', color: '#2563eb', bg: '#eff6ff' },
  review:         { text: '확인 필요', color: '#c2410c', bg: '#fff7ed' },
  short:          { text: '부족',      color: '#dc2626', bg: '#fef2f2' },
  overdue:        { text: '미수',      color: '#dc2626', bg: '#fef2f2' },
  'card-wait':    { text: '☐ 받음 체크', color: '#be185d', bg: '#fdf2f8' },
};

function arCellState(vendorName, m) {
  if (!m || !(m.charge > 0)) return null;
  if (m.remaining <= 0 || m.status === 'done' || m.status === 'discount') {
    const st = AR_STATUS_STYLE[m.status === 'discount' ? 'discount' : 'done'];
    return { key: 'done', ...st, text: m.manualPaidCard ? '☑ 받음' : st.text };
  }
  if (m.status === 'card-wait') return { key: 'card-wait', ...AR_STATUS_STYLE['card-wait'] };
  if (m.status === 'waiting' || m.status === 'partial-wait') return { key: m.status, ...AR_STATUS_STYLE[m.status] };
  if (m.status === 'review') return { key: 'review', ...AR_STATUS_STYLE.review };
  const keys = arState.cardAuto?.byCell?.[`${vendorName}|${m.month}`] || [];
  const ts = keys.map(k => arState.cardAuto.targets.find(t => t.key === k)).filter(Boolean);
  if (ts.some(t => t.status === 'match')) return { key: 'card', text: '카드일치', color: '#be185d', bg: '#fdf2f8' };
  // 유류만 매달 카드결제하는 업체: 유류는 들어왔고 유외상품(몇 달치 모아 결제)만 남은 달
  if (m.nonFuel > 0 && m.paid > 0 && m.remaining <= m.nonFuel) return { key: 'nonfuel', text: '유외 미수', color: '#b45309', bg: '#fffbeb' };
  if (ts.length) return { key: 'cand', text: '미수·카드후보', color: '#c2410c', bg: '#fff7ed' };
  return { key: 'due', ...(m.status === 'short' ? AR_STATUS_STYLE.short : AR_STATUS_STYLE.overdue) };
}

function renderArVendorTable() {
  const box = document.getElementById('ar-monthly-table');
  if (!box) return;

  if (!arState.vendors.length) {
    box.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px;">
      아직 외상 거래 데이터가 없습니다.</div>`;
    return;
  }

  // 최근 6개월만 펼치고 그 이전은 "이전 N개월" 한 칸(매출·미수 합계)으로 접음 — 좌우 스크롤 줄이기
  const allMonths = arState.months;
  const months = arState.showAllMonths ? allMonths : allMonths.slice(-AR_RECENT_MONTHS);
  const olderMonths = allMonths.slice(0, allMonths.length - months.length);
  const olderSum = v => {
    const list = v.months.filter(m => olderMonths.includes(m.month));
    return { charge: list.reduce((s, m) => s + (m.charge || 0), 0),
             due: list.reduce((s, m) => s + Math.max(0, m.remaining || 0), 0),
             dueCount: list.filter(m => m.remaining > 0).length };
  };
  const dir = arState.sortDir === 'asc' ? 1 : -1;
  const pf = arState.payFilter || 'all';
  const sorted = arState.vendors
    .filter(v => pf === 'all' || (pf === 'none' ? !v.payType : v.payType === pf))
    .sort((a, b) => {
      if (arState.sortField === 'name') return a.name.localeCompare(b.name, 'ko') * dir;
      return ((a.overdue + a.review) - (b.overdue + b.review) || a.remaining - b.remaining) * dir;
    });
  const pfCount = k => arState.vendors.filter(v => k === 'all' || (k === 'none' ? !v.payType : v.payType === k)).length;
  const pfBtn = (k, label) => `<button class="btn-filter${pf === k ? ' active' : ''}" onclick="setArPayFilter('${k}')">${label} ${pfCount(k)}</button>`;
  const cardTodo = arState.vendors.filter(v => v.payType === 'card' && v.cardWait > 0).length;
  const arrow = (field) => arState.sortField === field ? (arState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const monthLabel = ym => `${Number(ym.slice(5, 7))}월`;

  // 월별 합계 (매출 / 미수)
  const totals = {};
  months.forEach(m => { totals[m] = { charge: 0, due: 0 }; });
  arState.vendors.forEach(v => v.months.forEach(m => {
    if (!totals[m.month]) return;
    totals[m.month].charge += m.charge || 0;
    if (['overdue', 'short', 'review'].includes(m.status) && m.remaining > 0) totals[m.month].due += m.remaining;
  }));

  const cellBorder = 'border-left:1px solid #e2e8f0;';
  box.innerHTML = `
    <div class="ar-filter-bar">
      ${pfBtn('all', '전체')} ${pfBtn('bank', '통장 입금 업체')} ${pfBtn('card', '현장카드 업체')} ${pfBtn('other', '기타')} ${pfBtn('none', '결제방식 미정')}
      ${cardTodo ? `<span class="ar-card-todo">현장카드 업체 중 받음 체크 안 한 곳 ${cardTodo}</span>` : ''}
      <button class="btn-sm btn-primary" style="margin-left:auto;" onclick="openArReview()">🔎 업체별 점검</button>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#64748b;margin-bottom:6px;">
      <span><b style="color:#16a34a;">완료</b> 입금 완료</span>
      <span><b style="color:#2563eb;">입금 대기</b> 아직 입금 기한 전 (업체별 1~2개월 뒤 입금)</span>
      <span><b style="color:#dc2626;">미수·부족</b> 입금 기한이 지났는데 안 들어옴</span>
      <span><b style="color:#c2410c;">확인 필요</b> 맞춰 볼 입금이 있음 — 업체별 점검에서 확인</span>
      <span><b style="color:#be185d;">☐ 받음 체크</b> 현장카드 업체 — 칸을 누르면 받음 처리</span>
      <span><b style="color:#be185d;">카드일치</b> 이지샵·나이스에 같은 금액 카드결제 있음</span>
      <span><b style="color:#c2410c;">카드후보</b> 비슷한 금액 카드결제 있음</span>
      <span><b style="color:#b45309;">유외 미수</b> 유류는 입금, 유외상품만 남음</span>
      <span>· 칸을 누르면 입금 상세·확인 처리, 거래처명을 누르면 업체 정보</span>
      ${arState.cardAutoLoading ? '<span style="color:#94a3b8;">카드결제 대조 중…</span>' : ''}
      ${allMonths.length > AR_RECENT_MONTHS ? `<button class="btn-sm" style="margin-left:auto;" onclick="toggleArAllMonths()">${arState.showAllMonths ? `최근 ${AR_RECENT_MONTHS}개월만 보기` : `전체 ${allMonths.length}개월 펼치기`}</button>` : ''}
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;white-space:nowrap;">
      <thead>
        <tr style="background:#f1f5f9;position:sticky;top:0;z-index:2;">
          <th style="padding:8px 6px;text-align:left;position:sticky;left:0;background:#f1f5f9;z-index:3;cursor:pointer;user-select:none;"
              onclick="setArSort('name')" title="클릭하여 정렬">거래처명${arrow('name')}</th>
          ${olderMonths.length ? `<th style="padding:8px 6px;text-align:center;${cellBorder}cursor:pointer;background:#e2e8f0;" onclick="toggleArAllMonths()"
              title="${olderMonths.map(monthLabel).join(', ')} 합계 — 클릭하면 펼침">이전 ${olderMonths.length}개월 ▸</th>` : ''}
          ${months.map(m => `<th style="padding:8px 6px;text-align:center;${cellBorder}" title="${m}">${monthLabel(m)}</th>`).join('')}
          <th style="padding:8px 6px;text-align:right;${cellBorder}cursor:pointer;user-select:none;"
              onclick="setArSort('remaining')" title="클릭하여 정렬(기한 지난 미수 + 확인 필요 기준)">미수 (기한 지남)${arrow('remaining')}</th>
        </tr>
      </thead>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #94a3b8;position:sticky;bottom:0;">
          <td style="padding:6px;position:sticky;left:0;background:#f1f5f9;">합계</td>
          ${olderMonths.length ? (() => {
            const o = arState.vendors.reduce((acc, v) => { const x = olderSum(v); acc.charge += x.charge; acc.due += x.due; return acc; }, { charge: 0, due: 0 });
            return `<td style="padding:4px 6px;text-align:right;${cellBorder}background:#e2e8f0;">
              <div>${o.charge.toLocaleString()}</div>
              <div style="font-size:10px;font-weight:600;color:${o.due > 0 ? '#dc2626' : '#16a34a'};">${o.due > 0 ? '미수 ' + o.due.toLocaleString() : '완료'}</div>
            </td>`;
          })() : ''}
          ${months.map(m => `<td style="padding:4px 6px;text-align:right;${cellBorder}">
              <div>${totals[m].charge.toLocaleString()}</div>
              <div style="font-size:10px;font-weight:600;color:${totals[m].due > 0 ? '#dc2626' : '#16a34a'};">${totals[m].due > 0 ? '미수 ' + totals[m].due.toLocaleString() : '완료'}</div>
            </td>`).join('')}
          <td style="padding:4px 6px;text-align:right;color:#dc2626;${cellBorder}">${sorted.reduce((s, v) => s + (v.overdue || 0), 0).toLocaleString()}</td>
        </tr>
      </tfoot>
      <tbody>
        ${sorted.map(v => {
          const byMonth = {};
          v.months.forEach(m => byMonth[m.month] = m);
          const vName = esc(v.name).replace(/'/g, "\\'");   // onclick 인자용 (업체명에 ' 가 있어도 안전)
          // 업체 부가정보(입금계좌명·추적이전·초과·미확정·할인업체)는 업체 정보 창으로 이동 — 여기선 개수만 표시
          const infoCount = (v.aliases?.length ? 1 : 0) + (v.beforeTrackAmount > 0 ? 1 : 0) + (v.surplus > 0 ? 1 : 0)
                          + (v.unresolved?.length ? 1 : 0) + (v.discountSetting ? 1 : 0);
          const dueMonths = v.months.filter(m => m.remaining > 0).length;
          return `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px;position:sticky;left:0;background:#fff;cursor:pointer;" onclick="openArReview('${vName}')" title="클릭: 업체별 점검 (결제 특징·월별 대조)">
              ${v.payType === 'card' ? '<span class="ar-pay-tag card">카드</span>' : v.payType === 'other' ? '<span class="ar-pay-tag other">기타</span>' : !v.payType ? '<span class="ar-pay-tag none">미정</span>' : ''}
              <span style="text-decoration:underline dotted;">${esc(v.name)}</span>
              ${v.profileConfirmed ? '<span class="ar-confirmed" title="업체별 점검에서 확정">✓</span>' : ''}
              ${infoCount ? `<span style="font-size:10px;color:#64748b;background:#f1f5f9;border-radius:8px;padding:0 6px;margin-left:4px;">정보 ${infoCount}</span>` : ''}
              ${v.unresolved?.length ? '<span style="font-size:10px;color:#d97706;margin-left:2px;">⚠</span>' : ''}
            </td>
            ${olderMonths.length ? (() => {
              const o = olderSum(v);
              if (!o.charge && !o.due) return `<td style="text-align:center;color:#cbd5e1;${cellBorder}background:#f8fafc;">-</td>`;
              return `<td style="padding:4px 6px;text-align:right;${cellBorder}cursor:pointer;background:${o.due > 0 ? '#fef2f2' : '#f8fafc'};"
                          title="이전 달 합계 — 클릭하면 달별로 펼침" onclick="toggleArAllMonths()">
                  <div>${o.charge.toLocaleString()}</div>
                  <div style="font-size:10px;font-weight:700;color:${o.due > 0 ? '#dc2626' : '#16a34a'};">${o.due > 0 ? `미수 ${o.dueCount}개월` : '완료'}</div>
                </td>`;
            })() : ''}
            ${months.map(m => {
              const d = byMonth[m];
              const st = arCellState(v.name, d);
              if (!st) return `<td style="text-align:center;color:#cbd5e1;${cellBorder}">-</td>`;
              return `<td style="padding:4px 6px;text-align:right;${cellBorder}cursor:pointer;background:${st.bg};"
                          title="${v.payType === 'card' ? '클릭: 카드 받음 체크/해제' : '클릭: 입금 상세·확인 처리'}"
                          onclick="${v.payType === 'card' ? `toggleArCardReceived('${vName}','${m}')` : `showArDepositModal('${vName}','${m}')`}">
                  <div>${d.charge.toLocaleString()}</div>
                  <div style="font-size:10px;font-weight:700;color:${st.color};">${st.text}</div>
                </td>`;
            }).join('')}
            <td style="padding:4px 6px;text-align:right;${cellBorder}">
              ${v.overdue > 0 ? `<div style="color:#dc2626;font-weight:600;">${v.overdue.toLocaleString()}</div><div style="font-size:10px;color:#94a3b8;">${v.overdueMonths}개월 미수</div>` : ''}
              ${v.review > 0 ? `<div style="font-size:11px;color:#c2410c;">확인 필요 ${v.review.toLocaleString()}</div>` : ''}
              ${v.waiting > 0 ? `<div style="font-size:11px;color:#2563eb;">대기 ${v.waiting.toLocaleString()}</div>` : ''}
              ${v.cardWait > 0 ? `<div style="font-size:11px;color:#be185d;">카드 체크 전 ${v.cardWait.toLocaleString()}</div>` : ''}
              ${!(v.overdue > 0 || v.review > 0 || v.waiting > 0 || v.cardWait > 0) ? '<span class="badge badge-done">완납</span>' : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// 거래처명 클릭 → 업체 정보 창 (입금계좌명·추적이전·초과·월별 잔액·입금 충당 내역)
function showArVendorModal(name) {
  arState.expandedVendor = name;
  document.getElementById('ar-vendor-modal-title').textContent = `${name} — 업체 정보`;
  renderArVendorDetail();
  document.getElementById('ar-vendor-modal').style.display = 'flex';
}

function closeArVendorModal() {
  arState.expandedVendor = null;
  arState.splitFormFor = null;
  document.getElementById('ar-vendor-modal').style.display = 'none';
}

function toggleArVendorDetail(name) { showArVendorModal(name); }

function renderArVendorDetail() {
  const box = document.getElementById('ar-vendor-detail');
  if (!box) return;
  if (!arState.expandedVendor) { box.innerHTML = ''; return; }

  const v = arState.vendors.find(x => x.name === arState.expandedVendor);
  if (!v) { box.innerHTML = ''; return; }

  const monthRows = v.months.map(m => {
    // remaining: 0=일치, 양수=부족(달마다 그대로 표시, 다른달과 상계 안함), 음수=그 달만 초과입금
    const remColor = m.remaining === 0 ? '#16a34a' : (m.remaining > 0 ? '#dc2626' : '#0369a1');
    const remLabel = m.remaining === 0 ? '0원' : (m.remaining > 0 ? arNum(m.remaining) + ' 부족' : arNum(-m.remaining) + ' 초과');
    const cardBtn = m.manualPaidCard
      ? `<button style="font-size:10px;padding:1px 5px;margin-left:6px;color:#dc2626;" onclick="unmarkArPaidCard('${esc(v.name)}','${m.month}')">✕확인 처리 취소</button>`
      : m.remaining > 0 ? `<button style="font-size:10px;padding:1px 5px;margin-left:6px;" onclick="markArPaidCard('${esc(v.name)}','${m.month}')">입금 확인 처리</button>` : '';
    return `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:1px 6px;line-height:1.2;">${m.month}</td>
      <td style="padding:1px 6px;line-height:1.2;text-align:right;">${arNum(m.charge)}</td>
      <td style="padding:1px 6px;line-height:1.2;text-align:right;">${arNum(m.paid)}${m.lagMonths != null ? ` <span style="font-size:10px;color:#64748b;">(+${m.lagMonths}개월)</span>` : ''}</td>
      <td style="padding:1px 6px;line-height:1.2;text-align:right;color:${remColor};">${remLabel}${m.manualPaidCard ? ' <span class="badge badge-done" style="font-size:10px;">확인 처리</span>' : ''}</td>
      <td style="padding:1px 6px;line-height:1.2;">${cardBtn}</td>
    </tr>`;
  }).join('');

  const SOURCE_LABEL = {
    manual: '<span class="badge badge-done" style="font-size:10px;">수동</span>',
    note: '<span class="badge badge-ok" style="font-size:10px;">비고</span>',
    estimate: '<span class="badge badge-warn" style="font-size:10px;">추정</span>',
    unresolved: '<span class="badge badge-fail" style="font-size:10px;">미확정</span>',
    'before-track': '<span class="badge" style="font-size:10px;background:#e2e8f0;">추적이전</span>',
    card: '<span class="badge" style="font-size:10px;background:#fce7f3;color:#9d174d;">카드</span>',
  };
  const otherVendorOptions = arState.vendors
    .filter(x => x.name !== v.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');

  const allocRows = v.allocations.length
    ? v.allocations.map(a => {
        const splitBtn = a.source === 'card' ? ''   // 카드결제는 통장 입금이 아니라 분할 대상 아님 (카드 매칭 창에서 취소)
          : !a.isSplit
          ? `<button style="font-size:10px;padding:1px 5px;margin-left:4px;" onclick="toggleArSplitForm('${a.depositId}')">➕분할</button>`
          : `<button style="font-size:10px;padding:1px 5px;margin-left:4px;color:#dc2626;"
                     onclick="removeArSplit('${a.depositId}', ${a.splitIndex})">✕분할취소</button>`;
        const formRow = (arState.splitFormFor === a.depositId) ? `
          <tr style="background:#f8fafc;">
            <td colspan="5" style="padding:6px;">
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <span style="font-size:11px;color:#64748b;">이 입금(${arNum(a.amount)}) 중</span>
                <select id="ar-split-vendor" style="font-size:11px;padding:2px 4px;">
                  <option value="">-- 업체 선택 --</option>${otherVendorOptions}
                </select>
                <input type="number" id="ar-split-amount" placeholder="금액" style="font-size:11px;padding:2px 6px;width:100px;">
                <span style="font-size:11px;color:#64748b;">원은 그 업체 몫</span>
                <button style="font-size:11px;padding:2px 6px;" onclick="addArSplit('${a.depositId}')">확인</button>
                <button style="font-size:11px;padding:2px 6px;" onclick="toggleArSplitForm(null)">취소</button>
              </div>
            </td>
          </tr>` : '';
        return `<tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:4px 6px;white-space:nowrap;">${a.date}${a.isSplit ? ` <span style="font-size:10px;color:#7c3aed;">(분할${a.sourceFragment ? ': ' + esc(a.sourceFragment) : ''})</span>` : ''}</td>
          <td style="padding:4px 6px;text-align:right;">${arNum(a.amount)}</td>
          <td style="padding:4px 6px;">${a.appliedTo.map(x => `${x.month}(${arNum(x.amount)})`).join(', ') || '<span style="color:#94a3b8;">(미배정)</span>'}</td>
          <td style="padding:4px 6px;">${SOURCE_LABEL[a.source] || ''}</td>
          <td style="padding:4px 6px;color:#64748b;">${esc(a.note) || '-'}${splitBtn}</td>
        </tr>${formRow}`;
      }).join('')
    : `<tr><td colspan="5" style="padding:8px;text-align:center;color:#94a3b8;">매칭된 입금 내역이 없습니다.</td></tr>`;

  const aliasChips = (v.aliases || []).map(a => `
    <span style="display:inline-flex;align-items:center;gap:4px;background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 6px;font-size:11px;">
      ${esc(a)}
      <button style="border:none;background:none;color:#0369a1;cursor:pointer;font-size:10px;padding:0;"
              onclick="removeArAlias('${esc(v.name)}','${esc(a)}')">✕</button>
    </span>`).join('');

  box.innerHTML = `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">총 매출 <strong>${arNum(v.totalCharge)}</strong></div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">총 입금 <strong style="color:#0f766e;">${arNum(v.totalPaid)}</strong></div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">미수 잔액 <strong style="color:${v.remaining > 0 ? '#dc2626' : '#16a34a'};">${v.remaining > 0 ? arNum(v.remaining) : '완납'}</strong></div>
        ${v.surplus > 0 ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;">초과 입금 <strong style="color:#0369a1;">${arNum(v.surplus)}</strong></div>` : ''}
        ${v.beforeTrackAmount > 0 ? `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;" title="BOS 거래대금 자료가 없는 기간(추적 시작월 이전)의 입금이라 반영 안 됨">추적이전 입금 <strong>${arNum(v.beforeTrackAmount)}</strong> (${v.beforeTrackCount}건, 반영 제외)</div>` : ''}
        ${v.unresolved?.length ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;">대상월 미확정 입금 <strong style="color:#d97706;">${v.unresolved.length}건</strong></div>` : ''}
        ${v.discountSetting ? `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;">할인 입금 업체 (허용 ${arNum(v.discountSetting.maxDiff)})</div>` : ''}
      </div>

      <div style="font-size:11px;color:#64748b;margin:8px 0 4px;">입금계좌명(통장 적요와 업체명이 다를 때 등록)</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        ${aliasChips || '<span style="font-size:11px;color:#94a3b8;">등록된 입금계좌명 없음</span>'}
        <input type="text" id="ar-alias-input" placeholder="입금계좌명 입력"
               style="font-size:11px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:4px;width:120px;">
        <button style="font-size:11px;padding:2px 6px;" onclick="addArAlias('${esc(v.name)}')">추가</button>
      </div>

      <div style="font-size:11px;color:#64748b;margin:6px 0 4px;">할인 입금 업체 (거래명세서에서 직접 할인해 몇만원 적게 입금하는 업체 — 허용 차액 이내 부족분은 미수 대신 "할인"으로 처리)</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <label style="font-size:11px;display:flex;align-items:center;gap:4px;">
          <input type="checkbox" id="ar-disc-check" ${v.discountSetting ? 'checked' : ''}> 할인 입금 업체
        </label>
        <span style="font-size:11px;color:#64748b;">허용 차액</span>
        <input type="number" id="ar-disc-max" value="${v.discountSetting?.maxDiff || 100000}"
               style="font-size:11px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:4px;width:100px;">원
        <button style="font-size:11px;padding:2px 6px;" onclick="saveArDiscount('${esc(v.name)}')">저장</button>
        ${v.totalDiscount ? `<span style="font-size:11px;color:#64748b;">할인 처리 합계 ${arNum(v.totalDiscount)}</span>` : ''}
      </div>

      <div style="font-size:11px;color:#64748b;margin:6px 0 2px;">월별 미수 현황</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:8px;">
        <thead><tr style="color:#64748b;">
          <th style="padding:4px 6px;text-align:left;">월</th>
          <th style="padding:4px 6px;text-align:right;">거래대금</th>
          <th style="padding:4px 6px;text-align:right;">충당액</th>
          <th style="padding:4px 6px;text-align:right;">잔액</th>
          <th style="padding:4px 6px;"></th>
        </tr></thead>
        <tbody>${monthRows}</tbody>
      </table>

      <div style="font-size:11px;color:#64748b;margin:6px 0 2px;">입금 → 충당 내역 (몇월 거래대금이 들어왔는지)</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead><tr style="color:#64748b;">
          <th style="padding:4px 6px;text-align:left;">입금일</th>
          <th style="padding:4px 6px;text-align:right;">입금액</th>
          <th style="padding:4px 6px;text-align:left;">충당된 월</th>
          <th style="padding:4px 6px;text-align:left;">근거</th>
          <th style="padding:4px 6px;text-align:left;">비고(통장 원문)</th>
        </tr></thead>
        <tbody>${allocRows}</tbody>
      </table>
    </div>`;
}

// ── 할인 입금 업체 설정 ──────────────────────────────────────
async function saveArDiscount(vendorName) {
  const checked = document.getElementById('ar-disc-check')?.checked;
  const maxDiff = Number(document.getElementById('ar-disc-max')?.value) || 0;
  if (checked && !maxDiff) return toast('허용 차액을 입력하세요.', 'warn');
  const res = await api('POST', '/api/ar/discount-vendors', { vendorName, maxDiff: checked ? maxDiff : 0 });
  if (!res.ok) return toast(res.error || '저장 실패', 'error');
  toast(checked ? `${vendorName} 할인 입금 업체로 지정` : `${vendorName} 할인 입금 업체 해제`, 'success');
  await loadArSummary();
  renderArVendorDetail();
}

// ── 월별 입금 내역 모달 (표의 입금 칸 클릭) ────────────────────
// 그 업체의 그 달 매출에 충당된 입금(통장·카드·분할)을 입금일·입금자명과 함께 표시
const AR_SOURCE_TEXT = { manual: '수동 지정', note: '비고 월표기', estimate: '금액 추정', card: '현장 카드결제' };

function showArDepositModal(vendorName, month) {
  const v = arState.vendors.find(x => x.name === vendorName);
  if (!v) return;
  arState.openCell = [vendorName, month];
  const m = v.months.find(x => x.month === month) || { charge: 0, paid: 0, remaining: 0 };
  const rows = v.allocations
    .map(a => ({ a, part: a.appliedTo.find(x => x.month === month) }))
    .filter(x => x.part);

  const diffTxt = m.discount ? `<span style="color:#64748b;">할인 ${arNum(m.discount)} (완납 처리)</span>`
    : m.remaining > 0 ? `<span style="color:#dc2626;">부족 ${arNum(m.remaining)}</span>`
    : m.remaining < 0 ? `<span style="color:#0369a1;">초과 ${arNum(-m.remaining)}</span>`
    : '<span style="color:#16a34a;">일치</span>';

  document.getElementById('ar-deposit-title').textContent = `${vendorName} · ${Number(month.slice(5, 7))}월 입금 내역`;
  document.getElementById('ar-deposit-body').innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin-bottom:10px;">
      <div>매출 <strong>${arNum(m.charge)}</strong></div>
      <div>입금 <strong style="color:#0f766e;">${arNum(m.paid)}</strong></div>
      <div>${diffTxt}</div>
      ${m.nonFuel != null ? `<div style="color:#64748b;">유류 ${arNum(m.fuel)} · 유외상품 ${arNum(m.nonFuel)} <span style="font-size:11px;">(유외는 몇 달치 모아 결제)</span></div>` : ''}
      <div>${m.remaining > 0 ? '<span class="badge badge-fail">미수</span>' : '<span class="badge badge-done">완료</span>'}</div>
      ${m.manualPaidCard ? '<div><span class="badge badge-done">확인 처리됨</span></div>' : ''}
    </div>
    ${arMonthActionHtml(v, m, month)}
    ${rows.length ? `
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px;text-align:left;">입금일</th>
        <th style="padding:6px;text-align:left;">입금자명 (통장 적요)</th>
        <th style="padding:6px;text-align:right;">입금액</th>
        <th style="padding:6px;text-align:right;">이 달에 충당</th>
        <th style="padding:6px;text-align:left;">근거</th>
        <th style="padding:6px;text-align:left;">비고</th>
      </tr></thead>
      <tbody>${rows.map(({ a, part }) => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:6px;white-space:nowrap;">${a.date}</td>
          <td style="padding:6px;">${esc(a.payer || '-')}${a.isSplit ? ' <span style="font-size:10px;color:#7c3aed;">(분할)</span>' : ''}</td>
          <td style="padding:6px;text-align:right;white-space:nowrap;">${arNum(a.amount)}</td>
          <td style="padding:6px;text-align:right;white-space:nowrap;font-weight:600;">${arNum(part.amount)}</td>
          <td style="padding:6px;">${AR_SOURCE_TEXT[a.source] || a.source}</td>
          <td style="padding:6px;color:#64748b;">${esc(a.note || '-')}${a.appliedTo.length > 1 ? `<br><span style="font-size:10px;">여러 달 충당: ${a.appliedTo.map(x => `${Number(x.month.slice(5, 7))}월 ${arNum(x.amount)}`).join(', ')}</span>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>`
    : '<div style="padding:16px;text-align:center;color:#94a3b8;">이 달 매출에 매칭된 입금이 없습니다.</div>'}`;
  document.getElementById('ar-deposit-modal').style.display = 'flex';
}

// 월 상세 창 위쪽: 카드결제 일치 확인 + 입금 확인 처리 버튼
function arMonthActionHtml(v, m, month) {
  const jsArg = x => esc(x).replace(/'/g, "\\'");
  const keys = arState.cardAuto?.byCell?.[`${v.name}|${month}`] || [];
  const targets = (m.remaining > 0 ? keys.map(k => arState.cardAuto.targets.find(t => t.key === k)).filter(Boolean) : [])
    .sort((a, b) => (a.status === 'match' ? 0 : 1) - (b.status === 'match' ? 0 : 1));   // 일치 먼저

  const cardHtml = targets.map(t => `
    <div style="border:1px solid ${t.status === 'match' ? '#f9a8d4' : '#fed7aa'};background:${t.status === 'match' ? '#fdf2f8' : '#fff7ed'};border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:4px;">${t.status === 'match' ? '💳 카드결제 금액 일치' : '💳 비슷한 금액 카드결제 (확인 필요)'}
        <span style="font-weight:400;color:#64748b;">— ${esc(t.label)} ${arNum(t.amount)}</span></div>
      ${t.parts.length > 1 ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px;">${t.parts.map(p => `${esc(p.vendorName)} ${arNum(p.assign.reduce((s, x) => s + x.amount, 0))}`).join(' + ')}</div>` : ''}
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        ${t.options.map((o, i) => `<tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:4px;white-space:nowrap;">${o.date}</td>
          <td style="padding:4px;">${o.cards.map(c => `${esc(c.source || '')} ${esc(c.cardCompany)} <code style="font-size:10px;">${esc(c.cardNo)}</code> ${arNum(c.amount)}`).join('<br>')}</td>
          <td style="padding:4px;text-align:right;white-space:nowrap;">${o.cards.length > 1 ? '합계 ' : ''}<b>${arNum(o.amount)}</b>
            ${o.diff ? `<br><span style="font-size:10px;color:${Math.abs(o.diff) <= 100 ? '#64748b' : '#c2410c'};">차이 ${o.diff > 0 ? '+' : ''}${o.diff.toLocaleString()}</span>` : ''}</td>
          <td style="padding:4px;text-align:right;"><button class="btn-primary" style="font-size:11px;padding:3px 8px;"
              onclick="confirmArCardAuto('${jsArg(t.key)}', ${i})">이 카드결제로 확인</button></td>
        </tr>`).join('')}
      </table>
    </div>`).join('');

  // 이미 카드결제로 확인한 건 (이 업체·이 달에 배분된 것)
  const confirmed = (arState.cardMatched || []).filter(c => c.vendorName === v.name &&
    (c.assign || [{ month: c.month }]).some(x => x.month === month));
  const confirmedHtml = confirmed.length ? `
    <div style="font-size:12px;margin-bottom:8px;">${confirmed.map(c => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:2px;">💳 ${c.date} ${esc(c.cardCompany || '')} ${c.cardAmount ? `카드 ${arNum(c.cardAmount)} 중 ${arNum(c.amount)} 반영 (차액 ${arNum(c.selfHandled)} 자체 입금처리)` : arNum(c.amount)} — 카드결제로 확인됨
        <button style="font-size:10px;padding:1px 6px;color:#dc2626;" onclick="cancelArCardAuto('${jsArg(c.matchKey || '')}','${jsArg(c.id)}')">취소</button></div>`).join('')}
    </div>` : '';

  const btn = m.manualPaidCard
    ? `<button style="font-size:12px;padding:4px 10px;color:#dc2626;" onclick="unmarkArPaidCard('${jsArg(v.name)}','${month}')">✕ 확인 처리 취소</button>`
    : m.remaining > 0
      ? `<button class="btn-primary" style="font-size:12px;padding:4px 10px;" onclick="markArPaidCard('${jsArg(v.name)}','${month}')">✔ 입금 확인 처리 (미수 → 완료)</button>
         <span style="font-size:11px;color:#64748b;">통장·카드 내역으로 안 잡히지만 받은 게 확실할 때</span>`
      : '';
  return `${cardHtml}${confirmedHtml}${btn ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">${btn}</div>` : ''}`;
}

async function confirmArCardAuto(key, optionIndex) {
  const res = await api('POST', '/api/ar/card-auto-match/confirm', { key, optionIndex });
  if (!res.ok) return toast(res.error || '처리 실패', 'error');
  toast('카드결제로 입금 확인 처리했습니다.', 'success');
  await loadArSummary();
}

async function cancelArCardAuto(matchKey, id) {
  const res = await api('DELETE', '/api/ar/card-payments', matchKey ? { matchKey } : { id });
  if (!res.ok) return toast(res.error || '취소 실패', 'error');
  await loadArSummary();
}

// ── 현장 카드결제 매칭 모달 ───────────────────────────────────
async function showArCardModal() {
  await loadArCardCandidates();
  renderArCardModalBody();
  document.getElementById('ar-card-modal').style.display = 'flex';
}

async function setArCardMin(v) {
  arState.cardMin = Number(v) || 300000;
  await loadArCardCandidates();
  renderArCardModalBody();
}

function renderArCardModalBody() {
  const body = document.getElementById('ar-card-body');
  const vendorOptions = sel => arState.vendors
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(v => `<option value="${esc(v.name)}" ${v.name === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const monthOptions = sel => arState.months
    .map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${Number(m.slice(5, 7))}월 (${m.slice(0, 4)})</option>`).join('');

  const candRows = arState.cardCandidates.map((c, i) => {
    const s = c.suggestion;
    return `<tr style="border-bottom:1px solid #f1f5f9;${s ? 'background:#f0fdf4;' : ''}">
      <td style="padding:6px;white-space:nowrap;">${c.date}<br><span style="font-size:10px;color:#94a3b8;">${esc(c.transTime)}</span></td>
      <td style="padding:6px;white-space:nowrap;">${esc(c.cardCompany)}<br><code style="font-size:10px;">${esc(c.cardNo)}</code></td>
      <td style="padding:6px;text-align:right;font-weight:600;white-space:nowrap;">${arNum(c.amount)}</td>
      <td style="padding:6px;font-size:11px;">${s ? `<span style="color:#15803d;">${esc(s.vendorName)} ${Number(s.month.slice(5, 7))}월</span><br><span style="color:#64748b;">(${esc(s.reason)})</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
      <td style="padding:6px;">
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <select id="ar-card-v-${i}" style="font-size:11px;padding:2px 4px;max-width:170px;"><option value="">-- 업체 --</option>${vendorOptions(s?.vendorName)}</select>
          <select id="ar-card-m-${i}" style="font-size:11px;padding:2px 4px;"><option value="">-- 월 --</option>${monthOptions(s?.month)}</select>
          <button style="font-size:11px;padding:2px 8px;" onclick="confirmArCard(${i})">확정</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const matchedRows = arState.cardMatched.map(c => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px;white-space:nowrap;">${c.date}</td>
      <td style="padding:6px;white-space:nowrap;">${esc(c.cardCompany || '')} <code style="font-size:10px;">${esc(c.cardNo || '')}</code></td>
      <td style="padding:6px;text-align:right;">${arNum(c.amount)}</td>
      <td style="padding:6px;">${esc(c.vendorName)} · ${Number(c.month.slice(5, 7))}월</td>
      <td style="padding:6px;"><button style="font-size:11px;padding:2px 6px;color:#dc2626;" onclick="removeArCard('${esc(c.id)}')">취소</button></td>
    </tr>`).join('');

  body.innerHTML = `
    <div style="font-size:12px;color:#475569;margin-bottom:8px;line-height:1.7;">
      일마감 카드 대사에서 <strong>BOS에는 없고 카드(이지샵·나이스)에만 있는 결제</strong> 중
      <input type="number" value="${arState.cardMin}" onchange="setArCardMin(this.value)" style="width:90px;font-size:11px;padding:2px 6px;">원 이상입니다.
      외상대금을 현장에서 카드로 받은 건을 업체·대상 월에 지정하면 그 달 입금으로 반영됩니다.
      <br><span style="color:#15803d;">초록색</span> = 추천 (외상 월 매출과 금액 일치 또는 예전에 같은 카드로 매칭한 업체). 카드 데이터는 일마감 카드 업로드가 시작된 5월부터 있습니다.
    </div>
    <p style="font-weight:700;margin:8px 0 4px;">매칭 대기 ${arState.cardCandidates.length}건</p>
    ${arState.cardCandidates.length ? `
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px;text-align:left;">결제일</th><th style="padding:6px;text-align:left;">카드</th>
        <th style="padding:6px;text-align:right;">금액</th><th style="padding:6px;text-align:left;">추천</th>
        <th style="padding:6px;text-align:left;">업체 · 대상 월 지정</th>
      </tr></thead>
      <tbody>${candRows}</tbody>
    </table>` : '<div style="padding:12px;color:#94a3b8;">매칭할 카드결제가 없습니다.</div>'}
    <p style="font-weight:700;margin:16px 0 4px;">매칭 완료 ${arState.cardMatched.length}건</p>
    ${arState.cardMatched.length ? `
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px;text-align:left;">결제일</th><th style="padding:6px;text-align:left;">카드</th>
        <th style="padding:6px;text-align:right;">금액</th><th style="padding:6px;text-align:left;">업체 · 월</th><th></th>
      </tr></thead>
      <tbody>${matchedRows}</tbody>
    </table>` : '<div style="padding:12px;color:#94a3b8;">아직 없음</div>'}`;
}

async function confirmArCard(idx) {
  const c = arState.cardCandidates[idx];
  const vendorName = document.getElementById(`ar-card-v-${idx}`)?.value;
  const month      = document.getElementById(`ar-card-m-${idx}`)?.value;
  if (!vendorName || !month) return toast('업체와 대상 월을 선택하세요.', 'warn');
  const res = await api('POST', '/api/ar/card-payments', { ...c, vendorName, month });
  if (!res.ok) return toast(res.error || '매칭 실패', 'error');
  toast(`${vendorName} ${Number(month.slice(5, 7))}월 입금으로 반영`, 'success');
  await loadArSummary();
  renderArCardModalBody();
}

async function removeArCard(id) {
  const res = await api('DELETE', '/api/ar/card-payments', { id });
  if (!res.ok) return toast(res.error || '취소 실패', 'error');
  await loadArSummary();
  renderArCardModalBody();
}

// ── 입금 분할(다른 업체 몫 떼어내기) ──────────────────────────
function toggleArSplitForm(depositId) {
  arState.splitFormFor = (arState.splitFormFor === depositId) ? null : depositId;
  renderArVendorDetail();
}

async function addArSplit(depositId) {
  const vendorName = document.getElementById('ar-split-vendor')?.value;
  const amount = Number(document.getElementById('ar-split-amount')?.value) || 0;
  if (!vendorName) return toast('업체를 선택하세요.', 'warn');
  if (!amount) return toast('금액을 입력하세요.', 'warn');
  const res = await api('POST', '/api/ar/split', { depositId, vendorName, amount });
  if (!res.ok) return toast(res.error || '분할 등록 실패', 'error');
  toast('분할 등록 완료', 'success');
  arState.splitFormFor = null;
  await loadArSummary();
  renderArVendorDetail();
}

async function removeArSplit(depositId, splitIndex) {
  const res = await api('DELETE', '/api/ar/split', { depositId, splitIndex });
  if (!res.ok) return toast(res.error || '분할 삭제 실패', 'error');
  toast('분할 삭제 완료', 'success');
  await loadArSummary();
  renderArVendorDetail();
}

// ── 미매칭 입금 모달 (수동 지정) ──────────────────────────────
function showArUnmatchedModal() {
  renderArUnmatchedModalBody();
  document.getElementById('ar-unmatched-modal').style.display = 'flex';
}

function renderArUnmatchedModalBody() {
  const body = document.getElementById('ar-unmatched-body');
  const vendorOptions = arState.vendors
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(v => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('');

  if (!arState.unmatched.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;">미매칭 입금이 없습니다.</div>`;
    return;
  }

  body.innerHTML = `
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px;text-align:left;">입금일</th>
          <th style="padding:6px;text-align:left;">통장 적요(입금자명)</th>
          <th style="padding:6px;text-align:right;">금액</th>
          <th style="padding:6px;text-align:left;">업체 지정</th>
        </tr>
      </thead>
      <tbody>
        ${arState.unmatched.map(u => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px;white-space:nowrap;">${u.date}</td>
            <td style="padding:6px;">${esc(u.payer)}</td>
            <td style="padding:6px;text-align:right;white-space:nowrap;">${arNum(u.amount)}</td>
            <td style="padding:6px;">
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                ${u.suggestion ? `<button style="font-size:11px;padding:2px 6px;"
                    onclick="confirmArMatch('${u.id}','${esc(u.suggestion.name)}')">
                    ${esc(u.suggestion.name)}? (${Math.round(u.suggestion.score * 100)}%) 확정</button>` : ''}
                <select style="font-size:11px;padding:2px 4px;" id="ar-sel-${u.id}">
                  <option value="">-- 업체 선택 --</option>
                  ${vendorOptions}
                </select>
                <button style="font-size:11px;padding:2px 6px;"
                        onclick="confirmArMatch('${u.id}', document.getElementById('ar-sel-${u.id}').value)">지정</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function confirmArMatch(depositId, vendorName) {
  if (!vendorName) return toast('업체를 선택하세요.', 'warn');
  const res = await api('POST', '/api/ar/match', { depositId, vendorName });
  if (!res.ok) return toast(res.error || '매칭 실패', 'error');
  toast(`${vendorName}로 매칭 완료`, 'success');
  await loadArSummary();
  renderArUnmatchedModalBody();
}

// ── 카드결제 등 은행입금 매칭 대상이 없는 업체의 월별 완납 수동 확정 ──
async function markArPaidCard(vendorName, month) {
  const res = await api('POST', '/api/ar/mark-paid', { vendorName, month, note: '확인처리' });
  if (!res.ok) return toast(res.error || '처리 실패', 'error');
  toast(`${vendorName} ${Number(month.slice(5, 7))}월 입금 확인 처리`, 'success');
  await loadArSummary();
  renderArVendorDetail();
  if (arState.openCell && document.getElementById('ar-deposit-modal').style.display === 'flex') showArDepositModal(...arState.openCell);
}

async function unmarkArPaidCard(vendorName, month) {
  const res = await api('DELETE', '/api/ar/mark-paid', { vendorName, month });
  if (!res.ok) return toast(res.error || '취소 실패', 'error');
  await loadArSummary();
  renderArVendorDetail();
  if (arState.openCell && document.getElementById('ar-deposit-modal').style.display === 'flex') showArDepositModal(...arState.openCell);
}

// ── 미확정 배분(자동판별 실패 건) 수동 확정 모달 ──────────────────
function renderArUnresolvedBadge() {
  const badge = document.getElementById('ar-unresolved-badge');
  if (!badge) return;
  if (arState.unresolvedAllocations.length) {
    badge.textContent = arState.unresolvedAllocations.length;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function showArUnresolvedModal() {
  renderArUnresolvedModalBody();
  document.getElementById('ar-unresolved-modal').style.display = 'flex';
}

function arUnresolvedTargetKey(u) {
  return u.isSplit ? `${u.depositId}__split${u.splitIndex}` : `${u.depositId}__primary`;
}

function renderArUnresolvedModalBody() {
  const body = document.getElementById('ar-unresolved-body');
  if (!body) return;

  if (!arState.unresolvedAllocations.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;">미확정 배분이 없습니다.</div>`;
    return;
  }

  body.innerHTML = arState.unresolvedAllocations.map(u => {
    const key = arUnresolvedTargetKey(u);
    const vendor = arState.vendors.find(v => v.name === u.vendorName);
    const months = vendor ? vendor.months : [];
    const suggestedMap = new Map((u.suggestedWindow || []).map(a => [a.month, a.amount]));
    const monthRows = months.map(m => {
      const suggestedAmt = suggestedMap.get(m.month);
      const checked = suggestedAmt != null ? 'checked' : '';
      const amtVal = suggestedAmt != null ? suggestedAmt : (m.remaining > 0 ? m.remaining : '');
      return `
        <label style="display:flex;align-items:center;gap:4px;padding:2px 0;">
          <input type="checkbox" id="ar-unres-chk-${key}-${m.month}" ${checked}
                 onchange="document.getElementById('ar-unres-amt-${key}-${m.month}').disabled = !this.checked;">
          <span style="width:64px;display:inline-block;">${m.month}</span>
          <span style="font-size:10px;color:#94a3b8;">(거래 ${arNum(m.charge)} / 잔액 ${arNum(m.remaining)})</span>
          <input type="number" id="ar-unres-amt-${key}-${m.month}" value="${amtVal}"
                 ${checked ? '' : 'disabled'} style="font-size:11px;padding:1px 4px;width:100px;margin-left:auto;">
        </label>`;
    }).join('');

    return `
      <div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <div><b>${esc(u.vendorName)}</b>${u.isSplit ? ` <span style="color:#7c3aed;">(분할${u.sourceFragment ? ': ' + esc(u.sourceFragment) : ''})</span>` : ''}</div>
          <div>${u.date} / ${arNum(u.amount)}원</div>
        </div>
        ${u.note ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px;">비고: ${esc(u.note)}</div>` : ''}
        <div style="max-height:160px;overflow-y:auto;font-size:12px;">${monthRows || '<span style="color:#94a3b8;">해당 업체의 거래월 데이터가 없습니다.</span>'}</div>
        <div style="text-align:right;margin-top:6px;">
          <button style="font-size:11px;padding:2px 8px;" onclick="confirmArUnresolvedAllocation('${key}', '${u.depositId}', ${u.isSplit ? u.splitIndex : 'null'}, ${JSON.stringify(months.map(m => m.month)).replace(/"/g, '&quot;')})">확정</button>
        </div>
      </div>`;
  }).join('');
}

async function confirmArUnresolvedAllocation(key, depositId, splitIndex, monthList) {
  const monthAssign = [];
  monthList.forEach(month => {
    const chk = document.getElementById(`ar-unres-chk-${key}-${month}`);
    if (!chk || !chk.checked) return;
    const amt = Number(document.getElementById(`ar-unres-amt-${key}-${month}`)?.value) || 0;
    if (amt > 0) monthAssign.push({ month, amount: amt });
  });
  if (!monthAssign.length) return toast('배정할 월과 금액을 선택하세요.', 'warn');

  const target = (splitIndex == null) ? 'primary' : { splitIndex };
  const res = await api('POST', '/api/ar/resolve-allocation', { depositId, target, monthAssign });
  if (!res.ok) return toast(res.error || '확정 실패', 'error');
  toast('배분 확정 완료', 'success');
  await loadArSummary();
  renderArUnresolvedModalBody();
}

// ── 업체명 옆 입금계좌명(별칭) 등록/삭제 ────────────────────────
async function addArAlias(vendorName) {
  const input = document.getElementById('ar-alias-input');
  const alias = input?.value.trim();
  if (!alias) return toast('입금계좌명을 입력하세요.', 'warn');
  const res = await api('POST', '/api/ar/aliases', { vendorName, alias });
  if (!res.ok) return toast(res.error || '등록 실패', 'error');
  toast('입금계좌명 등록 완료 (다음 업로드부터 자동매칭됩니다)', 'success');
  await loadArSummary();
  renderArVendorDetail();
}

async function removeArAlias(vendorName, alias) {
  const res = await api('DELETE', '/api/ar/aliases', { vendorName, alias });
  if (!res.ok) return toast(res.error || '삭제 실패', 'error');
  await loadArSummary();
  renderArVendorDetail();
}

// ── 자산현황 ─────────────────────────────────────────────────
const assetState = { months: [], rows: [], loans: [], bankBalances: [], editingBankMonth: null };

async function loadAssetOverview() {
  const res = await api('GET', '/api/asset-overview');
  if (!res.ok) { toast(res.error || '자산현황 조회 실패', 'error'); return; }
  assetState.months       = res.months;
  assetState.rows         = res.rows;
  assetState.loans        = res.loans;
  assetState.bankBalances = res.bankBalances;
  renderAssetLoans();
  renderAssetTable();
}

function renderAssetLoans() {
  const tbody = document.getElementById('asset-loan-tbody');
  const totalEl = document.getElementById('asset-loan-total');
  if (!tbody) return;
  const total = assetState.loans.reduce((s, l) => s + (l.amount || 0), 0);
  if (totalEl) totalEl.textContent = `대출총액 ${arNum(total)}`;

  tbody.innerHTML = assetState.loans.length ? assetState.loans.map(l => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px;">${esc(l.name)}</td>
      <td style="padding:6px;text-align:right;">${arNum(l.amount)}</td>
      <td style="padding:6px;text-align:right;">${l.interestRate ? l.interestRate + '%' : '-'}</td>
      <td style="padding:6px;color:#64748b;">${esc(l.memo) || '-'}</td>
      <td style="padding:6px;text-align:center;">
        <button style="font-size:11px;padding:2px 6px;color:#dc2626;" onclick="deleteLoan('${l.id}')">삭제</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;">등록된 대출이 없습니다.</td></tr>`;
}

async function addLoan() {
  const name = document.getElementById('asset-loan-name')?.value.trim();
  const amount = Number(document.getElementById('asset-loan-amount')?.value) || 0;
  const interestRate = Number(document.getElementById('asset-loan-rate')?.value) || 0;
  const memo = document.getElementById('asset-loan-memo')?.value.trim() || '';
  if (!name) return toast('대출명을 입력하세요.', 'warn');
  if (!amount) return toast('금액을 입력하세요.', 'warn');
  const res = await api('POST', '/api/asset/loans', { name, amount, interestRate, memo });
  if (!res.ok) return toast(res.error || '대출 등록 실패', 'error');
  toast('대출 등록 완료', 'success');
  ['asset-loan-name', 'asset-loan-amount', 'asset-loan-rate', 'asset-loan-memo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  await loadAssetOverview();
}

async function deleteLoan(id) {
  const res = await api('DELETE', `/api/asset/loans/${id}`);
  if (!res.ok) return toast(res.error || '삭제 실패', 'error');
  await loadAssetOverview();
}

function renderAssetTable() {
  const tbody = document.getElementById('asset-table-tbody');
  if (!tbody) return;
  if (!assetState.rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8;">일마감 데이터가 없습니다.</td></tr>`;
    return;
  }
  // 최신 달이 위로 오도록 역순 표시
  const rows = assetState.rows.slice().reverse();
  tbody.innerHTML = rows.map(r => {
    const editing = assetState.editingBankMonth === r.month;
    const bankCell = editing ? `
      <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;">
        <input type="date" id="asset-bank-date-${r.month}" value="${r.bankDate || `${r.month}-01`}" style="font-size:11px;padding:2px 4px;width:120px;">
        <input type="number" id="asset-bank-amount-${r.month}" value="${r.bankAmount || ''}" placeholder="금액" style="font-size:11px;padding:2px 4px;width:100px;">
        <button style="font-size:11px;padding:2px 6px;" onclick="saveBankBalance('${r.month}')">저장</button>
        <button style="font-size:11px;padding:2px 6px;" onclick="toggleBankEdit(null)">취소</button>
      </div>` : `
      <span style="cursor:pointer;" onclick="toggleBankEdit('${r.month}')" title="클릭해서 수정">
        ${r.bankDate ? arNum(r.bankAmount) : '<span style="color:#94a3b8;">입력 필요</span>'}
        ${r.bankCarried ? `<span style="font-size:10px;color:#94a3b8;"> (${r.bankDate} 이월)</span>` : ''}
        ✏️
      </span>`;
    const netColor = r.netWorth >= 0 ? '#0f172a' : '#dc2626';
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px;font-weight:600;">${r.month}</td>
      <td style="padding:6px;text-align:right;">${bankCell}</td>
      <td style="padding:6px;text-align:right;">${arNum(r.inventoryValue)}</td>
      <td style="padding:6px;text-align:right;">${arNum(r.receivableValue)}</td>
      <td style="padding:6px;text-align:right;">${arNum(r.loanTotal)}</td>
      <td style="padding:6px;text-align:right;font-weight:700;color:${netColor};">${arNum(r.netWorth)}</td>
    </tr>`;
  }).join('');
}

function toggleBankEdit(month) {
  assetState.editingBankMonth = month;
  renderAssetTable();
}

async function saveBankBalance(month) {
  const date = document.getElementById(`asset-bank-date-${month}`)?.value;
  const amount = Number(document.getElementById(`asset-bank-amount-${month}`)?.value);
  if (!date) return toast('기준일을 입력하세요.', 'warn');
  if (!amount && amount !== 0) return toast('금액을 입력하세요.', 'warn');
  const res = await api('POST', '/api/asset/bank-balance', { date, amount });
  if (!res.ok) return toast(res.error || '저장 실패', 'error');
  toast('통장금액 저장 완료', 'success');
  assetState.editingBankMonth = null;
  await loadAssetOverview();
}

// ── 업체별 결제주기 설정 ──────────────────────────────────────

// ── 부가세 신고 (분기별 예상 세액) ─────────────────────────────
// 서버 lib/vatCalculator.js 계산 결과를 표시. 기타 매입·실제 신고값·면세 고객은 data/vat_settings.json
const vatState = { year: null, quarter: null, data: null };
const vatN = v => Math.round(v || 0).toLocaleString();
const vatSigned = v => `${v > 0 ? '+' : ''}${vatN(v)}`;

function initVatPeriod() {
  // 기본: 방금 끝난 분기 (신고 준비 대상)
  const now = new Date();
  let q = Math.floor(now.getMonth() / 3), y = now.getFullYear();
  if (q === 0) { q = 4; y -= 1; }
  vatState.year = y; vatState.quarter = q;
  const sel = document.getElementById('vat-year');
  sel.innerHTML = [now.getFullYear() - 1, now.getFullYear()].map(v => `<option value="${v}">${v}년</option>`).join('');
  sel.value = y;
}

function renderVatQuarterChips() {
  const box = document.getElementById('vat-quarters');
  box.innerHTML = [1, 2, 3, 4].map(q => {
    const on = q === vatState.quarter;
    return `<button class="btn-filter${on ? ' active' : ''}"
      onclick="vatState.quarter=${q}; loadVat()">${q}분기 <span style="opacity:.75">${q % 2 ? '예정' : '확정'}</span></button>`;
  }).join('');
}

async function loadVat() {
  if (!vatState.year) initVatPeriod();
  renderVatQuarterChips();
  const body = document.getElementById('vat-body');
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;">계산 중…</div>';
  const res = await api('GET', `/api/vat/summary?year=${vatState.year}&quarter=${vatState.quarter}`);
  if (!res.ok) { body.innerHTML = `<div class="notice notice-warn">${esc(res.error || '조회 실패')}</div>`; return; }
  vatState.data = res;
  renderVat(res);
}

function vatKpi(label, value, sub, color) {
  return `<div class="summary-kpi-card" style="border-top-color:${color};">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" style="color:${color};">${value}</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px;">${sub}</div></div>`;
}

function renderVat(d) {
  const p = d.period;
  const th = 'padding:6px 8px;background:#f1f5f9;font-weight:600;';
  const td = 'padding:6px 8px;border-bottom:1px solid #f1f5f9;';
  const r = 'text-align:right;';
  const dday = p.dDay > 0 ? `D-${p.dDay}` : p.dDay === 0 ? 'D-Day' : `기한 지남 (${-p.dDay}일)`;
  const payColor = d.payable > 0 ? '#dc2626' : '#2563eb';

  // KPI
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
    ${vatKpi('매출세액', vatN(d.outputTax) + '원', `과세표준 ${vatN(d.sales.supply)}원`, '#0f766e')}
    ${vatKpi('매입세액 (공제)', vatN(d.inputTax) + '원', `매입 공급가액 ${vatN(d.purchase.supply)}원`, '#7c3aed')}
    ${vatKpi(d.payable >= 0 ? '납부 예상세액' : '환급 예상세액', vatN(Math.abs(d.payable)) + '원', '매출세액 − 매입세액 − 공제', payColor)}
    ${vatKpi(`신고기한 · ${p.type}신고`, p.dueDate, `${dday} · 자료 ${p.days}/${p.expectedDays}일${p.lastDataDate ? ` (~${p.lastDataDate.slice(5)})` : ''}`, '#475569')}
  </div>`;

  // 경고
  if (d.warnings.length) {
    html += `<div class="notice notice-warn" style="margin-bottom:16px;line-height:1.8;">
      ${d.warnings.map(w => `⚠ ${esc(w)}`).join('<br>')}
      ${d.sales.taxFreeCandidates.map(n => `<br><button class="btn-sm" style="padding:2px 10px;font-size:11px;margin-top:4px;"
        onclick="vatSetTaxFree(decodeURIComponent('${encodeURIComponent(n)}'), true)">"${esc(n)}" 면세로 지정</button>`).join('')}
    </div>`;
  }

  // ① 매출
  const lines = d.sales.lines;
  html += `<div class="card"><div class="card-header"><h2>① 매출 — ${esc(p.label)}</h2>
      <span style="font-size:12px;color:#64748b;">판매금액은 부가세 포함, 공급가액 = 금액 ÷ 1.1</span></div>
    <div style="padding:12px 16px;overflow-x:auto;">
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr><th style="${th}text-align:left;">구분</th><th style="${th}${r}">판매금액</th><th style="${th}${r}">공급가액</th>
        <th style="${th}${r}">세액</th><th style="${th}text-align:left;">근거</th></tr></thead><tbody>
      ${lines.map(l => `<tr><td style="${td}">${esc(l.label)}</td><td style="${td}${r}">${vatN(l.amount)}</td>
        <td style="${td}${r}">${vatN(l.supply)}</td><td style="${td}${r}">${vatN(l.tax)}</td>
        <td style="${td}font-size:11px;color:#64748b;">${esc(l.basis)}</td></tr>`).join('')}
      ${d.sales.taxFree ? `<tr><td style="${td}">면세 매출 (과세표준 제외)</td><td style="${td}${r}">${vatN(d.sales.taxFree)}</td>
        <td style="${td}${r}">-</td><td style="${td}${r}">-</td><td style="${td}font-size:11px;color:#64748b;">${esc(Object.keys(d.sales.taxFreeCustomers).join(', '))}</td></tr>` : ''}
      <tr style="font-weight:700;background:#f8fafc;"><td style="${td}">과세 매출 합계</td><td style="${td}${r}">${vatN(d.sales.taxable)}</td>
        <td style="${td}${r}">${vatN(d.sales.supply)}</td><td style="${td}${r}">${vatN(d.outputTax)}</td><td style="${td}"></td></tr>
    </tbody></table>

    <div style="margin-top:14px;font-weight:600;font-size:13px;">월별 판매 (BOS)</div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:6px;">
      <thead><tr>${['월', '자료일수', '유류', '세차', '유외상품', '합계', '신용카드', '현금', '외상', '기타 결제']
        .map((h, i) => `<th style="${th}${i > 0 ? r : ''}">${h}</th>`).join('')}</tr></thead><tbody>
      ${d.sales.byMonth.map(m => `<tr>${[m.month, m.days, m.fuel, m.carwash, m.others, m.total, m.card, m.cash, m.credit, m.gift]
        .map((v, i) => `<td style="${td}${i > 0 ? r : ''}${i === 5 ? 'font-weight:600;' : ''}">${i === 0 ? v : vatN(v)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>

    <details style="margin-top:12px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">
      세금계산서 발급 대상 ${d.sales.invoiceCustomers.length}곳 · 사업자번호 미등록 ${d.sales.noBizCustomers.length}곳 (홈택스 발급 목록과 대조용)</summary>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:6px;">
        <thead><tr><th style="${th}text-align:left;">거래처</th><th style="${th}">사업자번호</th><th style="${th}${r}">외상 판매(부가세 포함)</th>
          <th style="${th}${r}">공급가액</th><th style="${th}${r}">세액</th></tr></thead><tbody>
        ${d.sales.invoiceCustomers.concat(d.sales.noBizCustomers).map(c => {
          const amt = c.amount - (c.nonFuelOnlyFuel || 0), sup = Math.round(amt / 1.1);
          const reg = String(c.bizNo || '').replace(/\D/g, '').length === 10;
          return `<tr${reg ? '' : ' style="color:#b45309;"'}>
            <td style="${td}">${esc(c.name)}${c.nonFuelOnlyFuel ? ` <span style="font-size:11px;color:#64748b;">(유류 ${vatN(c.nonFuelOnlyFuel)} 유가보조금 카드)</span>` : ''}</td>
            <td style="${td}text-align:center;">${reg ? esc(c.bizNo) : '미등록'}</td><td style="${td}${r}">${vatN(amt)}</td>
            <td style="${td}${r}">${vatN(sup)}</td><td style="${td}${r}">${vatN(amt - sup)}</td></tr>`;
        }).join('')}
      </tbody></table>
    </details>
    </div></div>`;

  // ② 매입
  html += `<div class="card"><div class="card-header"><h2>② 매입세액</h2>
      <span style="font-size:12px;color:#64748b;">세금계산서·사업용 카드·지출증빙 현금영수증만 공제</span></div>
    <div style="padding:12px 16px;overflow-x:auto;">
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr><th style="${th}text-align:left;">항목</th><th style="${th}">증빙</th><th style="${th}${r}">공급가액</th><th style="${th}${r}">세액</th>
        <th style="${th}">공제</th><th style="${th}text-align:left;">근거</th><th style="${th}"></th></tr></thead><tbody>
      ${d.purchase.items.map(it => `<tr${it.deductible ? '' : ' style="color:#94a3b8;text-decoration:line-through;"'}>
        <td style="${td}">${esc(it.label)}</td><td style="${td}text-align:center;">${esc(it.kind)}</td>
        <td style="${td}${r}">${vatN(it.supply)}</td><td style="${td}${r}">${vatN(it.tax)}</td>
        <td style="${td}text-align:center;">${it.deductible ? '공제' : '불공제'}</td>
        <td style="${td}font-size:11px;color:#64748b;">${esc(it.basis)}</td>
        <td style="${td}">${it.id ? `<button class="btn-sm" style="padding:2px 8px;font-size:11px;" onclick="vatDeleteManual('${esc(it.id)}')">삭제</button>` : ''}</td></tr>`).join('')}
      <tr style="font-weight:700;background:#f8fafc;"><td style="${td}" colspan="2">공제 매입 합계</td>
        <td style="${td}${r}">${vatN(d.purchase.supply)}</td><td style="${td}${r}">${vatN(d.purchase.tax)}</td><td style="${td}" colspan="3"></td></tr>
    </tbody></table>
    <div style="margin-top:6px;font-size:11px;color:#64748b;">
      연료: ${d.purchase.fuel.byFuel.map(f => `${f.fuel} ${vatN(f.qty)}L (${f.count}건) ${vatN(f.supply)}원`).join(' · ')}
    </div>

    <div style="margin-top:14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">기타 매입 추가 (홈택스 매입 세금계산서·카드 매입 합계)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;">
        <select id="vat-mp-kind"><option>세금계산서</option><option>카드</option><option>현금영수증</option></select>
        <input id="vat-mp-name" placeholder="내용 (예: 기타 세금계산서 합계)" style="width:220px;">
        <input id="vat-mp-supply" placeholder="공급가액" style="width:120px;text-align:right;">
        <input id="vat-mp-tax" placeholder="세액 (비우면 10%)" style="width:120px;text-align:right;">
        <label><input type="checkbox" id="vat-mp-nonded"> 불공제 (접대비·비영업용 승용차 등)</label>
        <input id="vat-mp-memo" placeholder="메모" style="width:160px;">
        <button class="btn-primary btn-sm" onclick="vatAddManual()">추가</button>
      </div>
    </div>
    </div></div>`;

  // ③ 납부세액
  html += `<div class="card"><div class="card-header"><h2>③ 납부세액</h2></div>
    <div style="padding:12px 16px;">
    <table style="width:100%;max-width:860px;font-size:13px;border-collapse:collapse;"><colgroup><col style="width:260px"><col style="width:150px"><col></colgroup>
      <tr><td style="${td}">매출세액 (㉮)</td><td style="${td}${r}">${vatN(d.outputTax)}</td><td style="${td}"></td></tr>
      <tr><td style="${td}">매입세액 (㉯)</td><td style="${td}${r}white-space:nowrap;">− ${vatN(d.inputTax)}</td><td style="${td}"></td></tr>
      ${d.credits.map(c => `<tr><td style="${td}">${esc(c.label)}</td><td style="${td}${r}white-space:nowrap;">− ${vatN(c.amount)}</td>
        <td style="${td}font-size:11px;color:#64748b;">${esc(c.note)}${c.key === 'eFiling' ? `
          <label style="margin-left:6px;"><input type="checkbox" ${d.settings.eFilingCredit ? 'checked' : ''} onchange="vatSetEFiling(this.checked)"> 직접 전자신고</label>` : ''}</td></tr>`).join('')}
      <tr style="font-weight:700;font-size:15px;"><td style="${td}">${d.payable >= 0 ? '납부할 세액' : '환급받을 세액'}</td>
        <td style="${td}${r}color:${payColor};">${vatN(Math.abs(d.payable))}</td><td style="${td}"></td></tr>
    </table>
    ${p.type === '확정' ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">※ 법인 확정신고는 예정신고한 분기를 빼고 이번 분기(3개월)분만 신고합니다. 예정신고 때 빠뜨린 금액이 있으면 확정신고서 "예정신고누락분" 칸에 더해집니다.</div>` : ''}
    <div style="margin-top:8px;font-size:11px;color:#64748b;">※ 정유사 지원금은 따로 입금되는 판매장려금(금전)이라 매출·매입세액 어디에도 넣지 않습니다. 정유사가 지원금만큼 수정세금계산서(−)를 발행했다면 매입세액이 줄어드니 세무사 신고서 (10)번과 비교하세요.</div>
    ${p.type === '예정' && d.payable < 0 ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">※ 예정신고 환급세액은 조기환급 대상이 아니면 바로 돌려받지 않고 확정신고 때 차감됩니다.</div>` : ''}
    ${d.settings.taxFreeCustomers.length ? `<div style="margin-top:8px;font-size:12px;">면세 고객: ${d.settings.taxFreeCustomers.map(n =>
      `${esc(n)} <a href="#" onclick="vatSetTaxFree(decodeURIComponent('${encodeURIComponent(n)}'), false);return false;">[해제]</a>`).join(' · ')}</div>` : ''}
    </div></div>`;

  // ④ 실제 신고 대조
  const a = d.actual || {};
  // 일반과세자 부가가치세 신고서 칸 번호 — 세무사 신고서에서 그대로 옮겨 적기
  const fields = [['salesInvoiceSupply', '(1) 과세 세금계산서 발급분 — 금액'], ['salesCardSupply', '(3) 신용카드·현금영수증 발행분 — 금액'],
    ['salesOtherSupply', '(4) 기타(정규영수증 외) — 금액'], ['outputTax', '(9) 합계 — 세액 ㉮'], ['inputInvoiceSupply', '(10)+(11) 세금계산서 수취분 — 금액'],
    ['inputCardSupply', '(14) 그 밖의 공제매입세액 — 금액'], ['inputTax', '(17) 차감계 — 세액 ㉯'], ['payable', '납부(환급)세액 ㉰']];
  html += `<div class="card"><div class="card-header"><h2>④ 실제 신고 대조</h2>
      <span style="font-size:12px;color:#64748b;">세무사 신고서의 칸 번호대로 금액을 넣으면 웹앱 예상과 비교 (차이 1% 넘으면 빨간색)</span></div>
    <div style="padding:12px 16px;overflow-x:auto;">
    ${d.compare ? `<table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr><th style="${th}text-align:left;">항목</th><th style="${th}${r}">웹앱 예상</th><th style="${th}${r}">실제 신고</th>
        <th style="${th}${r}">차이</th><th style="${th}${r}">차이율</th></tr></thead><tbody>
      ${d.compare.map(c => `<tr><td style="${td}">${esc(c.label)}</td><td style="${td}${r}">${vatN(c.estimate)}</td><td style="${td}${r}">${vatN(c.actual)}</td>
        <td style="${td}${r}color:${Math.abs(c.rate || 0) > 0.01 ? '#dc2626' : '#15803d'};">${vatSigned(c.diff)}</td>
        <td style="${td}${r}">${c.rate == null ? '-' : (c.rate * 100).toFixed(2) + '%'}</td></tr>`).join('')}
    </tbody></table>` : '<div style="color:#94a3b8;font-size:13px;">이 분기 실제 신고 금액이 없습니다.</div>'}
    <details style="margin-top:10px;"><summary style="cursor:pointer;font-size:13px;">실제 신고 금액 입력/수정</summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px;margin-top:8px;font-size:12px;">
        ${fields.map(([k, l]) => `<label style="display:flex;justify-content:space-between;gap:6px;align-items:center;">${l}
          <input id="vat-act-${k}" value="${a[k] != null ? vatN(a[k]) : ''}" style="width:140px;text-align:right;"></label>`).join('')}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button class="btn-primary btn-sm" onclick="vatSaveActual()">저장</button>
        ${d.actual ? `<button class="btn-danger btn-sm" onclick="vatSaveActual(true)">삭제</button>` : ''}
      </div>
    </details>
    </div></div>`;

  document.getElementById('vat-body').innerHTML = html;
}

async function vatAddManual() {
  const v = id => document.getElementById(id).value.trim();
  const entry = {
    kind: v('vat-mp-kind'), name: v('vat-mp-name'),
    supply: v('vat-mp-supply').replace(/,/g, ''), tax: v('vat-mp-tax').replace(/,/g, ''),
    deductible: !document.getElementById('vat-mp-nonded').checked, memo: v('vat-mp-memo'),
  };
  if (!entry.name || !entry.supply) { toast('내용과 공급가액을 입력하세요.', 'error'); return; }
  const res = await api('POST', '/api/vat/manual-purchase', { key: vatState.data.period.key, entry });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  toast('매입을 추가했습니다.', 'success');
  loadVat();
}

async function vatDeleteManual(id) {
  if (!confirm('이 매입 항목을 삭제할까요?')) return;
  const res = await api('DELETE', '/api/vat/manual-purchase', { key: vatState.data.period.key, id });
  if (!res.ok) { toast(res.error || '삭제 실패', 'error'); return; }
  loadVat();
}

async function vatSaveActual(remove) {
  let values = null;
  if (!remove) {
    values = {};
    ['salesInvoiceSupply', 'salesCardSupply', 'salesOtherSupply', 'outputTax', 'inputInvoiceSupply', 'inputCardSupply', 'inputTax', 'payable']
      .forEach(k => { values[k] = document.getElementById(`vat-act-${k}`).value.trim(); });
  } else if (!confirm('이 분기 실제 신고 금액을 삭제할까요?')) return;
  const res = await api('POST', '/api/vat/actual', { key: vatState.data.period.key, values });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  toast(remove ? '삭제했습니다.' : '저장했습니다.', 'success');
  loadVat();
}

async function vatSetTaxFree(name, on) {
  const cur = vatState.data.settings.taxFreeCustomers || [];
  const list = on ? cur.concat(name) : cur.filter(n => n !== name);
  const res = await api('POST', '/api/vat/settings', { taxFreeCustomers: list });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  loadVat();
}

async function vatSetEFiling(on) {
  const res = await api('POST', '/api/vat/settings', { eFilingCredit: on });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  loadVat();
}

// ══════════════════════════════════════════════════════════════
// 📥 자료 올리기 (통합 업로드) — /api/upload/auto
// ══════════════════════════════════════════════════════════════
const UPLOAD_KIND_LABEL = {
  'bos-sales': 'BOS 판매전표', 'bos-integrated': 'BOS 거래내역', 'card-sales': '카드 매출자료',
  'card-integrated': '나이스 통합거래조회', bank: '통장', tank: '탱크 실재고', orders: '주문목록',
  'deposit-bos': 'BOS 시재현황', 'deposit-easy': '이지샵 입금내역', management: '마감자료',
  customers: '고객등록 양식', unknown: '알 수 없음', error: '열기 실패',
};

function initUploadModal() {
  const input = document.getElementById('upload-auto-input');
  const drop  = document.getElementById('upload-drop');
  if (!input || !drop) return;
  input.addEventListener('change', e => {
    if (e.target.files.length) uploadAutoFiles([...e.target.files]);
    e.target.value = '';
  });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.remove('dragover');
  }));
  drop.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (files.length) uploadAutoFiles(files);
    else toast('엑셀 파일(.xlsx, .xls)만 올릴 수 있습니다.', 'warn');
  });
}

function openUploadModal() {
  document.getElementById('upload-modal').style.display = 'flex';
  loadUploadStatus();
}

function closeUploadModal() {
  document.getElementById('upload-modal').style.display = 'none';
}

const fmtRange = r => r ? (r.from === r.to ? r.from : `${r.from} ~ ${r.to}`) : '';

function uploadResultHtml(r, idx) {
  const cls = r.pending ? 'pending' : r.needsChoice ? 'warn' : !r.ok ? 'fail' : (r.warnings || []).length ? 'warn' : 'ok';
  const icon = r.pending ? '⏳' : r.needsChoice ? '❓' : !r.ok ? (r.skipped ? '⏭' : '❌') : (r.warnings || []).length ? '⚠️' : '✅';
  const lines = [
    ...(r.targets || []).map(t => `<li>${esc(t)} 반영</li>`),
    ...(r.warnings || []).map(w => `<li class="warn-line">⚠ ${esc(w)}</li>`),
    ...(r.error ? [`<li class="err-line">${esc(r.error)}</li>`] : []),
  ];
  const choice = r.needsChoice === 'card-source' ? `
    <div class="upload-choice">이 카드 파일은 어느 단말기 자료인가요? (한 번 고르면 다음부터 자동)
      <button class="btn-upload btn-teal" onclick="resolveUploadCard(${idx}, 'easyshop')">이지샵 (세차·유외)</button>
      <button class="btn-upload" style="background:#4f46e5;border-color:#4f46e5;" onclick="resolveUploadCard(${idx}, 'nice')">나이스 (유류)</button>
    </div>` : '';
  return `<div class="upload-result ${cls}">
    <div class="upload-result-title">${icon} ${esc(r.file)}
      ${r.type ? `<span class="kind">${esc(UPLOAD_KIND_LABEL[r.type] || r.label || r.type)}</span>` : ''}
      ${r.range ? `<span class="range">${esc(fmtRange(r.range))}</span>` : ''}
    </div>
    ${lines.length ? `<ul>${lines.join('')}</ul>` : ''}${choice}
  </div>`;
}

let uploadResults = [];
function renderUploadResults() {
  document.getElementById('upload-results').innerHTML = uploadResults.map(uploadResultHtml).join('');
}

async function uploadAutoFiles(files) {
  uploadResults = files.map(f => ({ file: f.name, pending: true, targets: ['판별·반영 중…'] }));
  renderUploadResults();
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  try {
    const res  = await fetch('/api/upload/auto', { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) {
      uploadResults = [{ file: files.map(f => f.name).join(', '), ok: false, error: data.error }];
    } else {
      uploadResults = data.results;
    }
  } catch (e) {
    uploadResults = [{ file: files.map(f => f.name).join(', '), ok: false, error: `서버 연결 오류: ${e.message}` }];
  }
  renderUploadResults();
  const okCount = uploadResults.filter(r => r.ok).length;
  if (okCount) toast(`✅ ${okCount}개 파일 반영 완료`, 'success');
  await afterAutoUpload();
}

async function resolveUploadCard(idx, cardSource) {
  const r = uploadResults[idx];
  if (!r) return;
  uploadResults[idx] = { ...r, pending: true, needsChoice: null, warnings: [], targets: ['반영 중…'] };
  renderUploadResults();
  const res = await api('POST', '/api/upload/auto/resolve', { saved: r.saved, file: r.file, cardSource });
  uploadResults[idx] = res.ok ? res.result : { ...r, ok: false, pending: false, error: res.error };
  renderUploadResults();
  await afterAutoUpload();
}

// 올린 뒤: 자료 현황 + 지금 보고 있는 화면 새로고침 (기존 로드 함수 그대로 사용)
async function afterAutoUpload() {
  loadUploadStatus();
  if (document.querySelector('.main-tab.active')?.dataset.group === 'today') loadToday();
  const group = document.querySelector('.main-tab.active')?.dataset.group;
  try {
    await loadBankDeposits();
    if (group === 'daily') {
      const lastDate = uploadResults.flatMap(r => r.dates || []).filter(Boolean).sort().pop();
      if (lastDate) switchToUploadedMonth(lastDate);
      await loadDailyMonth();
      const tab = document.querySelector('#subnav-daily .tab-btn.active')?.dataset.tab;
      if (tab === 'daily-expense') loadAllExpenses();
    } else if (group === 'monthly') {
      await loadForMonth();
      loadStaleStatements();
    } else if (group === 'summary') {
      loadSummary();
    }
  } catch (e) { console.error('[afterAutoUpload]', e); }
}

async function loadUploadStatus(elId = 'upload-status') {
  const el = document.getElementById(elId);
  if (!el) return;
  const res = await api('GET', '/api/upload/status');
  if (!res.ok) { el.innerHTML = `<div class="muted">자료 현황을 불러오지 못했습니다: ${esc(res.error || '')}</div>`; return; }
  const fmtAt = iso => iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const rows = res.items.map(it => `
    <tr class="${it.stale ? 'stale' : ''}">
      <td><strong>${esc(it.label)}</strong><div class="muted">${esc(it.where)}</div></td>
      <td class="num">${it.dataTo ? `${esc(it.dataTo)}까지` : (it.note ? esc(it.note) : '<span class="muted">없음</span>')}
        ${it.dataTo && it.lagDays > 0 ? `<div class="muted">${it.lagDays}일 전</div>` : ''}</td>
      <td class="num">${fmtAt(it.uploadedAt)}${it.uploadedFile ? `<div class="muted">${esc(it.uploadedFile)}</div>` : ''}</td>
      <td class="muted">${it.dataTo && it.note ? esc(it.note) : ''}</td>
    </tr>`).join('');
  el.innerHTML = `<table class="status-table">
    <thead><tr><th>자료</th><th>데이터 기간</th><th>마지막 업로드</th><th>참고</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// ══════════════════════════════════════════════════════════════
// 데이터 점검 (종합 탭) — /api/consistency
// ══════════════════════════════════════════════════════════════
const CHECK_LEVEL_LABEL = { error: '확인 필요', warn: '주의', ok: '정상', info: '참고' };

async function loadConsistency(ym, elId = 'consistency-card') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<div class="check-head"><h2>🔎 ${esc(ym)} 데이터 점검</h2><span class="muted">확인 중…</span></div>`;
  const res = await api('GET', `/api/consistency?month=${ym}`);
  if (!res.ok) { el.innerHTML = `<div class="check-head"><h2>🔎 데이터 점검</h2><span class="err-line">${esc(res.error || '실패')}</span></div>`; return; }
  const pills = ['error', 'warn', 'ok'].filter(l => res.counts[l])
    .map(l => `<span class="check-pill ${l}">${CHECK_LEVEL_LABEL[l]} ${res.counts[l]}</span>`).join('');
  const item = c => `
    <details class="check-item"${c.level === 'error' ? ' open' : ''}>
      <summary>
        <span class="check-dot ${c.level}"></span>
        <span class="check-title">${esc(c.title)}</span>
        <span class="check-summary">${esc(c.summary)}</span>
        ${c.level !== 'ok' && c.tab ? `<button class="check-go" onclick="event.preventDefault();goToCheckTab('${c.tab}')">바로가기</button>` : ''}
      </summary>
      ${c.items?.length ? `<ul class="check-detail">${c.items.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>` : ''}
    </details>`;
  const problems = res.checks.filter(c => c.level !== 'ok');
  const oks      = res.checks.filter(c => c.level === 'ok');
  el.innerHTML = `
    <div class="check-head">
      <h2>🔎 ${esc(ym)} 데이터 점검</h2>
      <div class="check-pills">${pills}</div>
      <button class="check-go" style="margin-left:auto" onclick="openUploadModal()">📥 자료 올리기 · 자료 현황</button>
    </div>
    <div class="check-list">${problems.map(item).join('')}</div>
    ${oks.length ? `<details class="check-ok-fold"><summary>정상 항목 ${oks.length}개 보기</summary><div class="check-list">${oks.map(item).join('')}</div></details>` : ''}`;
}

function goToCheckTab(tab) {
  if (tab.startsWith('daily-')) { switchGroup('daily'); switchDailySubTab(tab); }
  else { switchGroup('monthly'); switchSubTab(tab); }
}

// ── 거래명세서 목록: 지금 데이터와 금액이 다른(다시 만들어야 하는) 명세서 ──
async function loadStaleStatements() {
  const res = await api('GET', `/api/statements/stale?year=${state.year}&month=${state.month}`);
  state.staleStatements = {};
  if (res.ok) res.stale.forEach(s => { state.staleStatements[s.name] = s; });
  renderVendors();
}

// ══════════════════════════════════════════════════════════════
// 오늘 할 일 (첫 화면) — 자료 현황 + 이번 달·지난달 점검
// ══════════════════════════════════════════════════════════════
function loadToday() {
  const now = new Date();
  const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  loadUploadStatus('today-status');
  loadConsistency(ym(now), 'today-check-current');
  // 지난달은 월마감(거래명세서·세금계산서·미수) 확인용
  loadConsistency(ym(prev), 'today-check-prev');
}

// ══════════════════════════════════════════════════════════════
// 미수 — 업체별 점검 (결제방식·입금자명·입금 시기·할인 확인 → 월별 대조 → 확정)
// /api/ar/vendor-review, /api/ar/profile, /api/ar/assign, /api/ar/confirm-vendor
// ══════════════════════════════════════════════════════════════
const AR_BASIS_LABEL = { manual: '사람 확정', note: '비고', auto: '자동', review: '확인 필요', card: '카드' };
const arReview = { name: null, data: null, search: '' };

function setArPayFilter(k) {
  arState.payFilter = k;
  renderArVendorTable();
}

// 현장카드 업체: 칸을 누르면 받음 체크 ↔ 해제 (기존 /api/ar/mark-paid)
async function toggleArCardReceived(name, month) {
  const v = arState.vendors.find(x => x.name === name);
  const m = v?.months.find(x => x.month === month);
  if (!m) return;
  const on = !(m.manualPaidCard || m.remaining <= 0);
  if (!on && !m.manualPaidCard) { showArDepositModal(name, month); return; }   // 통장·카드매칭으로 완료된 달은 상세로
  const res = await api(on ? 'POST' : 'DELETE', '/api/ar/mark-paid', { vendorName: name, month, note: '카드 받음' });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  toast(on ? `☑ ${name} ${Number(month.slice(5))}월 카드 받음` : `${name} ${Number(month.slice(5))}월 받음 해제`, 'success');
  await loadArSummary();
  if (arReview.name === name) loadArReview(name);
}

function arReviewVendorList() {
  const q = arReview.search.trim();
  const rank = v => (!v.payType ? 0 : v.review > 0 ? 1 : v.overdue > 0 ? 2 : v.cardWait > 0 ? 3 : 4) + (v.profileConfirmed ? 10 : 0);
  return arState.vendors
    .filter(v => !q || v.name.includes(q))
    .sort((a, b) => rank(a) - rank(b) || (b.overdue + b.review) - (a.overdue + a.review) || a.name.localeCompare(b.name, 'ko'));
}

function renderArReviewList() {
  const box = document.getElementById('ar-review-list');
  if (!box) return;
  box.innerHTML = arReviewVendorList().map(v => {
    const tag = !v.payType ? '<span class="ar-pay-tag none">미정</span>'
      : v.payType === 'card' ? '<span class="ar-pay-tag card">카드</span>'
      : v.payType === 'other' ? '<span class="ar-pay-tag other">기타</span>' : '';
    const warn = v.review > 0 ? `<span class="ar-rv-warn">확인 ${v.reviewCount}</span>` : '';
    const amt = v.overdue > 0 ? `<span class="ar-rv-amt">${v.overdue.toLocaleString()}</span>` : '';
    return `<button class="ar-rv-item${arReview.name === v.name ? ' active' : ''}" onclick="loadArReview(this.dataset.name)" data-name="${esc(v.name)}">
      ${v.profileConfirmed ? '<span class="ar-confirmed">✓</span>' : ''}${tag}<span class="ar-rv-name">${esc(v.name)}</span>${warn}${amt}
    </button>`;
  }).join('');
}

async function openArReview(name) {
  document.getElementById('ar-review-modal').style.display = 'flex';
  if (!arState.vendors.length) await loadArSummary();
  renderArReviewList();
  const first = name || arReviewVendorList()[0]?.name;
  if (first) loadArReview(first);
}

function closeArReview() {
  document.getElementById('ar-review-modal').style.display = 'none';
  arReview.name = null;
}

async function loadArReview(name) {
  arReview.name = name;
  renderArReviewList();
  const body = document.getElementById('ar-review-detail');
  body.innerHTML = '<div class="muted" style="padding:20px;">불러오는 중…</div>';
  const res = await api('GET', `/api/ar/vendor-review?name=${encodeURIComponent(name)}`);
  if (arReview.name !== name) return;   // 그사이 다른 업체를 눌렀음
  if (!res.ok) { body.innerHTML = `<div class="err-line" style="padding:20px;">${esc(res.error || '실패')}</div>`; return; }
  arReview.data = res;
  renderArReviewDetail();
}

function arDepLine(d, vendor) {
  const isSplitPart = d.matchedVendor !== vendor;
  const amt = isSplitPart ? (d.splits || []).filter(s => s.vendorName === vendor).reduce((s, x) => s + x.amount, 0) : d.amount;
  const basis = d.isCard ? 'card' : d.matchBasis;
  return `<span class="ar-dep">
    <span class="ar-basis ${basis || ''}">${AR_BASIS_LABEL[basis] || basis || ''}</span>
    ${esc(d.date.slice(5))} ${esc(d.payer)} <b>${amt.toLocaleString()}</b>${isSplitPart ? ` <span class="muted">(${esc(d.matchedVendor)} 입금 중)</span>` : ''}
    ${d.note ? `<span class="muted">· ${esc(d.note)}</span>` : ''}
  </span>`;
}

function renderArReviewDetail() {
  const r = arReview.data;
  const box = document.getElementById('ar-review-detail');
  if (!r) return;
  const p = r.profile || {};
  const name = r.name;
  const nameArg = esc(name).replace(/'/g, "\\'");
  const st = p.stats || {};
  const lagDist = Object.entries(st.lags || {}).sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}개월 ${n}건`).join(', ');
  const isCard = p.payType === 'card';

  // 달별 대조: 그 달에 배정된 입금
  const byMonth = {};
  r.allocations.forEach(a => (a.appliedTo || []).forEach(t => { (byMonth[t.month] ||= []).push(a); }));
  const depById = Object.fromEntries(r.deposits.map(d => [d.id, d]));
  const monthOptions = r.months.map(m => `<option value="${m.month}">${Number(m.month.slice(5))}월 (${m.charge.toLocaleString()})</option>`).join('');

  const rows = r.months.slice().reverse().map(m => {
    const s = AR_STATUS_STYLE[m.status] || AR_STATUS_STYLE.done;
    const deps = (byMonth[m.month] || []).map(a => depById[a.depositId]).filter(Boolean);
    const uniq = [...new Map(deps.map(d => [d.id, d])).values()];
    return `<tr>
      <td class="c">${Number(m.month.slice(5))}월</td>
      <td class="n">${m.charge.toLocaleString()}</td>
      <td class="n">${m.paid ? m.paid.toLocaleString() : '-'}</td>
      <td class="n ${m.remaining > 100 ? 'neg' : ''}">${m.remaining > 100 ? m.remaining.toLocaleString() : m.remaining < -100 ? '+' + (-m.remaining).toLocaleString() : '0'}</td>
      <td><span class="ar-st" style="color:${s.color};background:${s.bg};">${m.manualPaidCard ? '☑ 받음' : s.text}</span>
        ${isCard ? `<button class="btn-sm" onclick="toggleArCardReceived('${nameArg}','${m.month}')">${m.manualPaidCard ? '받음 해제' : m.remaining > 0 ? '☐ 받음' : ''}</button>` : ''}</td>
      <td class="deps">${uniq.map(d => `<div>${arDepLine(d, name)}
          ${!d.isCard ? `<button class="btn-sm" onclick="arAssignPrompt('${d.id}')">옮기기</button>` : ''}</div>`).join('') || '<span class="muted">-</span>'}</td>
    </tr>`;
  }).join('');

  const unresolved = r.unresolved.map(u => {
    const d = depById[u.depositId] || u;
    const sug = (u.suggestedWindow || []).map(w => `${Number(w.month.slice(5))}월 ${w.amount.toLocaleString()}`).join(' + ');
    return `<div class="ar-rv-row">
      ${arDepLine({ ...d, matchBasis: 'review' }, name)}
      ${sug ? `<button class="btn-sm btn-primary" onclick='arAssign("${u.depositId}", "${nameArg}", ${JSON.stringify(u.suggestedWindow)})'>추천: ${sug}</button>` : ''}
      <button class="btn-sm" onclick="arAssignPrompt('${u.depositId}')">월 지정</button>
    </div>`;
  }).join('');

  const cands = r.candidates.map(d => `<div class="ar-rv-row">
      <span class="ar-dep"><span class="ar-basis ${d.matchBasis || 'none'}">${d.matchedVendor ? '다른 업체 후보' : '업체 모름'}</span>
        ${esc(d.date)} ${esc(d.payer)} <b>${d.amount.toLocaleString()}</b> ${d.note ? `<span class="muted">· ${esc(d.note)}</span>` : ''}
        ${d.nearMonth ? `<span class="muted">· ${Number(d.nearMonth.slice(5))}월 미수와 금액 비슷</span>` : ''}</span>
      <button class="btn-sm btn-primary" onclick='arAssign("${d.id}", "${nameArg}", ${d.nearMonth ? JSON.stringify([{ month: d.nearMonth, amount: d.amount }]) : 'null'})'>이 업체${d.nearMonth ? ` ${Number(d.nearMonth.slice(5))}월` : ''}로</button>
      <button class="btn-sm" onclick="arIgnoreDeposit('${d.id}')">외상 무관</button>
    </div>`).join('');

  const disc = p.discount || {};
  box.innerHTML = `
    <div class="ar-rv-head">
      <h3>${esc(name)}</h3>
      ${p.confirmed ? '<span class="ar-confirmed big">✓ 확정됨</span>' : ''}
      <button class="btn-sm" onclick="showArVendorModal('${nameArg}')">입금 충당 내역·별칭 (기존 화면)</button>
      <button class="btn-sm ${p.confirmed ? '' : 'btn-primary'}" style="margin-left:auto;" onclick="arConfirmVendor('${nameArg}', ${!p.confirmed})">${p.confirmed ? '확정 취소' : '✓ 이 업체 확정'}</button>
    </div>

    <div class="ar-rv-profile">
      <div class="ar-rv-field"><label>결제방식</label>
        <div class="ar-seg">
          ${[['bank', '통장 입금'], ['card', '현장 카드'], ['other', '기타'], ['', '미정']].map(([k, l]) =>
            `<button class="${(p.payType || '') === k ? 'on' : ''}" onclick="arSaveProfile({ payType: ${k ? `'${k}'` : 'null'} })">${l}</button>`).join('')}
        </div>
      </div>
      ${isCard ? '<div class="muted">현장 카드 업체는 달마다 [☐ 받음]만 체크하면 됩니다.</div>' : `
      <div class="ar-rv-field"><label>입금자명</label>
        <div class="ar-chips">
          ${(p.payers || []).map((n, i) => `<span class="ar-chip">${esc(n)}<button title="삭제" onclick="arRemovePayer(${i})">×</button></span>`).join('') || '<span class="muted">없음</span>'}
          <input id="ar-rv-payer" placeholder="통장 적요1 그대로 추가" onkeydown="if(event.key==='Enter')arAddPayer()">
          <button class="btn-sm" onclick="arAddPayer()">추가</button>
        </div>
      </div>
      <div class="ar-rv-field"><label>입금 시기</label>
        거래 후 <select id="ar-rv-lag-lo">${[0, 1, 2, 3, 4].map(n => `<option ${p.lagMonths?.[0] === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ~ <select id="ar-rv-lag-hi">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option ${(p.lagMonths?.[1] ?? 2) === n ? 'selected' : ''}>${n}</option>`).join('')}</select> 개월 뒤
        <span class="muted">${lagDist ? `(비고 기준 실제: ${lagDist})` : ''}</span>
      </div>
      <div class="ar-rv-field"><label>할인 입금</label>
        <select id="ar-rv-disc-type">
          <option value="" ${!p.discount ? 'selected' : ''}>없음</option>
          <option value="rate" ${disc.rate ? 'selected' : ''}>비율(%)</option>
          <option value="fixed" ${disc.fixed ? 'selected' : ''}>고정액(원)</option>
        </select>
        <input id="ar-rv-disc-val" type="number" step="any" style="width:110px" value="${disc.rate ? (disc.rate * 100).toFixed(2) : disc.fixed || ''}">
        <span class="muted">매달 이만큼 덜 들어와도 완료로 봄</span>
      </div>
      <div class="ar-rv-field"><label>합산 입금</label>
        이 업체 몫이 <select id="ar-rv-group"><option value="">(없음)</option>${r.otherVendors.filter(v => v !== name).map(v => `<option ${p.payGroup === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select> 입금에 섞여 들어옴
      </div>`}
      <div class="ar-rv-field"><label>메모</label><input id="ar-rv-memo" style="flex:1" value="${esc(p.memo || '')}" placeholder="예: 매달 10일 전후 입금, 7/26~8/25 마감"></div>
      <div><button class="btn-primary btn-sm" onclick="arSaveProfileForm()">저장</button>
        <span class="muted">${st.deposits ? `학습: 비고 붙은 입금 ${st.deposits}건` : '비고 붙은 입금 없음'}</span></div>
    </div>

    ${unresolved ? `<h4 class="ar-rv-h">⚠ 확인 필요 — 금액이 딱 맞는 달이 없거나 여러 개</h4>${unresolved}` : ''}

    <h4 class="ar-rv-h">달별 대조</h4>
    <table class="ar-rv-table">
      <thead><tr><th>월</th><th>외상 매출</th><th>입금</th><th>남은 금액</th><th>상태</th><th>배정된 입금</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${cands ? `<h4 class="ar-rv-h">이 업체 입금일 수 있는 것 (업체가 안 정해졌거나 확인 필요)</h4>${cands}` : ''}
    <select id="ar-rv-month-options" hidden>${monthOptions}</select>
  `;
}

async function arSaveProfile(patch) {
  const res = await api('POST', '/api/ar/profile', { name: arReview.name, patch });
  if (!res.ok) { toast(res.error || '저장 실패', 'error'); return; }
  toast('저장했습니다 — 매칭을 다시 계산합니다', 'success');
  await loadArSummary();
  loadArReview(arReview.name);
}

function arSaveProfileForm() {
  const v = id => document.getElementById(id)?.value;
  const p = arReview.data?.profile || {};
  if (p.payType === 'card') return arSaveProfile({ memo: v('ar-rv-memo') || '' });
  const lo = Number(v('ar-rv-lag-lo')), hi = Number(v('ar-rv-lag-hi'));
  if (hi < lo) { toast('입금 시기: 뒤 숫자가 앞 숫자보다 커야 합니다', 'warn'); return; }
  const dt = v('ar-rv-disc-type'), dv = Number(v('ar-rv-disc-val'));
  const discount = !dt || !(dv > 0) ? null : dt === 'rate' ? { rate: dv / 100 } : { fixed: Math.round(dv) };
  arSaveProfile({ lagMonths: [lo, hi], discount, payGroup: v('ar-rv-group') || null, memo: v('ar-rv-memo') || '' });
}

function arAddPayer() {
  const el = document.getElementById('ar-rv-payer');
  const n = el.value.trim();
  if (!n) return;
  const payers = [...(arReview.data.profile?.payers || [])];
  if (!payers.includes(n)) payers.push(n);
  arSaveProfile({ payers });
}

function arRemovePayer(i) {
  const payers = [...(arReview.data.profile?.payers || [])];
  payers.splice(i, 1);
  arSaveProfile({ payers });
}

async function arAssign(depositId, vendor, months) {
  const res = await api('POST', '/api/ar/assign', { depositId, vendor, months: months || [] });
  if (!res.ok) { toast(res.error || '배정 실패', 'error'); return; }
  toast('배정했습니다', 'success');
  await loadArSummary();
  loadArReview(arReview.name);
}

// 입금 한 건을 다른 달·다른 업체로: 간단 입력창 (달 한 개에 전액, 업체는 목록에서)
function arAssignPrompt(depositId) {
  const r = arReview.data;
  const d = r.deposits.find(x => x.id === depositId) || r.candidates.find(x => x.id === depositId) || r.unresolved.find(x => x.depositId === depositId);
  const amount = d?.amount;
  const vendor = prompt(`업체명 (그대로 두면 ${r.name})\n입금 ${d ? `${d.date} ${d.payer} ${amount.toLocaleString()}원` : ''}`, r.name);
  if (vendor == null) return;
  const months = r.months.map(m => m.month);
  const mIn = prompt(`몇 월분인가요? (예: 8 또는 7,8 — 여러 달이면 쉼표)\n${r.name} 외상 있는 달: ${months.map(m => Number(m.slice(5))).join(', ')}`);
  if (!mIn) return;
  const year = (d?.date || months[months.length - 1]).slice(0, 4);
  const list = mIn.split(/[,\s]+/).filter(Boolean).map(x => {
    const n = Number(x); const ym = `${year}-${String(n).padStart(2, '0')}`;
    return (d && ym > d.date.slice(0, 7)) ? `${Number(year) - 1}-${String(n).padStart(2, '0')}` : ym;
  });
  const own = (d?.amount || 0) - ((d?.splits || []).reduce((s, x) => s + x.amount, 0));
  let assign;
  if (list.length === 1) assign = [{ month: list[0], amount: own }];
  else {
    // 앞 달들은 그 달 외상만큼, 마지막 달이 나머지
    let left = own;
    assign = list.map((m, i) => {
      const c = r.months.find(x => x.month === m)?.charge || 0;
      const a = i === list.length - 1 ? left : Math.min(left, c);
      left -= a;
      return { month: m, amount: a };
    });
  }
  arAssign(depositId, vendor.trim() || r.name, assign);
}

async function arIgnoreDeposit(depositId) {
  if (!confirm('이 입금을 외상과 무관한 입금으로 뺄까요? (대출·환급·개인 입금 등)')) return;
  const res = await api('POST', '/api/ar/assign', { depositId, ignore: true });
  if (!res.ok) { toast(res.error || '실패', 'error'); return; }
  await loadArSummary();
  loadArReview(arReview.name);
}

async function arConfirmVendor(name, confirmed) {
  const res = await api('POST', '/api/ar/confirm-vendor', { name, confirmed });
  if (!res.ok) { toast(res.error || '실패', 'error'); return; }
  toast(confirmed ? `✓ ${name} 확정 (입금 ${res.frozen}건 고정)` : `${name} 확정 취소`, 'success');
  await loadArSummary();
  renderArReviewList();
  loadArReview(name);
}
