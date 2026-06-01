'use strict';
const fs   = require('fs');
const path = require('path');

function findBrowser() {
  // Edge 우선, Chrome 차선
  const candidates = [
    { exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data' },
    { exe: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data' },
    { exe: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data' },
    { exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data' },
    { exe: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data' },
  ];
  return candidates.find(c => fs.existsSync(c.exe)) || null;
}

// 유종별 공급가액/세액 계산
function calcTaxData(vendor) {
  const productMap = {};
  (vendor.txs || []).forEach(t => {
    if (!productMap[t.product]) productMap[t.product] = { qty: 0, sup: 0, tax: 0, amt: 0, unitPrice: t.unitPrice };
    const supply = t.taxType === '면세' ? t.amount : Math.round(t.amount / 1.1);
    const tax    = t.taxType === '면세' ? 0 : t.amount - supply;
    productMap[t.product].qty += t.qty;
    productMap[t.product].sup += supply;
    productMap[t.product].tax += tax;
    productMap[t.product].amt += t.amount;
  });
  return productMap;
}

// ── 로그인 감지 (5초 폴링, 다중 조건) ────────────────────────
async function pollForLogin(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const url  = window.location.href;
        // 로그인 성공 신호들
        if (text.includes('로그아웃'))              return 'logout_btn';
        if (text.includes('마이홈택스'))             return 'myhometax';
        if (text.includes('전자신고'))               return 'menu_found';
        if (text.includes('세금신고'))               return 'menu_found';
        if (document.querySelector('#gnb_logout'))   return 'logout_id';
        if (document.querySelector('.logout'))       return 'logout_class';
        // URL이 로그인 페이지가 아니면서 홈택스 내부 페이지인 경우
        if (url.includes('hometax.go.kr') &&
            !url.includes('nlogin') &&
            !url.includes('Login') &&
            url !== 'https://www.hometax.go.kr/' &&
            url !== 'https://www.hometax.go.kr') {
          return 'url_changed';
        }
        return null;
      });
      if (result) {
        console.log(`[홈택스봇] 로그인 감지 (${result})`);
        return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 5000)); // 5초 대기
  }
  return false;
}

// ── 홈택스 메인 진입점 ─────────────────────────────────────────
async function openHometax(vendor, customer, issueDate, hometaxMethod) {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch { throw new Error('puppeteer-core 모듈이 없습니다. npm install 후 재시도하세요.'); }

  const found = findBrowser();
  if (!found) throw new Error('Edge 또는 Chrome을 찾을 수 없습니다. 설치 후 재시도하세요.');

  const { exe: browserPath, dataDir: userDataDir } = found;
  const browserName = browserPath.includes('Edge') ? 'Edge' : 'Chrome';

  const taxData  = calcTaxData(vendor);
  const bizNo    = customer?.bizNo || '';
  const date     = (issueDate || '').replace(/[-/]/g, '');
  const method   = hometaxMethod || '통합';
  const products = Object.entries(taxData);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: false,
      defaultViewport: null,
      userDataDir,
      args: [
        '--start-maximized',
        '--profile-directory=Default',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
      ],
    });
  } catch (e) {
    // 브라우저가 이미 같은 프로필로 실행 중이면 새 창으로 열기
    const { exec } = require('child_process');
    exec(`"${browserPath}" --new-window https://www.hometax.go.kr`);
    console.log(`[홈택스봇] ${browserName}이 이미 실행 중 — 새 창으로 열었습니다. 수동으로 진행해주세요.`);
    return;
  }

  const page = await browser.newPage();
  await page.goto('https://www.hometax.go.kr', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`[홈택스봇] ${browserName} 실행됨. ${vendor.name} (${method}발행 ${products.length}종) — 공동인증서로 로그인하세요.`);

  // 로그인 감지: 5초마다 폴링, 최대 10분
  console.log('[홈택스봇] 로그인 대기 중 (최대 10분)...');
  const loggedIn = await pollForLogin(page, 600000);
  if (!loggedIn) {
    console.log('[홈택스봇] 로그인 대기 시간 초과 — 브라우저를 닫습니다.');
    await browser.close();
    return;
  }

  console.log('[홈택스봇] 로그인 확인! 건별발급 페이지로 이동 중...');
  await page.waitForTimeout(2000);

  try {
    if (method === '분리' && products.length > 1) {
      // ── 분리발행: 유종마다 건별발급 폼 별도 작성 ──────────────
      for (let i = 0; i < products.length; i++) {
        const [prodName, tot] = products[i];
        const isLast  = i === products.length - 1;
        const nextName = !isLast ? products[i + 1][0] : null;

        console.log(`[홈택스봇] [${i + 1}/${products.length}] ${prodName} 입력 중...`);
        await navigateToTaxInvoice(page);
        await page.waitForTimeout(2000);
        await fillInvoiceForm(page, [[prodName, tot]], date, bizNo);

        if (!isLast) {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료 — 발급 버튼 클릭 후 자동으로 ${nextName} 입력합니다.`);
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 300000 }); }
          catch { console.log(`[홈택스봇] 페이지 이동 감지 실패 — ${nextName}으로 진행합니다.`); }
          await page.waitForTimeout(1000);
        } else {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료 — 발급 버튼을 클릭하세요.`);
        }
      }
    } else {
      // ── 통합발행: 품목란에 유종별 행 나열 후 1건 ──────────────
      await navigateToTaxInvoice(page);
      await page.waitForTimeout(2000);
      await fillInvoiceForm(page, products, date, bizNo);
      console.log('[홈택스봇] ✅ 입력 완료 — 내용 확인 후 발급 버튼을 클릭하세요.');
    }
  } catch (e) {
    console.error('[홈택스봇] 자동입력 오류:', e.message);
    console.log('[홈택스봇] 수동으로 입력해주세요. 브라우저가 열려 있습니다.');
  }
}

