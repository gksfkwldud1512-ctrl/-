/**
 * 산업안전보건법 계열 기준물질 4종(관리대상유해물질/특별관리물질/작업환경측정 대상 유해인자/
 * 특수건강진단 대상 유해인자) 원본 데이터를 law.go.kr 공식 별표 원문(아래 출처)에서 직접
 * 옮겨적어, 기존 5개 화관법 xlsx와 동일한 컬럼 구조로 `data/reference/`에 xlsx를 생성한다.
 *
 * 출처(law.go.kr 공식 별표 PDF, 직접 열람해 옮겨적음):
 * - 별표12 관리대상 유해물질의 종류(산업안전보건기준에 관한 규칙, 제420·439·440조 관련) <개정 2022.10.18.>
 * - 별표21 작업환경측정 대상 유해인자(산업안전보건법 시행규칙, 제186조제1항 관련)
 * - 별표22 특수건강진단 대상 유해인자(산업안전보건법 시행규칙, 제201조 관련) <개정 2021.11.19.>
 *
 * 법령 원문의 "1)부터 N)까지의 물질을 중량비율 X% 이상 함유한 혼합물" 규정을 그대로
 * thresholdRaw 텍스트("라벨 : X% 이상")로 옮겨, 기존 threshold.ts의 Type B 파서가
 * 화관법 5종과 동일한 방식으로 파싱하도록 한다(카테고리별 고정 임계값을 코드에 하드코딩하지 않음).
 *
 * 재실행: `npx tsx src/scripts/generateIndustrialSafetyReference.ts`
 * (법 개정 시 이 파일의 데이터 배열만 갱신하고 다시 실행하면 4개 xlsx가 재생성된다.)
 */
import path from "node:path";
import ExcelJS from "exceljs";

const OUT_DIR = path.join(process.cwd(), "data", "reference");

type Entry = {
  cas: string; // 원문 그대로(콤마 다중 CAS, "등" 접미 포함 가능) — splitCasNumbers가 그대로 처리
  nameKr: string;
  nameEn: string;
  special?: boolean; // 별표12 전용: 특별관리물질 여부
  specialPct?: 0.3 | 0.1; // 별표12 전용: 특별관리물질일 때 임계값(기본 0.1)
  pct?: number; // 별표21/22 전용 개별 임계값 override(기본 1)
};

