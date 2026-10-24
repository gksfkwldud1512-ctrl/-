// 비고 정답 채점: 비고로 업체·월 정답 → 프로필 학습 → 비고 없이 autoMatch → 정답과 비교
// 사용: node scripts/ar-eval/eval.js [trainUntil=YYYY-MM] [profiles]
//   바탕화면 "수시입출예금 입출금내역.xls"(비고에 대상 월을 적은 파일)를 정답으로 lib/arLearn.js 자동 매칭을 채점. 읽기만 함
const path = require('path'), os = require('os'), fs = require('fs');
const W = path.join(__dirname, '..', '..');
const trainUntil = process.argv[2] || '9999-12';
const L = p => require(path.join(W, 'lib', p));
const { parseBankIncoming } = L('bankExpenseParser');
const { buildArMatrix, buildVendorAliasIndex, matchPayerToVendor } = L('arLedger');
const { learnFromNotes, buildProfiles, autoMatch } = L('arLearn');

const D = path.join(W, 'data');
const deposits = parseBankIncoming(path.join(os.homedir(), 'Desktop/수시입출예금 입출금내역.xls'));
const ar = buildArMatrix(D);
const customers = JSON.parse(fs.readFileSync(path.join(D, 'customers.json')));
const aliases = JSON.parse(fs.readFileSync(path.join(D, 'ar_vendor_aliases.json')));
const aliasIndex = buildVendorAliasIndex([...ar.byVendor.keys()], customers, aliases);
const IGNORE = [/^현\d{6,}/, /현대주덕/, /세무서/, /이자/, /결산/, /스카이넷/, /면세유환급/, /^01$/];
const isIgnored = p => IGNORE.some(r => r.test(String(p).replace(/\/.*$/, '').trim()));
const ctx = { aliasIndex, matchPayer: matchPayerToVendor, isIgnored };

const truth = learnFromNotes(deposits, ar, ctx);
const resolved = truth.filter(t => t.vendor && t.months.length);
console.log(`비고 입금 ${truth.length}건 → 업체·월 확정 ${resolved.length}, 업체 못 찾음 ${truth.filter(t => !t.vendor).length}`);
const byBasis = {}; truth.forEach(t => byBasis[t.basis] = (byBasis[t.basis] || 0) + 1);
console.log('근거:', JSON.stringify(byBasis));
truth.filter(t => !t.vendor).forEach(t => console.log('  ? 업체 못 찾음', t.dep.date, t.dep.payer, t.dep.amount.toLocaleString(), '|', t.dep.note));

const cardVendors = new Set(JSON.parse(fs.readFileSync(path.join(D, 'ar_card_payments.json'))).map(c => c.vendorName));
['대소방범대', '풀무원외상6576'].forEach(v => cardVendors.add(v));
const train = resolved.filter(t => t.dep.month <= trainUntil);
const profiles = buildProfiles(train, ar, { cardVendors });

// 비고 지우고 자동 매칭
const noNote = deposits.map(d => ({ ...d, note: '' }));
const auto = autoMatch(noNote, ar, profiles, ctx);
const key = d => `${d.date}|${d.payer}|${d.amount}`;
const autoBy = new Map(auto.map(a => [key(a.dep), a]));

// 정답 달이 외상 추적 시작(2026-01) 전이면 자동으로 맞출 외상 자료 자체가 없음 → 채점에서 따로 셈
const firstYm = ar.months[0];
const pre = resolved.filter(t => t.months.some(m => m.month < firstYm));
console.log(`정답이 추적 시작(${firstYm}) 전 달인 입금 ${pre.length}건 — 채점 제외`);
const evalSet = resolved.filter(t => !t.months.some(m => m.month < firstYm)).filter(t => t.dep.month > trainUntil || trainUntil === '9999-12');
let vOk = 0, mOk = 0, wrongAuto = 0, notAuto = 0;
const wrong = [];
for (const t of evalSet) {
  const a = autoBy.get(key(t.dep));
  if (!a || a.status !== 'auto') { notAuto++; if (a?.vendor === t.vendor) vOk++; wrong.push(['미확정', t, a]); continue; }
  if (a.vendor === t.vendor) vOk++;
  const same = a.vendor === t.vendor && a.months.map(m => m.month).join() === t.months.map(m => m.month).join();
  if (same) mOk++; else { wrongAuto++; wrong.push(['틀림', t, a]); }
}
const n = evalSet.length;
console.log(`\n채점 대상 ${n}건 (학습 ~${trainUntil}) — 업체 맞음 ${vOk} (${(vOk / n * 100).toFixed(1)}%), 업체+월 자동확정 맞음 ${mOk} (${(mOk / n * 100).toFixed(1)}%), 자동확정했는데 틀림 ${wrongAuto}, 확인필요로 남김 ${notAuto}`);
const st = {}; auto.forEach(a => st[a.status] = (st[a.status] || 0) + 1); console.log('전체 입금 상태:', JSON.stringify(st));
console.log('\n-- 틀리거나 미확정 (최대 60) --');
wrong.slice(0, 60).forEach(([k, t, a]) => console.log(` [${k}] ${t.dep.date} ${t.dep.payer} ${t.dep.amount.toLocaleString()} | 정답 ${t.vendor} ${t.months.map(m => m.month).join('+')} | 자동 ${a?.status} ${a?.vendor || '-'} ${(a?.months || []).map(m => m.month).join('+')} ${a?.candidates?.length ? '후보' + a.candidates.length : ''} | 비고 ${t.dep.note}`));

if (process.argv[3] === 'profiles') {
  console.log('\n-- 프로필 --');
  for (const [v, p] of Object.entries(profiles).sort()) console.log(` ${v}: ${p.payType || '미정'} | 입금자 ${p.payers.join(', ') || '-'} | 지연 ${p.lagMonths ? p.lagMonths.join('~') : '-'} | 할인 ${p.discount ? p.discount.rate : '-'} | 합산→${p.payGroup || '-'} | 단서 ${p.noteKeywords.join(',') || '-'}`);
}
