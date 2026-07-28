// 대기방지시설 SEMS 업로드용 설비 고정 메타데이터
// 6_26년 대기운영기록부.xlsx_260722 실제 업로드 파일에서 추출한 값 그대로 사용

export type Facility = {
  key: string;
  // 배출구가동시간목록양식 컬럼
  outletFacilityId: string; // 배출구시설ID
  outletSerial: string; // 배출구일련번호
  permitOutletSerial: string; // 허가증상배출구일련번호
  outletName: string; // 배출구명
  // 시설운전사항목록양식 컬럼
  preventionFacilityId: string; // 방지시설ID
  preventionSerial: string; // 방지시설일련번호
  permitPreventionNo: string; // 허가증상방지시설번호
  preventionName: string; // 방지시설명
  meterNo: string; // 적산전력계번호 ("0"=계량기 없음, 전력검침량 항상 0)
  isBoiler: boolean;
  boilerUnit?: 1 | 2; // 보일러 설비만 해당
};

export const FACILITIES: Facility[] = [
  {
    key: "corbon-tower-120",
    outletFacilityId: "FCL000131458",
    outletSerial: "1",
    permitOutletSerial: "방-3",
    outletName: "흡착시설-120",
    preventionFacilityId: "FCL000293095",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "Corbon-Tower(120㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "gas-scrubber-50",
    outletFacilityId: "FCL000131459",
    outletSerial: "3",
    permitOutletSerial: "방-4",
    outletName: "세정 집진시설-50",
    preventionFacilityId: "FCL000293096",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "GAS-SCRUBBER(50㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "bag-filter-165",
    outletFacilityId: "FCL000131460",
    outletSerial: "4",
    permitOutletSerial: "방-2",
    outletName: "여과집진시설-165",
    preventionFacilityId: "FCL000293097",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "BAG-FILTER(165N㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "bag-filter-500",
    outletFacilityId: "FCL000131461",
    outletSerial: "5",
    permitOutletSerial: "방-1",
    outletName: "여과집진시설-500",
    preventionFacilityId: "FCL000293098",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "BAG-FILTER(500㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "rto-250",
    outletFacilityId: "FCL000131462",
    outletSerial: "6",
    permitOutletSerial: "방-5",
    outletName: "방지시설면제(RTO)-250",
    preventionFacilityId: "FCL000293099",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "축열식산화설비(RTO-250㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "bag-filter-60",
    outletFacilityId: "FCL000131463",
    outletSerial: "7",
    permitOutletSerial: "방-6",
    outletName: "여과집진시설-60",
    preventionFacilityId: "FCL000293100",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "BAG-FILTER(60㎥/min)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "bag-filter-300",
    outletFacilityId: "FCL000131464",
    outletSerial: "8",
    permitOutletSerial: "방-7",
    outletName: "여과집진시설-300",
    preventionFacilityId: "FCL000293101",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "BAG- FILTER(300㎥)",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "bag-filter-60-2",
    outletFacilityId: "FCL000131465",
    outletSerial: "9",
    permitOutletSerial: " 방-8",
    outletName: "여과집진시설-60(2)",
    preventionFacilityId: "FCL000293102",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "BAG-FILTER(60㎥/min)(2) ",
    meterNo: "1",
    isBoiler: false,
  },
  {
    key: "boiler-1",
    outletFacilityId: "FCL000131466",
    outletSerial: "10",
    permitOutletSerial: "보일러",
    outletName: "보일러",
    preventionFacilityId: "FCL000293104",
    preventionSerial: "2",
    permitPreventionNo: "2",
    preventionName: "저녹스버너",
    meterNo: "0",
    isBoiler: true,
    boilerUnit: 1,
  },
  {
    key: "boiler-2",
    outletFacilityId: "FCL000131467",
    outletSerial: "11",
    permitOutletSerial: "11",
    outletName: "보일러2",
    preventionFacilityId: "FCL000293105",
    preventionSerial: "1",
    permitPreventionNo: "1",
    preventionName: "저녹스버너(2)",
    meterNo: "0",
    isBoiler: true,
    boilerUnit: 2,
  },
];

export const POWER_FACILITIES = FACILITIES.filter((f) => !f.isBoiler);

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dateCode(year: number, month: number, day: number): string {
  return `${year}${pad2(month)}${pad2(day)}`;
}
