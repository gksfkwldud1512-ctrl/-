'use strict';
const fs = require('fs');

// 브라우저 세션 전역 보관 (서버 재시작 전까지 유지)
let _browser = null;
let _vendorData = null;

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

// ── 1단계: 홈택스 브라우저 열기 ───────────────────────────────
async function openHometax(vendor, customer, issueDate, hometaxMethod) {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch { throw new Error('puppeteer-core 모듈이 없습니다.'); }

  const found = findBrowser();
  if (!found) throw new Error('Edge 또는 Chrome을 찾을 수 없습니다.');

  const { exe: browserPath, dataDir: userDataDir } = found;
  const browserName = browserPath.includes('Edge') ? 'Edge' : 'Chrome';

  // 기존 브라우저 세션이 있으면 닫기
  if (_browser) {
    try { await _browser.close(); } catch {}
    _browser = null;
  }

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
    const { exec } = require('child_process');
    exec(`"${browserPath}" --new-window https://www.hometax.go.kr`);
    throw new Error(`${browserName}이 이미 실행 중입니다. 열린 창에서 직접 진행해주세요.`);
  }

  _browser = browser;

  // 발행 데이터 보관 (자동입력 시 사용)
  const taxData = calcTaxData(vendor);
  _vendorData = {
    bizNo:    customer?.bizNo || '',
    date:     (issueDate || '').replace(/[-/]/g, ''),
    method:   hometaxMethod || '통합',
    products: Object.entries(taxData),
  };

  // 홈택스 열기
  const page = await browser.newPage();
  await page.goto('https://www.hometax.go.kr', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const browserLabel = browserName;
  console.log('');
  console.log('='.repeat(55));
  console.log(`[홈택스봇] ${browserLabel} 실행됨 — ${vendor.name}`);
  console.log('');
  console.log('  ① 공동인증서로 로그인하세요');
  console.log('  ② 조회/발급 → 전자세금계산서 → 발급 → 건별발급');
  console.log('  ③ 건별발급 화면에서 웹앱의 [자동 입력] 버튼 클릭!');
  console.log('='.repeat(55));
}

// ── 2단계: 현재 화면에 자동 입력 ─────────────────────────────
async function fillCurrentPage(productIndex) {
  if (!_browser) throw new Error('홈택스 브라우저가 열려있지 않습니다. 먼저 발행 버튼을 누르세요.');
  if (!_vendorData) throw new Error('발행 데이터가 없습니다.');

  const { bizNo, date, products } = _vendorData;
  const idx = productIndex || 0;

  // 입력할 품목 결정
  let targetProducts;
  if (_vendorData.method === '분리') {
    if (idx >= products.length) throw new Error('모든 품목 입력이 완료됐습니다.');
    targetProducts = [products[idx]];
  } else {
    targetProducts = products;
  }

  // 모든 페이지/프레임에서 입력 시도
  const pages = await _browser.pages();
  let filled = false;

  for (const pg of pages) {
    if (filled) break;
    const frames = pg.frames();
    for (const frame of frames) {
      try {
        const hasForm = await frame.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          const url  = window.location.href;
          return text.includes('공급받는자') || text.includes('작성일자') ||
                 text.includes('사업자등록번호') || text.includes('품목') ||
                 url.includes('UTSEIBG') || url.includes('taxInvoice');
        });

        if (hasForm) {
          console.log('[홈택스봇] 건별발급 폼 발견! 입력 중...');
          await doFill(frame, targetProducts, date, bizNo);
          filled = true;
          break;
        }
      } catch {}
    }

    // 프레임에서 못 찾으면 페이지 직접 시도
    if (!filled) {
      try {
        const hasForm = await pg.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          return text.includes('공급받는자') || text.includes('작성일자') ||
                 text.includes('품목') || text.includes('사업자등록번호');
        });
        if (hasForm) {
          console.log('[홈택스봇] 메인 페이지에서 폼 발견! 입력 중...');
          await doFill(pg, targetProducts, date, bizNo);
          filled = true;
        }
      } catch {}
    }
  }

  if (!filled) throw new Error('건별발급 폼을 찾지 못했습니다. 건별발급 화면에서 다시 시도해주세요.');

  const productName = targetProducts.map(([n]) => n).join(', ');
  const nextIdx = idx + 1;
  const isLastProduct = _vendorData.method !== '분리' || nextIdx >= products.length;

  return {
    filled: true,
    productName,
    nextIndex: nextIdx,
    isLast: isLastProduct,
    remaining: _vendorData.method === '분리' ? products.length - nextIdx : 0,
  };
}

async function doFill(target, products, date, bizNo) {
  // 작성일자
  if (date) {
    await target.evaluate((d) => {
      document.querySelectorAll('input').forEach(inp => {
        const h = (inp.id + inp.name + inp.placeholder + inp.className).toLowerCase();
        if ((h.includes('date') || h.includes('dt') || inp.maxLength === 8) && !inp.readOnly) {
          inp.value = d;
          ['input','change','blur'].forEach(ev =>
            inp.dispatchEvent(new Event(ev, { bubbles: true }))
          );
        }
      });
    }, date).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
  }

  // 사업자번호
  if (bizNo) {
    await target.evaluate((no) => {
      const clean = no.replace(/-/g, '');
      document.querySelectorAll('input').forEach(inp => {
        const h = (inp.id + inp.name + inp.placeholder + inp.className).toLowerCase();
        if ((h.includes('biz') || h.includes('corp') || h.includes('사업자') ||
             inp.maxLength === 10) && !inp.readOnly) {
          inp.value = clean;
          ['input','change','blur'].forEach(ev =>
            inp.dispatchEvent(new Event(ev, { bubbles: true }))
          );
        }
      });
    }, bizNo).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
  }

  // 품목 행 입력
  for (let i = 0; i < products.length; i++) {
    const [prodName, tot] = products[i];
    await target.evaluate((idx, name, qty, sup, tax) => {
      const rows = document.querySelectorAll('table tbody tr, [class*="row"]');
      const row  = Array.from(rows).filter(r => r.querySelectorAll('input').length >= 3)[idx];
      if (!row) return;
      const inputs = row.querySelectorAll('input');
      const set = (el, val) => {
        if (!el || el.readOnly) return;
        el.value = String(val);
        ['input','change','blur'].forEach(ev =>
          el.dispatchEvent(new Event(ev, { bubbles: true }))
        );
      };
      set(inputs[0], name);
      set(inputs[1], qty.toFixed(2));
      set(inputs[3], sup);
      set(inputs[4], tax);
    }, i, prodName, tot.qty, tot.sup, tot.tax).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('[홈택스봇] 입력 완료');
}

function getBrowserStatus() {
  return {
    isOpen: !!_browser,
    method: _vendorData?.method || null,
    totalProducts: _vendorData?.products?.length || 0,
  };
}

module.exports = { openHometax, fillCurrentPage, calcTaxData, getBrowserStatus };
