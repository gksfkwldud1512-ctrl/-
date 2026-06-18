'use strict';

// ── 일마감 상태 ──────────────────────────────────────────────
const dailyState = {
  year:            new Date().getFullYear(),
  month:           new Date().getMonth() + 1,
  days:            [],   // 해당 월 일별 데이터
  purchasePrices:  [],   // [{ date, fuel, price }] — 직접 입력
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
  initTabs();
  try { switchGroup('monthly'); } catch(e) {}
  initFileUpload();
  initDailyUpload();
  initEmailPreview();
  loadAll();
  loadDailyPurchasePrices();
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
}

function switchGroup(group) {
  // 인라인 스타일 전체 초기화 → CSS 클래스가 제어하도록 (인라인 스타일이 CSS보다 우선순위 높아 충돌 방지)
  document.querySelectorAll('.group-content').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  document.querySelectorAll('.tab-content').forEach(t => { t.classList.remove('active'); t.style.display = ''; });

  document.querySelectorAll('.main-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.main-tab[data-group="${group}"]`).classList.add('active');

  const subnav        = document.getElementById('subnav');
  const subnavDaily   = document.getElementById('subnav-daily');
  const subnavMonthly = document.getElementById('subnav-monthly');

  if (group === 'summary') {
    subnav.classList.add('hidden');
    document.getElementById('group-summary').classList.add('active');
    loadSummary();
  } else if (group === 'monthly') {
    subnav.classList.remove('hidden');
    if (subnavDaily)   subnavDaily.style.display   = 'none';
    if (subnavMonthly) subnavMonthly.style.display = '';
    document.getElementById('group-monthly').classList.add('active');
    const activeBtn = document.querySelector('#subnav-monthly .tab-btn.active');
    const activeTab = activeBtn ? activeBtn.dataset.tab : 'statements';
    switchSubTab(activeTab);
  } else if (group === 'daily') {
    subnav.classList.remove('hidden');
    if (subnavMonthly) subnavMonthly.style.display = 'none';
    if (subnavDaily)   subnavDaily.style.display   = '';
    document.getElementById('group-daily').classList.add('active');
    const activeBtn = document.querySelector('#subnav-daily .tab-btn.active');
    const activeTab = activeBtn ? activeBtn.dataset.tab : 'daily-main';
    switchDailySubTab(activeTab);
    loadDailyMonth();
  } else {
    subnav.classList.add('hidden');
    document.getElementById(`group-${group}`).classList.add('active');
  }
}

function switchDailySubTab(tab) {
  // group-daily 인라인 + 클래스 양쪽으로 강제 표시
  const gd = document.getElementById('group-daily');
  if (gd) { gd.classList.add('active'); gd.style.display = 'block'; }

  document.querySelectorAll('#subnav-daily .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  ['daily-main', 'daily-deposit', 'daily-expense', 'daily-customer', 'daily-customer-sales'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      const show = (t === tab);
      el.classList.toggle('active', show);
      el.style.display = show ? 'block' : 'none';  // 인라인 강제 (CSS 의존 제거)
    }
  });

  if (tab === 'daily-deposit') renderDepositVerification();
  if (tab === 'daily-expense') loadAllExpenses();
  if (tab === 'daily-customer') loadCustomerSalesTab();
  if (tab === 'daily-customer-sales') loadCustomerSalesMonth();
}

