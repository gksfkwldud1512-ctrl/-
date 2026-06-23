'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { version } = require('./package.json');

const app  = express();
const PORT = 3000;

app.use(express.json());
// 정적 파일 캐시 완전 방지 (HTML 포함 — 코드 업데이트 즉시 반영)
app.use((req, res, next) => {
  if (/\.(js|css|html)$/.test(req.path) || req.path === '/' || req.path === '') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/version', (req, res) => res.json({ version }));

const DATA_DIR    = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR  = path.join(__dirname, 'output');

[DATA_DIR, UPLOADS_DIR, OUTPUT_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `upload_${Date.now()}.xlsx`),
  }),
  fileFilter: (req, file, cb) => cb(null, /\.(xlsx|xls)$/i.test(file.originalname)),
});

const CUSTOMERS_FILE       = path.join(DATA_DIR, 'customers.json');
const SETTINGS_FILE        = path.join(DATA_DIR, 'settings.json');
const PURCHASE_PRICES_FILE = path.join(DATA_DIR, 'purchase_prices.json');
const PURCHASE_LOTS_FILE    = path.join(DATA_DIR, 'purchase_lots.json');
const FIFO_DAILY_FILE       = path.join(DATA_DIR, 'fifo_daily_prices.json');
const TANK_ACTUALS_FILE     = path.join(DATA_DIR, 'tank_actuals.json');
const EXPENSES_FILE         = path.join(DATA_DIR, 'expenses.json');
const DAILY_DIR            = path.join(DATA_DIR, 'daily');
const BANK_DEPOSITS_FILE   = path.join(DATA_DIR, 'bank_deposits.json');
const COMPLETION_FILE      = path.join(DATA_DIR, 'completion.json');

if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });

// ── FIFO 단가 재계산 ──────────────────────────────────────────
// 입고 이력(purchase_lots) + 일별 판매(daily/*.json) → 날짜별 적용 단가 계산
function recomputeFifoPrices() {
  const lots = readJSON(PURCHASE_LOTS_FILE, []);
  if (!lots.length) return;

  // 모든 일별 판매량 집계
  const salesByFuel = {};  // { fuel: [{date, qty}] }
  if (fs.existsSync(DAILY_DIR)) {
    fs.readdirSync(DAILY_DIR)
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        const day = readJSON(path.join(DAILY_DIR, f), {});
        if (!day.bos?.date || !day.bos?.fuels) return;
        const date = day.bos.date;
        for (const [fuel, data] of Object.entries(day.bos.fuels)) {
          if (!['휘발유','경유','등유'].includes(fuel)) continue;
          if (!salesByFuel[fuel]) salesByFuel[fuel] = [];
          salesByFuel[fuel].push({ date, qty: data.qty || 0 });
        }
      });
  }
  for (const fuel of Object.keys(salesByFuel)) {
    salesByFuel[fuel].sort((a, b) => a.date.localeCompare(b.date));
  }

  const priceChanges = [];

  for (const fuel of ['휘발유', '경유', '등유']) {
    const fuelLots = lots
      .filter(l => l.fuel === fuel && l.qty > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!fuelLots.length) continue;

    const sales = salesByFuel[fuel] || [];
    let lotIdx   = 0;
    let remaining = fuelLots[0].qty;
    priceChanges.push({ date: fuelLots[0].date, fuel, price: fuelLots[0].price });

    for (const sale of sales) {
      if (sale.date < fuelLots[lotIdx].date) continue;
      remaining -= sale.qty;

      while (remaining <= 0 && lotIdx < fuelLots.length - 1) {
        lotIdx++;
        remaining += fuelLots[lotIdx].qty;
        // 재고 소진 당일부터 다음 단가 적용
        priceChanges.push({ date: sale.date, fuel, price: fuelLots[lotIdx].price });
      }
    }
  }

  priceChanges.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
  writeJSON(PURCHASE_PRICES_FILE, priceChanges);
}

const { parseBosDaily, parseCustomerSales } = require('./lib/dailyBosParser');
const { parseEasyshop }    = require('./lib/easyshopParser');
const { matchCards }       = require('./lib/cardMatcher');
const { parseBankDeposits } = require('./lib/bankParser');

function vendorFile(year, month) {
  const mo = String(month).padStart(2, '0');
  return path.join(DATA_DIR, `vendors_${year}_${mo}.json`);
}

function fuelSummaryFile(year, month) {
  const mo = String(month).padStart(2, '0');
  return path.join(DATA_DIR, `monthly_fuel_${year}_${mo}.json`);
}

function getVendors(year, month) {
  return readJSON(vendorFile(year, month), []);
}

