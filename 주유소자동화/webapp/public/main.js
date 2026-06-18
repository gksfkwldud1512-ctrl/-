'use strict';

// ── 일마감 상태 ──────────────────────────────────────────────
const dailyState = {
  year:           new Date().getFullYear(),
  month:          new Date().getMonth() + 1,
  days:           [],
  purchasePrices: [],
  bankDeposits:   {},
};

// ── 지출목록 상태 ─────────────────────────────────────────────
let expenseList = [];

// ── 유틸 ─────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ── 초기화 ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/version').then(r => r.json()).then(d => {
    const el = document.getElementById('app-version');
    if (el) el.textContent = `v${d.version}`;
  });
  initDailyYearMonth();
  initTabs();
  initDailyUpload();
  loadDailyPurchasePrices();
  loadBankDeposits();
  switchDailySubTab('daily-main');
  loadDailyMonth();
});

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
  selYear.addEventListener('change',  () => { dailyState.year  = Number(selYear.value);  loadDailyMonth(); });
  selMonth.addEventListener('change', () => { dailyState.month = Number(selMonth.value); loadDailyMonth(); });
}

function initTabs() {
  document.querySelectorAll('#subnav-daily .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDailySubTab(btn.dataset.tab));
  });
}

function switchDailySubTab(tab) {
  ['daily-main', 'daily-expense'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      const show = t === tab;
      el.classList.toggle('active', show);
      el.style.display = show ? 'block' : 'none';
    }
  });
  document.querySelectorAll('#subnav-daily .tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (tab === 'daily-expense') loadAllExpenses();
}

function initDailyUpload() {
  document.getElementById('bos-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBos(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('card-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadCard(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('bank-expense-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadBankExpenses(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('expense-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) uploadExpenses(e.target.files[0]);
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

// ── BOS / 이지샵 업로드 ───────────────────────────────────────
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
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); }
}

async function uploadCard(file) {
  toast('이지샵 카드내역 업로드 중...', '');
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/daily/upload-card', { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      toast(`✅ 카드내역 업로드 완료`, 'success');
      switchToUploadedMonth(data.date);
      await loadDailyMonth();
    } else {
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) { toast(`업로드 오류: ${e.message}`, 'error'); }
}

// ── 은행 입금내역 ─────────────────────────────────────────────
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
    for (const [cardCo, actAmt] of Object.entries(actual)) {
      if (!cards[cardCo]) {
        errors.push({ depDate, cardCo, expected: 0, actual: actAmt, diff: actAmt });
      }
    }
  }
  return { errors, hasError: errors.length > 0 };
}

// ── 매입단가 관리 ─────────────────────────────────────────────
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
  const n = dailyState.purchasePrices.length;
  badge.textContent = n ? `단가 ${n}건 등록` : '단가 미등록';
  badge.style.color = n ? '#22c55e' : '#f59e0b';
}

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

// ── 일마감 데이터 ─────────────────────────────────────────────
async function loadDailyMonth() {
  const ym  = `${dailyState.year}-${String(dailyState.month).padStart(2,'0')}`;
  const res = await api('GET', `/api/daily/month/${ym}`);
  if (res.ok) {
    dailyState.days = res.days;
    renderDailyTable();
  }
}

function calcDailyProfit(day) {
  const bos = day.bos;
  if (!bos || !bos.date) return null;
  if (!dailyState.purchasePrices.length) return null;

  let profit = 0;
  ['휘발유', '경유', '등유'].forEach(fuel => {
    const f   = bos.fuels?.[fuel];
    const buy = getPriceForDate(bos.date, fuel);
    if (f && buy) profit += f.amount - (f.qty * buy);
  });
  profit += (bos.carwash?.amount || 0);
  profit += (bos.others?.amount  || 0) - (day.otherCost || 0);
  profit -= (day.card?.totalFee  || 0);
  return Math.round(profit);
}