// ---------------------------------------------------------------------------
// 별표12 — 관리대상 유해물질의 종류 (2022.10.18 개정)
// ---------------------------------------------------------------------------
const BP12_ORGANIC: Entry[] = [
  { cas: "111-30-8", nameKr: "글루타르알데히드", nameEn: "Glutaraldehyde" },
  { cas: "55-63-0", nameKr: "니트로글리세린", nameEn: "Nitroglycerin" },
  { cas: "75-52-5", nameKr: "니트로메탄", nameEn: "Nitromethane" },
  { cas: "98-95-3", nameKr: "니트로벤젠", nameEn: "Nitrobenzene" },
  { cas: "100-01-6", nameKr: "p-니트로아닐린", nameEn: "p-Nitroaniline" },
  { cas: "100-00-5", nameKr: "p-니트로클로로벤젠", nameEn: "p-Nitrochlorobenzene" },
  { cas: "88-72-2", nameKr: "2-니트로톨루엔", nameEn: "2-Nitrotoluene", special: true },
  { cas: "117-81-7", nameKr: "디(2-에틸헥실)프탈레이트", nameEn: "Di(2-ethylhexyl)phthalate" },
  { cas: "25321-14-6 등", nameKr: "디니트로톨루엔", nameEn: "Dinitrotoluene", special: true },
  { cas: "121-69-7", nameKr: "N,N-디메틸아닐린", nameEn: "N,N-Dimethylaniline" },
  { cas: "124-40-3", nameKr: "디메틸아민", nameEn: "Dimethylamine" },
  { cas: "127-19-5", nameKr: "N,N-디메틸아세트아미드", nameEn: "N,N-Dimethylacetamide", special: true, specialPct: 0.3 },
  { cas: "68-12-2", nameKr: "디메틸포름아미드", nameEn: "Dimethylformamide", special: true, specialPct: 0.3 },
  { cas: "84-74-2", nameKr: "디부틸 프탈레이트", nameEn: "Dibutyl phthalate", special: true },
  { cas: "111-42-2", nameKr: "디에탄올아민", nameEn: "Diethanolamine" },
  { cas: "60-29-7", nameKr: "디에틸 에테르", nameEn: "Diethyl ether" },
  { cas: "111-40-0", nameKr: "디에틸렌트리아민", nameEn: "Diethylenetriamine" },
  { cas: "100-37-8", nameKr: "2-디에틸아미노에탄올", nameEn: "2-Diethylaminoethanol" },
  { cas: "109-89-7", nameKr: "디에틸아민", nameEn: "Diethylamine" },
  { cas: "123-91-1", nameKr: "1,4-디옥산", nameEn: "1,4-Dioxane" },
  { cas: "108-83-8", nameKr: "디이소부틸케톤", nameEn: "Diisobutylketone" },
  { cas: "1717-00-6", nameKr: "1,1-디클로로-1-플루오로에탄", nameEn: "1,1-Dichloro-1-fluoroethane" },
  { cas: "75-09-2", nameKr: "디클로로메탄", nameEn: "Dichloromethane" },
  { cas: "95-50-1", nameKr: "o-디클로로벤젠", nameEn: "o-Dichlorobenzene" },
  { cas: "107-06-2", nameKr: "1,2-디클로로에탄", nameEn: "1,2-Dichloroethane", special: true },
  { cas: "540-59-0 등", nameKr: "1,2-디클로로에틸렌", nameEn: "1,2-Dichloroethylene" },
  { cas: "78-87-5", nameKr: "1,2-디클로로프로판", nameEn: "1,2-Dichloropropane", special: true },
  { cas: "75-43-4", nameKr: "디클로로플루오로메탄", nameEn: "Dichlorofluoromethane" },
  { cas: "123-31-9", nameKr: "p-디히드록시벤젠", nameEn: "p-dihydroxybenzene" },
  { cas: "67-56-1", nameKr: "메탄올", nameEn: "Methanol" },
  { cas: "109-86-4", nameKr: "2-메톡시에탄올", nameEn: "2-Methoxyethanol", special: true, specialPct: 0.3 },
  { cas: "110-49-6", nameKr: "2-메톡시에틸 아세테이트", nameEn: "2-Methoxyethyl acetate", special: true, specialPct: 0.3 },
  { cas: "591-78-6", nameKr: "메틸 n-부틸 케톤", nameEn: "Methyl n-butyl ketone" },
  { cas: "110-43-0", nameKr: "메틸 n-아밀 케톤", nameEn: "Methyl n-amyl ketone" },
  { cas: "74-89-5", nameKr: "메틸 아민", nameEn: "Methyl amine" },
  { cas: "79-20-9", nameKr: "메틸 아세테이트", nameEn: "Methyl acetate" },
  { cas: "78-93-3", nameKr: "메틸 에틸 케톤", nameEn: "Methyl ethyl ketone" },
  { cas: "108-10-1", nameKr: "메틸 이소부틸 케톤", nameEn: "Methyl isobutyl ketone" },
  { cas: "74-87-3", nameKr: "메틸 클로라이드", nameEn: "Methyl chloride" },
  { cas: "71-55-6", nameKr: "메틸 클로로포름", nameEn: "Methyl chloroform" },
  { cas: "101-68-8 등", nameKr: "메틸렌 비스(페닐 이소시아네이트)", nameEn: "Methylene bis(phenyl isocyanate)" },
  { cas: "583-60-8", nameKr: "o-메틸시클로헥사논", nameEn: "o-Methylcyclohexanone" },
  { cas: "25639-42-3 등", nameKr: "메틸시클로헥사놀", nameEn: "Methylcyclohexanol" },
  { cas: "108-31-6", nameKr: "무수 말레산", nameEn: "Maleic anhydride" },
  { cas: "85-44-9", nameKr: "무수 프탈산", nameEn: "Phthalic anhydride" },
  { cas: "71-43-2", nameKr: "벤젠", nameEn: "Benzene", special: true },
  { cas: "50-32-8", nameKr: "벤조(a)피렌", nameEn: "Benzo(a)pyrene", special: true },
  { cas: "106-99-0", nameKr: "1,3-부타디엔", nameEn: "1,3-Butadiene", special: true },
  { cas: "71-36-3", nameKr: "n-부탄올", nameEn: "n-Butanol" },
  { cas: "78-92-2", nameKr: "2-부탄올", nameEn: "2-Butanol" },
  { cas: "111-76-2", nameKr: "2-부톡시에탄올", nameEn: "2-Butoxyethanol" },
  { cas: "112-07-2", nameKr: "2-부톡시에틸 아세테이트", nameEn: "2-Butoxyethyl acetate" },
  { cas: "123-86-4", nameKr: "n-부틸 아세테이트", nameEn: "n-Butyl acetate" },
  { cas: "106-94-5", nameKr: "1-브로모프로판", nameEn: "1-Bromopropane", special: true, specialPct: 0.3 },
  { cas: "75-26-3", nameKr: "2-브로모프로판", nameEn: "2-Bromopropane", special: true, specialPct: 0.3 },
  { cas: "74-83-9", nameKr: "브롬화 메틸", nameEn: "Methyl bromide" },
  { cas: "8032-32-4", nameKr: "브이엠 및 피 나프타", nameEn: "VM&P Naphtha" },
  { cas: "108-05-4", nameKr: "비닐 아세테이트", nameEn: "Vinyl acetate" },
  { cas: "56-23-5", nameKr: "사염화탄소", nameEn: "Carbon tetrachloride", special: true },
  { cas: "8052-41-3", nameKr: "스토다드 솔벤트(벤젠 0.1% 이상 함유 시만 특별관리물질)", nameEn: "Stoddard solvent" },
  { cas: "100-42-5", nameKr: "스티렌", nameEn: "Styrene" },
  { cas: "108-94-1", nameKr: "시클로헥사논", nameEn: "Cyclohexanone" },
  { cas: "108-93-0", nameKr: "시클로헥사놀", nameEn: "Cyclohexanol" },
  { cas: "110-82-7", nameKr: "시클로헥산", nameEn: "Cyclohexane" },
  { cas: "110-83-8", nameKr: "시클로헥센", nameEn: "Cyclohexene" },
  { cas: "108-91-8", nameKr: "시클로헥실아민", nameEn: "Cyclohexylamine" },
  { cas: "62-53-3", nameKr: "아닐린 및 그 동족체", nameEn: "Aniline and its homologues" },
  { cas: "75-05-8", nameKr: "아세토니트릴", nameEn: "Acetonitrile" },
  { cas: "67-64-1", nameKr: "아세톤", nameEn: "Acetone" },
  { cas: "75-07-0", nameKr: "아세트알데히드", nameEn: "Acetaldehyde" },
  { cas: "107-13-1", nameKr: "아크릴로니트릴", nameEn: "Acrylonitrile", special: true },
  { cas: "79-06-1", nameKr: "아크릴아미드", nameEn: "Acrylamide", special: true },
  { cas: "106-92-3", nameKr: "알릴 글리시딜 에테르", nameEn: "Allyl glycidyl ether" },
  { cas: "141-43-5", nameKr: "에탄올아민", nameEn: "Ethanolamine" },
  { cas: "110-80-5", nameKr: "2-에톡시에탄올", nameEn: "2-Ethoxyethanol", special: true, specialPct: 0.3 },
  { cas: "111-15-9", nameKr: "2-에톡시에틸 아세테이트", nameEn: "2-Ethoxyethyl acetate", special: true, specialPct: 0.3 },
  { cas: "100-41-4", nameKr: "에틸 벤젠", nameEn: "Ethyl benzene" },
  { cas: "141-78-6", nameKr: "에틸 아세테이트", nameEn: "Ethyl acetate" },
  { cas: "140-88-5", nameKr: "에틸 아크릴레이트", nameEn: "Ethyl acrylate" },
  { cas: "107-21-1", nameKr: "에틸렌 글리콜", nameEn: "Ethylene glycol" },
  { cas: "628-96-6", nameKr: "에틸렌 글리콜 디니트레이트", nameEn: "Ethylene glycol dinitrate" },
  { cas: "107-07-3", nameKr: "에틸렌 클로로히드린", nameEn: "Ethylene chlorohydrin" },
  { cas: "151-56-4", nameKr: "에틸렌이민", nameEn: "Ethyleneimine", special: true },
  { cas: "75-04-7", nameKr: "에틸아민", nameEn: "Ethylamine" },
  { cas: "556-52-5 등", nameKr: "2,3-에폭시-1-프로판올", nameEn: "2,3-Epoxy-1-propanol", special: true },
  { cas: "75-56-9 등", nameKr: "1,2-에폭시프로판", nameEn: "1,2-Epoxypropane", special: true },
  { cas: "106-89-8 등", nameKr: "에피클로로히드린", nameEn: "Epichlorohydrin", special: true },
  { cas: "81-81-2", nameKr: "와파린", nameEn: "Warfarin", special: true, specialPct: 0.3 },
  { cas: "74-88-4", nameKr: "요오드화 메틸", nameEn: "Methyl iodide" },
  { cas: "110-19-0", nameKr: "이소부틸 아세테이트", nameEn: "Isobutyl acetate" },
  { cas: "78-83-1", nameKr: "이소부틸 알코올", nameEn: "Isobutyl alcohol" },
  { cas: "123-92-2", nameKr: "이소아밀 아세테이트", nameEn: "Isoamyl acetate" },
  { cas: "123-51-3", nameKr: "이소아밀 알코올", nameEn: "Isoamyl alcohol" },
  { cas: "108-21-4", nameKr: "이소프로필 아세테이트", nameEn: "Isopropyl acetate" },
  { cas: "67-63-0", nameKr: "이소프로필 알코올", nameEn: "Isopropyl alcohol" },
  { cas: "75-15-0", nameKr: "이황화탄소", nameEn: "Carbon disulfide" },
  { cas: "1319-77-3 등", nameKr: "크레졸", nameEn: "Cresol" },
  { cas: "1330-20-7 등", nameKr: "크실렌", nameEn: "Xylene" },
  { cas: "126-99-8", nameKr: "2-클로로-1,3-부타디엔", nameEn: "2-Chloro-1,3-butadiene" },
  { cas: "108-90-7", nameKr: "클로로벤젠", nameEn: "Chlorobenzene" },
  { cas: "79-34-5", nameKr: "1,1,2,2-테트라클로로에탄", nameEn: "1,1,2,2-Tetrachloroethane" },
  { cas: "109-99-9", nameKr: "테트라히드로푸란", nameEn: "Tetrahydrofuran" },
  { cas: "108-88-3", nameKr: "톨루엔", nameEn: "Toluene" },
  { cas: "584-84-9 등", nameKr: "톨루엔-2,4-디이소시아네이트", nameEn: "Toluene-2,4-diisocyanate" },
  { cas: "91-08-7 등", nameKr: "톨루엔-2,6-디이소시아네이트", nameEn: "Toluene-2,6-diisocyanate" },
  { cas: "121-44-8", nameKr: "트리에틸아민", nameEn: "Triethylamine" },
  { cas: "67-66-3", nameKr: "트리클로로메탄", nameEn: "Trichloromethane" },
  { cas: "79-00-5", nameKr: "1,1,2-트리클로로에탄", nameEn: "1,1,2-Trichloroethane" },
  { cas: "79-01-6", nameKr: "트리클로로에틸렌", nameEn: "Trichloroethylene", special: true },
  { cas: "96-18-4", nameKr: "1,2,3-트리클로로프로판", nameEn: "1,2,3-Trichloropropane", special: true },
  { cas: "127-18-4", nameKr: "퍼클로로에틸렌", nameEn: "Perchloroethylene", special: true },
  { cas: "108-95-2", nameKr: "페놀", nameEn: "Phenol", special: true, specialPct: 0.3 },
  { cas: "122-60-1 등", nameKr: "페닐 글리시딜 에테르", nameEn: "Phenyl glycidyl ether" },
  { cas: "75-12-7", nameKr: "포름아미드", nameEn: "Formamide", special: true, specialPct: 0.3 },
  { cas: "50-00-0", nameKr: "포름알데히드", nameEn: "Formaldehyde", special: true },
  { cas: "75-55-8", nameKr: "프로필렌이민", nameEn: "Propyleneimine", special: true },
  { cas: "109-60-4", nameKr: "n-프로필 아세테이트", nameEn: "n-Propyl acetate" },
  { cas: "110-86-1", nameKr: "피리딘", nameEn: "Pyridine" },
  { cas: "822-06-0", nameKr: "헥사메틸렌 디이소시아네이트", nameEn: "Hexamethylene diisocyanate" },
  { cas: "110-54-3", nameKr: "n-헥산", nameEn: "n-Hexane" },
  { cas: "142-82-5", nameKr: "n-헵탄", nameEn: "n-Heptane" },
  { cas: "77-78-1", nameKr: "황산 디메틸", nameEn: "Dimethyl sulfate", special: true },
  { cas: "302-01-2", nameKr: "히드라진 및 그 수화물", nameEn: "Hydrazine and its hydrates", special: true },
];

