const XLSX = require('xlsx');
const path = require('path');

const SRC = path.join(__dirname, '..', '1월~6월 상세거래내역.xlsx');
const OUT = path.join(__dirname, '..', '01시~06시 업체별 시간대별 매출액.xlsx');

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets['Sheet1'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

const hours = ['01', '02', '03', '04', '05', '06'];
const byCompany = new Map();

for (let i = 3; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;
  const t = row[2];
  if (typeof t !== 'string') continue;
  const m = t.match(/\s(\d{2}):/);
  if (!m) continue;
  const h = m[1];
  if (!hours.includes(h)) continue;

  const name = row[4] || '(고객명없음)';
  const amount = Number(row[14]) || 0;

  if (!byCompany.has(name)) {
    const obj = { total: 0 };
    hours.forEach((hh) => (obj[hh] = 0));
    byCompany.set(name, obj);
  }
  const obj = byCompany.get(name);
  obj[h] += amount;
  obj.total += amount;
}

const rows = [...byCompany.entries()].sort((a, b) => b[1].total - a[1].total);

const aoa = [];
aoa.push(['업체명', '01시', '02시', '03시', '04시', '05시', '06시', '합계']);
const colTotals = { '01': 0, '02': 0, '03': 0, '04': 0, '05': 0, '06': 0, total: 0 };

for (const [name, o] of rows) {
  aoa.push([name, o['01'], o['02'], o['03'], o['04'], o['05'], o['06'], o.total]);
  hours.forEach((h) => (colTotals[h] += o[h]));
  colTotals.total += o.total;
}

aoa.push([
  '합계',
  colTotals['01'],
  colTotals['02'],
  colTotals['03'],
  colTotals['04'],
  colTotals['05'],
  colTotals['06'],
  colTotals.total,
]);

const newWs = XLSX.utils.aoa_to_sheet(aoa);

// number formatting for amount columns
const range = XLSX.utils.decode_range(newWs['!ref']);
for (let r = 1; r <= range.e.r; r++) {
  for (let c = 1; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (newWs[addr]) newWs[addr].z = '#,##0';
  }
}

newWs['!cols'] = [
  { wch: 20 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 12 },
  { wch: 14 },
];

const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, newWs, '업체별 01~06시 매출액');
XLSX.writeFile(outWb, OUT);

console.log('생성 완료:', OUT);
console.log('업체 수:', rows.length, '전체 합계:', colTotals.total);
