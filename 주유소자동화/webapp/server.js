'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { version } = require('./package.json');

const app  = express();
const PORT = 3000;

app.use(express.json());
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

const CUSTOMERS_FILE      = path.join(DATA_DIR, 'customers.json');
const SETTINGS_FILE       = path.join(DATA_DIR, 'settings.json');
const PURCHASE_PRICES_FILE = path.join(DATA_DIR, 'purchase_prices.json');
const DAILY_DIR            = path.join(DATA_DIR, 'daily');
const BANK_DEPOSITS_FILE   = path.join(DATA_DIR, 'bank_deposits.json');

if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });

const { parseBosDaily }    = require('./lib/dailyBosParser');
const { parseEasyshop }    = require('./lib/easyshopParser');
const { matchCards }       = require('./lib/cardMatcher');
const { parseBankDeposits } = require('./lib/bankParser');

function vendorFile(year, month) {
  const mo = String(month).padStart(2, '0');
  return path.join(DATA_DIR, `vendors_${year}_${mo}.json`);
}

function getVendors(year, month) {
  return readJSON(vendorFile(year, month), []);
}

function readJSON(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch {}
  return def;
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── Excel 업로드 & 파싱 ────────────────────────────────────────
app.post('/api/parse-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: '파일이 없습니다.' });
    const year  = req.body.year  || new Date().getFullYear();
    const month = req.body.month || new Date().getMonth() + 1;
    const { parseExcel } = require('./lib/excelParser');
    const vendors = parseExcel(req.file.path);
    writeJSON(vendorFile(year, month), vendors);
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

// BOS 업로드
app.post('/api/daily/upload-bos', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: '파일 없음' });
  try {
    const parsed   = parseBosDaily(req.file.path);
    const existing = readJSON(dailyFile(parsed.date), { date: parsed.date });
    existing.bos   = parsed;
    runMatching(existing);
    writeJSON(dailyFile(parsed.date), existing);
    res.json({ ok: true, date: parsed.date, data: existing });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// 이지샵 카드 업로드
app.post('/api/daily/upload-card', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: '파일 없음' });
  try {
    const parsed   = parseEasyshop(req.file.path);
    const existing = readJSON(dailyFile(parsed.date), { date: parsed.date });
    existing.card  = parsed;
    runMatching(existing);
    writeJSON(dailyFile(parsed.date), existing);
    res.json({ ok: true, date: parsed.date, data: existing });
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
  // 같은 날짜+유종이 있으면 덮어쓰기
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

app.listen(PORT, () => {
  console.log('\n✅  주유소 자동화 웹앱 실행 중');
  console.log(`    브라우저에서 열기 → http://localhost:${PORT}\n`);
});