const BP12_METAL: Entry[] = [
  { cas: "7440-50-8", nameKr: "구리 및 그 화합물", nameEn: "Copper and its compounds" },
  { cas: "7439-92-1", nameKr: "납 및 그 무기화합물", nameEn: "Lead and its inorganic compounds", special: true, specialPct: 0.3 },
  { cas: "7440-02-0", nameKr: "니켈 및 그 무기화합물, 니켈 카르보닐(불용성화합물만 특별관리물질)", nameEn: "Nickel and its inorganic compounds, Nickel carbonyl" },
  { cas: "7439-96-5", nameKr: "망간 및 그 무기화합물", nameEn: "Manganese and its inorganic compounds" },
  { cas: "7440-39-3", nameKr: "바륨 및 그 가용성 화합물", nameEn: "Barium and its soluble compounds" },
  { cas: "7440-06-4", nameKr: "백금 및 그 화합물", nameEn: "Platinum and its compounds" },
  { cas: "1309-48-4", nameKr: "산화마그네슘", nameEn: "Magnesium oxide" },
  { cas: "1303-86-2", nameKr: "산화붕소", nameEn: "Boron oxide", special: true, specialPct: 0.3 },
  { cas: "7782-49-2", nameKr: "셀레늄 및 그 화합물", nameEn: "Selenium and its compounds" },
  { cas: "7439-97-6", nameKr: "수은 및 그 화합물(아릴·알킬화합물 제외)", nameEn: "Mercury and its compounds", special: true, specialPct: 0.3 },
  { cas: "7440-66-6", nameKr: "아연 및 그 화합물", nameEn: "Zinc and its compounds" },
  { cas: "7440-36-0", nameKr: "안티몬 및 그 화합물", nameEn: "Antimony and its compounds" },
  { cas: "1309-64-4", nameKr: "삼산화안티몬", nameEn: "Antimony trioxide", special: true },
  { cas: "7429-90-5", nameKr: "알루미늄 및 그 화합물", nameEn: "Aluminum and its compounds" },
  { cas: "1314-62-1", nameKr: "오산화바나듐", nameEn: "Vanadium pentoxide" },
  { cas: "7553-56-2", nameKr: "요오드 및 요오드화물", nameEn: "Iodine and iodides" },
  { cas: "7440-22-4", nameKr: "은 및 그 화합물", nameEn: "Silver and its compounds" },
  { cas: "13463-67-7", nameKr: "이산화티타늄", nameEn: "Titanium dioxide" },
  { cas: "7440-74-6", nameKr: "인듐 및 그 화합물", nameEn: "Indium and its compounds" },
  { cas: "7440-31-5", nameKr: "주석 및 그 화합물", nameEn: "Tin and its compounds" },
  { cas: "7440-67-7", nameKr: "지르코늄 및 그 화합물", nameEn: "Zirconium and its compounds" },
  { cas: "7439-89-6", nameKr: "철 및 그 화합물", nameEn: "Iron and its compounds" },
  { cas: "7440-43-9", nameKr: "카드뮴 및 그 화합물", nameEn: "Cadmium and its compounds", special: true },
  { cas: "7440-48-4", nameKr: "코발트 및 그 무기화합물", nameEn: "Cobalt and its inorganic compounds" },
  { cas: "7440-47-3", nameKr: "크롬 및 그 화합물(6가크롬 화합물만 특별관리물질)", nameEn: "Chromium and its compounds" },
  { cas: "7440-33-7", nameKr: "텅스텐 및 그 화합물", nameEn: "Tungsten and its compounds" },
];

const BP12_ACID: Entry[] = [
  { cas: "64-18-6", nameKr: "개미산", nameEn: "Formic acid" },
  { cas: "7722-84-1", nameKr: "과산화수소", nameEn: "Hydrogen peroxide" },
  { cas: "108-24-7", nameKr: "무수 초산", nameEn: "Acetic anhydride" },
  { cas: "7664-39-3", nameKr: "불화수소", nameEn: "Hydrogen fluoride" },
  { cas: "10035-10-6", nameKr: "브롬화수소", nameEn: "Hydrogen bromide" },
  { cas: "1330-43-4, 12179-04-3", nameKr: "사붕소산나트륨(무수물, 오수화물)", nameEn: "Sodium tetraborate", special: true, specialPct: 0.3 },
  { cas: "1310-73-2", nameKr: "수산화 나트륨", nameEn: "Sodium hydroxide" },
  { cas: "1310-58-3", nameKr: "수산화 칼륨", nameEn: "Potassium hydroxide" },
  { cas: "143-33-9", nameKr: "시안화 나트륨", nameEn: "Sodium cyanide" },
  { cas: "151-50-8", nameKr: "시안화 칼륨", nameEn: "Potassium cyanide" },
  { cas: "592-01-8", nameKr: "시안화 칼슘", nameEn: "Calcium cyanide" },
  { cas: "79-10-7", nameKr: "아크릴산", nameEn: "Acrylic acid" },
  { cas: "7647-01-0", nameKr: "염화수소", nameEn: "Hydrogen chloride" },
  { cas: "7664-38-2", nameKr: "인산", nameEn: "Phosphoric acid" },
  { cas: "7697-37-2", nameKr: "질산", nameEn: "Nitric acid" },
  { cas: "64-19-7", nameKr: "초산", nameEn: "Acetic acid" },
  { cas: "76-03-9", nameKr: "트리클로로아세트산", nameEn: "Trichloroacetic acid" },
  { cas: "7664-93-9", nameKr: "황산(pH 2.0 이하인 강산은 특별관리물질)", nameEn: "Sulfuric acid", special: true, specialPct: 0.1 },
];

const BP12_GAS: Entry[] = [
  { cas: "7782-41-4", nameKr: "불소", nameEn: "Fluorine" },
  { cas: "7726-95-6", nameKr: "브롬", nameEn: "Bromine" },
  { cas: "75-21-8", nameKr: "산화에틸렌", nameEn: "Ethylene oxide", special: true },
  { cas: "7784-42-1", nameKr: "삼수소화 비소", nameEn: "Arsine" },
  { cas: "74-90-8", nameKr: "시안화 수소", nameEn: "Hydrogen cyanide" },
  { cas: "7664-41-7 등", nameKr: "암모니아", nameEn: "Ammonia" },
  { cas: "7782-50-5", nameKr: "염소", nameEn: "Chlorine" },
  { cas: "10028-15-6", nameKr: "오존", nameEn: "Ozone" },
  { cas: "10102-44-0", nameKr: "이산화질소", nameEn: "Nitrogen dioxide" },
  { cas: "7446-09-5", nameKr: "이산화황", nameEn: "Sulfur dioxide" },
  { cas: "10102-43-9", nameKr: "일산화질소", nameEn: "Nitric oxide" },
  { cas: "630-08-0", nameKr: "일산화탄소", nameEn: "Carbon monoxide" },
  { cas: "75-44-5", nameKr: "포스겐", nameEn: "Phosgene" },
  { cas: "7803-51-2", nameKr: "포스핀", nameEn: "Phosphine" },
  { cas: "7783-06-4", nameKr: "황화수소", nameEn: "Hydrogen sulfide" },
];

const BP12_ALL: Entry[] = [...BP12_ORGANIC, ...BP12_METAL, ...BP12_ACID, ...BP12_GAS];