function renderDailyTable() {
  const tbody = document.getElementById('daily-tbody');
  if (!tbody) return;

  if (!dailyState.days.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="26">BOS 데이터를 업로드하면 현황이 표시됩니다</td></tr>';
    updateDailySummary(null);
    return;
  }

  let totals = { 휘발유L: 0, 경유L: 0, 등유L: 0, 휘발유A: 0, 경유A: 0, 등유A: 0, otherA: 0, carwashA: 0, profit: 0, cardFee: 0 };

  const rows = dailyState.days.map(day => {
    const bos  = day.bos;
    const card = day.card;
    const date = day.date || '';
    const md   = date.slice(5);

    const gL  = bos?.fuels?.['휘발유']?.qty    || 0;
    const dL  = bos?.fuels?.['경유']?.qty      || 0;
    const kL  = bos?.fuels?.['등유']?.qty      || 0;
    const gA  = bos?.fuels?.['휘발유']?.amount || 0;
    const dA  = bos?.fuels?.['경유']?.amount   || 0;
    const kA  = bos?.fuels?.['등유']?.amount   || 0;
    const otA = bos?.others?.amount  || 0;
    const cwA = bos?.carwash?.amount || 0;
    const otC = day.otherCost || 0;
    const cardFee = card?.totalFee || 0;
    const profit  = calcDailyProfit(day);

    totals.휘발유L += gL; totals.경유L += dL; totals.등유L += kL;
    totals.휘발유A += gA; totals.경유A += dA; totals.등유A += kA;
    totals.otherA  += otA; totals.carwashA += cwA;
    totals.profit  += profit ?? 0; totals.cardFee += cardFee;

    const drum  = v => v > 0 ? Math.floor(v / 200).toLocaleString() : '-';
    const litL  = v => v > 0 ? Math.floor(v).toLocaleString() : '-';
    const won   = v => v > 0 ? v.toLocaleString() : '-';
    const price = (a, q) => q > 0 ? Math.round(a / q).toLocaleString() + '원' : '-';
    const buyPr = (d, f) => { const p = getPriceForDate(d, f); return p ? p.toLocaleString() + '원' : '-'; };
    const pf    = profit != null ? `<span class="${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit.toLocaleString()}원</span>` : '-';

    const m      = day.matching;
    const bm     = calcBankMatch(day);
    const hasBankData = Object.keys(dailyState.bankDeposits).length > 0 && day.card?.depositExpected;

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
  const totalPf = hasPriceData
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
  const adjTotal  = adjs.reduce((s, a) => s + (a.amount || 0), 0);
  const remaining = m ? Math.abs(m.totalDiff) - adjTotal : 0;
  const isResolved = m && !m.totalMatch && remaining <= 0 && adjs.length > 0;

  let cardMatchSection = '';
  if (!m) {
    cardMatchSection = '<p style="color:#94a3b8;font-size:12px;margin-top:8px;">BOS 또는 이지샵 데이터가 없어 카드 대사를 수행할 수 없습니다.</p>';
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

    const byCo = {};
    for (const e of m.errors) {
      const co = e.cardCompany || '기타';
      if (!byCo[co]) byCo[co] = { easyOnly: 0, bosOnly: 0, mismatch: 0 };
      if (e.type === 'easy_only')            byCo[co].easyOnly += e.easyAmount || 0;
      else if (e.type === 'bos_only')        byCo[co].bosOnly  += e.bosAmount  || 0;
      else if (e.type === 'amount_mismatch') byCo[co].mismatch += (e.easyAmount || 0) - (e.bosAmount || 0);
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
      errSections = '<p style="color:#15803d;font-weight:600;margin-top:12px;">✅ 모든 카드 거래가 정상 매칭됩니다.</p>';
    }

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
  const reason = document.getElementById('adj-reason')?.value?.trim();
  const amount = Number(document.getElementById('adj-amount')?.value);
  const cardCo = document.getElementById('adj-card-co')?.value;
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

// ── 지출목록 탭 ──────────────────────────────────────────────

async function loadAllExpenses() {
  const countEl = document.getElementById('expense-list-count');
  if (countEl) countEl.textContent = '불러오는 중…';
  const res = await api('GET', '/api/expenses');
  console.log('[지출목록] API 응답:', res);
  if (res.ok) {
    expenseList = res.expenses || [];
    console.log('[지출목록] 건수:', expenseList.length);
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">지출 내역이 없습니다. 수시입출예금 파일을 업로드하세요.</td></tr>';
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
  if (label) label.textContent = `업로드 중: ${file.name}`;
  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch('/api/upload-bank-expenses', { method: 'POST', body: form });
    const data = await res.json();
    console.log('[지출업로드] 응답:', data);
    if (data.ok) {
      if (label) label.textContent = `✅ ${data.count}건 (${(data.months || []).join(', ')})`;
      toast(`✅ 수시입출예금 ${data.count}건 지출 임포트 완료`, 'success');
      loadAllExpenses();
    } else {
      if (label) label.textContent = '업로드 실패';
      toast(`오류: ${data.error}`, 'error');
    }
  } catch (e) {
    if (label) label.textContent = '서버 연결 오류';
    toast(`업로드 오류: ${e.message}`, 'error');
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
