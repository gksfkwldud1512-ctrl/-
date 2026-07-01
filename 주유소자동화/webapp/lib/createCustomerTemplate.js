'use strict';
const ExcelJS = require('exceljs');
const path    = require('path');

async function createTemplate(outputPath, dataRows = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('고객등록');

  ws.columns = [
    { key: 'name',        width: 24 },
    { key: 'bizNo',       width: 18 },
    { key: 'ceoName',     width: 14 },
    { key: 'contactName', width: 14 },
    { key: 'email',       width: 32 },
    { key: 'taxEmail',    width: 32 },
    { key: 'phone',       width: 18 },
    { key: 'address',     width: 36 },
    { key: 'bizType',     width: 16 },
    { key: 'bizItem',     width: 14 },
    { key: 'printMethod', width: 22 },
    { key: 'taxIssuance', width: 20 },
  ];

  // ── 안내 행 (1행) ──────────────────────────────────────────
  ws.mergeCells('A1:L1');
  const guide = ws.getCell('A1');
  guide.value = '★ 업체명은 BOS 거래내역서의 업체명과 정확히 일치해야 합니다. 세금계산서이메일을 비워두면 이메일을 대신 사용합니다.';
  guide.font  = { color: { argb: 'FFCC0000' }, size: 9 };
  guide.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  ws.getRow(1).height = 18;

  // ── 헤더 행 (2행) ──────────────────────────────────────────
  const headers = [
    '업체명 *', '사업자번호', '대표자명', '담당자명',
    '이메일', '세금계산서이메일',
    '연락처', '주소', '업태', '종목',
    '출력방법', '세금계산서발행구분',
  ];
  const hRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font    = { bold: true, color: { argb: 'FFFFFFFF' } };
    // 세금계산서이메일 컬럼(F=6번째)은 다른 색으로 구분
    c.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 5 ? 'FF7C3AED' : 'FF2563EB' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border  = { bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } } };
  });
  hRow.height = 20;

  // ── 보조 안내 행 (3행) ─────────────────────────────────────
  ws.mergeCells('A3:L3');
  const note = ws.getCell('A3');
  note.value = '이메일=거래명세서 발송용  |  세금계산서이메일=세금계산서 R열 (비우면 이메일 자동 사용)  |  세금계산서발행구분: 합산 / 분리';
  note.font  = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
  note.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  ws.getRow(3).height = 16;

  // ── 데이터 행 (4행~) ──────────────────────────────────────
  const isExample = dataRows.length === 0;
  const rows = isExample ? [
    ['태성화학(주)',  '123-45-67890', '홍길동', '홍담당', 'statement@company.com', 'tax@company.com',
     '010-1234-5678', '충북 음성군 대소면 ○○로 123', '제조업', '화학제품', '차량별-유종별', '합산'],
    ['(주)대한상사', '234-56-78901', '김대표', '김담당', 'daehan@email.com', '',
     '031-123-4567', '경기도 성남시 ○○구 ○○로 456', '도매업', '연료', '유종별', '분리'],
  ] : dataRows;

  rows.forEach((row, ri) => {
    const r    = ws.getRow(ri + 4);
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } };
    row.forEach((val, ci) => {
      const c = r.getCell(ci + 1);
      c.value = val;
      if (isExample) c.font = { color: { argb: 'FF94A3B8' }, italic: true };
      c.fill  = fill;
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    });
    r.height = 18;
  });

  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}

// 직접 실행 시 변환완료 파일 데이터를 새 양식으로 변환
if (require.main === module) {
  const XLSX = require('xlsx');
  const out  = path.join(__dirname, '..', '고객등록양식.xlsx');
  const src  = path.join(__dirname, '..', '고객등록양식_변환완료.xlsx');

  let dataRows = [];
  try {
    const wb   = XLSX.readFile(src);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let headerIdx = 0;
    for (let i = 0; i < Math.min(raw.length, 5); i++) {
      if (raw[i].some(c => String(c).trim() === '업체명 *' || String(c).trim() === '업체명')) { headerIdx = i; break; }
    }
    const hdrs = raw[headerIdx].map(h => String(h).trim());
    const col  = h => hdrs.indexOf(h);

    raw.slice(headerIdx + 1).forEach(r => {
      const name = String(r[col('업체명 *')] || r[col('업체명')] || '').trim();
      if (!name || name.startsWith('★') || name.startsWith('총 ') ||
          name.startsWith('출력방법') || name.startsWith('※')) return;

      const oldMethod   = String(r[col('세금계산서발행방식')] || '').trim();
      const taxIssuance = oldMethod === '분리' ? '분리' : '합산';
      const printMethod = String(r[col('출력방법')] || '').trim();
      const email       = String(r[col('이메일')]   || '').trim();

      dataRows.push([
        name,
        String(r[col('사업자번호')] || '').trim(),
        '',       // 대표자명 — 신규 필드
        String(r[col('담당자명')] || '').trim(),
        email,    // 이메일 → 거래명세서용으로 유지
        '',       // 세금계산서이메일 — 사용자가 직접 입력
        String(r[col('연락처')]   || '').trim(),
        '',       // 주소 — 구 양식에 없음
        '',       // 업태 — 구 양식에 없음
        '',       // 종목 — 구 양식에 없음
        printMethod,
        taxIssuance,
      ]);
    });
    console.log(`변환완료 파일에서 ${dataRows.length}개 업체 로드`);
  } catch (e) {
    console.log('변환완료 파일 없음 — 예시 데이터로 생성:', e.message);
  }

  createTemplate(out, dataRows)
    .then(p => console.log('생성 완료:', p))
    .catch(console.error);
}

module.exports = { createTemplate };
