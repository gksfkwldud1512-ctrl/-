// 화장실/샤워장/식당의 "기구" 종류별 이론 사용량(1회당 L) 기본값.
// 전부 환경부 절수설비 기준(수도법 시행규칙 [별표 2])·공중화장실 등의 설치기준 등
// 공식 자료를 근거로 한 출발점이며, 실제 설치된 제품이 다르면 UI에서 자유롭게 고쳐 쓴다.
export type FixtureType = "대변기" | "소변기" | "세면대" | "샤워기" | "기타";

export const FIXTURE_TYPES: FixtureType[] = ["대변기", "소변기", "세면대", "샤워기", "기타"];

export type FixturePreset = {
  defaultUnitUsageL: number; // 1회 사용량 기본값(L)
  sourceNote: string; // 근거/가정 설명 (UI에 그대로 노출)
};

export const FIXTURE_PRESETS: Record<FixtureType, FixturePreset | null> = {
  대변기: {
    defaultUnitUsageL: 6,
    sourceNote: "환경부 절수설비 기준(수도법 시행규칙 별표2) 1회 6L 이하 — 절수 1등급 제품은 4L 이하",
  },
  소변기: {
    defaultUnitUsageL: 2,
    sourceNote: "환경부 절수설비 기준 1회 2L 이하 — 절수 1등급 제품은 0.6L 이하",
  },
  세면대: {
    defaultUnitUsageL: 1.5,
    sourceNote: "공중화장실 등의 설치기준: 수도꼭지 분당 5L 이하. 1회 사용시간을 약 18초로 가정해 1회당 1.5L로 환산(가정값, 실제 사용습관에 따라 조정 필요)",
  },
  샤워기: {
    defaultUnitUsageL: 37.5,
    sourceNote:
      "환경부 절수기준 분당 7.5L 이하 × 5분 사용 가정 = 37.5L/회. 단, 실사용 통념상 5분 샤워 시 약 60L 정도 쓴다는 자료도 있어 실제 습관에 따라 더 크게 조정될 수 있음",
  },
  기타: null, // 프리셋 없음 — 사용자가 직접 사용량을 입력
};
