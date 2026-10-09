const XLSX=require(process.argv[2]+'/node_modules/xlsx');const fs=require('fs');const {readWorkbookAuto}=require(process.argv[2]+'/lib/xlsxReader');
module.exports=async(S)=>{
 const nwb=XLSX.read(fs.readFileSync(S+'/in/nice_dec.xlsx'));const nr=XLSX.utils.sheet_to_json(nwb.Sheets[nwb.SheetNames[0]],{header:1,defval:''});
 const hi=nr.findIndex(r=>r[0]==='번호'&&r.includes('승인번호'));const H=nr[hi];
 const nice=nr.slice(hi+1).filter(r=>r[0]!=='').map(r=>Object.fromEntries(H.map((h,i)=>[h,r[i]])));
 const bwb=await readWorkbookAuto(S+'/in/bos.xlsx');const br=XLSX.utils.sheet_to_json(bwb.Sheets[bwb.SheetNames[0]],{header:1,defval:''});
 const bh=br.findIndex(r=>r.includes('승인번호'));const BH=br[bh];
 const bos=br.slice(bh+1).filter(r=>r[1]).map(r=>Object.fromEntries(BH.map((h,i)=>[h||'_'+i,r[i]])));
 return {nice,bos};
};
