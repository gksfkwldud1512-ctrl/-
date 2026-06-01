'use strict';
const fs = require('fs');

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
  vendor.txs.forEach(t => {
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
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    throw new Error('puppeteer-core 모듈이 없습니다. npm install 후 재시도하세요.');
  }

  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome을 찾을 수 없습니다. Chrome을 설치하세요.');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--disable-infobars'],
  });

  const page    = await browser.newPage();
  const taxData = calcTaxData(vendor);
  const bizNo   = customer?.bizNo || '';
  const date    = (issueDate || '2026/06/01').replace(/\//g, '');
  const method  = hometaxMethod || '통합';
  const products = Object.entries(taxData); // [[유종명, 합계데이터], ...]

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

  console.log('[홈택스봇] 로그인 완료.');
  await page.waitForTimeout(1500);

  try {
    if (method === '분리' && products.length > 1) {
      // ── 분리발행: 유종마다 건별발급 폼 별도 제출 ─────────────
      for (let i = 0; i < products.length; i++) {
        const [prodName, tot] = products[i];
        const isLast = i === products.length - 1;
        const nextName = !isLast ? products[i + 1][0] : null;

        console.log(`[홈택스봇] [${i + 1}/${products.length}] ${prodName} 세금계산서 입력 중...`);
        await navigateToTaxInvoice(page);
        await page.waitForTimeout(2000);
        await fillInvoiceForm(page, customer, [[prodName, tot]], date, bizNo);

        if (!isLast) {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료 — 발급 버튼 클릭 후 자동으로 다음(${nextName}) 입력을 시작합니다.`);
          // 발급 후 페이지 이동 감지 (최대 5분 대기)
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 300000 });
          } catch {
            console.log(`[홈택스봇] 페이지 이동 감지 실패 — 다음(${nextName})으로 진행합니다.`);
          }
          await page.waitForTimeout(1000);
        } else {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료 — 발급 버튼을 클릭해 주세요.`);
        }
      }
      console.log(`[홈택스봇] 분리발행 ${products.length}건 처리 완료.`);

    } else {
      // ── 통합발행: 품목란에 유종별 행 나열 후 1건 발행 ─────────
      console.log(`[홈택스봇] 통합발행 — 품목 ${products.length}종 입력 시작...`);
      await navigateToTaxInvoice(page);
      await page.waitForTimeout(2000);
      await fillInvoiceForm(page, customer, products, date, bizNo);
      console.log('[홈택스봇] ✅ 입력 완료 — 내용 확인 후 발급 버튼을 클릭하세요.');
    }
  } catch (e) {
    console.error('[홈택스봇] 자동입력 오류:', e.message);
    console.log('[홈택스봇] 수동으로 입력해 주세요. 브라우저가 열려 있습니다.');
  }
}

// ── 건별발급 메뉴 탐색 ─────────────────────────────────────────
async function navigateToTaxInvoice(page) {
  const clicked = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, li, span, div'))
      .find(e => e.textContent.trim() === '조회/발급' || e.textContent.trim().includes('조회/발급'));
    if (el) { el.click(); return true; }
    return false;
  });

  if (!clicked) {
    await page.goto(
      'https://www.hometax.go.kr/websquareServlet/websquare?w2xPath=/ui/pp/UTSEIBG011M00.xml',
      { waitUntil: 'networkidle2', timeout: 20000 }
    );
    return;
  }

  await page.waitForTimeout(1000);
  for (const keyword of ['전자세금계산서', '발급', '건별발급']) {
    await page.evaluate((kw) => {
      const el = Array.from(document.querySelectorAll('a, li, span'))
        .find(e => e.textContent.trim() === kw || e.textContent.includes(kw));
      if (el) el.click();
    }, keyword);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(1500);
}

// ── 세금계산서 폼 입력 (통합/단일 공용) ────────────────────────
// products: [[유종명, {qty, sup, tax, amt}], ...]
async function fillInvoiceForm(page, customer, products, date, bizNo) {
  // 작성일자
  await page.evaluate((d) => {
    document.querySelectorAll('input').forEach(input => {
      if (input.placeholder?.includes('작성') || input.name?.includes('date') || input.id?.includes('date')) {
        input.value = d;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, date);
  await page.waitForTimeout(500);

  // 사업자번호
  if (bizNo) {
    await page.evaluate((no) => {
      document.querySelectorAll('input').forEach(input => {
        if (input.placeholder?.includes('사업자') || input.name?.includes('bizNo') ||
            input.maxLength === 10 || input.maxLength === 12) {
          input.value = no.replace(/-/g, '');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur',   { bubbles: true }));
        }
      });
    }, bizNo);
    await page.waitForTimeout(1000);
  }

  // 품목 행 입력
  for (let i = 0; i < products.length; i++) {
    const [prodName, tot] = products[i];
    await page.evaluate((idx, name, qty, sup, tax) => {
      const rows = document.querySelectorAll('table tbody tr, .item-row');
      const row  = rows[idx];
      if (!row) return;
      const cells = row.querySelectorAll('input, td input');
      if (cells[0]) { cells[0].value = name;           cells[0].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[1]) { cells[1].value = qty.toFixed(2); cells[1].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[3]) { cells[3].value = sup;            cells[3].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[4]) { cells[4].value = tax;            cells[4].dispatchEvent(new Event('change', { bubbles: true })); }
    }, i, prodName, tot.qty, tot.sup, tot.tax);
    await page.waitForTimeout(300);
  }
}

module.exports = { openHometax, calcTaxData };