// ---------------------------------------------------------------------------
// 별표21 — 작업환경측정 대상 유해인자(제186조제1항 관련) — 화학적 인자만(CAS 매칭 대상)
// ---------------------------------------------------------------------------
const BP21_ORGANIC: Entry[] = [
  { cas: "111-30-8", nameKr: "글루타르알데히드", nameEn: "Glutaraldehyde" },
  { cas: "55-63-0", nameKr: "니트로글리세린", nameEn: "Nitroglycerin" },
  { cas: "75-52-5", nameKr: "니트로메탄", nameEn: "Nitromethane" },
  { cas: "98-95-3", nameKr: "니트로벤젠", nameEn: "Nitrobenzene" },
  { cas: "100-01-6", nameKr: "p-니트로아닐린", nameEn: "p-Nitroaniline" },
  { cas: "100-00-5", nameKr: "p-니트로클로로벤젠", nameEn: "p-Nitrochlorobenzene" },
  { cas: "25321-14-6 등", nameKr: "디니트로톨루엔", nameEn: "Dinitrotoluene" },
  { cas: "121-69-7", nameKr: "N,N-디메틸아닐린", nameEn: "N,N-Dimethylaniline" },
  { cas: "124-40-3", nameKr: "디메틸아민", nameEn: "Dimethylamine" },
  { cas: "127-19-5", nameKr: "N,N-디메틸아세트아미드", nameEn: "N,N-Dimethylacetamide" },
  { cas: "68-12-2", nameKr: "디메틸포름아미드", nameEn: "Dimethylformamide" },
  { cas: "111-42-2", nameKr: "디에탄올아민", nameEn: "Diethanolamine" },
  { cas: "60-29-7", nameKr: "디에틸 에테르", nameEn: "Diethyl ether" },
  { cas: "111-40-0", nameKr: "디에틸렌트리아민", nameEn: "Diethylenetriamine" },
  { cas: "100-37-8", nameKr: "2-디에틸아미노에탄올", nameEn: "2-Diethylaminoethanol" },
  { cas: "109-89-7", nameKr: "디에틸아민", nameEn: "Diethylamine" },
  { cas: "123-91-1", nameKr: "1,4-디옥산", nameEn: "1,4-Dioxane" },
  { cas: "108-83-8", nameKr: "디이소부틸케톤", nameEn: "Diisobutylketone" },
  { cas: "1717-00-6", nameKr: "1,1-디클로로-1-플루오로에탄", nameEn: "1,1-Dichloro-1-fluoroethane" },
  { cas: "75-09-2", nameKr: "디클로로메탄", nameEn: "Dichloromethane" },
  { cas: "95-50-1", nameKr: "o-디클로로벤젠", nameEn: "o-Dichlorobenzene" },
  { cas: "107-06-2", nameKr: "1,2-디클로로에탄", nameEn: "1,2-Dichloroethane" },
  { cas: "540-59-0 등", nameKr: "1,2-디클로로에틸렌", nameEn: "1,2-Dichloroethylene" },
  { cas: "78-87-5", nameKr: "1,2-디클로로프로판", nameEn: "1,2-Dichloropropane" },
  { cas: "75-43-4", nameKr: "디클로로플루오로메탄", nameEn: "Dichlorofluoromethane" },
  { cas: "123-31-9", nameKr: "p-디히드록시벤젠", nameEn: "p-Dihydroxybenzene" },
  { cas: "67-56-1", nameKr: "메탄올", nameEn: "Methanol" },
  { cas: "109-86-4", nameKr: "2-메톡시에탄올", nameEn: "2-Methoxyethanol" },
  { cas: "110-49-6", nameKr: "2-메톡시에틸 아세테이트", nameEn: "2-Methoxyethyl acetate" },
  { cas: "591-78-6", nameKr: "메틸 n-부틸 케톤", nameEn: "Methyl n-butyl ketone" },
  { cas: "110-43-0", nameKr: "메틸 n-아밀 케톤", nameEn: "Methyl n-amyl ketone" },
  { cas: "74-89-5", nameKr: "메틸 아민", nameEn: "Methyl amine" },
  { cas: "79-20-9", nameKr: "메틸 아세테이트", nameEn: "Methyl acetate" },
  { cas: "78-93-3", nameKr: "메틸 에틸 케톤", nameEn: "Methyl ethyl ketone" },
  { cas: "108-10-1", nameKr: "메틸 이소부틸 케톤", nameEn: "Methyl isobutyl ketone" },
  { cas: "74-87-3", nameKr: "메틸 클로라이드", nameEn: "Methyl chloride" },
  { cas: "71-55-6", nameKr: "메틸 클로로포름", nameEn: "Methyl chloroform" },
  { cas: "101-68-8 등", nameKr: "메틸렌 비스(페닐 이소시아네이트)", nameEn: "Methylene bis(phenyl isocyanate)" },
  { cas: "583-60-8", nameKr: "o-메틸시클로헥사논", nameEn: "o-Methylcyclohexanone" },
  { cas: "25639-42-3 등", nameKr: "메틸시클로헥사놀", nameEn: "Methylcyclohexanol" },
  { cas: "108-31-6", nameKr: "무수 말레산", nameEn: "Maleic anhydride" },
  { cas: "85-44-9", nameKr: "무수 프탈산", nameEn: "Phthalic anhydride" },
  { cas: "71-43-2", nameKr: "벤젠", nameEn: "Benzene" },
  { cas: "106-99-0", nameKr: "1,3-부타디엔", nameEn: "1,3-Butadiene" },
  { cas: "71-36-3", nameKr: "n-부탄올", nameEn: "n-Butanol" },
  { cas: "78-92-2", nameKr: "2-부탄올", nameEn: "2-Butanol" },
  { cas: "111-76-2", nameKr: "2-부톡시에탄올", nameEn: "2-Butoxyethanol" },
  { cas: "112-07-2", nameKr: "2-부톡시에틸 아세테이트", nameEn: "2-Butoxyethyl acetate" },
  { cas: "123-86-4", nameKr: "n-부틸 아세테이트", nameEn: "n-Butyl acetate" },
  { cas: "106-94-5", nameKr: "1-브로모프로판", nameEn: "1-Bromopropane" },
  { cas: "75-26-3", nameKr: "2-브로모프로판", nameEn: "2-Bromopropane" },
  { cas: "74-83-9", nameKr: "브롬화 메틸", nameEn: "Methyl bromide" },
  { cas: "108-05-4", nameKr: "비닐 아세테이트", nameEn: "Vinyl acetate" },
  { cas: "56-23-5", nameKr: "사염화탄소", nameEn: "Carbon tetrachloride" },
  { cas: "8052-41-3", nameKr: "스토다드 솔벤트", nameEn: "Stoddard solvent" },
  { cas: "100-42-5", nameKr: "스티렌", nameEn: "Styrene" },
  { cas: "108-94-1", nameKr: "시클로헥사논", nameEn: "Cyclohexanone" },
  { cas: "108-93-0", nameKr: "시클로헥사놀", nameEn: "Cyclohexanol" },
  { cas: "110-82-7", nameKr: "시클로헥산", nameEn: "Cyclohexane" },
  { cas: "110-83-8", nameKr: "시클로헥센", nameEn: "Cyclohexene" },
  { cas: "62-53-3", nameKr: "아닐린 및 그 동족체", nameEn: "Aniline and its homologues" },
  { cas: "75-05-8", nameKr: "아세토니트릴", nameEn: "Acetonitrile" },
  { cas: "67-64-1", nameKr: "아세톤", nameEn: "Acetone" },
  { cas: "75-07-0", nameKr: "아세트알데히드", nameEn: "Acetaldehyde" },
  { cas: "107-13-1", nameKr: "아크릴로니트릴", nameEn: "Acrylonitrile" },
  { cas: "79-06-1", nameKr: "아크릴아미드", nameEn: "Acrylamide" },
  { cas: "106-92-3", nameKr: "알릴 글리시딜 에테르", nameEn: "Allyl glycidyl ether" },
  { cas: "141-43-5", nameKr: "에탄올아민", nameEn: "Ethanolamine" },
  { cas: "110-80-5", nameKr: "2-에톡시에탄올", nameEn: "2-Ethoxyethanol" },
  { cas: "111-15-9", nameKr: "2-에톡시에틸 아세테이트", nameEn: "2-Ethoxyethyl acetate" },
  { cas: "100-41-4", nameKr: "에틸 벤젠", nameEn: "Ethyl benzene" },
  { cas: "141-78-6", nameKr: "에틸 아세테이트", nameEn: "Ethyl acetate" },
  { cas: "140-88-5", nameKr: "에틸 아크릴레이트", nameEn: "Ethyl acrylate" },
  { cas: "107-21-1", nameKr: "에틸렌 글리콜", nameEn: "Ethylene glycol" },
  { cas: "628-96-6", nameKr: "에틸렌 글리콜 디니트레이트", nameEn: "Ethylene glycol dinitrate" },
  { cas: "107-07-3", nameKr: "에틸렌 클로로히드린", nameEn: "Ethylene chlorohydrin" },
  { cas: "151-56-4", nameKr: "에틸렌이민", nameEn: "Ethyleneimine" },
  { cas: "75-04-7", nameKr: "에틸아민", nameEn: "Ethylamine" },
  { cas: "556-52-5 등", nameKr: "2,3-에폭시-1-프로판올", nameEn: "2,3-Epoxy-1-propanol" },
  { cas: "75-56-9 등", nameKr: "1,2-에폭시프로판", nameEn: "1,2-Epoxypropane" },
  { cas: "106-89-8 등", nameKr: "에피클로로히드린", nameEn: "Epichlorohydrin" },
  { cas: "74-88-4", nameKr: "요오드화 메틸", nameEn: "Methyl iodide" },
  { cas: "110-19-0", nameKr: "이소부틸 아세테이트", nameEn: "Isobutyl acetate" },
  { cas: "78-83-1", nameKr: "이소부틸 알코올", nameEn: "Isobutyl alcohol" },
  { cas: "123-92-2", nameKr: "이소아밀 아세테이트", nameEn: "Isoamyl acetate" },
  { cas: "123-51-3", nameKr: "이소아밀 알코올", nameEn: "Isoamyl alcohol" },
  { cas: "108-21-4", nameKr: "이소프로필 아세테이트", nameEn: "Isopropyl acetate" },
  { cas: "67-63-0", nameKr: "이소프로필 알코올", nameEn: "Isopropyl alcohol" },
  { cas: "75-15-0", nameKr: "이황화탄소", nameEn: "Carbon disulfide" },
  { cas: "1319-77-3 등", nameKr: "크레졸", nameEn: "Cresol" },
  { cas: "1330-20-7 등", nameKr: "크실렌", nameEn: "Xylene" },
  { cas: "108-90-7", nameKr: "클로로벤젠", nameEn: "Chlorobenzene" },
  { cas: "79-34-5", nameKr: "1,1,2,2-테트라클로로에탄", nameEn: "1,1,2,2-Tetrachloroethane" },
  { cas: "109-99-9", nameKr: "테트라히드로푸란", nameEn: "Tetrahydrofuran" },
  { cas: "108-88-3", nameKr: "톨루엔", nameEn: "Toluene" },
  { cas: "584-84-9 등", nameKr: "톨루엔-2,4-디이소시아네이트", nameEn: "Toluene-2,4-diisocyanate" },
  { cas: "91-08-7 등", nameKr: "톨루엔-2,6-디이소시아네이트", nameEn: "Toluene-2,6-diisocyanate" },
  { cas: "121-44-8", nameKr: "트리에틸아민", nameEn: "Triethylamine" },
  { cas: "67-66-3", nameKr: "트리클로로메탄", nameEn: "Trichloromethane" },
  { cas: "79-00-5", nameKr: "1,1,2-트리클로로에탄", nameEn: "1,1,2-Trichloroethane" },
  { cas: "79-01-6", nameKr: "트리클로로에틸렌", nameEn: "Trichloroethylene" },
  { cas: "96-18-4", nameKr: "1,2,3-트리클로로프로판", nameEn: "1,2,3-Trichloropropane" },
  { cas: "127-18-4", nameKr: "퍼클로로에틸렌", nameEn: "Perchloroethylene" },
  { cas: "108-95-2", nameKr: "페놀", nameEn: "Phenol" },
  { cas: "87-86-5", nameKr: "펜타클로로페놀", nameEn: "Pentachlorophenol" },
  { cas: "50-00-0", nameKr: "포름알데히드", nameEn: "Formaldehyde" },
  { cas: "75-55-8", nameKr: "프로필렌이민", nameEn: "Propyleneimine" },
  { cas: "109-60-4", nameKr: "n-프로필 아세테이트", nameEn: "n-Propyl acetate" },
  { cas: "110-86-1", nameKr: "피리딘", nameEn: "Pyridine" },
  { cas: "822-06-0", nameKr: "헥사메틸렌 디이소시아네이트", nameEn: "Hexamethylene diisocyanate" },
  { cas: "110-54-3", nameKr: "n-헥산", nameEn: "n-Hexane" },
  { cas: "142-82-5", nameKr: "n-헵탄", nameEn: "n-Heptane" },
  { cas: "77-78-1", nameKr: "황산 디메틸", nameEn: "Dimethyl sulfate" },
  { cas: "302-01-2", nameKr: "히드라진", nameEn: "Hydrazine" },
];

