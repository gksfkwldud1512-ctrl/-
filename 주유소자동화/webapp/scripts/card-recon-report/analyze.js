const fs=require('fs');
module.exports=async(W,S)=>{
const {nice,bos}=await require(S+'/load.js')(S);
const ed=(a,b)=>{if(Math.abs(a.length-b.length)>1)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
const num=v=>Number(String(v).replace(/,/g,''))||0;
const coN=s=>String(s||'').replace(/\(.*?\)|카드|\s/g,'').replace('비씨','BC').replace('KB국민','국민').replace('하나구외환','하나');
// 이지샵 9월 (일마감 저장분)
const easy=[];for(const f of fs.readdirSync(W+'/data/daily').filter(f=>f.startsWith('2026-09'))){const d=JSON.parse(fs.readFileSync(W+'/data/daily/'+f));for(const t of d.cardSources?.easyshop?.cardTxs||[])easy.push({...t,date:f.slice(0,10)});}
const easyBy=new Map(easy.map(t=>[t.approvalNo,t]));
// NICE 분류
const N=nice.map(x=>({...x,amt:num(x['금액']),no:String(x['승인번호']).trim()}));
const okN=N.filter(x=>x['구분']==='승인'&&!x['취소일자']);
const cancN=N.filter(x=>x['구분']==='승인'&&x['취소일자']);
const rejN=N.filter(x=>x['구분']==='승인거절');
const okBy=new Map();okN.forEach(x=>{const a=okBy.get(x.no)||[];a.push(x);okBy.set(x.no,a)});
const cancBy=new Map(cancN.map(x=>[x.no,x]));const rejBy=new Map(rejN.map(x=>[x.no,x]));
// BOS 카드 거래 (승인번호 있는 것) 승인번호별 합산
const B=bos.filter(x=>String(x['승인번호']).trim()).map(x=>({...x,amt:num(x['판매금액']),no:String(x['승인번호']).trim()}));
const bosBy=new Map();B.forEach(x=>{const g=bosBy.get(x.no)||{no:x.no,rows:[],amt:0};g.rows.push(x);g.amt+=x.amt;bosBy.set(x.no,g)});
const res={bosOnly:[],niceOnly:[],mismatch:[],matched:0,noDeposit:[],easyMatched:0};
const usedNice=new Set();
for(const g of bosBy.values()){
  const r0=g.rows[0];const base={판매일자:r0['판매일자'],주유시간:r0['주유시간'],고객명:r0['고객명'],판매구분:r0['판매구분'],결제구분:r0['결제구분'],제품:[...new Set(g.rows.map(r=>r['제품명']))].join('+'),카드사:r0['카드사명'],승인번호:g.no,카드번호:r0['신용카드번호'],BOS금액:g.amt};
  const ok=okBy.get(g.no);
  if(ok){ok.forEach(x=>usedNice.add(x));const na=ok.reduce((s,x)=>s+x.amt,0);if(na===g.amt){res.matched++;continue;}
    const n0=ok[0];const days=new Set(g.rows.map(r=>r['판매일자']));const times=new Set(g.rows.map(r=>r['주유시간']));
    let 원인,조치;const qty=g.rows.reduce((s,r)=>s+num(r['판매수량']),0);const up=num(n0['단가']);
    if(days.size>1&&g.rows.length>1&&g.rows.every(r=>r.amt===g.rows[0].amt)&&g.amt-na===na*(g.rows.length-1)){원인='BOS 중복 입력';조치=`같은 거래(주유시간 ${[...times].join(', ')})가 BOS ${[...days].join('·')} 두 날짜에 입력됨 → BOS에서 한 건 삭제`;}
    else if(na>g.amt&&up>0&&na%up===0&&na/up>qty){원인='셀프 선결제 금액 그대로 매입 (부분취소 누락 추정)';조치=`카드 ${(na/up)}L×${up}원=${na.toLocaleString()}원 승인, 실제 주유 ${qty}L(${g.amt.toLocaleString()}원) → 차액 ${(na-g.amt).toLocaleString()}원 고객 과다청구. 나이스/주유기 부분취소 처리 확인`;}
    else if(g.amt*10===na||na*10===g.amt){원인='BOS 금액 자릿수 입력 오류';조치='BOS 판매금액을 카드 승인금액으로 수정';}
    else if(Math.abs(g.amt-na)<10000){원인='단가·할인 차이 (소액)';조치='BOS 단가와 카드 승인 단가 차이 확인';}
    else{원인='BOS 금액과 카드 승인금액 다름';조치='BOS 수량·금액 입력 오류 또는 일부 다른 결제수단 사용 여부 확인';}
    res.mismatch.push({...base,수량:qty,나이스금액:na,차액:g.amt-na,나이스거래일:n0['거래일자']+' '+n0['거래시간'],나이스카드종류:n0['카드종류'],원인,조치});continue;}
  if(easyBy.has(g.no)){const e=easyBy.get(g.no);res.easyMatched++;if(e.amount!==g.amt)res.mismatch.push({...base,나이스금액:e.amount,차액:g.amt-e.amount,나이스거래일:'(이지샵) '+e.date,원인:'BOS 금액과 이지샵 승인금액 다름',조치:'확인 필요'});continue;}
  // BOS에만 있음 → 원인 분석
  let 원인='',상세='',구분='';
  const pay=r0['결제구분'];
  if(pay==='현금'&&/^28[0-9]{7}$/.test(g.no)){구분='카드 아님';원인='현금영수증 승인번호';상세='현금 결제의 현금영수증 승인번호(28xxxxxxx) — 정상';}
  else if(['포인트','디지털쿠폰','디지털상품권'].includes(pay)){구분='카드 아님';원인=`${pay} 결제`;상세='카드 VAN 대상이 아닌 결제수단 — 정상';}
  else if(cancBy.has(g.no)){const c=cancBy.get(g.no);
    // 재승인 찾기: 같은 카드번호·같은 금액 정상승인 (같은 날)
    const re=okN.find(x=>!usedNice.has(x)&&x.amt===g.amt&&x['카드번호'].slice(0,4)===String(r0['신용카드번호']).slice(0,4)&&x['거래일자']===c['거래일자']);
    if(re){구분='승인번호 변경';원인='취소 후 재승인';상세=`${c['거래일자']} ${c['거래시간']} 승인 취소(${c['보류사유']||c['취소여부']}) → ${re['거래시간']} 재승인 ${re.no} (BOS 승인번호 미수정)`;usedNice.add(re);}
    else{구분='결제 누락';원인='카드 승인이 취소됨';상세=`나이스 ${c['거래일자']} ${c['거래시간']} 승인 ${c.amt.toLocaleString()}원 → ${c['취소일자']} 취소(${c['보류사유']||c['취소여부']}). BOS는 판매로 남아있고 재승인 없음`;}}
  else if(rejBy.has(g.no)){구분='결제 누락';원인='카드 승인거절';상세=`나이스 승인거절: ${rejBy.get(g.no)['응답메세지']}`;}
  else if(pay==='외상'){구분='확인 불필요';원인='외상 거래(별도 단말기·카드 아님)';상세='BOS 외상 결제에 승인번호가 기록된 건 — 나이스·이지샵 승인 없음';}
  else{
    // 다른 날짜·오타
    const near=okN.find(x=>!usedNice.has(x)&&x.amt===g.amt&&ed(x.no,g.no)<=1);
    if(near){구분='승인번호 상이';원인='BOS 승인번호 입력 오류 (한 자리 차이)';상세=`나이스 ${near['거래일자']} ${near['거래시간']} 승인번호 ${near.no} 같은 금액 → BOS 승인번호 수정`;usedNice.add(near);}
    else{구분='결제 누락';원인='나이스·이지샵 모두 승인 없음';상세='카드 결제 기록 없음 — 단말기 미결제/타 단말기/현금 수납 여부 확인 필요';}
  }
  res.bosOnly.push({...base,구분,원인,상세});
}
// 미수확인 탭에서 사람이 업체에 매칭한 카드결제
const arCards={};JSON.parse(fs.readFileSync(W+'/data/ar_card_payments.json','utf8')).forEach(c=>{const k=(c.cardId||c.id).split('|')[1];arCards[k]=(arCards[k]?arCards[k]+', ':'')+c.vendorName+' '+Number(c.month.slice(5,7))+'월분';});
// NICE에만 있음
for(const x of okN){ if(usedNice.has(x)||bosBy.has(x.no))continue;
  let 원인,상세;
  const cardType=x['카드종류'];
  if(arCards[x.no]){원인='외상대금 카드 수납 (매칭 완료)';상세='미수확인 탭에서 '+arCards[x.no]+'으로 확인됨';}
  else if(x.amt>=200000){원인='외상대금 카드 수납 추정';상세='BOS 판매전표에 없는 큰 금액 — 외상 업체가 현장에서 카드로 결제한 대금 (미수확인 탭에서 업체 매칭 필요)';}
  else if(x.amt<=1004){원인='단말기 테스트/소액';상세='';}
  else{원인='BOS 미입력';상세='BOS 판매전표에 승인번호 없음 — POS 미연동 결제·수기 결제 여부 확인';}
  res.niceOnly.push({거래일자:x['거래일자'],거래시간:x['거래시간'],카드사:x['매입사'],승인번호:x.no,카드번호:x['카드번호'],카드종류:cardType,유종:x['유종'],금액:x.amt,입금일자:x['입금일자']||'',원인,상세});
}
// 입금일 없는 카드
const bosNoMap=bosBy;
for(const x of okN.filter(x=>!x['입금일자'])){
  const g=bosNoMap.get(x.no);let 원인,조치;
  if(x['카드종류']==='주유전용(청구제외)'){원인='주유전용 카드(청구제외) — 일반 카드 청구·입금 대상 아님 (유가보조금·법인 주유카드 등)';조치=g?`BOS ${g.rows[0]['결제구분']} (${g.rows[0]['고객명']}) — `+(g.rows[0]['결제구분']==='외상'?'외상 매출로 업체에서 입금받는 건':'BOS는 '+g.rows[0]['결제구분']+'로 기록 → 카드사 입금이 오지 않으므로 업체 외상 청구(유가보조금 업체면 보조금 정산) 대상인지 확인'):'BOS에 없음 — 확인 필요';}
  else if(x['반송사유']&&x['반송사유']!=='정상'){원인=`카드사 반송: ${x['반송사유']}`;조치=`반송일 ${x['반송일자']||'-'} — 나이스정보통신/${x['매입사']}에 재청구(재매입) 요청 필요`;}
  else if(!x['청구일자']){원인='미청구(매입 전)';조치=x['거래일자']>='2026-09-28'?'월말 거래 — 청구 진행 중일 수 있음, 며칠 뒤 재확인':'청구되지 않음 — 나이스에 매입 누락 문의';}
  else{원인='청구됨, 입금일 미정';조치='입금 예정 — 카드사 지급일 확인';}
  res.noDeposit.push({거래일자:x['거래일자'],거래시간:x['거래시간'],매입사:x['매입사'],카드종류:x['카드종류'],승인번호:x.no,카드번호:x['카드번호'],금액:x.amt,청구일자:x['청구일자']||'',반송일자:x['반송일자']||'',반송사유:x['반송사유']||'',BOS결제구분:g?g.rows[0]['결제구분']:'(BOS 없음)',BOS고객:g?g.rows[0]['고객명']:'',원인,조치});
}
res.totals={niceOk:okN.length,niceOkAmt:okN.reduce((s,x)=>s+x.amt,0),cancel:cancN.length,reject:rejN.length,bosCard:bosBy.size,bosCardAmt:[...bosBy.values()].reduce((s,g)=>s+g.amt,0),easy:easy.length};
return res;};
