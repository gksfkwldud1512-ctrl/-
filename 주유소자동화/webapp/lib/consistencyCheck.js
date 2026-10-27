'use strict';
const fs   = require('fs');
const path = require('path');

// 데이터 정합성 점검 + 자료 현황 (읽기 전용 — 아무것도 저장하지 않음)
// 같은 BOS 파일이 일마감(daily)·고객판매현황(customer_sales)·거래명세서(vendors) 세 곳에
// 따로 저장되므로, 한 곳만 다시 올리면 화면마다 숫자가 달라진다. 그 차이를 찾아 알려준다.

const NICE_START_DATE = '2026-09-04';
const FUELS = ['휘발유', '경유', '등유'];
// 유종별로 이 일수 넘게 입고 기록이 없으면 입고 등록 누락 의심 (평소 입고 주기 기준)
const LOT_GAP_DAYS = { '휘발유': 14, '경유': 7, '등유': 45 };

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return def; }
}

function shiftDate(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const won = n => `${Math.round(n || 0).toLocaleString()}원`;
const mtimeISO = f => { try { return fs.statSync(f).mtime.toISOString(); } catch (_) { return null; } };

function vendorsPath(dataDir, ym)  { return path.join(dataDir, `vendors_${ym.replace('-', '_')}.json`); }
function custSalesPath(dataDir, ym) { return path.join(dataDir, `customer_sales_${ym.replace('-', '_')}.json`); }

// data/daily/YYYY-MM-*.json 전부 → [{date, ...}]
function loadDailyMonth(dataDir, ym) {
  const dir = path.join(dataDir, 'daily');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.startsWith(ym) && f.endsWith('.json')).sort()
    .map(f => readJSON(path.join(dir, f), null)).filter(Boolean);
}

function bosDayTotal(bos) {
  if (!bos) return 0;
  return Object.values(bos.fuels || {}).reduce((s, x) => s + (x.amount || 0), 0)
    + (bos.carwash?.amount || 0) + (bos.others?.amount || 0);
}

// 마지막 업로드 기록 (type별)
function lastUploads(dataDir) {
  const map = {};
  for (const e of readJSON(path.join(dataDir, 'upload_log.json'), [])) map[e.type] = e;
  return map;
}

