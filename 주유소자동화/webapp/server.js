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
  const { name, bizNo, contactName, email, phone, printMethod } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: '업체명은 필수입니다.' });
  const customers = readJSON(CUSTOMERS_FILE, []);
  const customer  = { name, bizNo: bizNo || '', contactName: contactName || '', email: email || '', phone: phone || '', printMethod: printMethod || '' };
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
    const { parseExcelRows } = require('./lib/excelParser');
    const rows = parseExcelRows(req.file.path, '고객등록');

    const customers = readJSON(CUSTOMERS_FILE, []);
    let added = 0, updated = 0;

    rows.forEach(row => {
      const name = String(row['업체명 *'] || row['업체명'] || '').trim();
      if (!name || name.startsWith('★') || name.startsWith('출력방법') || name.startsWith('※')) return;

      const incoming = {
        name,
        bizNo:        String(row['사업자번호']  || '').trim(),
        contactName:  String(row['담당자명']     || '').trim(),
        email:        String(row['이메일']       || '').trim(),
        phone:        String(row['연락처']       || '').trim(),
        printMethod:  String(row['출력방법']     || '').trim(),
      };

      const idx = customers.findIndex(c => c.name === name);
      if (idx >= 0) {
        // 기존 업체: 빈 값이 아닌 필드만 덮어쓰기
        ['bizNo','contactName','email','phone','printMethod'].forEach(k => {
          if (incoming[k]) customers[idx][k] = incoming[k];
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
    const { vendorName, email, filename, month } = req.body;
    const settings = readJSON(SETTINGS_FILE, {});
    if (!settings.smtpUser || !settings.smtpPass)
      return res.status(400).json({ ok: false, error: 'SMTP 설정 없음 — [설정] 탭에서 입력하세요.' });

    const fp = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(fp))
      return res.status(400).json({ ok: false, error: '거래명세서 파일 없음 — 먼저 생성하세요.' });

    const { sendEmail } = require('./lib/emailSender');
    await sendEmail(settings, email, vendorName, fp, month);
    res.json({ ok: true });
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

    const { openHometax } = require('./lib/hometaxBot');
    openHometax(vendor, customer, issueDate, year, month).catch(e =>
      console.error('[홈택스봇]', e.message)
    );
    res.json({ ok: true, message: '홈택스 브라우저를 열었습니다.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 설정 ─────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const s = readJSON(SETTINGS_FILE, {});
  res.json({ ok: true, smtpUser: s.smtpUser || '', hasPass: !!s.smtpPass });
});

app.post('/api/settings', (req, res) => {
  const { smtpUser, smtpPass } = req.body;
  const s = readJSON(SETTINGS_FILE, {});
  if (smtpUser) s.smtpUser = smtpUser;
  if (smtpPass) s.smtpPass = smtpPass;
  writeJSON(SETTINGS_FILE, s);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('\n✅  주유소 자동화 웹앱 실행 중');
  console.log(`    브라우저에서 열기 → http://localhost:${PORT}\n`);
});