function switchSubTab(tab) {
  document.querySelectorAll('#subnav-monthly .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`#subnav-monthly .tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  const section = document.getElementById(`tab-${tab}`);
  if (section) section.classList.add('active');
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
  renderAll();
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
    const checkCell = v.hasCredit
      ? `<input type="checkbox" class="vendor-check" value="${esc(v.name)}">`
      : '';

    const creditCell = credit > 0
      ? `<strong>${credit.toLocaleString()}원</strong>`
      : `<span style="color:#94a3b8">-</span>`;

    const otherCell = other > 0
      ? `${other.toLocaleString()}원`
      : `<span style="color:#94a3b8">-</span>`;

    const stmtDone = state.completion.statements.includes(v.name);
    const statCell = v.hasCredit
      ? (hasFile
          ? (stmtDone
              ? '<span class="badge badge-done">완료</span>'
              : '<span class="badge badge-ok">생성됨</span>')
          : '<span class="badge badge-no">미생성</span>')
      : '<span class="badge" style="background:#f1f5f9;color:#94a3b8">해당없음</span>';

    const dlCell = (v.hasCredit && hasFile)
      ? (isSplit
          ? `<a href="/api/download/${encodeURIComponent(splitFile1)}" class="btn-link" download>주유</a>
             <a href="/api/download/${encodeURIComponent(splitFile2)}" class="btn-link" download style="margin-left:4px">배달</a>`
          : `<a href="/api/download/${encodeURIComponent(filename)}" class="btn-link" download>다운로드</a>`)
      : '-';

    const savedMethod = state.vendorPrintMethods[v.name]
      ?? (state.customers.find(c => c.name === v.name)?.printMethod ?? '');
    const methodCell = v.hasCredit
      ? `<select class="select-method" onchange="updateVendorPrintMethod('${esc(v.name)}', this.value)">${printMethodOptions(savedMethod)}</select>`
      : dash();

    const hasDeliveryTxs = v.txs && v.txs.some(t => t.isDelivery) && v.txs.some(t => !t.isDelivery);
    const splitCell = (v.hasCredit && hasDeliveryTxs)
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
      <td>${esc(v.name)}${errorBadge}</td>
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
  // 외상 업체만 표시
  const creditVendors = state.vendors.filter(v => v.hasCredit);

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
    const status    = state.emailStatus[v.name];
    const emailDone = state.completion.emails.includes(v.name);

    let statusBadge;
    if (emailDone || status === 'sent') {
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

    const taxDone    = state.completion.taxInvoices.includes(v.name);
    const countBadge = taxDone
      ? '<span class="badge badge-done">완료</span>'
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

// ── 거래명세서 생성 ─────────────────────────────────────────
async function generateSelected() {
  const names = getChecked('vendor-check');
  if (!names.length) return toast('업체를 선택하세요.', 'warn');

  const issueDate      = state.issueDate.replace(/-/g, '/');
  const printMethods   = {};
  const splitDelivery  = {};
  names.forEach(n => {
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
    if (res.ok && !state.completion.emails.includes(name)) {
      state.completion.emails.push(name);
    }
    renderEmail();
    if (!res.ok) toast(`${name} 발송 실패: ${res.error}`, 'error');
  }

  const sent = names.filter(n => state.emailStatus[n] === 'sent').length;
  if (sent) toast(`✅ ${sent}개 업체 메일 발송 완료`, 'success');
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
  const contactName   = document.getElementById('c-contact').value.trim();
  const email         = document.getElementById('c-email').value.trim();
  const phone         = document.getElementById('c-phone').value.trim();
  const address       = document.getElementById('c-address').value.trim();
  const bizType       = document.getElementById('c-biztype').value.trim();
  const bizItem       = document.getElementById('c-bizitem').value.trim();
  const printMethod   = document.getElementById('c-print-method').value;
  const taxIssuance   = document.getElementById('c-tax-issuance').value;
  const splitDelivery = document.getElementById('c-split-delivery').value === 'true';
  if (!name) return toast('업체명을 입력하세요.', 'warn');

  const res = await api('POST', '/api/customers', { name, bizNo, contactName, email, phone, address, bizType, bizItem, printMethod, taxIssuance, splitDelivery });
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
  document.getElementById('c-contact').value       = c.contactName || '';
  document.getElementById('c-email').value         = c.email || '';
  document.getElementById('c-phone').value         = c.phone || '';
  document.getElementById('c-address').value       = c.address || '';
  document.getElementById('c-biztype').value       = c.bizType || '';
  document.getElementById('c-bizitem').value       = c.bizItem || '';
  document.getElementById('c-print-method').value   = c.printMethod || '';
  document.getElementById('c-tax-issuance').value   = c.taxIssuance || '합산';
  document.getElementById('c-split-delivery').value = c.splitDelivery ? 'true' : '';
  document.querySelector('[data-tab="customers"]').click();
  document.getElementById('customer-form-card').style.display = '';
  document.getElementById('customer-form-title').textContent  = `수정: ${name}`;
  document.getElementById('customer-form-card').scrollIntoView({ behavior: 'smooth' });
}

function closeCustomerForm() {
  document.getElementById('customer-form-card').style.display = 'none';
  ['c-name','c-bizno','c-contact','c-email','c-phone','c-address','c-biztype','c-bizitem'].forEach(id =>
    document.getElementById(id).value = ''
  );
  document.getElementById('c-print-method').value   = '';
  document.getElementById('c-tax-issuance').value   = '합산';
  document.getElementById('c-split-delivery').value = '';
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
  });
  document.getElementById('bank-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBank(e.target.files[0]);
  });
  // 입금 검증 탭의 이지샵 업로드 (동일 API, 레이블만 별도)
  document.getElementById('deposit-card-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadCard(e.target.files[0], 'deposit-card-label');
    e.target.value = '';
  });

  document.getElementById('bank-expense-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBankExpenses(e.target.files[0]);
    e.target.value = '';
  });
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
      switchToUploadedMonth(data.date);
      await loadDailyMonth();
    } else {
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); console.error(e); }
  document.getElementById('bos-file-input').value = '';
}

