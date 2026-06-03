'use strict';
const XLSX    = require('xlsx');
const ExcelJS = require('exceljs');
const path    = require('path');

function cleanEmail(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/\t/g, '').trim();
  const m = s.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

function cleanPhone(raw) {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const s = String(raw);
    if (s.length === 10) return `${s.slice(0,3)}-${s.slice(3,7)}-${s.slice(7)}`;
    if (s.length === 11) return `${s.slice(0,3)}-${s.slice(3,7)}-${s.slice(7)}`;
    return s;
  }
  return String(raw).trim();
}

function cleanBizNo(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s === '000-00-00000' || s === '0' || s.startsWith('000-00')) return '';
  return s;
}

function detectPrintMethod(note) {
  if (!note) return '';
  const s = String(note);
  if (s.includes('유종별')) return '유종별';
  return '';
}

function detectHometaxMethod(note) {
  if (!note) return '통합';
  const s = String(note);
  // 계산서 + 유종별 언급 시 분리발행
  if (s.includes('유종별') && (s.includes('계산서') || s.includes('발행'))) return '분리';
  return '통합';
}

async function convert(inputPath, outputPath) {
  // ── 원본 읽기 ─────────────────────────────────────────────
  const wb   = XLSX.readFile(inputPath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 헤더: 0행=제목, 1행=컬럼명, 2행~=데이터
  // col: 0=고객코드 1=고객명 2=고객구분 3=고객유형 4=대표전화 5=대표자명
  //      6=사업자번호 11=담당자명 12=담당자전화 13=담당자메일 14=참고사항

  const converted = [];
  for (const r of rows.slice(2)) {
    const name     = r[1] ? String(r[1]).trim() : '';
    const type     = r[3] ? String(r[3]).trim() : '';
    if (!name || type !== '외상') continue;

    const bizNo       = cleanBizNo(r[6]);
    const contactName = r[11] ? String(r[11]).trim() : (r[5] ? String(r[5]).trim() : '');
    const email       = cleanEmail(r[13]);
    const phone       = cleanPhone(r[12]) || cleanPhone(r[4]);
    const note        = r[14] ? String(r[14]).trim() : '';
    const printMethod = detectPrintMethod(note);
    const htMethod    = detectHometaxMethod(note);

    converted.push({ name, bizNo, contactName, email, phone, printMethod, htMethod, note });
  }

  console.log(`외상 고객 ${converted.length}건 변환`);

  // ── 출력 Excel 작성 ───────────────────────────────────────
  const out = new ExcelJS.Workbook();
  const sheet = out.addWorksheet('고객등록');

  sheet.columns = [
    { key: 'name',        width: 28 },
    { key: 'bizNo',       width: 18 },
    { key: 'contactName', width: 16 },
    { key: 'email',       width: 36 },
    { key: 'phone',       width: 18 },
    { key: 'printMethod', width: 20 },
    { key: 'htMethod',    width: 20 },
    { key: 'note',        width: 50 },
  ];

  // 안내 행
  sheet.mergeCells('A1:H1');
  const g = sheet.getCell('A1');
  g.value = '★ 업체명은 BOS 거래내역서의 업체명과 정확히 일치해야 합니다. 출력방법을 비워두면 기본(차량별-유종별)이 적용됩니다.';
  g.font  = { color: { argb: 'FFCC0000' }, size: 9 };
  g.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  sheet.getRow(1).height = 18;

  // 헤더 행
  const headers = ['업체명 *', '사업자번호', '담당자명', '이메일', '연락처', '출력방법', '세금계산서발행방식', '참고사항(참고용)'];
  const hRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  hRow.height = 20;

  // 데이터 행
  converted.forEach((row, ri) => {
    const r = sheet.getRow(ri + 3);
    const fill = { type: 'pattern', pattern: 'solid',
                   fgColor: { argb: ri % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } };

    const vals = [row.name, row.bizNo, row.contactName, row.email,
                  row.phone, row.printMethod, row.htMethod, row.note];
    vals.forEach((v, ci) => {
      const c = r.getCell(ci + 1);
      c.value = v || '';
      c.fill  = fill;
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      // 이메일/유종별 하이라이트
      if (ci === 3 && v) c.font = { color: { argb: 'FF1D4ED8' } };
      if (ci === 5 && v) c.font = { bold: true };
      if (ci === 6 && v === '분리') c.font = { bold: true, color: { argb: 'FFCC0000' } };
    });
    r.height = 18;
  });

  // 통계 요약
  const emailCount  = converted.filter(r => r.email).length;
  const bizCount    = converted.filter(r => r.bizNo).length;
  const bunriCount  = converted.filter(r => r.htMethod === '분리').length;
  const yujongCount = converted.filter(r => r.printMethod === '유종별').length;

  const sumRow = sheet.getRow(converted.length + 4);
  sheet.mergeCells(`A${converted.length + 4}:H${converted.length + 4}`);
  sumRow.getCell(1).value =
    `총 ${converted.length}개 업체 | 이메일 등록: ${emailCount}개 | 사업자번호: ${bizCount}개 | 유종별 출력: ${yujongCount}개 | 세금계산서 분리발행: ${bunriCount}개`;
  sumRow.getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, size: 11 };
  sumRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  await out.xlsx.writeFile(outputPath);
  console.log('저장 완료:', outputPath);
  console.log(`  이메일 등록: ${emailCount}/${converted.length}`);
  console.log(`  사업자번호: ${bizCount}/${converted.length}`);
  console.log(`  유종별 출력: ${yujongCount}개`);
  console.log(`  세금계산서 분리발행: ${bunriCount}개`);
  return converted;
}

const inputPath  = path.join(__dirname, '..', '미소주유소 고객정보.xlsx');
const outputPath = path.join(__dirname, '..', '고객등록양식_변환완료.xlsx');
convert(inputPath, outputPath).catch(console.error);
