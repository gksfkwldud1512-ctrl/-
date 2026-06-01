'use strict';
const ExcelJS = require('exceljs');
const path    = require('path');

async function createTemplate(outputPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('고객등록');

  ws.columns = [
    { key: 'name',        width: 22 },
    { key: 'bizNo',       width: 18 },
    { key: 'contactName', width: 14 },
    { key: 'email',       width: 32 },
    { key: 'phone',       width: 18 },
    { key: 'printMethod', width: 22 },
  ];

  // ── 안내 행 (1행) ──────────────────────────────────────────
  ws.mergeCells('A1:F1');
  const guide = ws.getCell('A1');
  guide.value = '★ 업체명은 BOS 거래내역서의 업체명과 정확히 일치해야 합니다. 출력방법을 비워두면 기본(차량별-유종별)이 적용됩니다.';
  guide.font  = { color: { argb: 'FFCC0000' }, size: 9 };
  guide.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  ws.getRow(1).height = 18;

  // ── 헤더 행 (2행) ──────────────────────────────────────────
  const headers = ['업체명 *', '사업자번호', '담당자명', '이메일', '연락처', '출력방법'];
  const hRow    = ws.getRow(2);
  headers.forEach((h, i) => {
    const c   = hRow.getCell(i + 1);
    c.value   = h;
    c.font    = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border  = { bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } } };
  });
  hRow.height = 20;

  // ── 출력방법 안내 행 (3행) ─────────────────────────────────
  ws.mergeCells('A3:F3');
  const note = ws.getCell('A3');
  note.value = '출력방법 선택값: 유종별 / 판매일자순 / 차량별-판매일자순 / 차량별-유종별 (비워두면 기본 차량별-유종별)';
  note.font  = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
  note.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  ws.getRow(3).height = 16;

  // ── 예시 행 (4행~) ─────────────────────────────────────────
  const examples = [
    ['태성화학(주)', '123-45-67890', '홍길동', 'example@company.com', '010-1234-5678', '차량별-유종별'],
    ['(주)대한상사', '234-56-78901', '김철수', 'daehan@email.com',    '031-123-4567', '유종별'],
  ];
  examples.forEach((row, ri) => {
    const r    = ws.getRow(ri + 4);
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } };
    row.forEach((val, ci) => {
      const c   = r.getCell(ci + 1);
      c.value   = val;
      c.font    = { color: { argb: 'FF94A3B8' }, italic: true };
      c.fill    = fill;
      c.border  = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    });
    r.height = 18;
  });

  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}

// 직접 실행 시 생성
if (require.main === module) {
  const out = path.join(__dirname, '..', '고객등록양식.xlsx');
  createTemplate(out).then(p => console.log('생성 완료:', p)).catch(console.error);
}

module.exports = { createTemplate };