const BP21_METAL: Entry[] = [
  { cas: "7440-50-8", nameKr: "구리(분진, 미스트, 흄)", nameEn: "Copper" },
  { cas: "7439-92-1", nameKr: "납 및 그 무기화합물", nameEn: "Lead and its inorganic compounds" },
  { cas: "7440-02-0", nameKr: "니켈 및 그 무기화합물, 니켈 카르보닐", nameEn: "Nickel and its inorganic compounds, Nickel carbonyl" },
  { cas: "7439-96-5", nameKr: "망간 및 그 무기화합물", nameEn: "Manganese and its inorganic compounds" },
  { cas: "7440-39-3", nameKr: "바륨 및 그 가용성 화합물", nameEn: "Barium and its soluble compounds" },
  { cas: "7440-06-4", nameKr: "백금 및 그 가용성 염", nameEn: "Platinum and its soluble salts" },
  { cas: "1309-48-4", nameKr: "산화마그네슘", nameEn: "Magnesium oxide" },
  { cas: "1314-13-2", nameKr: "산화아연(분진, 흄)", nameEn: "Zinc oxide" },
  { cas: "1309-37-1 등", nameKr: "산화철(분진, 흄)", nameEn: "Iron oxide" },
  { cas: "7782-49-2", nameKr: "셀레늄 및 그 화합물", nameEn: "Selenium and its compounds" },
  { cas: "7439-97-6", nameKr: "수은 및 그 화합물", nameEn: "Mercury and its compounds" },
  { cas: "7440-36-0", nameKr: "안티몬 및 그 화합물", nameEn: "Antimony and its compounds" },
  { cas: "7429-90-5", nameKr: "알루미늄 및 그 화합물", nameEn: "Aluminum and its compounds" },
  { cas: "1314-62-1", nameKr: "오산화바나듐(분진, 흄)", nameEn: "Vanadium pentoxide" },
  { cas: "7553-56-2", nameKr: "요오드 및 요오드화물", nameEn: "Iodine and iodides" },
  { cas: "7440-74-6", nameKr: "인듐 및 그 화합물", nameEn: "Indium and its compounds" },
  { cas: "7440-22-4", nameKr: "은 및 그 가용성 화합물", nameEn: "Silver and its soluble compounds" },
  { cas: "13463-67-7", nameKr: "이산화티타늄", nameEn: "Titanium dioxide" },
  { cas: "7440-31-5", nameKr: "주석 및 그 화합물(수소화 주석 제외)", nameEn: "Tin and its compounds" },
  { cas: "7440-67-7", nameKr: "지르코늄 및 그 화합물", nameEn: "Zirconium and its compounds" },
  { cas: "7440-43-9", nameKr: "카드뮴 및 그 화합물", nameEn: "Cadmium and its compounds" },
  { cas: "7440-48-4", nameKr: "코발트 및 그 무기화합물", nameEn: "Cobalt and its inorganic compounds" },
  { cas: "7440-47-3", nameKr: "크롬 및 그 무기화합물", nameEn: "Chromium and its inorganic compounds" },
  { cas: "7440-33-7", nameKr: "텅스텐 및 그 화합물", nameEn: "Tungsten and its compounds" },
];

