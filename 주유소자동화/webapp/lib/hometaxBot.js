'use strict';
const fs = require('fs');

function findBrowser() {
  const candidates = [
    { exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data' },
    { exe: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\User Data' },
    { exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data' },
    { exe: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      dataDir: process.env.LOCALAPPDATA + '\\Google\\Chrome\\User Data' },
  ];
  return candidates.find(c => fs.existsSync(c.exe)) || null;
}

function calcTaxData(vendor) {
  const productMap = {};
  (vendor.txs || []).forEach(t => {
    if (!productMap[t.product])
      productMap[t.product] = { qty: 0, sup: 0, tax: 0, amt: 0 };
    const supply = t.taxType === '면세' ? t.amount : Math.round(t.amount / 1.1);
    const tax    = t.taxType === '면세' ? 0 : t.amount - supply;
    productMap[t.product].qty += t.qty;
    productMap[t.product].sup += supply;
    productMap[t.product].tax += tax;
    productMap[t.product].amt += t.amount;
  });
  return productMap;
}

// ── 메인 진입점 ───────────────────────────────────────────────
async function openHometax(vendor, customer, issueDate, hometaxMethod) {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch { throw new Error('puppeteer-core 모듈이 없습니다.'); }

  const found = findBrowser();
  if (!found) throw new Error('Edge 또는 Chrome을 찾을 수 없습니다.');

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
  } catch {
    // 이미 실행 중이면 새 창으로만 열기
    const { exec } = require('child_process');
    exec(`"${browserPath}" --new-window https://www.hometax.go.kr`);
    console.log(`[홈택스봇] ${browserName} 이미 실행 중 — 새 창으로 열었습니다.`);
    return;
  }

  // 홈택스 메인 열기
  const page = await browser.newPage();
  await page.goto('https://www.hometax.go.kr', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('');
  console.log('='.repeat(55));
  console.log(`[홈택스봇] ${browserName} 실행됨 — ${vendor.name}`);
  console.log('');
  console.log('  ① 공동인증서로 로그인하세요');
  console.log('  ② 로그인 후 아래 메뉴로 이동하세요:');
  console.log('     조회/발급 → 전자세금계산서 → 발급 → 건별발급');
  console.log('  ③ 건별발급 화면이 열리면 자동으로 입력됩니다!');
  console.log('='.repeat(55));
  console.log('');

  // 건별발급 폼 자동 감지 & 입력 (최대 10분 대기)
  try {
    if (method === '분리' && products.length > 1) {
      for (let i = 0; i < products.length; i++) {
        const [prodName, tot] = products[i];
        const isLast  = i === products.length - 1;
        console.log(`[홈택스봇] [${i + 1}/${products.length}] ${prodName} 폼 감지 대기 중...`);

        const filled = await waitForFormAndFill(browser, [[prodName, tot]], date, bizNo, 600000);
        if (!filled) { console.log('[홈택스봇] 시간 초과'); break; }

        if (!isLast) {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료. 발급 버튼 클릭 후 다시 건별발급 메뉴로 이동하세요.`);
          // 다음 품목을 위해 사용자가 다시 건별발급으로 이동하길 기다림
          await waitForNewForm(browser, 300000);
        } else {
          console.log(`[홈택스봇] ✅ ${prodName} 입력 완료. 내용 확인 후 발급 버튼을 클릭하세요.`);
        }
      }
    } else {
      console.log('[홈택스봇] 건별발급 폼 감지 대기 중...');
      const filled = await waitForFormAndFill(browser, products, date, bizNo, 600000);
      if (filled) console.log('[홈택스봇] ✅ 입력 완료. 내용 확인 후 발급 버튼을 클릭하세요.');
      else        console.log('[홈택스봇] 시간 초과 — 수동으로 입력해주세요.');
    }
  } catch (e) {
    console.error('[홈택스봇] 오류:', e.message);
  }
}

// ── 건별발급 폼 감지 & 입력 ────────────────────────────────────
async function waitForFormAndFill(browser, products, date, bizNo, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // 열려있는 모든 페이지/프레임 확인
    const pages = await browser.pages();
    for (const pg of pages) {
      try {
        // 모든 프레임에서 건별발급 폼 여부 확인
        const frames = pg.frames();
        for (const frame of frames) {
          try {
            const isForm = await frame.evaluate(() => {
              const text = document.body ? document.body.innerText : '';
              const url  = window.location.href;
              return (
                text.includes('공급받는자') ||
                text.includes('작성일자') ||
                text.includes('사업자등록번호') ||
                url.includes('UTSEIBG011') ||
                url.includes('UTSEIBG01')
              );
            });

            if (isForm) {
              console.log('[홈택스봇] 건별발급 폼 감지! 입력 시작...');
              await new Promise(r => setTimeout(r, 1500));
              await fillInvoiceForm(frame, products, date, bizNo);
              return true;
            }
          } catch {}
        }
      } catch {}
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

// 새로운 건별발급 폼 열릴 때까지 대기 (분리발행 다음 건 용)
async function waitForNewForm(browser, timeoutMs) {
  // 현재 폼이 사라지고 새 폼이 나타날 때까지 대기
  await new Promise(r => setTimeout(r, 5000)); // 발급 버튼 클릭 후 잠시 대기
  await waitForFormAndFill(browser, [], '', '', timeoutMs);
}

// ── 폼 입력 ───────────────────────────────────────────────────
async function fillInvoiceForm(frame, products, date, bizNo) {
  // 작성일자
  if (date) {
    await frame.evaluate((d) => {
      document.querySelectorAll('input').forEach(inp => {
        const h = (inp.id + inp.name + inp.placeholder + inp.className).toLowerCase();
        if (h.includes('date') || h.includes('dt') || inp.maxLength === 8) {
          if (inp.value === '' || inp.value === '________') {
            inp.value = d;
            inp.dispatchEvent(new Event('input',  { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur',   { bubbles: true }));
          }
        }
      });
    }, date).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
  }

  // 사업자번호
  if (bizNo) {
    await frame.evaluate((no) => {
      const clean = no.replace(/-/g, '');
      document.querySelectorAll('input').forEach(inp => {
        const h = (inp.id + inp.name + inp.placeholder + inp.className).toLowerCase();
        if (h.includes('biz') || h.includes('corp') || h.includes('사업자') ||
            inp.maxLength === 10 || inp.maxLength === 12) {
          inp.value = clean;
          inp.dispatchEvent(new Event('input',  { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur',   { bubbles: true }));
        }
      });
    }, bizNo).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
  }

  // 품목 행 입력
  if (products.length === 0) return;
  for (let i = 0; i < products.length; i++) {
    const [prodName, tot] = products[i];
    await frame.evaluate((idx, name, qty, sup, tax) => {
      const rows = document.querySelectorAll(
        'table tbody tr, .grid-row, [class*="row"], [id*="row"]'
      );
      const row = rows[idx];
      if (!row) return;
      const inputs = row.querySelectorAll('input');
      const set = (el, val) => {
        if (!el) return;
        el.value = String(val);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (inputs[0]) set(inputs[0], name);       // 품목
      if (inputs[1]) set(inputs[1], qty.toFixed(2)); // 수량
      if (inputs[3]) set(inputs[3], sup);         // 공급가액
      if (inputs[4]) set(inputs[4], tax);         // 세액
    }, i, prodName, tot.qty, tot.sup, tot.tax).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('[홈택스봇] 폼 입력 완료');
}

module.exports = { openHometax, calcTaxData };
