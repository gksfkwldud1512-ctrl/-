'use strict';
const fs   = require('fs');
const path = require('path');

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
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

// ── 홈택스 메인 진입점 ─────────────────────────────────────────
async function openHometax(vendor, customer, issueDate, hometaxMethod) {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch { throw new Error('puppeteer-core 모듈이 없습니다. npm install 후 재시도하세요.'); }

  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome을 찾을 수 없습니다. Chrome을 설치하세요.');

  const taxData  = calcTaxData(vendor);
  const bizNo    = customer?.bizNo || '';
  const date     = (issueDate || '').replace(/[-/]/g, '');
  const method   = hometaxMethod || '통합';
  const products = Object.entries(taxData);

  // 사용자의 실제 Chrome 프로필 사용 → 공동인증서 플러그인 포함
  const userDataDir = process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data';

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
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
    // Chrome이 이미 같은 프로필로 실행 중이면 새 창으로 열기
    const { exec } = require('child_process');
    exec(`"${chromePath}" --new-window https://www.hometax.go.kr`);
    console.log('[홈택스봇] Chrome이 이미 실행 중 — 새 창으로 열었습니다. 수동으로 진행해주세요.');
    return;
  }

  const page = await browser.newPage();
  await page.goto('https://www.hometax.go.kr', { waitUntil: 'networkidle2', timeout: 30000 });
  console.log(`[홈택스봇] ${vendor.name} (${method}발행 ${products.length}종) — 공동인증서로 로그인하세요.`);

  // 로그인 감지 (최대 10분)
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('로그아웃') || document.querySelector('.user-name') !== null,
      { timeout: 600000 }
    );
  } catch {
    console.log('[홈택스봇] 로그인 대기 시간 초과');
    await browser.close();
    return;
  }

  console.log('[홈택스봇] 로그인 완료. 세금계산서 발급 메뉴로 이동 중...');
  await page.waitForTimeout(1500);

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

// ── 건별발급 메뉴 탐색 ─────────────────────────────────────────
async function navigateToTaxInvoice(page) {
  // 직접 URL로 이동 시도 (가장 안정적)
  try {
    await page.goto(
      'https://www.hometax.go.kr/websquareServlet/websquare?w2xPath=/ui/pp/UTSEIBG011M00.xml',
      { waitUntil: 'networkidle2', timeout: 20000 }
    );
    await page.waitForTimeout(2000);
    return;
  } catch {}

  // URL 실패 시 메뉴 클릭으로 탐색
  const menus = ['조회/발급', '전자세금계산서', '발급', '건별발급'];
  for (const keyword of menus) {
    await page.evaluate((kw) => {
      const el = Array.from(document.querySelectorAll('a, li, span, div, button'))
        .find(e => e.textContent.trim() === kw || e.textContent.includes(kw));
      if (el) el.click();
    }, keyword);
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
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
