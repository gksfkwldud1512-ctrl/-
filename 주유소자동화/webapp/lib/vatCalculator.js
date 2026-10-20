// 부가가치세 분기 계산 — (주)미소주유소 = 법인 일반과세자
//   매출: 일마감 BOS 판매금액(부가세 포함) → 공급가액 = 금액 ÷ 1.1
//   매입: 입고이력(purchase_lots, 단가 부가세 포함) + 고정 세금계산서(임차료) + 수동 입력분
//   공제: 신용카드 발행세액공제는 법인 제외(0), 전자신고세액공제는 확정신고 때만 선택
// 법인은 분기마다 신고: 1Q 예정(4/25) · 2Q 확정(7/25) · 3Q 예정(10/25) · 4Q 확정(다음해 1/25)
const fs = require('fs');
const path = require('path');

const VAT_SETTINGS_DEFAULT = {
  // 매달 같은 금액으로 받는 매입 세금계산서 (공급가액 기준)
  fixedPurchases: [
    { id: 'rent', name: 'HD현대오일뱅크 임차료', kind: '세금계산서', supplyMonthly: 11000000, from: '2026-01', to: null },
  ],
  // 분기별 수동 입력 매입 { 'YYYY-Qn': [{ id, kind, name, supply, tax, deductible, memo }] }
  manualPurchases: {},
  // 면세유 공급 고객 (BOS 고객명) — 과세표준에서 제외
  taxFreeCustomers: [],
  // 유가보조금 카드업체(statement_nonfuel_only)의 유류분을 세금계산서 대상에서 빼기 시작하는 월
  nonFuelOnlyFrom: '2026-09',
  // 확정신고 때 직접 전자신고하면 1만원 공제 (세무사 대리 신고면 해당 없음)
  eFilingCredit: false,
  // 실제 신고 금액 { 'YYYY-Qn': { salesInvoiceSupply, salesCardSupply, salesOtherSupply, outputTax, inputInvoiceSupply, inputCardSupply, inputTax, payable } }
  actual: {},
};

const FUELS = ['휘발유', '경유', '등유'];
const PAY_GIFT = ['포인트', '상품권', '디지털상품권', '디지털쿠폰'];

const readJSON = (file, def) => {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* 손상 시 기본값 */ }
  return def;
};
const pad = n => String(n).padStart(2, '0');
// 부가세 포함 금액 → 공급가액/세액 (원 미만 반올림, 세액은 차액)
const split = amount => { const supply = Math.round(amount / 1.1); return { amount, supply, tax: amount - supply }; };
const validBizNo = s => String(s || '').replace(/\D/g, '').length === 10;

function quarterInfo(year, quarter) {
  const m0 = (quarter - 1) * 3 + 1;
  const months = [0, 1, 2].map(i => `${year}-${pad(m0 + i)}`);
  const from = `${months[0]}-01`;
  const to = `${months[2]}-${pad(new Date(year, m0 + 2, 0).getDate())}`;
  const isFinal = quarter % 2 === 0;
  // 신고기한: 다음 달 25일, 토·일이면 다음 월요일 (공휴일은 미반영)
  const due = new Date(Date.UTC(quarter === 4 ? year + 1 : year, quarter === 4 ? 0 : m0 + 2, 25));
  while (due.getUTCDay() === 0 || due.getUTCDay() === 6) due.setUTCDate(due.getUTCDate() + 1);
  return {
    year, quarter, key: `${year}-Q${quarter}`, months, from, to,
    type: isFinal ? '확정' : '예정',
    label: `${year}년 ${quarter <= 2 ? 1 : 2}기 ${isFinal ? '확정' : '예정'} (${m0}~${m0 + 2}월)`,
    dueDate: due.toISOString().slice(0, 10),
  };
}

function loadSettings(dataDir) {
  const s = readJSON(path.join(dataDir, 'vat_settings.json'), {});
  // 기본값 객체가 저장 과정에서 바뀌지 않도록 복사본 사용
  return { ...JSON.parse(JSON.stringify(VAT_SETTINGS_DEFAULT)), ...s };
}

