'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SETTINGS_FILE  = path.join(DATA_DIR, 'settings.json');

function vendorFile(year, month) {
  const mo = String(month).padStart(2, '0');
  return path.join(DATA_DIR, `vendors_${year}_${mo}.json`);
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

// ── 업체 목록 조회 (월별) ─────────────────────────────────────
app.get('/api/vendors', (req, res) => {
  const year  = req.query.year  || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;
  res.json({ ok: true, vendors: readJSON(vendorFile(year, month), []) });
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

// ── 거래명세서 생성 (외상 업체만) ────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { vendorNames, issueDate, year, month, printMethods } = req.body;
    if (!vendorNames?.length) return res.status(400).json({ ok: false, error: '업체를 선택하세요.' });

    const vendors   = readJSON(vendorFile(year, month), []);
    const customers = readJSON(CUSTOMERS_FILE, []);
    // 외상 거래가 있는 업체만 생성
    const selected  = vendorNames
      .map(n => vendors.find(v => v.name === n))
      .filter(v => v?.hasCredit);

    if (!selected.length) return res.status(400).json({ ok: false, error: '선택한 업체 중 외상 거래가 없습니다.' });

    const { generateStatements } = require('./lib/statementGenerator');
    const files = await generateStatements(selected, customers, OUTPUT_DIR, issueDate, year, month, printMethods || {});
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
  const { name, bizNo, contactName, email, phone, address, bizType, bizItem, printMethod, hometaxMethod, taxIssuance } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: '업체명은 필수입니다.' });
  const customers = readJSON(CUSTOMERS_FILE, []);
  const customer  = {
    name,
    bizNo:         bizNo        || '',
    contactName:   contactName  || '',
    email:         email        || '',
    phone:         phone        || '',
    address:       address      || '',
    bizType:       bizType      || '',
    bizItem:       bizItem      || '',
    printMethod:   printMethod  || '',
    hometaxMethod: hometaxMethod || '통합',
    taxIssuance:   taxIssuance  || '합산',
  };
  const idx = customers.findIndex(c => c.name === name);
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

    const vendors   = readJSON(vendorFile(year, month), []);
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
    const vendors   = readJSON(vendorFile(year, month), []);
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

app.listen(PORT, () => {
  console.log('\n✅  주유소 자동화 웹앱 실행 중');
  console.log(`    브라우저에서 열기 → http://localhost:${PORT}\n`);
});