function readJSON(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('[readJSON]', file, e.message); }
  return def;
}
function writeJSON(file, data) {
  // 원자적 쓰기: 임시 파일에 먼저 쓰고 rename → 전원 차단 시에도 데이터 보존
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

// ── Excel 업로드 & 파싱 ────────────────────────────────────────
app.post('/api/parse-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: '파일이 없습니다.' });
    const year  = req.body.year  || new Date().getFullYear();
    const month = req.body.month || new Date().getMonth() + 1;
    const { parseExcel } = require('./lib/excelParser');
    const { vendors, fuelSummary } = parseExcel(req.file.path);
    writeJSON(vendorFile(year, month), vendors);
    writeJSON(fuelSummaryFile(year, month), fuelSummary);
    res.json({ ok: true, vendors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 업체 목록 조회 (월별, BOS + 배달 합산) ────────────────────
app.get('/api/vendors', (req, res) => {
  const year  = req.query.year  || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;
  res.json({ ok: true, vendors: getVendors(year, month) });
});

// ── 월별 업로드 현황 ──────────────────────────────────────────
app.get('/api/monthly-status', (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const months = {};
  for (let m = 1; m <= 12; m++) {
    const mo = String(m).padStart(2, '0');
    months[mo] = fs.existsSync(vendorFile(year, m));
  }
  res.json({ ok: true, months });
});

// ── 월별 영업이익 분석 ────────────────────────────────────────────
app.get('/api/monthly-profit', (req, res) => {
  const year  = req.query.year  || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;

  const fuelSummary   = readJSON(fuelSummaryFile(year, month), null);
  const prices        = readJSON(PURCHASE_PRICES_FILE, []);
  // fifo_daily_prices.json = 마감자료에서 직접 추출한 일별 FIFO 단가 (정확한 기준)
  const fifoDaily     = readJSON(FIFO_DAILY_FILE, []);
  const fifoDailyMap  = {};
  for (const e of fifoDaily) { if (!fifoDailyMap[e.date]) fifoDailyMap[e.date] = e; } // 날짜별 첫 번째 항목 우선

  if (!fuelSummary) return res.json({ ok: true, fuelTotals: null });

  // 날짜 기준 매입단가 조회 — fifo_daily_prices 우선, 없으면 purchase_prices fallback
  function getPriceForDate(date, fuel) {
    const d = date.replace(/\//g, '-');
    // 1순위: 마감자료에서 추출한 일별 FIFO 단가
    const fifoEntry = fifoDailyMap[d];
    if (fifoEntry && fifoEntry[fuel]?.price) return fifoEntry[fuel].price;
    // 2순위: 입고 이력 기반 계산 단가 (fallback)
    let found = null;
    for (const p of prices) {
      if (p.fuel === fuel && p.date <= d) found = p.price;
    }
    return found;
  }

  const FUEL_TYPES = ['휘발유', '경유', '등유'];
  const totals = {};  // { product: { qty, amount, cost, profit } }

  for (const [date, fuels] of Object.entries(fuelSummary)) {
    for (const [prod, data] of Object.entries(fuels)) {
      if (!totals[prod]) totals[prod] = { qty: 0, amount: 0, cost: 0, hasPrice: false };
      totals[prod].qty    += data.qty;
      totals[prod].amount += data.amount;

      if (FUEL_TYPES.includes(prod)) {
        const p = getPriceForDate(date, prod);
        if (p != null) {
          totals[prod].cost     += data.qty * p;
          totals[prod].hasPrice  = true;
        }
      }
    }
  }

  // 이익 계산
  for (const [prod, t] of Object.entries(totals)) {
    if (FUEL_TYPES.includes(prod)) {
      t.profit = t.hasPrice ? Math.round(t.amount - t.cost) : null;
    } else {
      t.profit = t.amount;  // 세차/유외상품은 전액 이익 (원가는 일마감에서 관리)
    }
  }

  res.json({ ok: true, fuelTotals: totals, hasPrices: prices.length > 0 });
});

// ── 연간 고객별 판매 현황 (외상 거래 기준) ───────────────────────
app.get('/api/customer-sales', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const customerMap = {};

  for (let m = 1; m <= 12; m++) {
    const vendors = readJSON(vendorFile(year, m), []);
    const mo = String(m).padStart(2, '0');
    for (const vendor of vendors) {
      if (!vendor.txs || !vendor.txs.length) continue;
      if (!customerMap[vendor.name]) {
        customerMap[vendor.name] = { name: vendor.name, months: {} };
      }
      let qty = 0, amount = 0;
      for (const tx of vendor.txs) {
        qty += tx.qty || 0;
        amount += tx.amount || 0;
      }
      if (amount > 0 || qty > 0) {
        customerMap[vendor.name].months[mo] = { qty, amount };
      }
    }
  }

  const customers = Object.values(customerMap)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  res.json({ ok: true, year, customers });
});

// ── 배달 Excel 확인 (배달판매전표리스트 형식) ─────────────────────
// 배달 내역은 BOS에 이미 포함된 데이터 → 합산 없이 확인용으로만 파싱
app.post('/api/parse-delivery-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: '파일이 없습니다.' });
    const { parseDeliveryExcel } = require('./lib/excelParser');
    const delivVendors = parseDeliveryExcel(req.file.path);
    const txCount   = delivVendors.reduce((s, v) => s + v.txs.length, 0);
    const totalAmt  = delivVendors.reduce((s, v) => s + v.total, 0);
    // vendors_delivery 파일 저장 안 함 — BOS 데이터에 이미 포함
    res.json({ ok: true, delivCount: delivVendors.length, txCount, totalAmt });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 거래명세서 생성 (외상 업체만) ────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { vendorNames, issueDate, year, month, printMethods, splitDelivery } = req.body;
    if (!vendorNames?.length) return res.status(400).json({ ok: false, error: '업체를 선택하세요.' });

    const vendors   = getVendors(year, month);
    const customers = readJSON(CUSTOMERS_FILE, []);
    // 외상 거래가 있는 업체만 생성
    const selected  = vendorNames
      .map(n => vendors.find(v => v.name === n))
      .filter(v => v?.hasCredit);

    if (!selected.length) return res.status(400).json({ ok: false, error: '선택한 업체 중 외상 거래가 없습니다.' });

    const { generateStatements } = require('./lib/statementGenerator');
    const files = await generateStatements(selected, customers, OUTPUT_DIR, issueDate, year, month, printMethods || {}, splitDelivery || {});
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 생성 파일 목록 ────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  if (!fs.existsSync(OUTPUT_DIR)) return res.json({ ok: true, files: [] });
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.xlsx'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtime }))
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  res.json({ ok: true, files });
});

// ── 파일 다운로드 ─────────────────────────────────────────────
app.get('/api/download/:filename', (req, res) => {
  const fp = path.join(OUTPUT_DIR, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).end('Not found');
  res.download(fp);
});

// ── 고객 조회 ────────────────────────────────────────────────
app.get('/api/customers', (req, res) => {
  res.json({ ok: true, customers: readJSON(CUSTOMERS_FILE, []) });
});

// ── 고객 저장 ────────────────────────────────────────────────
app.post('/api/customers', (req, res) => {
  const { name, bizNo, contactName, email, phone, address, bizType, bizItem, printMethod, hometaxMethod, taxIssuance, splitDelivery } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: '업체명은 필수입니다.' });
  const customers = readJSON(CUSTOMERS_FILE, []);
  const idx = customers.findIndex(c => c.name === name);
  // 기존 데이터와 병합 — 빈 값으로 기존 데이터를 덮어쓰지 않음
  const existing = idx >= 0 ? customers[idx] : {};
  const customer = {
    name,
    bizNo:        bizNo        || existing.bizNo        || '',
    contactName:  contactName  || existing.contactName  || '',
    email:        email        || existing.email        || '',
    phone:        phone        || existing.phone        || '',
    address:      address      || existing.address      || '',
    bizType:      bizType      || existing.bizType      || '',
    bizItem:      bizItem      || existing.bizItem      || '',
    printMethod:  printMethod  !== undefined ? printMethod  : (existing.printMethod  || ''),
    hometaxMethod:hometaxMethod !== undefined ? hometaxMethod : (existing.hometaxMethod || '통합'),
    taxIssuance:  taxIssuance  !== undefined ? taxIssuance  : (existing.taxIssuance  || '합산'),
    splitDelivery: splitDelivery !== undefined
      ? (splitDelivery === true || splitDelivery === 'true')
      : (existing.splitDelivery || false),
  };
  if (idx >= 0) customers[idx] = customer;
  else customers.push(customer);
  writeJSON(CUSTOMERS_FILE, customers);
  res.json({ ok: true });
});

// ── 고객 삭제 ────────────────────────────────────────────────
app.delete('/api/customers/:name', (req, res) => {
  const customers = readJSON(CUSTOMERS_FILE, []).filter(
    c => c.name !== decodeURIComponent(req.params.name)
  );
  writeJSON(CUSTOMERS_FILE, customers);
  res.json({ ok: true });
});

// ── 고객 Excel 양식 다운로드 ──────────────────────────────────
app.get('/api/customer-template', async (req, res) => {
  const templatePath = path.join(__dirname, '고객등록양식.xlsx');
  if (!fs.existsSync(templatePath)) {
    const { createTemplate } = require('./lib/createCustomerTemplate');
    await createTemplate(templatePath);
  }
  res.download(templatePath, '고객등록양식.xlsx');
});

// ── 고객 Excel 업로드 & 병합 ──────────────────────────────────
app.post('/api/import-customers', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: '파일이 없습니다.' });

    const XLSX = require('xlsx');
    const wb   = XLSX.readFile(req.file.path);
    const ws   = wb.Sheets['고객등록'] || wb.Sheets[wb.SheetNames[0]];

    // 헤더 행 자동 탐지: 셀 값이 정확히 '업체명 *' 또는 '업체명'인 행을 찾아 파싱
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
      if (rawRows[i].some(c => String(c).trim() === '업체명 *' || String(c).trim() === '업체명')) {
        headerIdx = i; break;
      }
    }
    const headers = rawRows[headerIdx].map(h => String(h).trim());
    const rows = rawRows.slice(headerIdx + 1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });

    const customers = readJSON(CUSTOMERS_FILE, []);
    let added = 0, updated = 0;

    rows.forEach(row => {
      // '업체명 *' 또는 '업체명' 컬럼 모두 지원
      const name = String(row['업체명 *'] || row['업체명'] || '').trim();
      // 빈 행·안내문·합계 행 제외
      if (!name || name.startsWith('★') || name.startsWith('총 ') ||
          name.startsWith('출력방법') || name.startsWith('※')) return;

      const incoming = {
        name,
        bizNo:        String(row['사업자번호']           || '').trim(),
        contactName:  String(row['담당자명']             || '').trim(),
        email:        String(row['이메일']               || '').trim(),
        phone:        String(row['연락처']               || '').trim(),
        address:      String(row['주소']                 || '').trim(),
        bizType:      String(row['업태']                 || '').trim(),
        bizItem:      String(row['종목']                 || '').trim(),
        printMethod:  String(row['출력방법']             || '').trim(),
        hometaxMethod:String(row['세금계산서발행방식']   || '').trim() || '통합',
        taxIssuance:  String(row['세금계산서발행구분']   || '').trim() || '합산',
      };

      const idx = customers.findIndex(c => c.name === name);
      if (idx >= 0) {
        ['bizNo','contactName','email','phone','address','bizType','bizItem','printMethod','hometaxMethod','taxIssuance'].forEach(k => {
          if (incoming[k] && incoming[k] !== '통합' && incoming[k] !== '합산') customers[idx][k] = incoming[k];
          else if (k === 'hometaxMethod') customers[idx][k] = incoming[k] || '통합';
          else if (k === 'taxIssuance')   customers[idx][k] = incoming[k] || '합산';
        });
        updated++;
      } else {
        customers.push(incoming);
        added++;
      }
    });

    writeJSON(CUSTOMERS_FILE, customers);
    res.json({ ok: true, added, updated, total: customers.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 메일 발송 ────────────────────────────────────────────────
app.post('/api/send-email', async (req, res) => {
  try {
    const { vendorName, email, filename, month, extraMemo } = req.body;
    const settings = readJSON(SETTINGS_FILE, {});
    if (!settings.smtpUser || !settings.smtpPass)
      return res.status(400).json({ ok: false, error: 'SMTP 설정 없음 — [설정] 탭에서 입력하세요.' });

    const fp = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(fp))
      return res.status(400).json({ ok: false, error: '거래명세서 파일 없음 — 먼저 생성하세요.' });

    const { sendEmail } = require('./lib/emailSender');
    await sendEmail(settings, email, vendorName, fp, month, extraMemo || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 세금계산서 일괄발행 Excel 생성 ───────────────────────────
app.post('/api/generate-tax-excel', (req, res) => {
  try {
    const { issueDate, year, month, taxMethods } = req.body;
    if (!issueDate) return res.status(400).json({ ok: false, error: '발행일자를 입력하세요.' });

    const vendors   = getVendors(year, month);
    const customers = readJSON(CUSTOMERS_FILE, []);

    if (!vendors.length) return res.status(400).json({ ok: false, error: 'Excel 파일을 먼저 업로드하세요.' });

    const { generateTaxInvoiceExcel } = require('./lib/taxInvoiceGenerator');
    const result = generateTaxInvoiceExcel(vendors, customers, issueDate, taxMethods || {}, OUTPUT_DIR);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 홈택스 자동화 ────────────────────────────────────────────
app.post('/api/hometax', async (req, res) => {
  try {
    const { vendorName, issueDate, year, month } = req.body;
    const vendors   = getVendors(year, month);
    const customers = readJSON(CUSTOMERS_FILE, []);
    const vendor    = vendors.find(v => v.name === vendorName);
    const customer  = customers.find(c => c.name === vendorName) || {};

    if (!vendor)
      return res.status(400).json({ ok: false, error: '업체 데이터 없음 — Excel 파일을 먼저 업로드하세요.' });
    if (!customer.bizNo)
      return res.status(400).json({ ok: false, error: `${vendorName} 사업자번호 없음 — [고객 관리]에 등록하세요.` });

    const hometaxMethod = req.body.hometaxMethod || customer.hometaxMethod || '통합';
    const { openHometax, calcTaxData } = require('./lib/hometaxBot');
    const taxData = calcTaxData(vendor);

    // 발행 데이터 계산 (UI 패널 표시용)
    const products = Object.entries(taxData).map(([name, d]) => ({
      name, qty: d.qty, supply: d.sup, tax: d.tax, amount: d.amt
    }));
    const totalSupply = products.reduce((s, p) => s + p.supply, 0);
    const totalTax    = products.reduce((s, p) => s + p.tax, 0);
    const totalAmount = products.reduce((s, p) => s + p.amount, 0);
    const invoiceCount = hometaxMethod === '분리' ? products.length : 1;

    // puppeteer 자동화 백그라운드 실행
    openHometax(vendor, customer, issueDate, hometaxMethod).catch(e =>
      console.error('[홈택스봇]', e.message)
    );

    res.json({
      ok: true,
      hometaxMethod,
      invoiceCount,
      customer: { name: customer.name, bizNo: customer.bizNo },
      issueDate,
      products,
      totalSupply,
      totalTax,
      totalAmount,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 홈택스 자동 입력 (건별발급 화면에서 호출) ─────────────────
app.post('/api/hometax-fill', async (req, res) => {
  try {
    const { productIndex } = req.body;
    const { fillCurrentPage } = require('./lib/hometaxBot');
    const result = await fillCurrentPage(productIndex || 0);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── 홈택스 브라우저 상태 조회 ─────────────────────────────────
app.get('/api/hometax-status', (req, res) => {
  const { getBrowserStatus } = require('./lib/hometaxBot');
  res.json({ ok: true, ...getBrowserStatus() });
});

// ── 설정 ─────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const s = readJSON(SETTINGS_FILE, {});
  res.json({ ok: true, smtpUser: s.smtpUser || '', hasPass: !!s.smtpPass, hasCertPass: !!s.certPass });
});

app.post('/api/settings', (req, res) => {
  const { smtpUser, smtpPass, certPass } = req.body;
  const s = readJSON(SETTINGS_FILE, {});
  if (smtpUser)  s.smtpUser  = smtpUser;
  if (smtpPass)  s.smtpPass  = smtpPass;
  if (certPass)  s.certPass  = certPass;
  writeJSON(SETTINGS_FILE, s);
  res.json({ ok: true });
});

// ── 일마감 ───────────────────────────────────────────────────

function dailyFile(date) { return path.join(DAILY_DIR, `${date}.json`); }

function runMatching(daily) {
  if (daily.bos?.cardTxs && daily.card?.cardTxs) {
    daily.matching = matchCards(daily.bos.cardTxs, daily.card.cardTxs);
  } else {
    delete daily.matching;
  }
}

function saveCustomerSales(monthMap) {
  for (const [ym, customers] of Object.entries(monthMap)) {
    const fpath = path.join(DATA_DIR, `customer_sales_${ym.replace('-','_')}.json`);
    // 기존 데이터와 병합 (같은 key는 덮어쓰기)
    const existing = readJSON(fpath, []);
    const existMap = {};
    existing.forEach(c => { existMap[`${c.name}||${c.payType}`] = c; });
    customers.forEach(c => { existMap[`${c.name}||${c.payType}`] = c; });
    writeJSON(fpath, Object.values(existMap).sort((a,b) => b.totalAmount - a.totalAmount));
  }
}

// BOS 업로드 (단일 날짜 또는 월별 파일 모두 처리)
app.post('/api/daily/upload-bos', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: '파일 없음' });
  try {
    const days = parseBosDaily(req.file.path);
    let lastDate = '';
    for (const parsed of days) {
      const existing = readJSON(dailyFile(parsed.date), { date: parsed.date });
      existing.bos   = parsed;
      runMatching(existing);
      writeJSON(dailyFile(parsed.date), existing);
      lastDate = parsed.date;
    }
    // 고객별 판매 집계도 함께 저장
    try {
      const monthMap = parseCustomerSales(req.file.path);
      saveCustomerSales(monthMap);
    } catch(_) {}
    res.json({ ok: true, count: days.length, date: lastDate });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── 고객 판매 현황 ────────────────────────────────────────────
// 월별 고객 판매 집계 조회
app.get('/api/daily/customer-sales', (req, res) => {
  const ym = req.query.month; // YYYY-MM
  if (!ym) return res.json({ ok: false, error: 'month 파라미터 필요' });
  const fpath = path.join(DATA_DIR, `customer_sales_${ym.replace('-','_')}.json`);
  res.json({ ok: true, month: ym, customers: readJSON(fpath, []) });
});

// uploads/ 폴더의 BOS 상세조회 파일을 전부 재파싱하여 고객 판매 데이터 재구축
app.post('/api/daily/rebuild-customer-sales', (req, res) => {
  const UPLOADS_DIR = path.join(__dirname, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) return res.json({ ok: true, processed: 0 });

  // 기존 customer_sales_*.json 초기화 (깨끗하게 재구축)
  fs.readdirSync(DATA_DIR).filter(f => f.startsWith('customer_sales_') && f.endsWith('.json'))
    .forEach(f => fs.unlinkSync(path.join(DATA_DIR, f)));

  const files = fs.readdirSync(UPLOADS_DIR).filter(f => f.endsWith('.xlsx'));
  const processedMonths = new Set();
  let errors = 0;

  for (const fname of files) {
    try {
      const monthMap = parseCustomerSales(path.join(UPLOADS_DIR, fname));
      if (Object.keys(monthMap).length > 0) {
        saveCustomerSales(monthMap);
        Object.keys(monthMap).forEach(ym => processedMonths.add(ym));
      }
    } catch(_) { errors++; }
  }

  res.json({ ok: true, months: [...processedMonths].sort(), errors });
});

// 이지샵 카드 업로드 (단일 날짜 또는 월별 파일 모두 처리)
app.post('/api/daily/upload-card', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: '파일 없음' });
  try {
    const days = parseEasyshop(req.file.path);
    let lastDate = '';
    for (const parsed of days) {
      const existing = readJSON(dailyFile(parsed.date), { date: parsed.date });
      existing.card  = parsed;
      runMatching(existing);
      writeJSON(dailyFile(parsed.date), existing);
      lastDate = parsed.date;
    }
    res.json({ ok: true, count: days.length, date: lastDate });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// 매입단가 조회
app.get('/api/daily/purchase-prices', (req, res) => {
  res.json({ ok: true, prices: readJSON(PURCHASE_PRICES_FILE, []) });
});
// 매입단가 추가 { date, fuel, price }
app.post('/api/daily/purchase-prices', (req, res) => {
  const { date, fuel, price } = req.body;
  if (!date || !fuel || !price) return res.json({ ok: false, error: '날짜/유종/단가를 모두 입력하세요.' });
  const list = readJSON(PURCHASE_PRICES_FILE, []);
  const idx = list.findIndex(e => e.date === date && e.fuel === fuel);
  if (idx >= 0) list[idx].price = +price;
  else list.push({ date, fuel, price: +price });
  list.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
  writeJSON(PURCHASE_PRICES_FILE, list);
  res.json({ ok: true, prices: list });
});
// 매입단가 삭제 { date, fuel }
app.delete('/api/daily/purchase-prices', (req, res) => {
  const { date, fuel } = req.body;
  const list = readJSON(PURCHASE_PRICES_FILE, []).filter(e => !(e.date === date && e.fuel === fuel));
  writeJSON(PURCHASE_PRICES_FILE, list);
  res.json({ ok: true, prices: list });
});

// ── 일별 FIFO 단가 조회 ───────────────────────────────────────
app.get('/api/daily/fifo-prices', (req, res) => {
  res.json({ ok: true, prices: readJSON(FIFO_DAILY_FILE, []) });
});

// ── 탱크 실재고 업로드 (오차 계산용, 영업이익 무관) ──────────────
app.post('/api/upload-tank-actuals', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: '파일이 없습니다.' });
    const { parseTankStock } = require('./lib/tankStockParser');
    const data = parseTankStock(req.file.path);
    if (!data.length) return res.json({ ok: false, error: '파싱 결과가 없습니다. 파일 형식을 확인하세요.' });
    writeJSON(TANK_ACTUALS_FILE, data);
    const from = data[0].date;
    const to   = data[data.length - 1].date;
    res.json({ ok: true, count: data.length, from, to });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── 탱크 재고 오차 조회 (종합 탭 전용, 참고용) ────────────────────
// year/month 미전달 시 전체 기간 반환
app.get('/api/tank-variance', (req, res) => {
  try {
    const tankActuals = readJSON(TANK_ACTUALS_FILE, []);
    if (!tankActuals.length) return res.json({ ok: true, rows: [], monthTotal: null });

    // 날짜 → 실재고 맵
    const actualMap = {};
    for (const a of tankActuals) actualMap[a.date] = a;

    // 일별 BOS 판매량 로드 (전체)
    const dailySales = {};
    if (fs.existsSync(DAILY_DIR)) {
      fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        const d = readJSON(path.join(DAILY_DIR, f), {});
        if (!d.bos?.date) return;
        const dt = d.bos.date;
        dailySales[dt] = { 휘발유: d.bos.fuels?.휘발유?.qty || 0, 경유: d.bos.fuels?.경유?.qty || 0, 등유: d.bos.fuels?.등유?.qty || 0 };
      });
    }

    // 입고량 맵 (purchase_lots)
    const lots = readJSON(PURCHASE_LOTS_FILE, []);
    const receiptMap = {};
    for (const l of lots) {
      if (!receiptMap[l.date]) receiptMap[l.date] = {};
      receiptMap[l.date][l.fuel] = (receiptMap[l.date][l.fuel] || 0) + (l.qty || 0);
    }

    // FIFO 단가 참조 (영업이익 계산과 동일 기존 로직 그대로)
    const prices    = readJSON(PURCHASE_PRICES_FILE, []);
    const fifoDaily = readJSON(FIFO_DAILY_FILE, []);
    const fifoMap   = {};
    for (const e of fifoDaily) { if (!fifoMap[e.date]) fifoMap[e.date] = e; }

    function getFifoPrice(date, fuel) {
      const fe = fifoMap[date];
      if (fe && fe[fuel]?.price) return fe[fuel].price;
      const list = prices.filter(p => p.fuel === fuel && p.date <= date);
      return list.length ? list[list.length - 1].price : 0;
    }

    // 전체 기간 오차 계산 (날짜 오름차순 정렬)
    // 공식: 재고차(D) = ATG(D-1) - ATG(D) + D일 입고량
    //       오차(D)   = 재고차 - BOS판매량(D)
    const sorted = [...tankActuals].sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return res.json({ ok: true, rows: [], monthTotal: null });

    // 날짜 → ATG 맵 (전일 조회용)
    const atgMap = {};
    for (const a of sorted) atgMap[a.date] = a;

    const rows = [];
    const FUELS = ['휘발유', '경유', '등유'];

    for (let i = 0; i < sorted.length; i++) {
      const today = sorted[i];

      // 전일 ATG — 같은 배열 안에 없으면 맵에서 조회 (월 경계 처리)
      const prev = i > 0 ? sorted[i - 1] : null;
      if (!prev) continue; // 첫날은 전일 없으므로 스킵

      const hasBos = !!dailySales[today.date];
      const row = { date: today.date, hasBos, fuels: {} };

      for (const fuel of FUELS) {
        const atgPrev  = prev[fuel]  || 0;   // 전일 ATG
        const atgCurr  = today[fuel] || 0;   // 당일 ATG
        const receipts = receiptMap[today.date]?.[fuel] || 0; // 당일 새벽 입고 (ATG에 이미 포함)
        // 탱크 실소비 = 전일ATG - 당일ATG + 당일입고 (입고량을 빼서 순수 소비 산출)
        const tankDiff = atgPrev - atgCurr + receipts;
        const bosSales = dailySales[today.date]?.[fuel] || 0;
        const variance = tankDiff - bosSales; // 양수=탱크 더 소비, 음수=BOS가 더 기록
        const price    = getFifoPrice(today.date, fuel);
        row.fuels[fuel] = {
          atgPrev:  Math.round(atgPrev),
          atgCurr:  Math.round(atgCurr),
          receipts: Math.round(receipts),
          tankDiff: Math.round(tankDiff * 10) / 10,
          bosSales: Math.round(bosSales * 10) / 10,
          variance: Math.round(variance * 10) / 10,
          price,
          amount:   Math.round(variance * price),
        };
      }
      rows.push(row);
    }

    // 전체 합계 + 월별 소계 (BOS 있는 날만 집계)
    const monthTotal = { 휘발유: 0, 경유: 0, 등유: 0, total: 0 };
    const byMonth = {};
    for (const row of rows) {
      if (!row.hasBos) continue; // BOS 없는 날 제외
      const ym = row.date.substr(0, 7);
      if (!byMonth[ym]) byMonth[ym] = { 휘발유: 0, 경유: 0, 등유: 0, total: 0 };
      for (const fuel of FUELS) {
        const amt = row.fuels[fuel]?.amount || 0;
        monthTotal[fuel] += amt;
        monthTotal.total += amt;
        byMonth[ym][fuel] += amt;
        byMonth[ym].total += amt;
      }
    }

    res.json({ ok: true, rows, monthTotal, byMonth });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── 탱크 현황 조회 (FIFO 기준 현재고 + 전달단가 잔여량) ────────
app.get('/api/daily/tank-status', (req, res) => {
  const targetDate = req.query.date || new Date().toISOString().slice(0, 10);
  const lots = readJSON(PURCHASE_LOTS_FILE, []);
  const CAPACITY = { '휘발유': 100000, '경유': 300000, '등유': 50000 };

  const totalSoldByFuel = {};
  if (fs.existsSync(DAILY_DIR)) {
    fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json')).forEach(f => {
      const day = readJSON(path.join(DAILY_DIR, f), {});
      if (!day.bos?.date || day.bos.date >= targetDate) return;
      for (const [fuel, data] of Object.entries(day.bos.fuels || {})) {
        if (!['휘발유', '경유', '등유'].includes(fuel)) continue;
        totalSoldByFuel[fuel] = (totalSoldByFuel[fuel] || 0) + (data.qty || 0);
      }
    });
  }

  const tanks = {};
  for (const fuel of ['휘발유', '경유', '등유']) {
    const fuelLots = lots
      .filter(l => l.fuel === fuel && l.qty > 0 && l.date <= targetDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    // 실재고(stock) 보정 기준점 — 가장 최근 stock 입력이 있는 lot
    let stockCorrection = null;
    for (const lot of fuelLots) {
      if (lot.stock != null) stockCorrection = lot;
    }

    let sold = totalSoldByFuel[fuel] || 0;
    let lotIdx = 0;
    let remainingInLot = fuelLots[0]?.qty || 0;
    let prevPrice = null;

    if (stockCorrection) {
      // stock 기준점 이후 판매량 재계산
      const stockDate = stockCorrection.date;
      let soldAfterStock = 0;
      if (fs.existsSync(DAILY_DIR)) {
        fs.readdirSync(DAILY_DIR).filter(f => f.endsWith('.json')).forEach(f => {
          const day = readJSON(path.join(DAILY_DIR, f), {});
          if (!day.bos?.date || day.bos.date <= stockDate || day.bos.date >= targetDate) return;
          soldAfterStock += (day.bos.fuels?.[fuel]?.qty || 0);
        });
      }
      // stock 기준점 이후 입고량
      const lotsAfterStock = fuelLots.filter(l => l.date > stockDate);
      const receivedAfterStock = lotsAfterStock.reduce((s, l) => s + l.qty, 0);
      // 현재 재고 = 실재고 + 이후 입고 - 이후 판매
      const totalRemaining = Math.max(0, stockCorrection.stock + receivedAfterStock - soldAfterStock);
      // 현재 소비 중인 lot의 남은 양 (stock 기준점의 단가 lot이 얼마나 남았는지)
      const currentLotRemaining = Math.max(0, stockCorrection.stock - soldAfterStock);
      const nextQty = receivedAfterStock;
      tanks[fuel] = {
        capacity: CAPACITY[fuel],
        totalRemaining: Math.round(totalRemaining),
        currentLotRemaining: Math.round(Math.min(currentLotRemaining, totalRemaining)),
        nextLotsQty: Math.round(Math.max(0, totalRemaining - Math.min(currentLotRemaining, totalRemaining))),
        currentPrice: stockCorrection.price,
        previousPrice: null,
        stockCorrected: true,
        stockDate,
      };
      continue;
    }

    while (lotIdx < fuelLots.length && sold > 0) {
      if (sold >= remainingInLot) {
        sold -= remainingInLot;
        prevPrice = fuelLots[lotIdx].price;
        lotIdx++;
        remainingInLot = lotIdx < fuelLots.length ? fuelLots[lotIdx].qty : 0;
      } else {
        remainingInLot -= sold;
        sold = 0;
      }
    }

    const currentPrice = fuelLots[lotIdx]?.price || null;
    let nextLotsQty = 0;
    for (let i = lotIdx + 1; i < fuelLots.length; i++) nextLotsQty += fuelLots[i].qty;

    tanks[fuel] = {
      capacity: CAPACITY[fuel],
      totalRemaining: Math.round(remainingInLot + nextLotsQty),
      currentLotRemaining: Math.round(remainingInLot),
      nextLotsQty: Math.round(nextLotsQty),
      currentPrice,
      previousPrice: prevPrice,
    };
  }

  res.json({ ok: true, date: targetDate, tanks });
});

// ── 입고 이력 (FIFO 재고 관리) ─────────────────────────────
// 조회
app.get('/api/daily/lots', (req, res) => {
  try { res.json({ ok: true, lots: readJSON(PURCHASE_LOTS_FILE, []) }); }
  catch (e) { res.json({ ok: false, error: e.message }); }
});
// 추가 { date, fuel, qty, price, stock? }
app.post('/api/daily/lots', (req, res) => {
  try {
    const { date, fuel, qty, price, stock } = req.body;
    if (!date || !fuel || !qty || !price) return res.json({ ok: false, error: '날짜/유종/수량/단가를 모두 입력하세요.' });
    const lots = readJSON(PURCHASE_LOTS_FILE, []);
    const entry = { date, fuel, qty: +qty, price: +price };
    if (stock !== undefined && stock !== '' && stock !== null) entry.stock = +stock;
    lots.push(entry);
    lots.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
    writeJSON(PURCHASE_LOTS_FILE, lots);
    try { recomputeFifoPrices(); } catch (e2) { console.error('[recomputeFifoPrices]', e2.message); }
    res.json({ ok: true, lots, prices: readJSON(PURCHASE_PRICES_FILE, []) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
// 삭제 { date, fuel, price } (같은 날짜+유종+단가 첫 번째 삭제)
app.delete('/api/daily/lots', (req, res) => {
  try {
    const { date, fuel, price } = req.body;
    const lots = readJSON(PURCHASE_LOTS_FILE, []);
    const idx = lots.findIndex(l => l.date === date && l.fuel === fuel && l.price === +price);
    if (idx >= 0) lots.splice(idx, 1);
    writeJSON(PURCHASE_LOTS_FILE, lots);
    try { recomputeFifoPrices(); } catch (e2) { console.error('[recomputeFifoPrices]', e2.message); }
    res.json({ ok: true, lots, prices: readJSON(PURCHASE_PRICES_FILE, []) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── 마감자료 Excel 업로드 (FIFO 단가 + 입고 이력 임포트) ─────
app.post('/api/upload-management', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: '파일이 없습니다.' });
    const { parseSalesMgmt, extractLots, extractFifoDaily } = require('./lib/managementParser');

    // 1) 입고 이력(lots) 추출 → purchase_lots.json 저장
    const newLots = extractLots(req.file.path);
    writeJSON(PURCHASE_LOTS_FILE, newLots);

    // 2) 일별 FIFO 단가 추출 → fifo_daily_prices.json 저장 (영업이익 정확 계산의 기준)
    const fifoDaily = extractFifoDaily(req.file.path);
    writeJSON(FIFO_DAILY_FILE, fifoDaily);

    // 3) FIFO 재계산 → purchase_prices.json 갱신
    recomputeFifoPrices();

    // 3) lots가 없으면 단가 변경일만 직접 임포트 (fallback)
    const currentLots = readJSON(PURCHASE_LOTS_FILE, []);
    if (!currentLots.length) {
      const changes = parseSalesMgmt(req.file.path);
      const list = readJSON(PURCHASE_PRICES_FILE, []);
      for (const ch of changes) {
        const idx = list.findIndex(e => e.date === ch.date && e.fuel === ch.fuel);
        if (idx >= 0) list[idx].price = ch.price;
        else list.push({ date: ch.date, fuel: ch.fuel, price: ch.price });
      }
      list.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
      writeJSON(PURCHASE_PRICES_FILE, list);
    }

    const finalPrices = readJSON(PURCHASE_PRICES_FILE, []);
    res.json({ ok: true, lotCount: newLots.length, priceCount: finalPrices.length, lots: newLots, prices: finalPrices, fifoDaily });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 지출관리 ─────────────────────────────────────────────────
app.get('/api/expenses', (req, res) => {
  const list = readJSON(EXPENSES_FILE, []);
  const month = req.query.month;
  res.json({ ok: true, expenses: month ? list.filter(e => e.month === month) : list });
});

app.post('/api/upload-expenses', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: '파일이 없습니다.' });
    const { parseExpenses } = require('./lib/expenseParser');
    const list = parseExpenses(req.file.path);
    writeJSON(EXPENSES_FILE, list);
    res.json({ ok: true, count: list.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 수시입출예금 업로드 → 지출 자동 분류 ────────────────────────
app.post('/api/upload-bank-expenses', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: '파일이 없습니다.' });
    const { parseBankExpenses } = require('./lib/bankExpenseParser');
    const newItems = parseBankExpenses(req.file.path);

    // 영향을 받는 월 목록
    const affectedMonths = [...new Set(newItems.map(e => e.month))];

    // expenses.json 에서 source==='bank' 이고 해당 월인 것 제거 후 새 항목 추가
    let list = readJSON(EXPENSES_FILE, []);
    list = list.filter(e => !(e.source === 'bank' && affectedMonths.includes(e.month)));
    list = list.concat(newItems);
    writeJSON(EXPENSES_FILE, list);

    res.json({ ok: true, count: newItems.length, months: affectedMonths });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 지출 항목 삭제 (month+date+vendor+amount 기준) ───────────────
app.delete('/api/expenses/delete', (req, res) => {
  const { month, date, vendor, amount } = req.body;
  const list = readJSON(EXPENSES_FILE, []);
  const idx  = list.findIndex(e =>
    e.month === month &&
    (e.date || '') === (date || '') &&
    e.vendor === vendor &&
    e.amount == amount  // 숫자/문자열 모두 허용
  );
  if (idx >= 0) list.splice(idx, 1);
  writeJSON(EXPENSES_FILE, list);
  res.json({ ok: true });
});

// ── 계정과목 동기화: 4~5월 기준으로 1~3월 일괄 업데이트 ──────────
app.post('/api/expenses/sync-categories', (req, res) => {
  const { srcMonths = ['2026-04', '2026-05'], dstMonths = ['2026-01', '2026-02', '2026-03'] } = req.body;
  const list = readJSON(EXPENSES_FILE, []);

  // 1. 기준 월(4~5월)에서 업체명 → {category, subCategory} 매핑 구성
  //    같은 업체가 여러 달에 있으면 가장 나중 월 값 사용
  const vendorMap = {};
  list
    .filter(e => srcMonths.includes(e.month))
    .sort((a, b) => (a.month||'').localeCompare(b.month||''))  // 월 순서대로
    .forEach(e => {
      vendorMap[e.vendor] = { category: e.category, subCategory: e.subCategory };
    });

  // 2. 대상 월(1~3월) 항목에 매핑 적용
  let updated = 0;
  list.forEach(e => {
    if (!dstMonths.includes(e.month)) return;
    const mapped = vendorMap[e.vendor];
    if (!mapped) return;
    if (e.category !== mapped.category || e.subCategory !== mapped.subCategory) {
      e.category    = mapped.category;
      e.subCategory = mapped.subCategory;
      updated++;
    }
  });

  writeJSON(EXPENSES_FILE, list);
  res.json({ ok: true, updated, total: list.filter(e => dstMonths.includes(e.month)).length });
});

// ── 지출 항목 수정 (계정과목/분류 변경) ──────────────────────────
app.post('/api/expenses/update', (req, res) => {
  const { month, date, vendor, amount, field, value } = req.body;
  const ALLOWED = ['category', 'subCategory'];
  if (!ALLOWED.includes(field)) return res.json({ ok: false, error: '수정 불가 필드' });
  const list = readJSON(EXPENSES_FILE, []);
  const idx  = list.findIndex(e =>
    e.month === month &&
    (e.date || '') === (date || '') &&
    e.vendor === vendor &&
    e.amount == amount
  );
  if (idx >= 0) { list[idx][field] = value; writeJSON(EXPENSES_FILE, list); }
  res.json({ ok: true });
});

// 수동 지출 추가/삭제
app.post('/api/expenses', (req, res) => {
  const { month, category, subCategory, vendor, amount } = req.body;
  if (!month || !amount) return res.json({ ok: false, error: '월과 금액을 입력하세요.' });
  const list = readJSON(EXPENSES_FILE, []);
  list.push({ month, category: category||'변동비', subCategory: subCategory||'기타', vendor: vendor||'', amount: +amount });
  writeJSON(EXPENSES_FILE, list);
  res.json({ ok: true, expenses: list.filter(e => e.month === month) });
});

app.delete('/api/expenses/:idx', (req, res) => {
  const list = readJSON(EXPENSES_FILE, []);
  list.splice(+req.params.idx, 1);
  writeJSON(EXPENSES_FILE, list);
  res.json({ ok: true });
});

// ── 종합 보고 (월별 요약) ────────────────────────────────────
app.get('/api/summary/:yearMonth', (req, res) => {
  const ym = req.params.yearMonth;  // "2026-05"

  // 일별 판매 데이터 합산
  const dailyFiles = fs.existsSync(DAILY_DIR)
    ? fs.readdirSync(DAILY_DIR).filter(f => f.startsWith(ym) && f.endsWith('.json'))
    : [];

  let totalSales = { 휘발유: 0, 경유: 0, 등유: 0, carwash: 0, others: 0 };
  let totalQty   = { 휘발유: 0, 경유: 0, 등유: 0 };
  let totalCardFee = 0;
  const prices = readJSON(PURCHASE_PRICES_FILE, []);
  const fifoDaily = readJSON(FIFO_DAILY_FILE, []);
  const fifoDailyMap = {};
  for (const e of fifoDaily) { if (!fifoDailyMap[e.date]) fifoDailyMap[e.date] = e; }

  function getFifoPrice(date, fuel) {
    // fifo_daily_prices 우선 (마감자료 기준), fallback → purchase_prices
    const fe = fifoDailyMap[date];
    if (fe && fe[fuel]?.price) return fe[fuel].price;
    const list = prices.filter(p => p.fuel === fuel && p.date <= date);
    return list.length ? list[list.length-1].price : 0;
  }

  let totalProfit = 0;
  let hasPrices = prices.length > 0;
  const profitByFuel = { 휘발유: 0, 경유: 0, 등유: 0 };
  const costByFuel   = { 휘발유: 0, 경유: 0, 등유: 0 };

  for (const f of dailyFiles) {
    const d = readJSON(path.join(DAILY_DIR, f), {});
    if (!d.bos?.date) continue;
    const date = d.bos.date;
    for (const fuel of ['휘발유','경유','등유']) {
      const fuelData = d.bos.fuels?.[fuel];
      if (!fuelData) continue;
      totalSales[fuel] += fuelData.amount || 0;
      totalQty[fuel]   += fuelData.qty    || 0;
      const buyPrice = getFifoPrice(date, fuel);
      if (buyPrice) {
        const fp = (fuelData.amount || 0) - (fuelData.qty || 0) * buyPrice;
        totalProfit    += fp;
        profitByFuel[fuel] += fp;
        costByFuel[fuel]   += (fuelData.qty || 0) * buyPrice;
      }
    }
    totalSales.carwash += d.bos.carwash?.amount || 0;
    totalSales.others  += d.bos.others?.amount  || 0;
    const otC = d.otherCost || 0;
    totalProfit += (d.bos.carwash?.amount || 0);
    totalProfit += (d.bos.others?.amount  || 0) - otC;
    totalCardFee += d.card?.totalFee || 0;
    totalProfit -= d.card?.totalFee || 0;
  }

  // 유종별 평균매입단가
  const avgBuyPriceByFuel = {};
  for (const fuel of ['휘발유','경유','등유']) {
    avgBuyPriceByFuel[fuel] = totalQty[fuel] > 0
      ? Math.round(costByFuel[fuel] / totalQty[fuel]) : null;
  }

  // 지출 합산
  const expenses = readJSON(EXPENSES_FILE, []).filter(e => e.month === ym);
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expByCategory = {};
  for (const e of expenses) {
    if (!expByCategory[e.category]) expByCategory[e.category] = 0;
    expByCategory[e.category] += e.amount;
  }

  // 지출 Top5 (계정과목별)
  const expBySubCat = {};
  for (const e of expenses) {
    const key = e.subCategory || e.category || '기타';
    expBySubCat[key] = (expBySubCat[key] || 0) + (e.amount || 0);
  }
  const expenseTop5 = Object.entries(expBySubCat)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  // 고객 매출 Top5 (외상/카드 구분)
  const custSalesFile = path.join(DATA_DIR, `customer_sales_${ym.replace('-','_')}.json`);
  let customerTop5 = [], cardTop5 = [];
  if (fs.existsSync(custSalesFile) && hasPrices) {
    const allCusts = readJSON(custSalesFile, []);
    const avgBuyForTop = {};
    for (const fuel of ['휘발유','경유','등유']) {
      avgBuyForTop[fuel] = totalQty[fuel] > 0 ? costByFuel[fuel] / totalQty[fuel] : 0;
    }
    const computeProfit = (c) => {
      let profit = 0;
      for (const [fuel, fd] of Object.entries(c.fuels || {})) {
        profit += (fd.amount || 0) - (fd.qty || 0) * (avgBuyForTop[fuel] || 0);
      }
      return profit;
    };
    const toTop5 = (list) => list.map(c => {
      const profit = computeProfit(c);
      return {
        name: c.name, payType: c.payType,
        qty: Math.round(c.totalQty),
        amount: Math.round(c.totalAmount),
        avgSellPrice: c.totalQty > 0 ? Math.round(c.totalAmount / c.totalQty) : null,
        profit: Math.round(profit),
        profitPct: c.totalAmount > 0 ? Math.round(profit / c.totalAmount * 1000) / 10 : null,
      };
    }).sort((a,b) => b.amount - a.amount).slice(0,5);

    customerTop5 = toTop5(allCusts.filter(c => c.payType === '외상'));
    cardTop5     = toTop5(allCusts.filter(c => c.payType === '신용카드'));
  } else {
    // fallback: vendors 파일
    const vendorFile = path.join(DATA_DIR, `vendors_${ym.replace('-','_')}.json`);
    if (fs.existsSync(vendorFile) && hasPrices) {
    const vendors = readJSON(vendorFile, []);
    const avgBuy = {};
    for (const fuel of ['휘발유','경유','등유']) {
      avgBuy[fuel] = totalQty[fuel] > 0 ? costByFuel[fuel] / totalQty[fuel] : 0;
    }
    customerTop5 = vendors
      .filter(v => v.hasCredit && (v.txs?.length || 0) > 0)
      .map(v => {
        let totalAmt = 0, totalQtyC = 0, profitC = 0;
        const byFuel = {};
        for (const tx of (v.txs || [])) {
          const fuel = ['휘발유','경유','등유'].includes(tx.product) ? tx.product : null;
          totalAmt += tx.amount || 0;
          if (fuel) {
            if (!byFuel[fuel]) byFuel[fuel] = { qty: 0, amount: 0 };
            byFuel[fuel].qty    += tx.qty    || 0;
            byFuel[fuel].amount += tx.amount || 0;
            totalQtyC += tx.qty || 0;
          }
        }
        for (const [fuel, fd] of Object.entries(byFuel)) {
          profitC += fd.amount - fd.qty * (avgBuy[fuel] || 0);
        }
        return {
          name: v.name,
          qty: Math.round(totalQtyC),
          amount: Math.round(totalAmt),
          avgSellPrice: totalQtyC > 0 ? Math.round(totalAmt / totalQtyC) : null,
          profit: Math.round(profitC),
          profitPct: totalAmt > 0 ? Math.round(profitC / totalAmt * 1000) / 10 : null,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    } // end fallback vendors
  }

  const totalRevenue = Object.values(totalSales).reduce((s,v)=>s+v, 0);

  res.json({
    ok: true,
    yearMonth: ym,
    sales: totalSales,
    qty: totalQty,
    revenue: totalRevenue,
    profit: hasPrices ? Math.round(totalProfit) : null,
    profitByFuel: hasPrices ? { 휘발유: Math.round(profitByFuel.휘발유), 경유: Math.round(profitByFuel.경유), 등유: Math.round(profitByFuel.등유) } : null,
    avgBuyPriceByFuel: hasPrices ? avgBuyPriceByFuel : null,
    cardFee: totalCardFee,
    expense: totalExpense,
    expByCategory,
    expenseTop5,
    customerTop5,
    cardTop5,
    netProfit: hasPrices ? Math.round(totalProfit - totalExpense) : null,
  });
});

// ── 연간 결과보고서 (12개월 집계) ────────────────────────────
app.get('/api/annual-summary', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const prices   = readJSON(PURCHASE_PRICES_FILE, []);
  const allExpenses = readJSON(EXPENSES_FILE, []);
  const fifoDaily = readJSON(FIFO_DAILY_FILE, []);
  const fifoDailyMap = {};
  for (const e of fifoDaily) { if (!fifoDailyMap[e.date]) fifoDailyMap[e.date] = e; }

  function getFifoPrice(date, fuel) {
    // fifo_daily_prices 우선 (마감자료 기준), fallback → purchase_prices
    const fe = fifoDailyMap[date];
    if (fe && fe[fuel]?.price) return fe[fuel].price;
    const list = prices.filter(p => p.fuel === fuel && p.date <= date);
    return list.length ? list[list.length-1].price : 0;
  }

  const hasPrices = prices.length > 0;
  const months = [];

  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2,'0')}`;
    const dailyFiles = fs.existsSync(DAILY_DIR)
      ? fs.readdirSync(DAILY_DIR).filter(f => f.startsWith(ym) && f.endsWith('.json'))
      : [];

    if (!dailyFiles.length) { months.push(null); continue; }

    let sales = { 휘발유:0, 경유:0, 등유:0, carwash:0, others:0 };
    let qty   = { 휘발유:0, 경유:0, 등유:0 };
    let profit = 0, cardFee = 0;
    let fuelProfit = { 휘발유:0, 경유:0, 등유:0 };

    for (const f of dailyFiles) {
      const d = readJSON(path.join(DAILY_DIR, f), {});
      if (!d.bos?.date) continue;
      const date = d.bos.date;
      for (const fuel of ['휘발유','경유','등유']) {
        const fd = d.bos.fuels?.[fuel];
        if (!fd) continue;
        sales[fuel] += fd.amount || 0;
        qty[fuel]   += fd.qty    || 0;
        const bp = getFifoPrice(date, fuel);
        const fp = bp ? (fd.amount||0) - (fd.qty||0)*bp : 0;
        fuelProfit[fuel] += fp;
        profit += fp;
      }
      sales.carwash += d.bos.carwash?.amount || 0;
      sales.others  += d.bos.others?.amount  || 0;
      profit += (d.bos.carwash?.amount || 0);
      profit += (d.bos.others?.amount  || 0) - (d.otherCost || 0);
      cardFee += d.card?.totalFee || 0;
      profit  -= d.card?.totalFee || 0;
    }

    const expense = allExpenses
      .filter(e => e.month === ym)
      .reduce((s, e) => s + (e.amount||0), 0);
    const revenue = Object.values(sales).reduce((s,v)=>s+v, 0);

    months.push({
      month: m, ym,
      sales, qty, fuelProfit,
      revenue,
      profit:    hasPrices ? Math.round(profit)            : null,
      cardFee,
      expense,
      netProfit: hasPrices ? Math.round(profit - expense)  : null,
    });
  }

  res.json({ ok: true, year, months, hasPrices });
});

// ── 카드 차이 조정 (사유 등록) ───────────────────────────────
app.post('/api/daily/:date/card-adjustments', (req, res) => {
  const { date } = req.params;
  const { reason, amount, cardCompany, note } = req.body;
  if (!reason || !amount) return res.json({ ok: false, error: '사유와 금액을 입력하세요.' });
  const existing = readJSON(dailyFile(date), null);
  if (!existing) return res.json({ ok: false, error: '데이터 없음' });
  if (!existing.cardAdjustments) existing.cardAdjustments = [];
  existing.cardAdjustments.push({
    reason,
    amount:      +amount,
    cardCompany: cardCompany || '',
    note:        note || '',
    createdAt:   new Date().toISOString().slice(0, 10),
  });
  writeJSON(dailyFile(date), existing);
  res.json({ ok: true, adjustments: existing.cardAdjustments });
});

app.delete('/api/daily/:date/card-adjustments/:idx', (req, res) => {
  const { date, idx } = req.params;
  const existing = readJSON(dailyFile(date), null);
  if (!existing?.cardAdjustments) return res.json({ ok: false, error: '데이터 없음' });
  existing.cardAdjustments.splice(+idx, 1);
  writeJSON(dailyFile(date), existing);
  res.json({ ok: true, adjustments: existing.cardAdjustments });
});

// 유외상품 원가 수기 저장
app.post('/api/daily/:date/other-cost', (req, res) => {
  const { date }   = req.params;
  const { cost }   = req.body;
  const existing   = readJSON(dailyFile(date), null);
  if (!existing) return res.json({ ok: false, error: '데이터 없음' });
  existing.otherCost = +cost || 0;
  writeJSON(dailyFile(date), existing);
  res.json({ ok: true });
});

// 월별 전체 조회
app.get('/api/daily/month/:yearMonth', (req, res) => {
  const ym   = req.params.yearMonth;
  const days = fs.readdirSync(DAILY_DIR)
    .filter(f => f.startsWith(ym) && f.endsWith('.json'))
    .map(f => readJSON(path.join(DAILY_DIR, f), {}))
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({ ok: true, days });
});

// 은행 입금내역 조회 — :date 보다 반드시 먼저 등록
app.get('/api/daily/bank-deposits', (req, res) => {
  res.json({ ok: true, deposits: readJSON(BANK_DEPOSITS_FILE, {}) });
});

// 일별 조회 — catch-all이므로 구체 경로 뒤에 위치
app.get('/api/daily/:date', (req, res) => {
  res.json({ ok: true, data: readJSON(dailyFile(req.params.date), null) });
});

// 은행 입금내역 업로드 (월 1회)
app.post('/api/daily/upload-bank', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: '파일 없음' });
  try {
    const newDeposits = parseBankDeposits(req.file.path);
    const existing    = readJSON(BANK_DEPOSITS_FILE, {});
    // 날짜별 카드사별 병합
    for (const [date, cards] of Object.entries(newDeposits)) {
      if (!existing[date]) existing[date] = {};
      for (const [card, amt] of Object.entries(cards)) {
        existing[date][card] = amt; // 덮어쓰기 (재업로드 시 최신값 적용)
      }
    }
    writeJSON(BANK_DEPOSITS_FILE, existing);
    const dateCount = Object.keys(newDeposits).length;
    res.json({ ok: true, dateCount });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── 월간 보고서 HTML 내보내기 (카카오톡 파일 공유용) ─────────────
app.get('/api/export-html/:yearMonth', (req, res) => {
  const ym = req.params.yearMonth;
  const [yy, mm] = ym.split('-');

  try {
    // ── 데이터 직접 읽기 (내부 HTTP 요청 없이) ──────────────────
    const prices    = readJSON(PURCHASE_PRICES_FILE, []);
    const fifoDaily = readJSON(FIFO_DAILY_FILE, []);
    const fifoDailyMap = {};
    for (const e of fifoDaily) { if (!fifoDailyMap[e.date]) fifoDailyMap[e.date] = e; }

    function getFifoPrice(date, fuel) {
      const fe = fifoDailyMap[date];
      if (fe && fe[fuel]?.price) return fe[fuel].price;
      const list = prices.filter(p => p.fuel === fuel && p.date <= date);
      return list.length ? list[list.length-1].price : 0;
    }

    const dailyFiles = fs.existsSync(DAILY_DIR)
      ? fs.readdirSync(DAILY_DIR).filter(f => f.startsWith(ym) && f.endsWith('.json'))
      : [];

    let totalSales = { 휘발유:0, 경유:0, 등유:0, carwash:0, others:0 };
    let totalQty   = { 휘발유:0, 경유:0, 등유:0 };
    let profitByFuel = { 휘발유:0, 경유:0, 등유:0 };
    let costByFuel   = { 휘발유:0, 경유:0, 등유:0 };
    let totalProfit  = 0;

    for (const f of dailyFiles) {
      const d = readJSON(path.join(DAILY_DIR, f), {});
      if (!d.bos?.date) continue;
      const date = d.bos.date;
      for (const fuel of ['휘발유','경유','등유']) {
        const fd = d.bos.fuels?.[fuel]; if (!fd) continue;
        totalSales[fuel] += fd.amount||0; totalQty[fuel] += fd.qty||0;
        const bp = getFifoPrice(date, fuel);
        if (bp) {
          const fp = (fd.amount||0) - (fd.qty||0)*bp;
          totalProfit += fp; profitByFuel[fuel] += fp; costByFuel[fuel] += (fd.qty||0)*bp;
        }
      }
      totalSales.carwash += d.bos.carwash?.amount||0;
      totalSales.others  += d.bos.others?.amount||0;
      totalProfit += (d.bos.carwash?.amount||0) + (d.bos.others?.amount||0) - (d.otherCost||0) - (d.card?.totalFee||0);
    }

    const avgBuyByFuel = {};
    for (const fuel of ['휘발유','경유','등유']) {
      avgBuyByFuel[fuel] = totalQty[fuel]>0 ? Math.round(costByFuel[fuel]/totalQty[fuel]) : null;
    }

    const allExpenses = readJSON(EXPENSES_FILE, []).filter(e => e.month === ym);
    const totalExpense = allExpenses.reduce((s,e)=>s+(e.amount||0), 0);
    const totalRevenue = Object.values(totalSales).reduce((s,v)=>s+v, 0);
    const netProfit    = Math.round(totalProfit - totalExpense);
    const hasPrices    = prices.length > 0;

    const custFile = path.join(DATA_DIR, `customer_sales_${ym.replace('-','_')}.json`);
    const allCustomers = fs.existsSync(custFile) ? readJSON(custFile, []) : [];

    // 기준가 계산
    const avgBuy = {};
    for (const fuel of ['휘발유','경유','등유']) {
      avgBuy[fuel] = totalQty[fuel]>0 ? costByFuel[fuel]/totalQty[fuel] : 0;
    }
    function custProfit(c) {
      let p=0;
      for (const [fuel, fd] of Object.entries(c.fuels||{})) {
        p += (fd.amount||0) - (fd.qty||0)*(avgBuy[fuel]||0);
      }
      return Math.round(p);
    }
    const expenseTop5 = (() => {
      const m={};
      allExpenses.forEach(e=>{const k=e.subCategory||e.category||'기타';m[k]=(m[k]||0)+(e.amount||0);});
      return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,a])=>({name:n,amount:a}));
    })();
    const custTop5   = allCustomers.filter(c=>c.payType==='외상').map(c=>({...c,profit:custProfit(c)})).sort((a,b)=>b.totalAmount-a.totalAmount).slice(0,5);
    const cardTop5   = allCustomers.filter(c=>c.payType==='신용카드').map(c=>({...c,profit:custProfit(c)})).sort((a,b)=>b.totalAmount-a.totalAmount).slice(0,5);

    // ── 서버사이드 HTML 빌드 헬퍼 ──────────────────────────────
    const generatedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const H  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const W  = n => n==null?'-':Math.round(n).toLocaleString()+'원';
    const L  = n => n>0?Math.floor(n).toLocaleString()+'L':'-';

    // ── 종합 패널 ────────────────────────────────────────────────
    const cost   = hasPrices ? totalRevenue - Math.round(totalProfit) : null;
    const margin = hasPrices && totalRevenue>0 ? (netProfit/totalRevenue*100).toFixed(1)+'%' : '-';
    const kpi = [
      ['총 매출', W(totalRevenue), ''],
      ['매입원가', W(cost), ''],
      ['영업이익', W(hasPrices?Math.round(totalProfit):null), hasPrices?(totalProfit>=0?'pos':'neg'):''],
      ['지출', W(totalExpense), ''],
      ['순이익', W(hasPrices?netProfit:null), hasPrices?(netProfit>=0?'pos':'neg'):''],
      ['순이익률', margin, hasPrices?(netProfit>=0?'pos':'neg'):''],
    ];
    let sumHtml = '<div class="kpi-grid">';
    kpi.forEach(([l,v,c])=>{ sumHtml+=`<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value ${c}">${v}</div></div>`; });
    sumHtml += '</div>';

    // 유종별 판매
    const FUELS = [['경유','#60a5fa'],['휘발유','#fb923c'],['등유','#4ade80']];
    let salesRows='', totalFuelQty=0;
    for (const [fuel, color] of FUELS) {
      const amt=totalSales[fuel]||0, qty=totalQty[fuel]||0, drums=Math.floor(qty/200);
      totalFuelQty+=qty;
      const avgS=qty>0?Math.round(amt/qty):null, avgB=avgBuyByFuel[fuel];
      const fp=hasPrices?Math.round(profitByFuel[fuel]):null;
      const fpPct=fp!=null&&amt>0?(fp/amt*100).toFixed(1)+'%':'-';
      const fc=fp==null?'':fp>=0?'pos':'neg';
      salesRows+=`<tr><td style="color:${color};">${fuel}</td><td>${qty>0?qty.toLocaleString()+'L <small>('+drums+'드럼)</small>':'-'}</td><td>${avgS?avgS.toLocaleString()+'원':'-'}</td><td>${avgB?avgB.toLocaleString()+'원':'-'}</td><td class="${fc}">${fp!=null?fp.toLocaleString()+'원 <small>('+fpPct+')</small>':'-'}</td></tr>`;
    }
    const totDrums=Math.floor(totalFuelQty/200);
    const tfc=hasPrices?(totalProfit>=0?'pos':'neg'):'';
    salesRows+=`<tr class="total-row"><td>합계</td><td>${Math.floor(totalFuelQty).toLocaleString()}L <small>(${totDrums}드럼)</small></td><td>-</td><td>-</td><td class="${tfc}">${hasPrices?Math.round(totalProfit).toLocaleString()+'원':'-'}</td></tr>`;
    const etcAmt=(totalSales.carwash||0)+(totalSales.others||0);
    sumHtml+=`<div class="card"><div class="card-head">유종별 판매 현황</div><div style="overflow-x:auto;"><table class="fuel-table"><thead><tr><th>유종</th><th>판매량</th><th>판매가</th><th>매입가</th><th>영업이익</th></tr></thead><tbody>${salesRows}</tbody></table></div>${etcAmt>0?`<div style="padding:8px 12px;font-size:12px;color:#64748b;border-top:1px solid #334155;">세차+유외상품 ${etcAmt.toLocaleString()}원</div>`:''}</div>`;

    // 지출 Top5
    let expTop='<div class="card"><div class="card-head">지출 Top 5 <span class="lnk" onclick="sw(\'expense\')">전체보기 →</span></div>';
    if (expenseTop5.length) {
      const maxA=expenseTop5[0].amount;
      expenseTop5.forEach((e,i)=>{ const bp=maxA>0?(e.amount/maxA*100).toFixed(0):0; expTop+=`<div class="top5-row"><div class="top5-hd"><span class="top5-nm">${i+1}. ${H(e.name)}</span><span class="top5-am">${e.amount.toLocaleString()}원</span></div><div class="bar-bg"><div class="bar-fill" style="width:${bp}%;"></div></div></div>`; });
    } else expTop+='<div class="empty">지출 데이터 없음</div>';
    sumHtml += expTop+'</div>';

    // 고객 Top5
    function t5html(title, list, linkTab) {
      let h=`<div class="card"><div class="card-head">${title} <span class="lnk" onclick="sw('${linkTab}')">전체보기 →</span></div>`;
      if (list.length) {
        list.forEach((c,i)=>{ const cls=(c.profit||0)>=0?'pos':'neg'; const pct=c.totalAmount>0?(c.profit/c.totalAmount*100).toFixed(1)+'' : '-'; h+=`<div class="cust-row"><div class="cust-hd"><span class="cust-nm">${i+1}. ${H(c.name)}</span><span class="cust-am">${Math.round(c.totalAmount).toLocaleString()}원</span></div><div class="cust-dt"><span>${c.totalQty?Math.floor(c.totalQty).toLocaleString()+'L':'-'}</span><span class="${cls}">이익 ${c.profit!=null?c.profit.toLocaleString()+'원':'-'} (${pct}%)</span></div></div>`; });
      } else h+='<div class="empty">데이터 없음</div>';
      return h+'</div>';
    }
    sumHtml += t5html('외상 고객 Top 5', custTop5, 'customer');
    sumHtml += t5html('카드 고객 Top 5', cardTop5, 'customer');

    // ── 지출내역 패널 ───────────────────────────────────────────
    let expHtml = `<div class="sec-lbl">${yy}년 ${mm}월 · 총 ${allExpenses.length}건</div>`;
    if (allExpenses.length) {
      expHtml += `<div class="card"><div class="card-head">총 지출 <span style="color:#f87171;font-weight:700;">${totalExpense.toLocaleString()}원</span></div>`;
      const groups={};
      allExpenses.forEach(e=>{const k=e.subCategory||e.category||'기타';if(!groups[k])groups[k]={amount:0,items:[]};groups[k].amount+=e.amount||0;groups[k].items.push(e);});
      const sorted=Object.entries(groups).sort((a,b)=>b[1].amount-a[1].amount);
      const maxA=sorted[0][1].amount;
      sorted.forEach(([catName,{amount,items}],idx)=>{
        const bp=maxA>0?(amount/maxA*100).toFixed(0):0;
        const cid=`ec${idx}`;
        expHtml+=`<div style="border-bottom:1px solid #0f172a;"><div class="exp-cat-hd" onclick="tgl('${cid}',this)"><span class="exp-cat-nm">▶ ${H(catName)} <small>(${items.length}건)</small></span><span class="exp-cat-am">${amount.toLocaleString()}원</span></div><div style="padding:0 14px 6px;"><div class="bar-bg"><div class="bar-fill" style="width:${bp}%;background:#ef4444;"></div></div></div><div class="exp-items" id="${cid}">`;
        items.sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{expHtml+=`<div class="exp-item"><div><div style="font-size:12px;color:#cbd5e1;">${H(e.vendor||'-')}</div><div style="font-size:10px;color:#475569;">${e.date}</div></div><div class="exp-item-a">${(e.amount||0).toLocaleString()}원</div></div>`;});
        expHtml+='</div></div>';
      });
      expHtml+='</div>';
    } else expHtml+='<div class="empty">지출 데이터 없음</div>';

    // ── 고객현황 패널 ────────────────────────────────────────────
    let custHtml='';
    if (allCustomers.length) {
      // 필터별 데이터를 각각 data-* 속성으로 미리 삽입 → JS로 필터링
      const custWithProfit = allCustomers.map(c=>({...c, _profit:custProfit(c)}));
      const makeRows = (list) => list.map((c,i)=>{
        const cp=c._profit, qty=c.totalQty||0;
        const avgS=qty>0?Math.round(c.totalAmount/qty):null;
        const pct=c.totalAmount>0?(cp/c.totalAmount*100).toFixed(1):'-';
        const pc=cp>=0?'pos':'neg';
        const badge=c.payType==='외상'?'<span class="badge-c">외상</span>':c.payType==='신용카드'?'<span class="badge-k">카드</span>':'<span class="badge-h">현금</span>';
        return `<tr><td>${i+1}</td><td title="${H(c.name)}">${H(c.name)}</td><td style="text-align:center;">${badge}</td><td>${qty>0?Math.floor(qty).toLocaleString()+'L':'-'}</td><td>${avgS?avgS.toLocaleString()+'원':'-'}</td><td style="font-weight:600;">${Math.round(c.totalAmount).toLocaleString()}원</td><td class="${pc}" style="font-weight:700;">${cp.toLocaleString()}원</td><td class="${pc}" style="font-size:11px;">${pct}%</td></tr>`;
      }).join('');

      const filters = ['전체','외상','카드','현금'];
      const fBtns = filters.map(f=>`<button class="m-filter${f==='전체'?' active':''}" data-f="${f}" onclick="filterCust('${f}',this)">${f}</button>`).join('');
      const tblHead=`<thead><tr><th>#</th><th>업체명</th><th>구분</th><th>판매량</th><th>판매가</th><th>매출</th><th>영업이익</th><th>이익률</th></tr></thead>`;

      // 각 필터별 rows를 data-rows attribute로 저장
      const filterData = {
        '전체': custWithProfit,
        '외상': custWithProfit.filter(c=>c.payType==='외상'),
        '카드': custWithProfit.filter(c=>c.payType==='신용카드'),
        '현금': custWithProfit.filter(c=>c.payType==='현금'),
      };
      const dataAttrs = filters.map(f=>`data-rows-${f==='전체'?'all':f}="${Buffer.from(JSON.stringify(filterData[f])).toString('base64')}"`).join(' ');

      custHtml=`<div class="filter-bar" id="cust-filter-bar">${fBtns}<span id="cust-count" style="margin-left:auto;font-size:11px;color:#475569;align-self:center;">${custWithProfit.length}개 업체</span></div><div style="overflow-x:auto;"><table class="cust-table" id="cust-tbl">${tblHead}<tbody id="cust-tbody">${makeRows(custWithProfit)}</tbody></table></div>`;

      // Base64로 필터 데이터 저장 (전역 변수로)
      const allB64 = Buffer.from(JSON.stringify(filterData)).toString('base64');
      custHtml+=`<script>var _custData=JSON.parse(atob('${allB64}'));</s`+`cript>`;
    } else {
      custHtml='<div class="empty">고객 데이터 없음</div>';
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>미소주유소 ${yy}년 ${mm}월 월간 보고서</title>
  <meta property="og:title" content="미소주유소 ${yy}년 ${mm}월 월간 보고서">
  <meta property="og:description" content="유종별 매출 · 지출내역 · 고객현황 종합보고">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;font-size:14px;padding-bottom:60px}
    header{background:#1e293b;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;position:sticky;top:0;z-index:20}
    .logo{font-size:15px;font-weight:700;color:#f8fafc}
    .sub{font-size:11px;color:#64748b;text-align:right;line-height:1.4}
    .panel{display:none;padding:12px}
    .panel.active{display:block}
    .tab-nav{position:fixed;bottom:0;left:0;right:0;background:#1e293b;border-top:1px solid #334155;display:flex;z-index:30}
    .tab-nav-btn{flex:1;padding:10px 6px 8px;background:none;border:none;color:#64748b;font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:inherit}
    .tab-nav-btn .ic{font-size:18px}
    .tab-nav-btn.active{color:#3b82f6;border-top:2px solid #3b82f6}
    .kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}
    .kpi-card{background:#1e293b;border-radius:10px;padding:12px;border:1px solid #334155}
    .kpi-label{font-size:11px;color:#94a3b8;margin-bottom:3px}
    .kpi-value{font-size:16px;font-weight:700;color:#f8fafc;word-break:keep-all}
    .kpi-value.pos{color:#4ade80}.kpi-value.neg{color:#f87171}
    .card{background:#1e293b;border-radius:10px;border:1px solid #334155;margin-bottom:12px;overflow:hidden}
    .card-head{padding:11px 14px 9px;font-size:13px;font-weight:700;color:#94a3b8;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center}
    .card-head-link{font-size:11px;color:#475569;cursor:pointer;text-decoration:underline}
    .fuel-table{width:100%;border-collapse:collapse;font-size:12px}
    .fuel-table th{padding:7px 8px;text-align:right;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;white-space:nowrap}
    .fuel-table th:first-child{text-align:left}
    .fuel-table td{padding:8px 8px;text-align:right;border-bottom:1px solid #1e3a5f22;color:#cbd5e1;white-space:nowrap;font-size:12px}
    .fuel-table td:first-child{text-align:left;font-weight:600;color:#f8fafc}
    .fuel-table tr.total-row td{background:#334155;font-weight:700;border-top:1px solid #475569;border-bottom:none}
    .pos{color:#4ade80}.neg{color:#f87171}
    .top5-row{padding:9px 14px;border-bottom:1px solid #0f172a}
    .top5-row:last-child{border-bottom:none}
    .top5-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .top5-nm{font-size:13px;font-weight:600;color:#e2e8f0}
    .top5-am{font-size:13px;font-weight:700;color:#60a5fa}
    .bar-bg{background:#334155;border-radius:3px;height:4px}
    .bar-fill{background:#3b82f6;border-radius:3px;height:4px}
    .cust-row{padding:9px 14px;border-bottom:1px solid #0f172a}
    .cust-row:last-child{border-bottom:none}
    .cust-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
    .cust-nm{font-size:13px;font-weight:600;color:#e2e8f0}
    .cust-am{font-size:13px;font-weight:700;color:#f8fafc}
    .cust-dt{font-size:11px;color:#64748b;display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}
    .exp-cat-hd{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
    .exp-cat-nm{font-size:13px;font-weight:700;color:#e2e8f0}
    .exp-cat-am{font-size:13px;font-weight:700;color:#f87171}
    .exp-items{display:none;background:#0f172a}
    .exp-items.open{display:block}
    .exp-item{padding:7px 14px 7px 24px;display:flex;justify-content:space-between;border-top:1px solid #1e293b}
    .exp-item-l{font-size:12px;color:#94a3b8}
    .exp-item-d{font-size:10px;color:#475569}
    .exp-item-a{font-size:12px;color:#fca5a5;font-weight:600;white-space:nowrap}
    .filter-bar{padding:8px 12px;display:flex;gap:6px;border-bottom:1px solid #334155;background:#1e293b;flex-wrap:wrap}
    .m-filter{padding:4px 12px;border-radius:16px;border:1px solid #475569;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer}
    .m-filter.active{background:#3b82f6;border-color:#3b82f6;color:#fff;font-weight:600}
    .cust-table{width:100%;border-collapse:collapse;font-size:12px}
    .cust-table th{padding:7px 8px;text-align:right;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;white-space:nowrap;background:#0f172a}
    .cust-table th:nth-child(1),.cust-table th:nth-child(2){text-align:center}
    .cust-table td{padding:8px 8px;text-align:right;border-bottom:1px solid #1e293b;color:#cbd5e1;white-space:nowrap;font-size:12px}
    .cust-table td:nth-child(1){text-align:center;color:#475569;font-size:11px}
    .cust-table td:nth-child(2){text-align:left;font-weight:600;color:#f8fafc;max-width:120px;overflow:hidden;text-overflow:ellipsis}
    .badge-c{background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600}
    .badge-k{background:#fce7f3;color:#9d174d;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600}
    .badge-h{background:#f3f4f6;color:#374151;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600}
    .lnk{font-size:11px;color:#475569;cursor:pointer;text-decoration:underline;font-weight:400}
    .empty{padding:24px;text-align:center;color:#475569;font-size:13px}
    .sec-lbl{padding:6px 12px 2px;font-size:11px;color:#475569}
    @media(max-width:360px){.kpi-value{font-size:14px}}
  </style>
</head>
<body>
<header>
  <div class="logo">⛽ 미소주유소</div>
  <div class="sub">${yy}년 ${mm}월 보고서<br><span style="font-size:10px;">${generatedAt}</span></div>
</header>
<!-- 서버에서 완전히 렌더링된 패널 -->
<div id="panel-summary" class="panel active">${sumHtml}</div>
<div id="panel-expense"  class="panel">${expHtml}</div>
<div id="panel-customer" class="panel">${custHtml}</div>
<nav class="tab-nav">
  <button class="tab-nav-btn active" onclick="sw('summary')"><span class="ic">📊</span>종합</button>
  <button class="tab-nav-btn"        onclick="sw('expense')"><span class="ic">💰</span>지출내역</button>
  <button class="tab-nav-btn"        onclick="sw('customer')"><span class="ic">👥</span>고객현황</button>
</nav>
<script>
/* 탭 전환 및 지출 펼치기만 JS로 처리 (데이터 렌더링은 서버에서 완료) */
function sw(tab){
  ['summary','expense','customer'].forEach(function(t){
    document.getElementById('panel-'+t).classList.toggle('active',t===tab);
  });
  var tabs=['summary','expense','customer'];
  document.querySelectorAll('.tab-nav-btn').forEach(function(b,i){b.classList.toggle('active',tabs[i]===tab);});
}
function tgl(id,btn){
  var el=document.getElementById(id);
  var op=el.classList.toggle('open');
  var nm=btn.querySelector('.exp-cat-nm');
  if(nm)nm.textContent=(op?'▼':'▶')+nm.textContent.slice(1);
}
/* 고객 필터 (서버 렌더링 데이터 기반) */
function filterCust(f,btn){
  document.querySelectorAll('.m-filter').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(typeof _custData==='undefined')return;
  var map={'전체':'전체','외상':'외상','카드':'카드','현금':'현금'};
  var list=_custData[f]||_custData['전체']||[];
  var tbody=document.getElementById('cust-tbody');
  var cnt=document.getElementById('cust-count');
  if(cnt)cnt.textContent=list.length+'개 업체';
  if(!tbody)return;
  var W=function(n){return n==null?'-':Math.round(n).toLocaleString()+'원';};
  var rows=list.map(function(c,i){
    var cp=c._profit||0,qty=c.totalQty||0;
    var avgS=qty>0?Math.round(c.totalAmount/qty):null;
    var pct=c.totalAmount>0?(cp/c.totalAmount*100).toFixed(1):'-';
    var pc=cp>=0?'pos':'neg';
    var badge=c.payType==='외상'?'<span class="badge-c">외상</span>':c.payType==='신용카드'?'<span class="badge-k">카드</span>':'<span class="badge-h">현금</span>';
    return '<tr><td>'+(i+1)+'</td><td>'+c.name+'</td><td style="text-align:center;">'+badge+'</td><td>'+(qty>0?Math.floor(qty).toLocaleString()+'L':'-')+'</td><td>'+(avgS?avgS.toLocaleString()+'원':'-')+'</td><td style="font-weight:600;">'+Math.round(c.totalAmount).toLocaleString()+'원</td><td class="'+pc+'" style="font-weight:700;">'+cp.toLocaleString()+'원</td><td class="'+pc+'" style="font-size:11px;">'+pct+'%</td></tr>';
  });
  tbody.innerHTML=rows.join('');
}
</script>
</body>
</html>`;

    const filename = encodeURIComponent(`미소주유소_${yy}년${mm}월_보고서.html`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(html);
  } catch(e) {
    res.status(500).send('보고서 생성 오류: ' + e.message);
  }
});

// ── 서버 IP 조회 (모바일 공유용) ──────────────────────────────
app.get('/api/server-info', (req, res) => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let localIP = 'localhost';
  // 192.168.x.x(가정용WiFi) > 10.x.x.x > 기타 순으로 우선
  const candidates = [];
  for (const iface of Object.values(ifaces)) {
    for (const alias of iface) {
      if (alias.family !== 'IPv4' || alias.internal) continue;
      if (alias.address.startsWith('169.254.')) continue; // APIPA 제외
      candidates.push(alias.address);
    }
  }
  const wifi = candidates.find(ip => ip.startsWith('192.168.'))
            || candidates.find(ip => ip.startsWith('10.'))
            || candidates[0];
  if (wifi) localIP = wifi;
  res.json({ ok: true, ip: localIP, port: PORT, version });
});

// ── 모바일용 일마감 월별 데이터 ───────────────────────────────
app.get('/api/daily-summary', (req, res) => {
  const year  = parseInt(req.query.year)  || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const ym    = `${year}-${String(month).padStart(2,'0')}`;

  const days = [];
  if (fs.existsSync(DAILY_DIR)) {
    fs.readdirSync(DAILY_DIR)
      .filter(f => f.startsWith(ym) && f.endsWith('.json'))
      .sort()
      .forEach(f => {
        const d = readJSON(path.join(DAILY_DIR, f), {});
        if (d.bos) days.push(d);
      });
  }

  const prices = readJSON(PURCHASE_PRICES_FILE, []);
  function getFifoPrice(date, fuel) {
    const list = prices.filter(p => p.fuel === fuel && p.date <= date);
    return list.length ? list[list.length - 1].price : 0;
  }

  const result = days.map(d => {
    const bos = d.bos;
    let profit = null;
    if (prices.length > 0 && bos) {
      profit = 0;
      ['휘발유', '경유', '등유'].forEach(fuel => {
        const f = bos.fuels?.[fuel];
        const buy = getFifoPrice(bos.date, fuel);
        if (f && buy) profit += f.amount - f.qty * buy;
      });
      profit += (bos.carwash?.amount || 0);
      profit += (bos.others?.amount  || 0) - (d.otherCost || 0);
      profit -= (d.card?.totalFee    || 0);
      profit = Math.round(profit);
    }
    return {
      date:   bos?.date,
      fuels:  bos?.fuels,
      carwash: bos?.carwash,
      others:  bos?.others,
      profit,
    };
  });

  res.json({ ok: true, year, month, days: result });
});

// ── 완료 상태 (거래명세서/이메일/세금계산서) ──────────────────────
app.get('/api/completion', (req, res) => {
  const year  = req.query.year  || new Date().getFullYear();
  const month = req.query.month || (new Date().getMonth() + 1);
  const all   = readJSON(COMPLETION_FILE, {});
  const key   = `${year}-${String(month).padStart(2, '0')}`;
  const def   = { statements: [], emails: [], taxInvoices: [] };
  res.json({ ok: true, completion: all[key] || def });
});

app.post('/api/completion', (req, res) => {
  const { year, month, completion } = req.body;
  if (!year || !month || !completion) return res.json({ ok: false, error: '잘못된 요청' });
  const all = readJSON(COMPLETION_FILE, {});
  const key = `${year}-${String(month).padStart(2, '0')}`;
  all[key]  = completion;
  fs.writeFileSync(COMPLETION_FILE, JSON.stringify(all, null, 2));
  res.json({ ok: true });
});

// ── 전역 에러 핸들러 (try-catch 없는 핸들러 오류 포착) ────────
app.use((err, req, res, next) => {
  console.error('[Express Error]', req.method, req.path, err.message);
  res.status(500).json({ ok: false, error: '서버 오류: ' + err.message });
});

// 처리되지 않은 Promise 거부 로그
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

app.listen(PORT, () => {
  console.log('\n✅  주유소 자동화 웹앱 실행 중');
  console.log(`    브라우저에서 열기 → http://localhost:${PORT}\n`);
});