// ── 자료 현황: 자료 종류별 "데이터가 몇 일까지 들어 있는지" + 마지막 업로드 ──────
function getDataStatus(ctx) {
  const { dataDir } = ctx;
  const today = ctx.today || localToday();
  const logs  = lastUploads(dataDir);
  const dailyDir = path.join(dataDir, 'daily');
  const latest = { bos: '', easyshop: '', nice: '' };
  if (fs.existsSync(dailyDir)) {
    for (const f of fs.readdirSync(dailyDir).filter(f => f.endsWith('.json'))) {
      const date = f.slice(0, 10);
      const d = readJSON(path.join(dailyDir, f), {});
      if (d.bos && date > latest.bos) latest.bos = date;
      if (d.cardSources?.easyshop && date > latest.easyshop) latest.easyshop = date;
      if (d.cardSources?.nice && date > latest.nice) latest.nice = date;
    }
  }
  const files = fs.readdirSync(dataDir);
  const months = prefix => files.filter(f => f.startsWith(prefix) && /_\d{4}_\d{2}\.json$/.test(f))
    .map(f => f.match(/(\d{4})_(\d{2})\.json$/).slice(1).join('-')).sort();
  const vendorMonths = months('vendors_');
  const csMonths     = months('customer_sales_');
  const maxDate = (list, key = 'date') => list.map(x => x[key]).filter(Boolean).sort().pop() || '';

  const expenses   = readJSON(path.join(dataDir, 'expenses.json'), []).filter(e => e.source === 'bank');
  const bankCard   = Object.keys(readJSON(path.join(dataDir, 'bank_deposits.json'), {})).sort().pop() || '';
  const arDeposits = readJSON(path.join(dataDir, 'ar_deposits.json'), []);
  const tank       = readJSON(path.join(dataDir, 'tank_actuals.json'), []);
  const lots       = readJSON(path.join(dataDir, 'purchase_lots.json', ), []).filter(l => l.type !== 'stock' && !l.stock);

  // stale: 어제 자료까지 있으면 정상, 그보다 오래되면 주의 (일요일 등 쉬는 날 감안해 2일 여유)
  const item = (key, label, dataTo, uploadTypes, where, extra = {}) => {
    const log = uploadTypes.map(t => logs[t]).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at)).pop();
    const lagDays = dataTo ? daysBetween(dataTo, today) : null;
    return { key, label, dataTo, lagDays, stale: !dataTo || lagDays > 2,
             uploadedAt: log?.at || null, uploadedFile: log?.file || null, where, ...extra };
  };

  // 거래명세서(vendors) 마지막 달의 판매 최종일 = 업로드 기록 range, 없으면 그 달만 표시
  const lastVendorYm = vendorMonths[vendorMonths.length - 1] || '';
  const vendorTo = (logs['bos-vendors']?.range?.to) || '';

  return {
    today,
    items: [
      item('bos-daily', 'BOS 판매 (일마감)', latest.bos, ['bos-daily'], '일마감'),
      item('bos-vendors', 'BOS 판매 (거래명세서·미수)', vendorTo && vendorTo.slice(0, 7) === lastVendorYm ? vendorTo : '', ['bos-vendors'], '월마감',
        { months: vendorMonths, note: lastVendorYm ? `${lastVendorYm}까지 저장` : '없음' }),
      item('customer-sales', '고객판매현황', '', ['bos-daily'], '일마감 → 고객판매현황',
        { months: csMonths, note: csMonths.length ? `${csMonths[csMonths.length - 1]}까지 저장` : '없음', stale: false }),
      item('card-nice', '나이스 카드 (유류)', latest.nice, ['card-nice'], '일마감'),
      item('card-easyshop', '이지샵 카드 (세차·유외)', latest.easyshop, ['card-easyshop'], '일마감',
        { note: '세차·유외 카드결제가 없는 날은 비어 있음', staleLimit: 7 }),
      item('bank', '통장 입출금 (지출·미수 입금)', maxDate(expenses) > maxDate(arDeposits) ? maxDate(expenses) : maxDate(arDeposits), ['bank'], '일마감 → 지출목록'),
      item('bank-card', '통장 카드사 입금 (카드 입금 대사)', bankCard, ['bank', 'bank-card'], '일마감'),
      item('tank', '탱크 실재고', maxDate(tank), ['tank'], '종합 → 재고 오차'),
      item('orders', '입고 이력 (주문목록)', maxDate(lots), ['orders'], '일마감 → 입고이력',
        { note: '유종별 마지막 입고: ' + FUELS.map(f => `${f} ${maxDate(lots.filter(l => l.fuel === f)) || '-'}`).join(', ') }),
    ].map(it => it.staleLimit ? { ...it, stale: !it.dataTo || it.lagDays > it.staleLimit } : it),
  };
}