const BP21_ACID: Entry[] = BP12_ACID.map((e) => ({ cas: e.cas, nameKr: e.nameKr.replace(/\(.*?특별관리물질.*?\)/, "").trim(), nameEn: e.nameEn }));
const BP21_GAS: Entry[] = BP12_GAS.map((e) => ({ cas: e.cas, nameKr: e.nameKr, nameEn: e.nameEn }));

const BP21_PERMIT: Entry[] = [
  { cas: "134-32-7", nameKr: "α-나프틸아민 및 그 염", nameEn: "α-naphthylamine and its salts" },
  { cas: "119-90-4", nameKr: "디아니시딘 및 그 염", nameEn: "Dianisidine and its salts" },
  { cas: "91-94-1", nameKr: "디클로로벤지딘 및 그 염", nameEn: "Dichlorobenzidine and its salts" },
  { cas: "7440-41-7", nameKr: "베릴륨 및 그 화합물", nameEn: "Beryllium and its compounds" },
  { cas: "98-07-7", nameKr: "벤조트리클로라이드", nameEn: "Benzotrichloride", pct: 0.5 },
  { cas: "7440-38-2", nameKr: "비소 및 그 무기화합물", nameEn: "Arsenic and its inorganic compounds" },
  { cas: "75-01-4", nameKr: "염화비닐", nameEn: "Vinyl chloride" },
  { cas: "65996-93-2", nameKr: "콜타르피치 휘발물", nameEn: "Coal tar pitch volatiles" },
  { cas: "13530-65-9 등", nameKr: "크롬산 아연", nameEn: "Zinc chromates" },
  { cas: "119-93-7", nameKr: "o-톨리딘 및 그 염", nameEn: "o-Tolidine and its salts" },
  { cas: "12035-72-2, 16812-54-7", nameKr: "황화니켈류", nameEn: "Nickel sulfides" },
];

const BP21_ALL: Entry[] = [...BP21_ORGANIC, ...BP21_METAL, ...BP21_ACID, ...BP21_GAS, ...BP21_PERMIT];