function calcVatQuarter(dataDir, year, quarter, today = new Date().toISOString().slice(0, 10)) {
  const period = quarterInfo(year, quarter);
  const settings = loadSettings(dataDir);
  const warnings = [];
  const taxFree = new Set(settings.taxFreeCustomers || []);

  // ── 매출: 일마감 BOS ──
  const dailyDir = path.join(dataDir, 'daily');
  const days = fs.existsSync(dailyDir) ? fs.readdirSync(dailyDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= period.from && f.slice(0, 10) <= period.to)
    .sort().map(f => readJSON(path.join(dailyDir, f), {})).filter(d => d.bos?.fuels) : [];
  const byMonth = Object.fromEntries(period.months.map(m => [m, { month: m, total: 0, fuel: 0, carwash: 0, others: 0, card: 0, cash: 0, credit: 0, gift: 0, days: 0 }]));
  for (const d of days) {
    const b = d.bos, mm = byMonth[b.date.slice(0, 7)];
    if (!mm) continue;
    const fuel = FUELS.reduce((s, f) => s + (b.fuels[f]?.amount || 0), 0);
    mm.fuel += fuel; mm.carwash += b.carwash?.amount || 0; mm.others += b.others?.amount || 0;
    mm.total += fuel + (b.carwash?.amount || 0) + (b.others?.amount || 0);
    const p = b.byPay || {};
    mm.card += p['신용카드'] || 0; mm.cash += p['현금'] || 0; mm.credit += p['외상'] || 0;
    mm.days++;
  }
  // 기타 결제 = 합계 − 카드 − 현금 − 외상 (포인트·상품권 등, 일마감 byPay엔 따로 없음)
  for (const mm of Object.values(byMonth)) mm.gift = mm.total - mm.card - mm.cash - mm.credit;
  const lastDataDate = days.length ? days[days.length - 1].bos.date : null;
  const expectedDays = Math.round((new Date(period.to) - new Date(period.from)) / 864e5) + 1;
  const complete = days.length >= expectedDays;
  if (!days.length) warnings.push('이 분기 일마감 자료가 없습니다.');
  else if (!complete) warnings.push(`일마감 자료가 ${days.length}/${expectedDays}일만 있습니다 (마지막 ${lastDataDate}). 분기가 끝나지 않았거나 업로드가 빠졌으면 금액이 작게 나옵니다.`);

  // ── 외상 고객별: 고객판매현황 (월 단위) ──
  const customers = readJSON(path.join(dataDir, 'customers.json'), []);
  const bizNoOf = Object.fromEntries(customers.map(c => [c.name, c.bizNo]));
  const nonFuelOnly = new Set(readJSON(path.join(dataDir, 'statement_nonfuel_only.json'), []));
  const credit = {};   // name → { amount, fuel, nonFuel, bizNo }
  const taxFreeSales = {};
  let giftFromCustomers = 0;
  for (const m of period.months) {
    const rows = readJSON(path.join(dataDir, `customer_sales_${m.replace('-', '_')}.json`), null);
    if (!rows) { if (byMonth[m].days) warnings.push(`${m} 고객판매현황 자료가 없어 세금계산서 발급분을 나눌 수 없습니다.`); continue; }
    for (const r of rows) {
      const fuelAmt = FUELS.reduce((s, f) => s + (r.fuels?.[f]?.amount || 0), 0);
      if (taxFree.has(r.name)) { taxFreeSales[r.name] = (taxFreeSales[r.name] || 0) + (r.totalAmount || 0); continue; }
      if (PAY_GIFT.includes(r.payType)) giftFromCustomers += r.totalAmount || 0;
      if (r.payType !== '외상') continue;
      const c = credit[r.name] || (credit[r.name] = { name: r.name, bizNo: bizNoOf[r.name] || '', amount: 0, fuel: 0, nonFuel: 0, nonFuelOnlyFuel: 0 });
      c.amount += r.totalAmount || 0; c.fuel += fuelAmt; c.nonFuel += (r.totalAmount || 0) - fuelAmt;
      if (nonFuelOnly.has(r.name) && settings.nonFuelOnlyFrom && m >= settings.nonFuelOnlyFrom) c.nonFuelOnlyFuel += fuelAmt;
    }
  }

  const total = Object.values(byMonth).reduce((s, x) => s + x.total, 0);
  const taxFreeAmount = Object.values(taxFreeSales).reduce((s, v) => s + v, 0);
  const sum = (o, k) => Object.values(o).reduce((s, x) => s + x[k], 0);
  const creditList = Object.values(credit).sort((a, b) => b.amount - a.amount);
  const invoiceCust = creditList.filter(c => validBizNo(c.bizNo));
  const noBizCust = creditList.filter(c => !validBizNo(c.bizNo));
  const invoiceAmount = invoiceCust.reduce((s, c) => s + c.amount - c.nonFuelOnlyFuel, 0);
  const subsidyCardAmount = creditList.reduce((s, c) => s + c.nonFuelOnlyFuel, 0);
  const noBizAmount = noBizCust.reduce((s, c) => s + c.amount - c.nonFuelOnlyFuel, 0);
  const cardAmount = sum(byMonth, 'card'), cashAmount = sum(byMonth, 'cash');
  // 나머지(포인트·상품권 등 + 일마감·고객현황 반올림 차이) = 총매출에서 나눈 것들을 뺀 값 → 합계가 항상 총매출과 같음
  const taxable = total - taxFreeAmount;
  const otherAmount = taxable - invoiceAmount - subsidyCardAmount - cardAmount - cashAmount - noBizAmount;

  const lines = [
    { key: 'invoice', label: '세금계산서 발급분', basis: `외상 고객 중 사업자번호 등록 ${invoiceCust.length}곳`, ...split(invoiceAmount) },
    { key: 'card', label: '신용카드 매출', basis: 'BOS 결제구분 신용카드', ...split(cardAmount) },
    { key: 'subsidyCard', label: '유가보조금 카드 결제분', basis: `유외상품만 명세서 발행하는 업체의 유류분 (${settings.nonFuelOnlyFrom}~)`, ...split(subsidyCardAmount) },
    { key: 'cash', label: '현금 매출', basis: 'BOS 결제구분 현금 (현금영수증 발행 여부 미확인)', ...split(cashAmount) },
    { key: 'noBiz', label: '외상 (사업자번호 미등록)', basis: `고객관리에 사업자번호 없는 ${noBizCust.length}곳`, ...split(noBizAmount) },
    { key: 'other', label: '포인트·상품권 등', basis: '포인트·상품권·쿠폰 결제 + 집계 차이', ...split(otherAmount) },
  ].filter(l => l.amount !== 0 || ['invoice', 'card', 'cash'].includes(l.key));
  // 공급가액 합계를 총액 기준으로 한 번 더 맞춤 (줄별 반올림 차이 흡수)
  const salesTotal = split(taxable);
  const lineSupplySum = lines.reduce((s, l) => s + l.supply, 0);
  if (lines.length && lineSupplySum !== salesTotal.supply) {
    const big = lines.reduce((a, l) => (l.amount > a.amount ? l : a));
    big.supply += salesTotal.supply - lineSupplySum; big.tax = big.amount - big.supply;
  }

  const taxFreeCandidates = [...new Set(creditList.map(c => c.name).filter(n => /면세/.test(n) && !taxFree.has(n)))];
  if (taxFreeCandidates.length) warnings.push(`이름에 "면세"가 들어간 고객이 과세로 계산되고 있습니다: ${taxFreeCandidates.join(', ')} — 면세유 공급이면 면세로 지정하세요.`);
  if (noBizAmount > 0) warnings.push(`고객관리에 사업자번호가 없는 외상 ${noBizAmount.toLocaleString()}원(${noBizCust.length}곳)은 세금계산서 발급분으로 나누지 못했습니다. 세금계산서를 받는 업체면 [월마감 → 고객 관리]에 사업자번호를 등록하세요. 합계(과세표준·세액)에는 영향 없습니다.`);

  // ── 매입: 연료 입고 ──
  const lots = readJSON(path.join(dataDir, 'purchase_lots.json'), [])
    .filter(l => l.qty > 0 && l.type !== 'stock' && !l.stock && l.date >= period.from && l.date <= period.to);
  const fuelByType = FUELS.map(f => {
    const ls = lots.filter(l => l.fuel === f);
    const amount = Math.round(ls.reduce((s, l) => s + l.qty * l.price, 0));
    return { fuel: f, count: ls.length, qty: ls.reduce((s, l) => s + l.qty, 0), ...split(amount) };
  });
  const fuelAmount = fuelByType.reduce((s, x) => s + x.amount, 0);
  const fuelPurchase = { ...split(fuelAmount), byFuel: fuelByType, count: lots.length };
  fuelPurchase.supply = fuelByType.reduce((s, x) => s + x.supply, 0); fuelPurchase.tax = fuelAmount - fuelPurchase.supply;
  if (!lots.length) warnings.push('이 분기 연료 입고 기록이 없습니다 (입고이력 등록 필요).');

  // ── 매입: 고정 세금계산서 ──
  const fixed = (settings.fixedPurchases || []).map(fp => {
    // 진행 중인 분기는 이번 달까지만 (아직 안 받은 달의 세금계산서는 넣지 않음)
    const n = period.months.filter(m => m >= fp.from && (!fp.to || m <= fp.to) && m <= today.slice(0, 7)).length;
    const supply = (fp.supplyMonthly || 0) * n;
    return { ...fp, months: n, supply, tax: Math.round(supply * 0.1), deductible: fp.deductible !== false };
  }).filter(fp => fp.months > 0);

  // ── 매입: 수동 입력 ──
  const manual = ((settings.manualPurchases || {})[period.key] || []).map(e => ({
    ...e, supply: +e.supply || 0, tax: e.tax != null && e.tax !== '' ? +e.tax : Math.round((+e.supply || 0) * 0.1), deductible: e.deductible !== false,
  }));
  if (!manual.length) warnings.push('기타 매입(소액 세금계산서·사업용 카드)이 입력되지 않았습니다. 2분기 실적은 공급가액 약 2,690만원(세액 약 269만원)이었습니다.');

  const purchaseItems = [
    { key: 'fuel', label: '연료 매입 (HD현대오일뱅크)', kind: '세금계산서', supply: fuelPurchase.supply, tax: fuelPurchase.tax, deductible: true, basis: `입고 ${lots.length}건 × 단가 ÷ 1.1` },
    ...fixed.map(f => ({ key: `fixed:${f.id}`, label: f.name, kind: f.kind || '세금계산서', supply: f.supply, tax: f.tax, deductible: f.deductible, basis: `월 ${f.supplyMonthly.toLocaleString()} × ${f.months}개월` })),
    ...manual.map(e => ({ key: `manual:${e.id}`, id: e.id, label: e.name, kind: e.kind || '세금계산서', supply: e.supply, tax: e.tax, deductible: e.deductible, basis: e.memo || '직접 입력' })),
  ];
  const ded = purchaseItems.filter(p => p.deductible), nonDed = purchaseItems.filter(p => !p.deductible);
  const purchase = {
    items: purchaseItems,
    fuel: fuelPurchase,
    invoiceSupply: ded.filter(p => p.kind === '세금계산서').reduce((s, p) => s + p.supply, 0),
    cardSupply: ded.filter(p => p.kind !== '세금계산서').reduce((s, p) => s + p.supply, 0),
    supply: ded.reduce((s, p) => s + p.supply, 0),
    tax: ded.reduce((s, p) => s + p.tax, 0),
    nonDeductibleSupply: nonDed.reduce((s, p) => s + p.supply, 0),
    nonDeductibleTax: nonDed.reduce((s, p) => s + p.tax, 0),
  };

  // ── 공제·납부 ──
  const credits = [
    { key: 'cardIssue', label: '신용카드매출전표 등 발행세액공제', amount: 0, note: '법인사업자는 적용 대상 아님 (개인사업자 공급가액 10억 이하만)' },
    { key: 'eFiling', label: '전자신고세액공제', amount: period.type === '확정' && settings.eFilingCredit ? 10000 : 0, note: '확정신고 때 직접 전자신고하면 1만원 (세무사 대리 신고는 해당 없음)' },
  ];
  const creditTotal = credits.reduce((s, c) => s + c.amount, 0);
  const outputTax = lines.reduce((s, l) => s + l.tax, 0);
  const payable = outputTax - purchase.tax - creditTotal;

  // ── 실제 신고 대조 ──
  const actual = (settings.actual || {})[period.key] || null;
  let compare = null;
  if (actual) {
    const est = {
      salesSupply: salesTotal.supply,
      salesInvoiceSupply: lines.find(l => l.key === 'invoice')?.supply || 0,
      salesCardSupply: salesTotal.supply - (lines.find(l => l.key === 'invoice')?.supply || 0),
      outputTax,
      inputInvoiceSupply: purchase.invoiceSupply,
      inputCardSupply: purchase.cardSupply,
      inputTax: purchase.tax,
      payable: outputTax - purchase.tax,   // 신고서 ㉰ = ㉮ − ㉯ (경감·공제세액 차감 전)
    };
    // 일반과세자 신고서 칸 번호 기준
    const labels = {
      salesSupply: '매출 과세표준 합계 (9) 금액', salesInvoiceSupply: '└ 세금계산서 발급분 (1)', salesCardSupply: '└ 신용카드·현금영수증 (3) + 기타 (4)',
      outputTax: '매출세액 ㉮ (9) 세액', inputInvoiceSupply: '세금계산서 수취분 (10)+(11) 금액', inputCardSupply: '그 밖의 공제매입 (14) 금액',
      inputTax: '매입세액 ㉯ (17) 세액', payable: '납부(환급)세액 ㉰ = ㉮ − ㉯',
    };
    // 웹앱 예상의 "카드·현금 등"은 세금계산서 외 전부라서 실제도 (3)+(4)로 맞춰 비교
    const act = { ...actual };
    if (act.salesCardSupply != null || act.salesOtherSupply != null) act.salesCardSupply = (act.salesCardSupply || 0) + (act.salesOtherSupply || 0);
    if (act.salesSupply == null && act.salesInvoiceSupply != null) act.salesSupply = (act.salesInvoiceSupply || 0) + (act.salesCardSupply || 0);
    compare = Object.keys(labels).filter(k => act[k] != null).map(k => ({
      key: k, label: labels[k], estimate: est[k], actual: act[k], diff: est[k] - act[k],
      rate: act[k] ? (est[k] - act[k]) / act[k] : null,
    }));
  }

  return {
    period: { ...period, days: days.length, expectedDays, complete, lastDataDate, dDay: Math.round((new Date(period.dueDate) - new Date(today)) / 864e5) },
    sales: { total, taxFree: taxFreeAmount, taxFreeCustomers: taxFreeSales, taxable, supply: salesTotal.supply, tax: outputTax, lines,
      byMonth: Object.values(byMonth), taxFreeCandidates, invoiceCustomers: invoiceCust, noBizCustomers: noBizCust, giftFromCustomers },
    purchase, credits, creditTotal, outputTax, inputTax: purchase.tax, payable,
    actual, compare, warnings,
  };
}

module.exports = { calcVatQuarter, quarterInfo, loadSettings, VAT_SETTINGS_DEFAULT };