// ── 건별발급 페이지 이동 ──────────────────────────────────────
const INVOICE_URLS = [
  'https://www.hometax.go.kr/websquareServlet/websquare?w2xPath=/ui/pp/UTSEIBG011M00.xml',
  'https://www.hometax.go.kr/websquareServlet/websquare?w2xPath=/ui/pp/UTSEIBG01.xml',
];

async function navigateToTaxInvoice(page) {
  // 1단계: 알려진 URL로 직접 이동
  for (const url of INVOICE_URLS) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.waitForTimeout(2000);
      // 건별발급 폼이 로드됐는지 확인
      const found = await page.evaluate(() =>
        document.body.innerText.includes('건별발급') ||
        document.body.innerText.includes('전자세금계산서') ||
        document.querySelector('input') !== null
      );
      if (found) { console.log('[홈택스봇] 건별발급 페이지 진입 완료'); return; }
    } catch {}
  }

  // 2단계: 메뉴 순서대로 클릭
  console.log('[홈택스봇] URL 직접 이동 실패 — 메뉴 클릭 시도');
  await page.goto('https://www.hometax.go.kr', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  const menuSteps = [
    { text: '조회/발급',     exact: false },
    { text: '전자세금계산서', exact: false },
    { text: '발급',          exact: true  },
    { text: '건별발급',      exact: false },
  ];

  for (const step of menuSteps) {
    const clicked = await page.evaluate(({ text, exact }) => {
      const els = Array.from(document.querySelectorAll('a, li, span, div, button, td'));
      const el = exact
        ? els.find(e => e.textContent.trim() === text)
        : els.find(e => e.textContent.includes(text));
      if (el) { el.click(); return true; }
      return false;
    }, step);
    console.log(`[홈택스봇] 메뉴 "${step.text}": ${clicked ? '클릭됨' : '못 찾음'}`);
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(2000);
}

// ── 세금계산서 폼 입력 ─────────────────────────────────────────
// products: [[유종명, {qty, sup, tax, amt}], ...]
async function fillInvoiceForm(page, products, date, bizNo) {
  // 작성일자
  if (date) {
    await page.evaluate((d) => {
      document.querySelectorAll('input').forEach(input => {
        const hint = (input.placeholder || '') + (input.name || '') + (input.id || '');
        if (hint.includes('date') || hint.includes('Date') || hint.includes('작성')) {
          input.value = d;
          input.dispatchEvent(new Event('input',  { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }, date);
    await page.waitForTimeout(500);
  }

  // 사업자번호 입력
  if (bizNo) {
    await page.evaluate((no) => {
      const clean = no.replace(/-/g, '');
      document.querySelectorAll('input').forEach(input => {
        const hint = (input.placeholder || '') + (input.name || '') + (input.id || '');
        if (hint.includes('사업자') || hint.includes('bizNo') || hint.includes('CorpNum')) {
          input.value = clean;
          input.dispatchEvent(new Event('input',  { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur',   { bubbles: true }));
        }
      });
    }, bizNo);
    await page.waitForTimeout(1200);
  }

  // 품목 행 입력
  for (let i = 0; i < products.length; i++) {
    const [prodName, tot] = products[i];
    await page.evaluate((idx, name, qty, sup, tax) => {
      const rows = document.querySelectorAll('table tbody tr, .item-row, [class*="item"]');
      const row  = rows[idx];
      if (!row) return;
      const cells = row.querySelectorAll('input, td input');
      const set   = (el, val) => { if (!el) return; el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      set(cells[0], name);
      set(cells[1], qty.toFixed(2));
      set(cells[3], sup);
      set(cells[4], tax);
    }, i, prodName, tot.qty, tot.sup, tot.tax);
    await page.waitForTimeout(400);
  }
}

module.exports = { openHometax, calcTaxData };
