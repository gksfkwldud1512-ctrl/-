'use strict';

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
  sort:                { col: 'name', dir: 'asc' },
  vendorPrintMethods:  {},   // { 업체명: 출력방법 } — 세션 내
  hometaxMethods:      {},   // { 업체명: '통합'|'분리' } — 세션 내 (구 자동화용)
  taxIssuanceMethods:  {},   // { 업체명: '합산'|'분리' } — 세션 내 (일괄발행용)
};

// ── 초기화 ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initYearMonth();
  initTabs();
  initFileUpload();
  initEmailPreview();
  loadAll();
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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      renderAll();
    });
  });
}

function initFileUpload() {
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) uploadExcel(e.target.files[0]);
  });
  document.getElementById('customer-file-input').addEventListener('change', e => {
    if (e.target.files[0]) importCustomers(e.target.files[0]);
  });
}

async function loadAll() {
  const [vRes, cRes, fRes, mRes, sRes] = await Promise.all([
    api('GET', `/api/vendors?year=${state.year}&month=${state.month}`),
    api('GET', '/api/customers'),
    api('GET', '/api/files'),
    api('GET', `/api/monthly-status?year=${state.year}`),
    api('GET', '/api/settings'),
  ]);
  if (vRes.ok) state.vendors       = vRes.vendors;
  if (cRes.ok) state.customers     = cRes.customers;
  if (fRes.ok) state.files         = fRes.files;
  if (mRes.ok) state.monthlyStatus = mRes.months;
  if (sRes.ok && sRes.smtpUser) {
    document.getElementById('smtp-user').value = sRes.smtpUser;
    if (sRes.hasPass) document.getElementById('smtp-pass').placeholder = '저장됨 (변경 시 입력)';
    const certStatus = document.getElementById('cert-pass-status');
    if (certStatus) certStatus.textContent = sRes.hasCertPass ? '✅ 공동인증서 비밀번호 저장됨' : '';
  }
  renderAll();
}

async function loadForMonth() {
  const [vRes, mRes, fRes] = await Promise.all([
    api('GET', `/api/vendors?year=${state.year}&month=${state.month}`),
    api('GET', `/api/monthly-status?year=${state.year}`),
    api('GET', '/api/files'),
  ]);
  if (vRes.ok) state.vendors       = vRes.vendors;
  if (mRes.ok) state.monthlyStatus = mRes.months;
  if (fRes.ok) state.files         = fRes.files;
  renderAll();
}

// ── 렌더링 ──────────────────────────────────────────────────
function renderAll() {
  renderMonthlyChips();
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

// 업체 출력방법 변경 (세션 내 임시 저장)
function updateVendorPrintMethod(name, value) {
  state.vendorPrintMethods[name] = value;
}

// 파일명 생성 (서버와 동일한 규칙)
function getFilename(name) {
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const mo   = String(state.month).padStart(2, '0');
  return `${state.year}년${mo}월_거래명세서_${safe}.xlsx`;
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
    const filename = getFilename(v.name);
    const hasFile  = state.files.some(f => f.name === filename);
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

    const statCell = v.hasCredit
      ? (hasFile
          ? '<span class="badge badge-ok">생성됨</span>'
          : '<span class="badge badge-no">미생성</span>')
      : '<span class="badge" style="background:#f1f5f9;color:#94a3b8">해당없음</span>';

    const dlCell = (v.hasCredit && hasFile)
      ? `<a href="/api/download/${encodeURIComponent(filename)}" class="btn-link" download>다운로드</a>`
      : '-';

    const savedMethod = state.vendorPrintMethods[v.name]
      ?? (state.customers.find(c => c.name === v.name)?.printMethod ?? '');
    const methodCell = v.hasCredit
      ? `<select class="select-method" onchange="updateVendorPrintMethod('${esc(v.name)}', this.value)">${printMethodOptions(savedMethod)}</select>`
      : dash();

    return `<tr>
      <td class="col-chk">${checkCell}</td>
      <td>${esc(v.name)}</td>
      <td class="col-num">${creditCell}</td>
      <td class="col-num">${otherCell}</td>
      <td class="col-num">${total.toLocaleString()}원</td>
      <td class="col-method">${methodCell}</td>
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

    let statusBadge = '<span class="badge badge-no">대기</span>';
    if (status === 'sending') statusBadge = '<span class="badge badge-sending">발송중...</span>';
    if (status === 'sent')    statusBadge = '<span class="badge badge-sent">발송완료</span>';
    if (status === 'fail')    statusBadge = '<span class="badge badge-fail">실패</span>';

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

// ── 세금계산서 발행구분 (세션 임시 저장) ─────────────────────
function getTaxIssuance(vendorName) {
  if (state.taxIssuanceMethods[vendorName] !== undefined)
    return state.taxIssuanceMethods[vendorName];
  return state.customers.find(c => c.name === vendorName)?.taxIssuance || '합산';
}
function updateTaxIssuance(name, value) {
  state.taxIssuanceMethods[name] = value;
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

    const countBadge = `<span class="badge ${invoiceCount > 1 ? 'badge-warn' : 'badge-ok'}">${invoiceCount}장</span>`;

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

  const fRes = await api('GET', '/api/files');
  if (fRes.ok) state.files = fRes.files;
}

// ── 거래명세서 생성 ─────────────────────────────────────────
async function generateSelected() {
  const names = getChecked('vendor-check');
  if (!names.length) return toast('업체를 선택하세요.', 'warn');

  const issueDate    = state.issueDate.replace(/-/g, '/');
  const printMethods = {};
  names.forEach(n => { if (state.vendorPrintMethods[n]) printMethods[n] = state.vendorPrintMethods[n]; });
  toast(`${names.length}개 업체 거래명세서 생성 중...`, '');

  const res = await api('POST', '/api/generate', {
    vendorNames: names,
    issueDate,
    year:  state.year,
    month: state.month,
    printMethods,
  });

  if (res.ok) {
    toast(`✅ ${res.files.length}개 파일 생성 완료`, 'success');
    const fRes = await api('GET', '/api/files');
    if (fRes.ok) state.files = fRes.files;
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
      month:      state.month,
      extraMemo,
    });

    state.emailStatus[name] = res.ok ? 'sent' : 'fail';
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
  if (!name) return toast('업체명을 입력하세요.', 'warn');

  const res = await api('POST', '/api/customers', { name, bizNo, contactName, email, phone, address, bizType, bizItem, printMethod, taxIssuance });
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
  document.getElementById('c-print-method').value  = c.printMethod || '';
  document.getElementById('c-tax-issuance').value  = c.taxIssuance || '합산';
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
  document.getElementById('c-print-method').value = '';
  document.getElementById('c-tax-issuance').value = '합산';
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
      toast(`✅ 전체 ${data.vendors.length}개 업체 로드 (외상 ${creditCount}개)`, 'success');

      const [mRes, fRes] = await Promise.all([
        api('GET', `/api/monthly-status?year=${state.year}`),
        api('GET', '/api/files'),
      ]);
      if (mRes.ok) state.monthlyStatus = mRes.months;
      if (fRes.ok) state.files         = fRes.files;
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