// 생성된 거래명세서 파일(output/YYYY년MM월_거래명세서_업체.xlsx) 총합계 ↔ 지금 데이터로 만들 총합계
// → { stale: [{name, fileTotal, dataTotal, at, text}], fileCount }
async function findStaleStatements(ctx, ym) {
  const { outputDir } = ctx;
  if (!fs.existsSync(outputDir)) return { stale: [], fileCount: 0 };
  const [yy, mm] = ym.split('-');
  const prefix = `${yy}년${mm}월_거래명세서_`;
  const expected = ctx.expectedStatements(ym);
  const bySafeName = new Map([...expected.entries()].map(([n, e]) => [n.replace(/[\\/:*?"<>|]/g, '_'), { name: n, ...e }]));
  const fileTotals = new Map();   // safeName → { total, at }
  for (const f of fs.readdirSync(outputDir).filter(f => f.startsWith(prefix) && f.endsWith('.xlsx'))) {
    const safeName = f.slice(prefix.length, -5).replace(/_(스탠드|배달)$/, '');
    if (!bySafeName.has(safeName)) continue;
    const total = await ctx.readStatementTotal(path.join(outputDir, f));
    if (total == null) continue;
    const cur = fileTotals.get(safeName) || { total: 0, at: '' };
    const at = mtimeISO(path.join(outputDir, f));
    fileTotals.set(safeName, { total: cur.total + total, at: at > cur.at ? at : cur.at });
  }
  const stale = [];
  for (const [safeName, ft] of fileTotals) {
    const e = bySafeName.get(safeName);
    if (Math.abs(Math.round(e.total) - Math.round(ft.total)) > 1) {
      stale.push({ name: e.name, fileTotal: Math.round(ft.total), dataTotal: Math.round(e.total), at: ft.at,
                   text: `${e.name}: 명세서 파일 ${won(ft.total)} / 지금 데이터 ${won(e.total)}` });
    }
  }
  return { stale, fileCount: fileTotals.size };
}

// ── 정합성 점검 ─────────────────────────────────────────────────
// ctx: { dataDir, outputDir, today?, expectedStatements(ym) → Map(name → {total}),
//        readStatementTotal(file) → Promise<number|null>, arSummary() → [{name, months:[{month,remaining}]}] }
// → { month, checks: [{ id, title, level: 'ok'|'warn'|'error'|'info', summary, items:[], tab }] }
async function runConsistency(ctx, ym) {
  const { dataDir, outputDir } = ctx;
  const today = ctx.today || localToday();
  const yesterday = shiftDate(today, -1);
  const checks = [];
  const add = (id, title, tab, level, summary, items = []) => checks.push({ id, title, tab, level, summary, items });

  const vFile    = vendorsPath(dataDir, ym);
  const csFile   = custSalesPath(dataDir, ym);
  const vendors  = readJSON(vFile, null);
  const custSale = readJSON(csFile, null);
  const days     = loadDailyMonth(dataDir, ym);
  const logs     = readJSON(path.join(dataDir, 'upload_log.json'), []);
  const lastLog  = type => logs.filter(e => e.type === type && (e.targets || []).some(t => t.includes(ym))).pop();

  // 1. 거래명세서(vendors) ↔ 고객판매현황: 같은 BOS인데 업체별 금액이 다른지
  if (vendors && custSale) {
    // 업체명 앞뒤 공백은 두 파서가 다르게 다룸(거래명세서 쪽은 BOS 원문 그대로) → trim해서 비교
    const cs = new Map();
    custSale.forEach(c => { const k = String(c.name).trim(); cs.set(k, (cs.get(k) || 0) + (c.totalAmount || 0)); });
    const vs = new Map();
    vendors.forEach(v => { const k = String(v.name).trim(); vs.set(k, (vs.get(k) || 0) + (v.total || 0)); });
    const diffs = [];
    for (const [name, total] of vs) {
      const a = Math.round(total), b = Math.round(cs.get(name) || 0);
      if (Math.abs(a - b) > 1) diffs.push({ name, vendors: a, customerSales: b, diff: a - b });
      cs.delete(name);
    }
    for (const [name, amt] of cs) {
      if (name === '현금고객' || Math.abs(amt) <= 1) continue;   // 이름 없는 거래 — 거래명세서 데이터엔 원래 없음
      diffs.push({ name, vendors: 0, customerSales: Math.round(amt), diff: -Math.round(amt) });
    }
    diffs.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    const vAt = mtimeISO(vFile), cAt = mtimeISO(csFile);
    const newer = vAt && cAt ? (vAt > cAt ? '거래명세서 데이터' : '고객판매현황') : '';
    add('vendors-vs-sales', '거래명세서 ↔ 고객판매현황 업체별 금액', 'statements',
      diffs.length ? 'error' : 'ok',
      diffs.length
        ? `${diffs.length}개 업체 금액이 다릅니다. 두 곳에 서로 다른 시점의 BOS 파일이 올라가 있습니다 (최근 갱신: ${newer}). 같은 BOS 파일을 "자료 올리기"로 한 번 다시 올리면 맞춰집니다.`
        : '업체별 금액이 모두 같습니다.',
      diffs.slice(0, 50).map(d => ({ ...d, text: `${d.name}: 거래명세서 ${won(d.vendors)} / 고객판매현황 ${won(d.customerSales)} (차이 ${won(d.diff)})` })));
  }

  // 2. 일마감 일별 합계 ↔ 고객판매현황 월 합계
  if (days.length && custSale) {
    const dailySum = days.reduce((s, d) => s + bosDayTotal(d.bos), 0);
    const csSum    = custSale.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const diff = Math.round(dailySum - csSum);
    add('daily-vs-sales', '일마감 합계 ↔ 고객판매현황 합계', 'daily-main',
      Math.abs(diff) > 1 ? 'warn' : 'ok',
      Math.abs(diff) > 1 ? `일마감 ${won(dailySum)} / 고객판매현황 ${won(csSum)} — 차이 ${won(diff)}` : `둘 다 ${won(dailySum)}로 같습니다.`);
  }

  // 3. 일마감엔 있는데 거래명세서 데이터가 없는 달
  if (days.length && !vendors) {
    add('vendors-missing', '거래명세서 데이터', 'statements', 'warn',
      `${ym} 일마감 자료는 있는데 거래명세서·미수용 데이터가 없습니다. 그 달 BOS 판매전표(1일부터)를 "자료 올리기"로 올리세요.`);
  } else if (vendors) {
    const log = lastLog('bos-vendors');
    add('vendors-missing', '거래명세서 데이터', 'statements', 'ok',
      `업체 ${vendors.length}곳 저장됨${log?.range ? ` (판매일 ${log.range.from} ~ ${log.range.to})` : ''}`);
  }

  // 4. 날짜별 자료 누락 (어제까지)
  const [y, m] = ym.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lastDay  = monthEnd < yesterday ? monthEnd : yesterday;
  const byDate = new Map(days.map(d => [d.date, d]));
  const missing = [];
  for (let d = `${ym}-01`; d <= lastDay; d = shiftDate(d, 1)) {
    const day = byDate.get(d);
    const lacks = [];
    if (!day?.bos) lacks.push('BOS');
    if (d >= NICE_START_DATE && day?.bos && !day.cardSources?.nice) lacks.push('나이스 카드');
    if (day?.bos?.cardTxs?.length && !day.card) lacks.push('카드내역');
    if (lacks.length) missing.push({ date: d, lacks, text: `${d}: ${lacks.join(', ')} 없음` });
  }
  if (lastDay >= `${ym}-01`) {
    add('daily-missing', '일마감 날짜별 자료', 'daily-main', missing.length ? 'warn' : 'ok',
      missing.length ? `${missing.length}일 자료가 빠져 있습니다.` : `${ym}-01 ~ ${lastDay} 모두 있습니다.`, missing);
  }

  // 5. 거래명세서 파일이 지금 데이터와 다름 (데이터를 고친 뒤 다시 생성 안 함)
  if (vendors && ctx.expectedStatements && ctx.readStatementTotal && fs.existsSync(outputDir)) {
    const { stale, fileCount } = await findStaleStatements(ctx, ym);
    add('statements-stale', '거래명세서 파일 최신 여부', 'statements', stale.length ? 'error' : 'ok',
      stale.length ? `${stale.length}개 업체 명세서가 지금 데이터와 다릅니다. 다시 생성하세요.`
                   : `생성된 명세서 ${fileCount}개 모두 지금 데이터와 같습니다.`, stale);
  }

  // 6. 외상 업체 고객정보 (사업자번호·이메일)
  if (vendors) {
    const customers = readJSON(path.join(dataDir, 'customers.json'), []);
    const byName = new Map(customers.map(c => [c.name, c]));
    const lacks = [];
    for (const v of vendors.filter(v => v.hasCredit)) {
      const c = byName.get(v.name) || {};
      const miss = [];
      if (String(c.bizNo || '').replace(/\D/g, '').length !== 10) miss.push('사업자번호');
      if (!c.email) miss.push('이메일');
      if (miss.length) lacks.push({ name: v.name, credit: Math.round(v.totalCredit || 0), miss,
                                    text: `${v.name} (외상 ${won(v.totalCredit)}): ${miss.join('·')} 없음` });
    }
    lacks.sort((a, b) => b.credit - a.credit);
    add('customer-info', '외상 업체 고객정보', 'customers', lacks.length ? 'warn' : 'ok',
      lacks.length ? `${lacks.length}개 외상 업체에 세금계산서·메일 발송 정보가 없습니다.` : '모든 외상 업체 정보가 있습니다.', lacks);
  }

  // 7. 카드 대사 오류 + 미수
  if (days.length) {
    // 카드에만 있는 거래 중 외상 카드결제로 잡힌 것(ar_card_payments)과 사유 등록(cardAdjustments)은 차이에서 뺌
    const arCards = new Set(readJSON(path.join(dataDir, 'ar_card_payments.json'), [])
      .map(c => c.cardId || (c.rounding ? null : c.id.split('#')[0])).filter(Boolean));
    const leftDiff = d => {
      const ar = (d.matching.errors || []).filter(e => e.type === 'easy_only' && arCards.has(`${d.date}|${e.approvalNo}`))
        .reduce((s, e) => s + (e.easyAmount || 0), 0);
      const adj = (d.cardAdjustments || []).reduce((s, x) => s + (x.amount || 0), 0);
      return Math.max(0, Math.abs(d.matching.totalDiff + ar) - adj);
    };
    const bad = days.filter(d => d.matching && !d.matching.totalMatch && leftDiff(d) > 0);
    add('card-matching', '카드 대사', 'daily-main', bad.length ? 'warn' : 'ok',
      bad.length ? `${bad.length}일 BOS ↔ 카드 금액이 맞지 않습니다. (외상 카드결제·사유 등록분 제외)` : '대사한 날 모두 일치합니다.',
      bad.map(d => ({ date: d.date, diff: leftDiff(d), text: `${d.date}: 남은 차이 ${won(leftDiff(d))} / 오류 ${(d.matching.errors || []).length}건` })));
  }
  if (ctx.arSummary) {
    try {
      // 업체별 입금 지연(1~2개월 등) 기한이 지났는데 안 들어온 달만 "밀린 미수" (기한 전은 입금 대기라 정상)
      // 현장카드 업체(받음 체크 전)는 따로 셈
      const ar = ctx.arSummary();
      const pick = st => ar.map(v => ({ name: v.name, months: v.months.filter(x => st.includes(x.status) && x.month <= ym) }))
        .filter(v => v.months.length)
        .map(v => ({ ...v, amount: v.months.reduce((s, x) => s + Math.max(0, x.remaining), 0) }))
        .sort((a, b) => b.amount - a.amount);
      const old = pick(['overdue', 'short']);
      const card = pick(['card-wait']);
      add('ar-overdue', '밀린 미수', 'archeck', old.length ? 'warn' : 'ok',
        (old.length ? `입금 기한이 지난 미수: ${old.length}개 업체 ${won(old.reduce((s, v) => s + v.amount, 0))}.` : '입금 기한이 지난 미수가 없습니다.')
          + (card.length ? ` 현장카드 업체 받음 체크 전: ${card.length}곳 ${won(card.reduce((s, v) => s + v.amount, 0))}.` : ''),
        [...old.slice(0, 30).map(v => ({ name: v.name, text: `${v.name}: ${v.months.length}개월 ${won(v.amount)} (${v.months.map(x => x.month.slice(5) + '월').join(', ')})` })),
         ...card.slice(0, 15).map(v => ({ name: v.name, text: `[카드] ${v.name}: ${v.months.map(x => x.month.slice(5) + '월').join(', ')} 받음 체크 전` }))]);
    } catch (e) { add('ar-overdue', '밀린 미수', 'archeck', 'info', `계산 실패: ${e.message}`); }
  }

  // 8. 입고 기록 공백 (판매는 계속되는데 입고 등록이 오래 없음)
  {
    const lots = readJSON(path.join(dataDir, 'purchase_lots.json'), []).filter(l => l.type !== 'stock' && !l.stock && l.qty > 0);
    const lastSale = days.filter(d => d.bos).map(d => d.date).sort().pop();
    if (lastSale) {
      const gaps = [];
      for (const fuel of FUELS) {
        const last = lots.filter(l => l.fuel === fuel && l.date <= lastSale).map(l => l.date).sort().pop();
        const sold = days.reduce((s, d) => s + (d.bos?.fuels?.[fuel]?.qty || 0), 0);
        if (!sold) continue;
        const gap = last ? daysBetween(last, lastSale) : null;
        if (gap == null || gap > LOT_GAP_DAYS[fuel]) {
          gaps.push({ fuel, last: last || null, gap, text: `${fuel}: 마지막 입고 ${last || '기록 없음'}${gap != null ? ` (${gap}일 전)` : ''} — 그동안 판매는 계속됨` });
        }
      }
      add('lots-gap', '입고 기록', 'daily-main', gaps.length ? 'warn' : 'ok',
        gaps.length ? '입고 등록이 오래 없는 유종이 있습니다. 주문목록을 올리거나 입고이력에 입력하세요.' : '유종별 입고 기록이 이어지고 있습니다.', gaps);
    }
  }

  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  return {
    month: ym,
    counts: checks.reduce((acc, c) => (acc[c.level] = (acc[c.level] || 0) + 1, acc), {}),
    checks: checks.sort((a, b) => order[a.level] - order[b.level]),
  };
}

module.exports = { getDataStatus, runConsistency, findStaleStatements };