async function uploadCard(file, labelId) {
  toast('이지샵 카드내역 업로드 중...', '');
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/daily/upload-card', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      const labelText = `✅ ${data.count > 1 ? data.count+'일치' : data.date} 업로드 완료`;
      const lbl = document.getElementById(labelId || 'deposit-card-label');
      if (lbl) lbl.textContent = labelText;
      toast(`✅ 카드내역 업로드 완료`, 'success');
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
  const pRes = await api('GET', '/api/daily/purchase-prices');
  if (pRes.ok) dailyState.purchasePrices = Array.isArray(pRes.prices) ? pRes.prices : [];
  renderPurchasePriceTable();
}

function renderPurchasePriceTable() {
  updatePpBadge();
  const tbody = document.getElementById('pp-tbody');
  if (!tbody) return;
  const list = dailyState.purchasePrices;
  if (!list.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">등록된 단가 이력이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(e => `<tr>
    <td>${e.date}</td>
    <td>${esc(e.fuel)}</td>
    <td class="col-num"><strong>${Number(e.price).toLocaleString()}원</strong></td>
    <td class="col-action">
      <button class="btn-sm btn-danger" onclick="deletePurchasePrice('${e.date}','${esc(e.fuel)}')">삭제</button>
    </td>
  </tr>`).join('');
}

function updatePpBadge() {
  const badge = document.getElementById('pp-summary-badge');
  if (!badge) return;
  const priceCount = dailyState.purchasePrices.length;
  badge.textContent = priceCount ? `단가 ${priceCount}건 등록` : '단가 미등록';
  badge.style.color = priceCount ? '#22c55e' : '#f59e0b';
}

// 날짜 기준으로 해당 유종의 적용 단가 찾기 (수동 입력 단가만 사용)
function getPriceForDate(date, fuel) {
  const list = dailyState.purchasePrices.filter(e => e.fuel === fuel && e.date <= date);
  if (!list.length) return 0;
  return list[list.length - 1].price;
}

async function addPurchasePrice() {
  const date  = document.getElementById('pp-date').value;
  const fuel  = document.getElementById('pp-fuel').value;
  const price = Number(document.getElementById('pp-price').value);
  if (!date) return toast('적용 시작일을 선택하세요.', 'warn');
  if (!price) return toast('단가를 입력하세요.', 'warn');
  const res = await api('POST', '/api/daily/purchase-prices', { date, fuel, price });
  if (res.ok) {
    dailyState.purchasePrices = res.prices;
    renderPurchasePriceTable();
    renderDailyTable();
    document.getElementById('pp-price').value = '';
    toast(`✅ ${date} ${fuel} ${price.toLocaleString()}원 등록 완료`, 'success');
  } else {
    toast(`오류: ${res.error}`, 'error');
  }
}

async function deletePurchasePrice(date, fuel) {
  if (!confirm(`${date} ${fuel} 단가를 삭제하시겠습니까?`)) return;
  const res = await api('DELETE', '/api/daily/purchase-prices', { date, fuel });
  if (res.ok) {
    dailyState.purchasePrices = res.prices;
    renderPurchasePriceTable();
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
}

function calcDailyProfit(day) {
  const bos = day.bos;
  if (!bos || !bos.date) return null;

  // 단가가 하나도 없으면 null
  if (!dailyState.purchasePrices.length) return null;

  let profit = 0;
  ['휘발유', '경유', '등유'].forEach(fuel => {
    const f   = bos.fuels?.[fuel];
    const buy = getPriceForDate(bos.date, fuel);
    if (f && buy) profit += f.amount - (f.qty * buy);
  });
  profit += (bos.carwash?.amount || 0);
  profit += (bos.others?.amount  || 0) - (day.otherCost || 0);
  profit -= (day.card?.totalFee  || 0);  // 카드 수수료 차감
  return Math.round(profit);
}

function renderDailyTable() {
  const tbody = document.getElementById('daily-tbody');
  if (!tbody) return;

  if (!dailyState.days.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="25">BOS 데이터를 업로드하면 현황이 표시됩니다</td></tr>';
    updateDailySummary(null);
    return;
  }

  let totals = { 휘발유L: 0, 경유L: 0, 등유L: 0, 휘발유A: 0, 경유A: 0, 등유A: 0, otherA: 0, carwashA: 0, profit: 0, cardFee: 0 };

  const rows = dailyState.days.map(day => {
    const bos  = day.bos;
    const card = day.card;
    const date = day.date || '';
    const md   = date.slice(5); // "05-05"

    const gL  = bos?.fuels?.['휘발유']?.qty    || 0;
    const dL  = bos?.fuels?.['경유']?.qty      || 0;
    const kL  = bos?.fuels?.['등유']?.qty      || 0;
    const gA  = bos?.fuels?.['휘발유']?.amount || 0;
    const dA  = bos?.fuels?.['경유']?.amount   || 0;
    const kA  = bos?.fuels?.['등유']?.amount   || 0;
    const otA = bos?.others?.amount  || 0;  // 유외상품
    const cwA = bos?.carwash?.amount || 0;  // 세차
    const otC = day.otherCost || 0;
    const cardFee = card?.totalFee || 0;
    const profit  = calcDailyProfit(day);

    totals.휘발유L += gL; totals.경유L += dL; totals.등유L += kL;
    totals.휘발유A += gA; totals.경유A += dA; totals.등유A += kA;
    totals.otherA  += otA;
    totals.carwashA += cwA;
    totals.profit  += profit ?? 0;
    totals.cardFee += cardFee;

    const drum  = v  => v > 0 ? Math.floor(v / 200).toLocaleString() : '-';
    const litL  = v  => v > 0 ? Math.floor(v).toLocaleString() : '-';
    const won   = v  => v > 0 ? v.toLocaleString() : '-';
    const price = (a, q) => q > 0 ? Math.round(a / q).toLocaleString() + '원' : '-';
    const buyPr = (d, f) => { const p = getPriceForDate(d, f); return p ? p.toLocaleString() + '원' : '-'; };
    const pf    = profit != null ? `<span class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit.toLocaleString()}원</span>` : '-';

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
        const adjTotal = adjs.reduce((s, a) => s + (a.amount || 0), 0);
        const remaining = Math.abs(m.totalDiff) - adjTotal;
        if (remaining <= 0 && adjs.length > 0) {
          cardBadge = `<button class="btn-match-adj" onclick="showMatchingModal('${date}')">✅ 조정</button>`;
        } else {
          const diffStr = m.totalDiff ? ` ${Math.abs(m.totalDiff).toLocaleString()}원` : '';
          cardBadge = `<button class="btn-match-err" onclick="showMatchingModal('${date}')">⚠${diffStr}</button>`;
        }
      }
    }

    const bankBadge = !hasBankData ? '' :
      (!bm || !bm.hasError)
        ? `<span class="badge-match-ok">✅</span>`
        : `<button class="btn-match-err" onclick="showMatchingModal('${date}')">⚠ ${bm.errors.length}건</button>`;

    const matchBadge = `${cardBadge}${bankBadge ? '<br>' + bankBadge : ''}`;

    // 합계드럼 = 휘발유+경유+등유 총합
    const totalL    = gL + dL + kL;
    const totalDrum = totalL > 0 ? Math.floor(totalL / 200).toLocaleString() : '-';

    const totalSales = gA + dA + kA + otA + cwA;
    return `<tr>
      <td class="daily-col-date">${md}</td>
      <td class="group-summary-cell">${totalDrum}</td>
      <td class="group-summary-cell" style="font-weight:600;">${totalSales > 0 ? totalSales.toLocaleString() + '원' : '-'}</td>
      <td class="group-summary-cell daily-col-profit">${pf}</td>
      <td>${litL(gL)}</td><td>${drum(gL)}</td><td>${won(gA)}</td><td>${price(gA,gL)}</td><td>${buyPr(date,'휘발유')}</td>
      <td>${litL(dL)}</td><td>${drum(dL)}</td><td>${won(dA)}</td><td>${price(dA,dL)}</td><td>${buyPr(date,'경유')}</td>
      <td>${litL(kL)}</td><td>${drum(kL)}</td><td>${won(kA)}</td><td>${price(kA,kL)}</td><td>${buyPr(date,'등유')}</td>
      <td>${won(otA)}</td>
      <td><input class="input-other-cost" type="number" value="${otC || ''}" placeholder="0"
           onchange="saveOtherCost('${date}', this.value)"></td>
      <td>${won(cwA)}</td>
      <td>${cardFee > 0 ? cardFee.toLocaleString() : '-'}</td>
      <td>${card?.depositDate || '-'}</td>
      <td class="daily-col-profit">${pf}</td>
      <td style="text-align:center;">${matchBadge}</td>
    </tr>`;
  });

  const hasPriceData = dailyState.purchasePrices.length > 0;
  const totalPf    = hasPriceData
    ? `<span class="${totals.profit >= 0 ? 'profit-pos' : 'profit-neg'}">${totals.profit.toLocaleString()}원</span>`
    : '단가 미입력';

  const totalAllL    = totals.휘발유L + totals.경유L + totals.등유L;
  const totalAllDrum = Math.floor(totalAllL / 200).toLocaleString();

  const totalAllSales = totals.휘발유A + totals.경유A + totals.등유A + totals.otherA + totals.carwashA;
  const totalRow = `<tr class="total-row">
    <td class="daily-col-date">합계</td>
    <td class="group-summary-cell">${totalAllDrum}</td>
    <td class="group-summary-cell" style="font-weight:700;">${totalAllSales.toLocaleString()}원</td>
    <td class="group-summary-cell daily-col-profit">${totalPf}</td>
    <td>${Math.floor(totals.휘발유L).toLocaleString()}</td><td>${Math.floor(totals.휘발유L/200).toLocaleString()}</td><td>${totals.휘발유A.toLocaleString()}</td><td>-</td><td>-</td>
    <td>${Math.floor(totals.경유L).toLocaleString()}</td><td>${Math.floor(totals.경유L/200).toLocaleString()}</td><td>${totals.경유A.toLocaleString()}</td><td>-</td><td>-</td>
    <td>${Math.floor(totals.등유L).toLocaleString()}</td><td>${Math.floor(totals.등유L/200).toLocaleString()}</td><td>${totals.등유A.toLocaleString()}</td><td>-</td><td>-</td>
    <td>${totals.otherA.toLocaleString()}</td><td>-</td>
    <td>${totals.carwashA.toLocaleString()}</td>
    <td>${totals.cardFee.toLocaleString()}</td><td>-</td>
    <td class="daily-col-profit">${totalPf}</td>
    <td>-</td>
  </tr>`;

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
    cardMatchSection = '<p style="color:#94a3b8; font-size:12px; margin-top:8px;">BOS 또는 이지샵 데이터가 없어 카드 대사를 수행할 수 없습니다.</p>';
  } else {
    const summaryClass = m.totalMatch ? 'match-summary-ok' : 'match-summary-err';
    const summaryIcon  = m.totalMatch ? '✅' : '⚠';
    const totalDiffStr = m.totalDiff !== 0
      ? `<span class="price-diff">&nbsp;(차액 ${Math.abs(m.totalDiff).toLocaleString()}원)</span>` : '';

    const typeOrder = ['bos_only', 'easy_only', 'amount_mismatch'];
    let errSections = '';
    typeOrder.forEach(type => {
      const list = m.errors.filter(e => e.type === type);
      if (!list.length) return;
      errSections += `<p class="error-section-title" style="margin-top:16px;">${
        type === 'bos_only' ? '① BOS에만 있는 거래' :
        type === 'easy_only' ? '② 이지샵에만 있는 거래' : '③ 금액 불일치'
      }</p>
      <table class="error-table">
        <thead><tr>
          <th>승인번호</th><th>카드사</th><th>카드번호</th><th>유종</th>
          ${type === 'amount_mismatch'
            ? '<th>BOS 금액</th><th>이지샵 금액</th><th>차액</th>'
            : `<th>${type === 'bos_only' ? 'BOS' : '이지샵'} 금액</th>`}
        </tr></thead>
        <tbody>${list.map(e => `<tr>
          <td><code>${esc(e.approvalNo)}</code></td>
          <td>${esc(e.cardCompany)}</td>
          <td><code>${esc(e.cardNo)}</code></td>
          <td>${esc(e.product || e.fuel || '')}</td>
          ${type === 'amount_mismatch'
            ? `<td>${e.bosAmount.toLocaleString()}원</td>
               <td>${e.easyAmount.toLocaleString()}원</td>
               <td class="price-diff">${e.diff > 0 ? '+' : ''}${e.diff.toLocaleString()}원</td>`
            : `<td>${(e.bosAmount ?? e.easyAmount).toLocaleString()}원</td>`}
        </tr>`).join('')}</tbody>
      </table>`;
    });

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
        <thead><tr><th>카드사</th><th>이지샵만</th><th>BOS만</th><th>차액</th></tr></thead>
        <tbody>${coRows}</tbody>
      </table>` : '';

    if (!errSections) {
      errSections = '<p style="color:#15803d; font-weight:600; margin-top:12px;">✅ 모든 카드 거래가 정상 매칭됩니다.</p>';
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
        &nbsp;/&nbsp; 이지샵 <strong>${m.easyTotal.toLocaleString()}원</strong>
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
          <p class="error-section-title">💳 카드 대사 (BOS ↔ 이지샵)</p>
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

async function loadSummary() {
  const ym = `${summaryState.year}-${String(summaryState.month).padStart(2,'0')}`;
  const res = await api('GET', `/api/summary/${ym}`);
  if (res.ok) renderSummary(res);
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
    const rows = FUELS.map(fuel => {
      const amt = data.sales?.[fuel] || 0;
      const qty = data.qty?.[fuel]   || 0;
      const drums = Math.floor(qty / 200);
      const avgPrice = qty > 0 ? Math.round(amt / qty) : 0;
      return `<tr>
        <td><strong>${fuel}</strong></td>
        <td style="text-align:right;">${Math.floor(qty).toLocaleString()}L (${drums}드럼)</td>
        <td style="text-align:right;">${avgPrice > 0 ? avgPrice.toLocaleString()+'원' : '-'}</td>
        <td style="text-align:right;">${amt > 0 ? amt.toLocaleString()+'원' : '-'}</td>
      </tr>`;
    });
    rows.push(`<tr style="background:#f8fafc;font-weight:700;">
      <td>세차+유외</td>
      <td>-</td><td>-</td>
      <td style="text-align:right;">${((data.sales?.carwash||0)+(data.sales?.others||0)).toLocaleString()}원</td>
    </tr>`);
    rows.push(`<tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #e2e8f0;">
      <td>합계</td>
      <td>-</td><td>-</td>
      <td style="text-align:right;">${(data.revenue||0).toLocaleString()}원</td>
    </tr>`);
    salesBody.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
        <th style="padding:7px 10px;text-align:left;">유종</th>
        <th style="padding:7px 10px;text-align:right;">판매량</th>
        <th style="padding:7px 10px;text-align:right;">평균단가</th>
        <th style="padding:7px 10px;text-align:right;">매출액</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

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
  const res = await api('GET', '/api/expenses');
  if (res.ok) {
    expenseList = res.expenses || [];
    renderExpenseList();
  } else {
    toast('지출 내역 조회 실패: ' + (res.error || '서버 오류'), 'error');
  }
}

function renderExpenseList() {
  const tbody = document.getElementById('expense-list-tbody');
  const count = document.getElementById('expense-list-count');
  if (count) count.textContent = `${expenseList.length}건`;
  if (!tbody) return;
  if (!expenseList.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">지출 내역이 없습니다. 엑셀 파일을 업로드하세요.</td></tr>';
    return;
  }
  const sorted = expenseList.map((e, i) => ({ ...e, _i: i }))
    .sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  tbody.innerHTML = sorted.map(e => `<tr>
    <td>${esc(e.date || e.month || '')}</td>
    <td>${esc(e.subCategory || '')}</td>
    <td><span class="badge-cat ${e.category === '고정비' ? 'badge-fixed' : 'badge-var'}">${esc(e.category || '')}</span></td>
    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(e.vendor || '')}">${esc(e.vendor || '')}</td>
    <td style="text-align:right;">${(e.amount || 0).toLocaleString()}원</td>
    <td><button class="btn-sm btn-danger" onclick="deleteExpenseItem(${e._i})">삭제</button></td>
  </tr>`).join('');
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
      toast(`✅ 수시입출예금 ${data.count}건 지출 임포트 완료`, 'success');
      loadAllExpenses();
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
  <table id="annual-report-table" style="font-size:12px;border-collapse:collapse;min-width:600px;width:100%;">
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
    _mobileUrl = `http://${res.ip}:${res.port}/mobile.html`;
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