// ---------------------------------------------------------------------------
// 별표22 — 특수건강진단 대상 유해인자(제201조 관련) <2021.11.19 개정> — 화학적 인자만
// ---------------------------------------------------------------------------
const BP22_ORGANIC: Entry[] = [
  { cas: "8006-61-9", nameKr: "가솔린", nameEn: "Gasoline" },
  { cas: "111-30-8", nameKr: "글루타르알데히드", nameEn: "Glutaraldehyde" },
  { cas: "91-59-8", nameKr: "β-나프틸아민", nameEn: "β-Naphthylamine" },
  { cas: "55-63-0", nameKr: "니트로글리세린", nameEn: "Nitroglycerin" },
  { cas: "75-52-5", nameKr: "니트로메탄", nameEn: "Nitromethane" },
  { cas: "98-95-3", nameKr: "니트로벤젠", nameEn: "Nitrobenzene" },
  { cas: "100-01-6", nameKr: "p-니트로아닐린", nameEn: "p-Nitroaniline" },
  { cas: "100-00-5", nameKr: "p-니트로클로로벤젠", nameEn: "p-Nitrochlorobenzene" },
  { cas: "25321-14-6 등", nameKr: "디니트로톨루엔", nameEn: "Dinitrotoluene" },
  { cas: "121-69-7", nameKr: "N,N-디메틸아닐린", nameEn: "N,N-Dimethylaniline" },
  { cas: "60-11-7", nameKr: "p-디메틸아미노아조벤젠", nameEn: "p-Dimethylaminoazobenzene" },
  { cas: "127-19-5", nameKr: "N,N-디메틸아세트아미드", nameEn: "N,N-Dimethylacetamide" },
  { cas: "68-12-2", nameKr: "디메틸포름아미드", nameEn: "Dimethylformamide" },
  { cas: "60-29-7", nameKr: "디에틸 에테르", nameEn: "Diethyl ether" },
  { cas: "111-40-0", nameKr: "디에틸렌트리아민", nameEn: "Diethylenetriamine" },
  { cas: "123-91-1", nameKr: "1,4-디옥산", nameEn: "1,4-Dioxane" },
  { cas: "108-83-8", nameKr: "디이소부틸케톤", nameEn: "Diisobutylketone" },
  { cas: "75-09-2", nameKr: "디클로로메탄", nameEn: "Dichloromethane" },
  { cas: "95-50-1", nameKr: "o-디클로로벤젠", nameEn: "o-Dichlorobenzene" },
  { cas: "107-06-2", nameKr: "1,2-디클로로에탄", nameEn: "1,2-Dichloroethane" },
  { cas: "540-59-0 등", nameKr: "1,2-디클로로에틸렌", nameEn: "1,2-Dichloroethylene" },
  { cas: "78-87-5", nameKr: "1,2-디클로로프로판", nameEn: "1,2-Dichloropropane" },
  { cas: "75-43-4", nameKr: "디클로로플루오로메탄", nameEn: "Dichlorofluoromethane" },
  { cas: "123-31-9", nameKr: "p-디히드록시벤젠", nameEn: "p-dihydroxybenzene" },
  { cas: "569-61-9", nameKr: "마젠타", nameEn: "Magenta" },
  { cas: "67-56-1", nameKr: "메탄올", nameEn: "Methanol" },
  { cas: "109-86-4", nameKr: "2-메톡시에탄올", nameEn: "2-Methoxyethanol" },
  { cas: "110-49-6", nameKr: "2-메톡시에틸 아세테이트", nameEn: "2-Methoxyethyl acetate" },
  { cas: "591-78-6", nameKr: "메틸 n-부틸 케톤", nameEn: "Methyl n-butyl ketone" },
  { cas: "110-43-0", nameKr: "메틸 n-아밀 케톤", nameEn: "Methyl n-amyl ketone" },
  { cas: "78-93-3", nameKr: "메틸 에틸 케톤", nameEn: "Methyl ethyl ketone" },
  { cas: "108-10-1", nameKr: "메틸 이소부틸 케톤", nameEn: "Methyl isobutyl ketone" },
  { cas: "74-87-3", nameKr: "메틸 클로라이드", nameEn: "Methyl chloride" },
  { cas: "71-55-6", nameKr: "메틸 클로로포름", nameEn: "Methyl chloroform" },
  { cas: "101-68-8 등", nameKr: "메틸렌 비스(페닐 이소시아네이트)", nameEn: "Methylene bis(phenyl isocyanate)" },
  { cas: "101-14-4", nameKr: "4,4'-메틸렌 비스(2-클로로아닐린)", nameEn: "4,4'-Methylene bis(2-chloroaniline)" },
  { cas: "583-60-8", nameKr: "o-메틸시클로헥사논", nameEn: "o-Methylcyclohexanone" },
  { cas: "25639-42-3 등", nameKr: "메틸시클로헥사놀", nameEn: "Methylcyclohexanol" },
  { cas: "108-31-6", nameKr: "무수 말레산", nameEn: "Maleic anhydride" },
  { cas: "85-44-9", nameKr: "무수 프탈산", nameEn: "Phthalic anhydride" },
  { cas: "71-43-2", nameKr: "벤젠", nameEn: "Benzene" },
  { cas: "92-87-5", nameKr: "벤지딘 및 그 염", nameEn: "Benzidine and its salts" },
  { cas: "106-99-0", nameKr: "1,3-부타디엔", nameEn: "1,3-Butadiene" },
  { cas: "71-36-3", nameKr: "n-부탄올", nameEn: "n-Butanol" },
  { cas: "78-92-2", nameKr: "2-부탄올", nameEn: "2-Butanol" },
  { cas: "111-76-2", nameKr: "2-부톡시에탄올", nameEn: "2-Butoxyethanol" },
  { cas: "112-07-2", nameKr: "2-부톡시에틸 아세테이트", nameEn: "2-Butoxyethyl acetate" },
  { cas: "106-94-5", nameKr: "1-브로모프로판", nameEn: "1-Bromopropane" },
  { cas: "75-26-3", nameKr: "2-브로모프로판", nameEn: "2-Bromopropane" },
  { cas: "74-83-9", nameKr: "브롬화 메틸", nameEn: "Methyl bromide" },
  { cas: "542-88-1", nameKr: "비스(클로로메틸) 에테르", nameEn: "bis(Chloromethyl) ether" },
  { cas: "56-23-5", nameKr: "사염화탄소", nameEn: "Carbon tetrachloride" },
  { cas: "8052-41-3", nameKr: "스토다드 솔벤트", nameEn: "Stoddard solvent" },
  { cas: "100-42-5", nameKr: "스티렌", nameEn: "Styrene" },
  { cas: "108-94-1", nameKr: "시클로헥사논", nameEn: "Cyclohexanone" },
  { cas: "108-93-0", nameKr: "시클로헥사놀", nameEn: "Cyclohexanol" },
  { cas: "110-82-7", nameKr: "시클로헥산", nameEn: "Cyclohexane" },
  { cas: "110-83-8", nameKr: "시클로헥센", nameEn: "Cyclohexene" },
  { cas: "62-53-3", nameKr: "아닐린 및 그 동족체", nameEn: "Aniline and its homologues" },
  { cas: "75-05-8", nameKr: "아세토니트릴", nameEn: "Acetonitrile" },
  { cas: "67-64-1", nameKr: "아세톤", nameEn: "Acetone" },
  { cas: "75-07-0", nameKr: "아세트알데히드", nameEn: "Acetaldehyde" },
  { cas: "492-80-8", nameKr: "아우라민", nameEn: "Auramine" },
  { cas: "107-13-1", nameKr: "아크릴로니트릴", nameEn: "Acrylonitrile" },
  { cas: "79-06-1", nameKr: "아크릴아미드", nameEn: "Acrylamide" },
  { cas: "110-80-5", nameKr: "2-에톡시에탄올", nameEn: "2-Ethoxyethanol" },
  { cas: "111-15-9", nameKr: "2-에톡시에틸 아세테이트", nameEn: "2-Ethoxyethyl acetate" },
  { cas: "100-41-4", nameKr: "에틸 벤젠", nameEn: "Ethyl benzene" },
  { cas: "140-88-5", nameKr: "에틸 아크릴레이트", nameEn: "Ethyl acrylate" },
  { cas: "107-21-1", nameKr: "에틸렌 글리콜", nameEn: "Ethylene glycol" },
  { cas: "628-96-6", nameKr: "에틸렌 글리콜 디니트레이트", nameEn: "Ethylene glycol dinitrate" },
  { cas: "107-07-3", nameKr: "에틸렌 클로로히드린", nameEn: "Ethylene chlorohydrin" },
  { cas: "151-56-4", nameKr: "에틸렌이민", nameEn: "Ethyleneimine" },
  { cas: "556-52-5 등", nameKr: "2,3-에폭시-1-프로판올", nameEn: "2,3-Epoxy-1-propanol" },
  { cas: "106-89-8 등", nameKr: "에피클로로히드린", nameEn: "Epichlorohydrin" },
  { cas: "53469-21-9, 11097-69-1", nameKr: "염소화비페닐", nameEn: "Polychlorobiphenyls" },
  { cas: "74-88-4", nameKr: "요오드화 메틸", nameEn: "Methyl iodide" },
  { cas: "78-83-1", nameKr: "이소부틸 알코올", nameEn: "Isobutyl alcohol" },
  { cas: "123-92-2", nameKr: "이소아밀 아세테이트", nameEn: "Isoamyl acetate" },
  { cas: "123-51-3", nameKr: "이소아밀 알코올", nameEn: "Isoamyl alcohol" },
  { cas: "67-63-0", nameKr: "이소프로필 알코올", nameEn: "Isopropyl alcohol" },
  { cas: "75-15-0", nameKr: "이황화탄소", nameEn: "Carbon disulfide" },
  { cas: "8007-45-2", nameKr: "콜타르", nameEn: "Coal tar" },
  { cas: "1319-77-3 등", nameKr: "크레졸", nameEn: "Cresol" },
  { cas: "1330-20-7 등", nameKr: "크실렌", nameEn: "Xylene" },
  { cas: "107-30-2", nameKr: "클로로메틸 메틸 에테르", nameEn: "Chloromethyl methyl ether" },
  { cas: "108-90-7", nameKr: "클로로벤젠", nameEn: "Chlorobenzene" },
  { cas: "8006-64-2", nameKr: "테레빈유", nameEn: "Turpentine oil" },
  { cas: "79-34-5", nameKr: "1,1,2,2-테트라클로로에탄", nameEn: "1,1,2,2-Tetrachloroethane" },
  { cas: "109-99-9", nameKr: "테트라히드로푸란", nameEn: "Tetrahydrofuran" },
  { cas: "108-88-3", nameKr: "톨루엔", nameEn: "Toluene" },
  { cas: "584-84-9 등", nameKr: "톨루엔-2,4-디이소시아네이트", nameEn: "Toluene-2,4-diisocyanate" },
  { cas: "91-08-7 등", nameKr: "톨루엔-2,6-디이소시아네이트", nameEn: "Toluene-2,6-diisocyanate" },
  { cas: "67-66-3", nameKr: "트리클로로메탄", nameEn: "Trichloromethane" },
  { cas: "79-00-5", nameKr: "1,1,2-트리클로로에탄", nameEn: "1,1,2-Trichloroethane" },
  { cas: "79-01-6", nameKr: "트리클로로에틸렌", nameEn: "Trichloroethylene(TCE)" },
  { cas: "96-18-4", nameKr: "1,2,3-트리클로로프로판", nameEn: "1,2,3-Trichloropropane" },
  { cas: "127-18-4", nameKr: "퍼클로로에틸렌", nameEn: "Perchloroethylene" },
  { cas: "108-95-2", nameKr: "페놀", nameEn: "Phenol" },
  { cas: "87-86-5", nameKr: "펜타클로로페놀", nameEn: "Pentachlorophenol" },
  { cas: "50-00-0", nameKr: "포름알데히드", nameEn: "Formaldehyde" },
  { cas: "57-57-8", nameKr: "β-프로피오락톤", nameEn: "β-Propiolactone" },
  { cas: "91-15-6", nameKr: "o-프탈로디니트릴", nameEn: "o-Phthalodinitrile" },
  { cas: "110-86-1", nameKr: "피리딘", nameEn: "Pyridine" },
  { cas: "822-06-0", nameKr: "헥사메틸렌 디이소시아네이트", nameEn: "Hexamethylene diisocyanate" },
  { cas: "110-54-3", nameKr: "n-헥산", nameEn: "n-Hexane" },
  { cas: "142-82-5", nameKr: "n-헵탄", nameEn: "n-Heptane" },
  { cas: "77-78-1", nameKr: "황산 디메틸", nameEn: "Dimethyl sulfate" },
  { cas: "302-01-2", nameKr: "히드라진", nameEn: "Hydrazine" },
];

const BP22_METAL: Entry[] = [
  { cas: "7440-50-8", nameKr: "구리(분진, 미스트, 흄)", nameEn: "Copper" },
  { cas: "7439-92-1", nameKr: "납 및 그 무기화합물", nameEn: "Lead and its inorganic compounds" },
  { cas: "7440-02-0, 13463-39-3", nameKr: "니켈 및 그 무기화합물, 니켈 카르보닐", nameEn: "Nickel and its inorganic compounds, Nickel carbonyl" },
  { cas: "7439-96-5", nameKr: "망간 및 그 무기화합물", nameEn: "Manganese and its inorganic compounds" },
  { cas: "78-00-2 등", nameKr: "사알킬납", nameEn: "Tetraalkyl lead" },
  { cas: "1314-13-2", nameKr: "산화아연(분진, 흄)", nameEn: "Zinc oxide" },
  { cas: "1309-37-1 등", nameKr: "산화철(분진, 흄)", nameEn: "Iron oxide" },
  { cas: "1327-53-3", nameKr: "삼산화비소", nameEn: "Arsenic trioxide" },
  { cas: "7439-97-6", nameKr: "수은 및 그 화합물", nameEn: "Mercury and its compounds" },
  { cas: "7440-36-0", nameKr: "안티몬 및 그 화합물", nameEn: "Antimony and its compounds" },
  { cas: "7429-90-5", nameKr: "알루미늄 및 그 화합물", nameEn: "Aluminum and its compounds" },
  { cas: "1314-62-1", nameKr: "오산화바나듐(분진, 흄)", nameEn: "Vanadium pentoxide" },
  { cas: "7553-56-2", nameKr: "요오드 및 요오드화물", nameEn: "Iodine and iodides" },
  { cas: "7440-74-6", nameKr: "인듐 및 그 화합물", nameEn: "Indium and its compounds" },
  { cas: "7440-31-5", nameKr: "주석 및 그 화합물", nameEn: "Tin and its compounds" },
  { cas: "7440-67-7", nameKr: "지르코늄 및 그 화합물", nameEn: "Zirconium and its compounds" },
  { cas: "7440-43-9", nameKr: "카드뮴 및 그 화합물", nameEn: "Cadmium and its compounds" },
  { cas: "7440-48-4", nameKr: "코발트(분진, 흄)", nameEn: "Cobalt" },
  { cas: "7440-47-3", nameKr: "크롬 및 그 화합물", nameEn: "Chromium and its compounds" },
  { cas: "7440-33-7", nameKr: "텅스텐 및 그 화합물", nameEn: "Tungsten and its compounds" },
];

