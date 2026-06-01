'use strict';
const fs = require('fs');

// Windows Chrome 경로 자동 탐색
function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

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

async function openHometax(vendor, customer, issueDate) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    throw new Error('puppeteer-core 모듈이 없습니다. npm install 후 재시도하세요.');
  }

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome을 찾을 수 없습니다. Chrome을 설치하세요.');
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--disable-infobars'],
  });

  const page = await browser.newPage();
  const taxData = calcTaxData(vendor);
  const bizNo = customer?.bizNo || '';
  const date = (issueDate || '2026/06/01').replace(/\//g, '');

  await page.goto('https://www.hometax.go.kr', { waitUntil: 'networkidle2', timeout: 30000 });

  console.log(`[홈택스봇] ${vendor.name} - 브라우저 열림. 공동인증서로 로그인하세요.`);

  // 로그인 감지 (최대 10분 대기)
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('로그아웃') || document.querySelector('.user-name') !== null,
      { timeout: 600000 }
    );
  } catch {
    console.log('[홈택스봇] 로그인 대기 시간 초과');
    return;
  }

  console.log('[홈택스봇] 로그인 완료. 전자세금계산서 발급 메뉴로 이동...');
  await page.waitForTimeout(1500);

  // 메뉴 탐색: 조회/발급 → 전자세금계산서 → 발급 → 건별발급
  try {
    await navigateToTaxInvoice(page);
    console.log('[홈택스봇] 발급 페이지 진입. 데이터 입력 시작...');
    await page.waitForTimeout(2000);
    await fillTaxInvoiceForm(page, vendor, customer, taxData, date, bizNo);
    console.log('[홈택스봇] 입력 완료. 내용 확인 후 최종 발급 버튼을 클릭하세요.');
  } catch (e) {
    console.error('[홈택스봇] 자동입력 오류:', e.message);
    console.log('[홈택스봇] 수동으로 입력해 주세요. 브라우저가 열려있습니다.');
  }
}

async function navigateToTaxInvoice(page) {
  // 홈택스 메뉴 구조로 탐색
  const clicked = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a, li, span, div'));
    const target = allLinks.find(el =>
      el.textContent.trim() === '조회/발급' || el.textContent.trim().includes('조회/발급')
    );
    if (target) { target.click(); return true; }
    return false;
  });

  if (!clicked) {
    // URL 직접 이동 시도
    await page.goto(
      'https://www.hometax.go.kr/websquareServlet/websquare?w2xPath=/ui/pp/UTSEIBG011M00.xml',
      { waitUntil: 'networkidle2', timeout: 20000 }
    );
    return;
  }

  await page.waitForTimeout(1000);

  // 전자세금계산서 클릭
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, li, span'))
      .find(e => e.textContent.includes('전자세금계산서'));
    if (el) el.click();
  });
  await page.waitForTimeout(800);

  // 발급 클릭
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, li, span'))
      .find(e => e.textContent.trim() === '발급');
    if (el) el.click();
  });
  await page.waitForTimeout(800);

  // 건별발급 클릭
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a, li, span'))
      .find(e => e.textContent.includes('건별발급'));
    if (el) el.click();
  });
  await page.waitForTimeout(2000);
}

async function fillTaxInvoiceForm(page, vendor, customer, taxData, date, bizNo) {
  // 작성일자 입력
  await page.evaluate((d) => {
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
      if (input.placeholder?.includes('작성') || input.name?.includes('date') || input.id?.includes('date')) {
        input.value = d;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, date);

  await page.waitForTimeout(500);

  // 사업자번호 입력
  if (bizNo) {
    await page.evaluate((no) => {
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => {
        if (input.placeholder?.includes('사업자') || input.name?.includes('bizNo') ||
            input.maxLength === 10 || input.maxLength === 12) {
          input.value = no.replace(/-/g, '');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      });
    }, bizNo);

    await page.waitForTimeout(1000);
  }

  // 품목 입력 (각 유종별)
  const products = Object.entries(taxData);
  for (let i = 0; i < products.length; i++) {
    const [prodName, tot] = products[i];
    await page.evaluate((idx, name, qty, sup, tax) => {
      // 품목행 셀렉터는 홈택스 UI에 따라 다를 수 있음
      const rows = document.querySelectorAll('table tbody tr, .item-row');
      const row = rows[idx];
      if (!row) return;
      const cells = row.querySelectorAll('input, td input');
      if (cells[0]) { cells[0].value = name; cells[0].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[1]) { cells[1].value = qty.toFixed(2); cells[1].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[3]) { cells[3].value = sup; cells[3].dispatchEvent(new Event('change', { bubbles: true })); }
      if (cells[4]) { cells[4].value = tax; cells[4].dispatchEvent(new Event('change', { bubbles: true })); }
    }, i, prodName, tot.qty, tot.sup, tot.tax);
    await page.waitForTimeout(300);
  }
}

module.exports = { openHometax, calcTaxData };
