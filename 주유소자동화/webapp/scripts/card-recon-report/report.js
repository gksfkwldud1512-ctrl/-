// BOS ↔ 나이스(+이지샵) 9월 카드 대사 분석 엑셀 생성
const W = process.argv[2], S = process.argv[3], OUT = process.argv[4];
const ExcelJS = require(W + '/node_modules/exceljs');

(async () => {
  const r = await require(S + '/analyze.js')(W, S);
  const wb = new ExcelJS.Workbook();
  wb.creator = '미소주유소 자동화';

  const FONT = { name: '맑은 고딕', size: 10 };
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const border = { top: { style: 'thin', color: { argb: 'FFD0D7E2' } }, bottom: { style: 'thin', color: { argb: 'FFD0D7E2' } },
                   left: { style: 'thin', color: { argb: 'FFD0D7E2' } }, right: { style: 'thin', color: { argb: 'FFD0D7E2' } } };
  const fills = {
    red:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } },
    orange: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } },
    yellow: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } },
    green:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
    gray:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } },
  };

  // 표 시트 공통
  function tableSheet(name, title, note, cols, rows, fillOf) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { ...FONT, size: 14, bold: true };
    ws.getCell('A2').value = note;
    ws.getCell('A2').font = { ...FONT, color: { argb: 'FF64748B' } };
    ws.mergeCells(1, 1, 1, cols.length); ws.mergeCells(2, 1, 2, cols.length);
    ws.getRow(2).height = 30; ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
    const hr = ws.getRow(4);
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.h; cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEAD_FILL; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = border;
      ws.getColumn(i + 1).width = c.w;
    });
    hr.height = 22;
    rows.forEach((row, ri) => {
      const xr = ws.getRow(5 + ri);
      const fill = fillOf ? fillOf(row) : null;
      cols.forEach((c, i) => {
        const cell = xr.getCell(i + 1);
        const v = typeof c.k === 'function' ? c.k(row) : row[c.k];
        cell.value = v === undefined ? '' : v;
        cell.font = FONT; cell.border = border;
        cell.alignment = { vertical: 'top', wrapText: !!c.wrap, horizontal: c.num ? 'right' : 'left' };
        if (c.num) cell.numFmt = '#,##0';
        if (fill) cell.fill = fill;
      });
    });
    if (rows.length) {
      const tr = ws.getRow(5 + rows.length);
      tr.getCell(1).value = `합계 ${rows.length}건`; tr.getCell(1).font = { ...FONT, bold: true };
      cols.forEach((c, i) => {
        if (!c.sum) return;
        const cell = tr.getCell(i + 1);
        cell.value = rows.reduce((s, x) => s + (Number(typeof c.k === 'function' ? c.k(x) : x[c.k]) || 0), 0);
        cell.numFmt = '#,##0'; cell.font = { ...FONT, bold: true };
      });
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: cols.length } };
    }
    return ws;
  }

  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const t = r.totals;

  // ── 분류 ──
  const missing   = r.bosOnly.filter(x => x.구분 === '결제 누락');
  const apprDiff  = r.bosOnly.filter(x => x.구분 === '승인번호 상이');
  const notCard   = r.bosOnly.filter(x => x.구분 !== '결제 누락' && x.구분 !== '승인번호 상이');
  const by = (arr, f) => arr.reduce((m, x) => { (m[f(x)] = m[f(x)] || []).push(x); return m; }, {});
  const mmBy = by(r.mismatch, x => x.원인);
  const ndBy = by(r.noDeposit, x => x.원인);
  const noBy = by(r.niceOnly, x => x.원인);
  const presale = mmBy['셀프 선결제 금액 그대로 매입 (부분취소 누락 추정)'] || [];
  const dup     = mmBy['BOS 중복 입력'] || [];
  const lotte   = r.noDeposit.filter(x => /반송/.test(x.원인));
  const fleet   = r.noDeposit.filter(x => /주유전용/.test(x.원인));
  const fleetNotCredit = fleet.filter(x => x.BOS결제구분 !== '외상');

  // ── 1. 요약 ──
  const ws = wb.addWorksheet('요약');
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 12; ws.getColumn(3).width = 16; ws.getColumn(4).width = 80;
  let row = 1;
  const put = (vals, opt = {}) => {
    const xr = ws.getRow(row++);
    vals.forEach((v, i) => {
      const c = xr.getCell(i + 1); c.value = v;
      c.font = { ...FONT, ...(opt.bold ? { bold: true } : {}), ...(opt.size ? { size: opt.size } : {}), ...(opt.color ? { color: { argb: opt.color } } : {}) };
      c.alignment = { vertical: 'top', wrapText: i === 3 };
      if (typeof v === 'number') { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right', vertical: 'top' }; }
      if (opt.fill) c.fill = opt.fill;
      if (opt.border) c.border = border;
    });
    return xr;
  };
  put(['2026년 9월 카드 대사 분석 — BOS vs 나이스정보통신(+이지샵)'], { bold: true, size: 15 });
  put([`대상: BOS 판매전표 상세조회 9/4~9/30, 나이스 통합거래조회 9/1~9/30 (나이스는 9/4부터 사용), 이지샵 9월 자료(일마감 저장분) · 작성 2026-10-09`], { color: 'FF64748B' });
  row++;
  put(['기본 현황', '건수', '금액', ''], { bold: true, fill: fills.gray, border: true });
  put(['나이스 정상 승인 (취소 제외)', t.niceOk, t.niceOkAmt, ''], { border: true });
  put(['나이스 승인 후 취소', t.cancel, '', '같은 승인번호의 취소 건 — BOS에 남아있는 것은 없음(모두 재승인 또는 BOS 미기록)'], { border: true });
  put(['나이스 승인거절', t.reject, '', 'BOS에 기록된 건 없음'], { border: true });
  put(['BOS 승인번호 있는 거래 (승인번호 기준)', t.bosCard, t.bosCardAmt, '신용카드 외 외상·현금영수증·포인트 등 승인번호가 있는 모든 거래 포함'], { border: true });
  put(['  ↳ 나이스와 승인번호·금액 일치', r.matched, '', ''], { border: true });
  put(['  ↳ 이지샵(세차·유외상품)과 일치', r.easyMatched, '', '나이스에 없는 세차·유외상품은 이지샵 단말기 결제로 확인'], { border: true });
  row++;
  put(['확인이 필요한 항목', '건수', '금액', '원인 및 조치'], { bold: true, fill: fills.gray, border: true });
  const items = [
    ['① 결제 누락 (BOS 판매 O, 카드 승인 X)', missing.length, sum(missing, 'BOS금액'),
      missing.length ? '나이스·이지샵 어디에도 승인이 없는 BOS 카드 판매 — 시트 [결제누락·금액불일치] 확인' : '없음. BOS 카드 판매는 모두 나이스 또는 이지샵 승인이 확인됨 (현금영수증·외상·포인트 제외)', fills.green],
    ['② 셀프 선결제 금액 그대로 매입', presale.length, sum(presale, '나이스금액') - sum(presale, 'BOS금액'),
      '현대카드(AMEX) 셀프 주유 시 180L 선결제 승인 → 실제 주유량만큼 부분취소가 안 되고 승인금액 전액 매입. 고객 과다청구 금액(차액) — 나이스·주유기 업체에 부분취소 처리 확인, 고객 환불 필요', fills.red],
    ['③ 롯데카드 반송 (입금 안 됨)', lotte.length, sum(lotte, '금액'),
      '9월 롯데카드 승인 전체(나이스 요약표 롯데 매출 1,152,267원과 동일)가 반송사유 "EDC승인매출 접수경로 오류"로 반송 — 정상 승인됐지만 롯데카드가 매입을 반송해 입금되지 않음. 나이스정보통신에 접수경로(가맹점 등록) 확인 후 재청구 요청', fills.red],
    ['④ BOS 금액과 카드 승인금액 다름', (r.mismatch.length - presale.length - dup.length), r.mismatch.filter(x => !presale.includes(x) && !dup.includes(x)).reduce((s, x) => s + Math.abs(x.차액), 0),
      'BOS 금액 입력 오류(자릿수·수량), 단가 차이 등 — 시트 [결제누락·금액불일치]. 금액은 차액 절대값 합계', fills.orange],
    ['⑤ BOS 중복 입력', dup.length, dup.reduce((s, x) => s + x.차액, 0),
      '같은 카드 거래(같은 주유시간)가 BOS 두 날짜에 입력 → BOS 매출 과다. BOS에서 한 건 삭제', fills.orange],
    ['⑥ BOS 승인번호 입력 오류', apprDiff.length, sum(apprDiff, 'BOS금액'), '승인번호 한 자리 다름(금액 같음) — 결제는 정상, BOS 승인번호만 수정', fills.yellow],
    ['⑦ 주유전용(청구제외) 카드 — BOS가 외상 아님', fleetNotCredit.length, sum(fleetNotCredit, '금액'),
      '카드사 일반 입금이 오지 않는 카드인데 BOS에 신용카드·현금으로 기록 (한누리투어·하나항공 등 유가보조금 업체 포함) → 업체 청구/보조금 정산 대상인지 확인', fills.yellow],
    ['⑧ 나이스에만 있는 결제 (BOS 판매 없음)', r.niceOnly.length, sum(r.niceOnly, '금액'),
      '대부분 외상 업체가 외상대금을 현장에서 카드로 결제한 건 — 미수확인 탭 [💳 현장 카드결제]에서 업체 매칭', fills.gray],
    ['참고: 주유전용 카드 — BOS 외상', fleet.length - fleetNotCredit.length, sum(fleet.filter(x => x.BOS결제구분 === '외상'), '금액'),
      '카드사 청구제외 카드로 BOS도 외상 처리 → 업체에서 외상대금으로 입금받는 정상 건 (입금일 없음이 정상)', fills.green],
  ];
  items.forEach(([a, b, c, d, f]) => { const xr = put([a, b, c, d], { border: true, fill: f }); xr.height = Math.max(18, Math.ceil(d.length / 45) * 15); });
  row++;
  put(['입금일 없는 카드 (나이스 정상 승인 중 입금일자 공란)', r.noDeposit.length, sum(r.noDeposit, '금액'), ''], { bold: true, fill: fills.gray, border: true });
  Object.entries(ndBy).forEach(([k, arr]) => put([k, arr.length, sum(arr, '금액'), arr[0].조치.replace(/^BOS [^—]+— /, '')], { border: true }));
  row++;
  put(['시트 안내'], { bold: true });
  put(['청구·입금없음 분류: 승인 정상·BOS에도 있는데 청구일자·입금일자가 모두 없는 72건을 업체별로 분류 (유가보조금/법인 월말결제/업체 미지정)'], { color: 'FF475569' });
  ['결제누락·금액불일치: 결제가 빠졌거나 BOS와 카드 금액이 다른 건 (조치 필요)',
   '입금일없는카드: 나이스 정상 승인인데 입금일자가 없는 건과 원인',
   '나이스에만있음: BOS 판매전표에 없는 카드 결제 (외상대금 카드 수납 등)',
   'BOS에만있음(전체): 나이스에 승인이 없는 BOS 거래 전체와 판정 (현금영수증·외상·포인트 등 정상 포함)'].forEach(x => put([x], { color: 'FF475569' }));

  // ── 1-2. 승인 O · BOS O · 청구일자·입금일자 없음 분류 ──
  {
    const SUBSIDY = ['하나관광여행사', '(주)하나항공여행사(음성지점)', '(주)하나항공여행사(청주본사)', '한누리투어(주)', '한누리관광(주)'];
    const MONTHLY = { '풀무원 8470': '매달 말 신한카드로 한 달치 일괄결제 (8/28 2,277,078 · 9/29 3,035,570 미수확인에서 확인됨)',
                      '풀무원외상6576': '매달 비씨카드로 유류분 일괄결제 (4·5·8월 유류분 금액 일치), 유외상품은 몇 달치 모아 결제' };
    const nb = r.noDeposit.filter(x => !x.청구일자 && x.BOS결제구분 !== '(BOS 없음)');
    const groupOf = x => {
      if (SUBSIDY.includes(x.BOS고객)) return { g: 'A. 유가보조금 카드 업체', why: '업체 전용 주유카드(주유전용·청구제외)로 결제 → 나이스가 카드사에 일반 청구하지 않음 (매입방법 ETC)', act: '일반 카드매출처럼 카드사 입금이 들어오지 않음. 이 업체들은 거래명세서에 유외상품만 넣고 있어 유류 대금이 어디로 입금되는지(카드사 별도 정산/보조금 정산) 확인 필요 — 미수확인에 8·9월 입금 0원', fill: fills.orange };
      if (MONTHLY[x.BOS고객]) return { g: 'B. 법인 주유카드 + 월말 일괄결제', why: '주유할 때는 법인 주유전용 카드로 승인만 받고(청구제외) BOS 외상 처리', act: MONTHLY[x.BOS고객] + ' → 정상', fill: fills.green };
      return { g: 'C. BOS 업체 미지정 → 한누리투어(주) 추정', why: '주유전용(청구제외) 카드인데 BOS에 대표현금고객(현금·신용카드)으로 기록 → 카드사 입금도, 외상 청구도 안 됨', act: '같은 카드(9491-01**-****-8960)가 10/1 한누리투어(주) 차량 705515로 외상 등록됨 (결제 시각 12시대·금액 11~12만원 유사) → BOS에서 9/11·9/18 두 건을 한누리투어(주) 외상(차량 705515)으로 수정하고 9월 거래명세서·미수에 포함', fill: fills.red };
    };
    const rows = nb.map(x => ({ ...x, ...groupOf(x) })).sort((a, b) => a.g.localeCompare(b.g) || a.BOS고객.localeCompare(b.BOS고객) || a.거래일자.localeCompare(b.거래일자));

    const ws2 = wb.addWorksheet('청구·입금없음 분류', { views: [{ state: 'frozen', ySplit: 4 }] });
    ws2.getCell('A1').value = '승인 정상 · BOS에도 있음 · 청구일자와 입금일자가 모두 없는 카드';
    ws2.getCell('A1').font = { ...FONT, size: 14, bold: true };
    ws2.getCell('A2').value = `총 ${rows.length}건 ${rows.reduce((s, x) => s + x.금액, 0).toLocaleString()}원 — 전부 카드종류 "주유전용(청구제외)" (신한 9410-17·국민 9491-01·비씨 9456-20 계열). 나이스가 카드사에 청구하지 않는 카드라 청구일·입금일이 비어 있음. ※ 롯데카드 19건은 청구는 됐지만 반송돼 입금일만 없는 별도 건(시트 [입금일없는카드])`;
    ws2.getCell('A2').font = { ...FONT, color: { argb: 'FF475569' } }; ws2.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
    ws2.mergeCells('A1:H1'); ws2.mergeCells('A2:H2'); ws2.getRow(2).height = 45;

    // 분류 요약표
    const heads = ['분류', '업체(BOS 고객)', '사용 카드', '건수', '금액', 'BOS 기록', '원인', '확인·조치'];
    const widths = [26, 26, 22, 7, 13, 18, 45, 70];
    const hr = ws2.getRow(4);
    heads.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL; c.border = border; c.alignment = { horizontal: 'center' }; ws2.getColumn(i + 1).width = widths[i]; });
    const byVendor = {};
    rows.forEach(x => { const k = x.g + '|' + x.BOS고객; (byVendor[k] = byVendor[k] || []).push(x); });
    let ri = 5;
    for (const arr of Object.values(byVendor)) {
      const x = arr[0];
      const vals = [x.g, x.BOS고객 || '(이름 없음)', [...new Set(arr.map(a => a.카드번호))].join('\n'), arr.length, arr.reduce((s, a) => s + a.금액, 0),
                    [...new Set(arr.map(a => a.BOS결제구분))].join(', '), x.why, x.act];
      const xr = ws2.getRow(ri++);
      vals.forEach((v, i) => { const c = xr.getCell(i + 1); c.value = v; c.font = FONT; c.border = border; c.fill = x.fill; c.alignment = { vertical: 'top', wrapText: true, horizontal: typeof v === 'number' ? 'right' : 'left' }; if (typeof v === 'number') c.numFmt = '#,##0'; });
      xr.height = Math.max(30, Math.ceil(x.act.length / 40) * 14);
    }
    const tot = ws2.getRow(ri++);
    tot.getCell(1).value = '합계'; tot.getCell(4).value = rows.length; tot.getCell(5).value = rows.reduce((s, x) => s + x.금액, 0); tot.getCell(5).numFmt = '#,##0';
    [1, 4, 5].forEach(i => { tot.getCell(i).font = { ...FONT, bold: true }; });
    // 분류별 소계
    ri++;
    const gsum = {};
    rows.forEach(x => { gsum[x.g] = gsum[x.g] || { n: 0, a: 0, fill: x.fill }; gsum[x.g].n++; gsum[x.g].a += x.금액; });
    for (const [g, v] of Object.entries(gsum)) {
      const xr = ws2.getRow(ri++);
      xr.getCell(1).value = g; xr.getCell(4).value = v.n; xr.getCell(5).value = v.a; xr.getCell(5).numFmt = '#,##0';
      [1, 4, 5].forEach(i => { xr.getCell(i).font = { ...FONT, bold: true }; xr.getCell(i).fill = v.fill; xr.getCell(i).border = border; });
    }

    // 상세 목록
    ri += 2;
    ws2.getCell(`A${ri}`).value = '상세 목록'; ws2.getCell(`A${ri}`).font = { ...FONT, bold: true, size: 12 }; ri++;
    const dh = ['분류', '거래일자', '시간', '매입사', '카드번호', '승인번호', '금액', 'BOS 고객 / 결제구분'];
    const dr = ws2.getRow(ri++);
    dh.forEach((h, i) => { const c = dr.getCell(i + 1); c.value = h; c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL; c.border = border; });
    rows.forEach(x => {
      const xr = ws2.getRow(ri++);
      [x.g, x.거래일자, x.거래시간, x.매입사, x.카드번호, x.승인번호, x.금액, `${x.BOS고객 || '(이름 없음)'} / ${x.BOS결제구분}`].forEach((v, i) => {
        const c = xr.getCell(i + 1); c.value = v; c.font = FONT; c.border = border; c.fill = x.fill;
        if (typeof v === 'number') c.numFmt = '#,##0';
      });
    });
    console.log('nobill', Object.fromEntries(Object.entries(gsum).map(([k, v]) => [k, [v.n, v.a]])));
  }


  // ── 2. 결제누락·금액불일치 ──
  const issueRows = [
    ...missing.map(x => ({ ...x, 유형: '결제 누락', 카드금액: null, 차액: x.BOS금액, 원인: x.원인, 조치: x.상세 })),
    ...apprDiff.map(x => ({ ...x, 유형: '승인번호 상이', 카드금액: x.BOS금액, 차액: 0, 원인: x.원인, 조치: x.상세 })),
    ...r.mismatch.map(x => ({ ...x, 유형: '금액 불일치', 카드금액: x.나이스금액 })),
  ].sort((a, b) => String(a.판매일자).localeCompare(String(b.판매일자)));
  tableSheet('결제누락·금액불일치', '결제 누락 · 금액 불일치',
    '차액 = BOS 금액 − 카드 승인금액 (+ BOS가 많음 / − 카드가 많음). 빨강=고객 과다청구·결제 누락, 주황=BOS 입력 오류, 노랑=승인번호만 다름',
    [{ h: '판매일자', k: '판매일자', w: 11 }, { h: '고객명', k: '고객명', w: 14 }, { h: '결제구분', k: '결제구분', w: 9 },
     { h: '제품', k: '제품', w: 14 }, { h: '카드사', k: '카드사', w: 10 }, { h: '승인번호', k: '승인번호', w: 11 },
     { h: 'BOS 금액', k: 'BOS금액', w: 11, num: true, sum: true }, { h: '카드 승인금액', k: '카드금액', w: 12, num: true, sum: true },
     { h: '차액', k: '차액', w: 10, num: true, sum: true }, { h: '유형', k: '유형', w: 11 },
     { h: '원인', k: '원인', w: 30, wrap: true }, { h: '조치', k: '조치', w: 60, wrap: true }],
    issueRows, x => /선결제|결제 누락/.test(x.원인 + x.유형) ? fills.red : x.유형 === '승인번호 상이' ? fills.yellow : fills.orange);

  // ── 3. 입금일 없는 카드 ──
  tableSheet('입금일없는카드', '입금일 없는 카드 (나이스 정상 승인, 입금일자 공란)',
    '빨강=입금 안 되는 문제 건(재청구 필요), 노랑=청구제외 카드인데 BOS가 외상이 아님(확인 필요), 초록=청구제외 카드 + BOS 외상(정상)',
    [{ h: '거래일자', k: '거래일자', w: 11 }, { h: '시간', k: '거래시간', w: 9 }, { h: '매입사', k: '매입사', w: 12 },
     { h: '카드종류', k: '카드종류', w: 16 }, { h: '승인번호', k: '승인번호', w: 11 }, { h: '카드번호', k: '카드번호', w: 20 },
     { h: '금액', k: '금액', w: 11, num: true, sum: true }, { h: '청구일자', k: '청구일자', w: 11 }, { h: '반송일자', k: '반송일자', w: 11 },
     { h: '반송사유', k: '반송사유', w: 22 }, { h: 'BOS 결제구분', k: 'BOS결제구분', w: 11 }, { h: 'BOS 고객', k: 'BOS고객', w: 18 },
     { h: '원인', k: '원인', w: 34, wrap: true }, { h: '조치', k: '조치', w: 55, wrap: true }],
    r.noDeposit.sort((a, b) => (/반송/.test(b.원인) - /반송/.test(a.원인)) || (a.BOS결제구분 === '외상') - (b.BOS결제구분 === '외상') || a.거래일자.localeCompare(b.거래일자)),
    x => /반송/.test(x.원인) ? fills.red : x.BOS결제구분 !== '외상' ? fills.yellow : fills.green);

  // ── 4. 나이스에만 있음 ──
  tableSheet('나이스에만있음', '나이스에만 있는 결제 (BOS 판매전표에 승인번호 없음)',
    '외상 업체가 외상대금을 현장에서 카드로 결제한 건이 대부분 — 미수확인 탭에서 업체·월 매칭하면 입금으로 반영됨',
    [{ h: '거래일자', k: '거래일자', w: 11 }, { h: '시간', k: '거래시간', w: 9 }, { h: '카드사', k: '카드사', w: 12 },
     { h: '승인번호', k: '승인번호', w: 11 }, { h: '카드번호', k: '카드번호', w: 20 }, { h: '카드종류', k: '카드종류', w: 12 },
     { h: '유종', k: '유종', w: 8 }, { h: '금액', k: '금액', w: 12, num: true, sum: true }, { h: '입금일자', k: '입금일자', w: 11 },
     { h: '원인', k: '원인', w: 26 }, { h: '상세', k: '상세', w: 60, wrap: true }],
    r.niceOnly, x => /매칭 완료/.test(x.원인) ? fills.green : null);

  // ── 5. BOS에만 있음 (전체) ──
  tableSheet('BOS에만있음(전체)', 'BOS에만 있는 승인번호 (나이스 승인 없음) — 전체 판정',
    '현금영수증 승인번호, 외상 거래, 포인트·쿠폰 결제는 카드 VAN 대상이 아니므로 정상. 결제 누락/승인번호 상이만 조치 필요',
    [{ h: '판매일자', k: '판매일자', w: 11 }, { h: '주유시간', k: '주유시간', w: 17 }, { h: '고객명', k: '고객명', w: 16 },
     { h: '판매구분', k: '판매구분', w: 8 }, { h: '결제구분', k: '결제구분', w: 10 }, { h: '제품', k: '제품', w: 12 },
     { h: '카드사', k: '카드사', w: 10 }, { h: '승인번호', k: '승인번호', w: 11 }, { h: 'BOS 금액', k: 'BOS금액', w: 11, num: true, sum: true },
     { h: '판정', k: '구분', w: 12 }, { h: '원인', k: '원인', w: 26 }, { h: '상세', k: '상세', w: 55, wrap: true }],
    r.bosOnly.sort((a, b) => ((a.구분 === '결제 누락' || a.구분 === '승인번호 상이') ? 0 : 1) - ((b.구분 === '결제 누락' || b.구분 === '승인번호 상이') ? 0 : 1) || String(a.판매일자).localeCompare(String(b.판매일자))),
    x => x.구분 === '결제 누락' ? fills.red : x.구분 === '승인번호 상이' ? fills.yellow : null);

  await wb.xlsx.writeFile(OUT);
  console.log('saved', OUT);
  console.log({ missing: missing.length, presale: presale.length, presaleAmt: sum(presale, '나이스금액') - sum(presale, 'BOS금액'),
    lotte: lotte.length, lotteAmt: sum(lotte, '금액'), mismatchOther: r.mismatch.length - presale.length - dup.length, dup: dup.length,
    apprDiff: apprDiff.length, fleet: fleet.length, fleetNotCredit: fleetNotCredit.length, fleetNotCreditAmt: sum(fleetNotCredit, '금액'),
    niceOnly: r.niceOnly.length, niceOnlyAmt: sum(r.niceOnly, '금액'), noDeposit: r.noDeposit.length });
})();