const BP22_ACID: Entry[] = [
  { cas: "108-24-7", nameKr: "무수 초산", nameEn: "Acetic anhydride" },
  { cas: "7664-39-3", nameKr: "불화수소", nameEn: "Hydrogen fluoride" },
  { cas: "143-33-9", nameKr: "시안화 나트륨", nameEn: "Sodium cyanide" },
  { cas: "151-50-8", nameKr: "시안화 칼륨", nameEn: "Potassium cyanide" },
  { cas: "7647-01-0", nameKr: "염화수소", nameEn: "Hydrogen chloride" },
  { cas: "7697-37-2", nameKr: "질산", nameEn: "Nitric acid" },
  { cas: "76-03-9", nameKr: "트리클로로아세트산", nameEn: "Trichloroacetic acid" },
  { cas: "7664-93-9", nameKr: "황산", nameEn: "Sulfuric acid" },
];

const BP22_GAS: Entry[] = BP12_GAS.filter((e) => e.cas !== "75-21-8").concat([{ cas: "75-21-8", nameKr: "산화에틸렌", nameEn: "Ethylene oxide" }]);

const BP22_PERMIT: Entry[] = [
  { cas: "134-32-7", nameKr: "α-나프틸아민 및 그 염", nameEn: "α-naphthylamine and its salts" },
  { cas: "119-90-4", nameKr: "디아니시딘 및 그 염", nameEn: "Dianisidine and its salts" },
  { cas: "91-94-1", nameKr: "디클로로벤지딘 및 그 염", nameEn: "Dichlorobenzidine and its salts" },
  { cas: "7440-41-7", nameKr: "베릴륨 및 그 화합물", nameEn: "Beryllium and its compounds" },
  { cas: "98-07-7", nameKr: "벤조트리클로라이드", nameEn: "Benzotrichloride", pct: 0.5 },
  { cas: "7440-38-2", nameKr: "비소 및 그 무기화합물", nameEn: "Arsenic and its inorganic compounds" },
  { cas: "75-01-4", nameKr: "염화비닐", nameEn: "Vinyl chloride" },
  { cas: "65996-93-2", nameKr: "콜타르피치 휘발물(코크스 제조·취급업무)", nameEn: "Coal tar pitch volatiles" },
  { cas: "13530-65-9 등", nameKr: "크롬산 아연", nameEn: "Zinc chromates" },
  { cas: "119-93-7", nameKr: "o-톨리딘 및 그 염", nameEn: "o-Tolidine and its salts" },
  { cas: "12035-72-2, 16812-54-7", nameKr: "황화니켈류", nameEn: "Nickel sulfides" },
];

const BP22_ALL: Entry[] = [...BP22_ORGANIC, ...BP22_METAL, ...BP22_ACID, ...BP22_GAS, ...BP22_PERMIT];

// ---------------------------------------------------------------------------
// CAS별 전체 임계값 문구(clause) 맵 생성 — 여러 법령/카테고리에 동시에 속한 CAS는
// 모든 절을 하나의 thresholdRaw 문자열로 합쳐, 어느 xlsx 파일에서 먼저 seed되어도
// (seedReferenceData.ts의 유니온 병합과 함께) 동일한 전체 문구를 갖도록 한다.
// ---------------------------------------------------------------------------
function casTokens(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => /^\d{1,7}-\d{2}-\d$/.exec(s.split(/\s+/)[0])?.[0])
    .filter((s): s is string => !!s);
}

const clauseMap = new Map<string, Set<string>>();
function addClause(entries: Entry[], label: string, defaultPct = 1) {
  for (const e of entries) {
    const pct = e.pct ?? defaultPct;
    const clause = `${label} : ${pct}% 이상`;
    for (const cas of casTokens(e.cas)) {
      if (!clauseMap.has(cas)) clauseMap.set(cas, new Set());
      clauseMap.get(cas)!.add(clause);
    }
  }
}
function addSpecialClause(entries: Entry[]) {
  for (const e of entries) {
    if (!e.special) continue;
    const pct = e.specialPct ?? 0.1;
    const clause = `특별관리물질 : ${pct}% 이상`;
    for (const cas of casTokens(e.cas)) {
      if (!clauseMap.has(cas)) clauseMap.set(cas, new Set());
      clauseMap.get(cas)!.add(clause);
    }
  }
}

// 관리대상유해물질 해당 기준은 원칙 1%지만, 특별관리물질로 지정된 물질은 그 물질에 적용되는
// (0.3% 또는 0.1%) 더 낮은 기준을 "관리대상유해물질 해당" 판정에도 그대로 적용한다
// (별표12 비고: "...는 0.3%, 그 밖의 특별관리물질은 0.1%] 이상 함유한 혼합물" — 특별관리물질은
// 관리대상유해물질의 부분집합이며 같은 문장에서 함께 정의되므로 두 카테고리의 트리거 임계값은
// 특별관리물질로 지정된 물질에 한해 동일하다).
const bp12WithManagementPct: Entry[] = BP12_ALL.map((e) => ({
  ...e,
  pct: e.special ? e.specialPct ?? 0.1 : 1,
}));
addClause(bp12WithManagementPct, "관리대상유해물질");
addSpecialClause(BP12_ALL);
addClause(BP21_ALL, "작업환경측정", 1);
addClause(BP22_ALL, "특수건강진단", 1);

function thresholdRawFor(cas: string): string {
  const tokens = casTokens(cas);
  const clauses = new Set<string>();
  for (const t of tokens) {
    for (const c of clauseMap.get(t) ?? []) clauses.add(c);
  }
  return Array.from(clauses).join(" / ");
}

// ---------------------------------------------------------------------------
// xlsx 출력 — 기존 5개 화관법 파일과 동일한 컬럼 순서
// (NO | CAS번호 | 영문명 | 국문명 | 기존 | 급성만성생태 | 사고대비 | 제한금지허가 | 중점 | 잔류 |
//  유해특성분류및혼합물함량기준(%) | 등록대상기존화학물질 | 기존물질여부)
// ---------------------------------------------------------------------------
const HEADER = [
  "NO",
  "CAS번호",
  "영문명",
  "국문명",
  "기존",
  "급성·만성·생태",
  "사고대비",
  "제한/금지/허가",
  "중점",
  "잔류",
  "유해특성분류 및 혼합물 함량기준(%)",
  "등록대상기존화학물질",
  "기존물질여부",
];

async function writeXlsx(fileName: string, entries: Entry[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(HEADER);
  entries.forEach((e, idx) => {
    ws.addRow([idx + 1, e.cas, e.nameEn, e.nameKr, "", "", "", "", "", "", thresholdRawFor(e.cas), "", ""]);
  });
  const filePath = path.join(OUT_DIR, fileName);
  await wb.xlsx.writeFile(filePath);
  console.log(`작성됨: ${fileName} (${entries.length}행)`);
}

async function main() {
  await writeXlsx("관리대상유해물질.xlsx", BP12_ALL);
  await writeXlsx("특별관리물질.xlsx", BP12_ALL.filter((e) => e.special));
  await writeXlsx("작업환경측정대상유해인자.xlsx", BP21_ALL);
  await writeXlsx("특수건강진단대상유해인자.xlsx", BP22_ALL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
