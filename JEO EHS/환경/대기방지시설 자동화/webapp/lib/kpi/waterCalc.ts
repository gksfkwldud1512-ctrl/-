// 용수관리 시설배치도의 "계산값" 산정 로직.
// 실측값이 없는 배관(보일러 보충수, 냉각탑 증발량)을 현장에서 확인된 설비 스펙으로 추정한다.
// 아래 상수들은 전부 사용자가 직접 확인해준 실측/스펙값이다 — 설비가 바뀌면 여기만 고치면 된다.

// 보일러 계열은 서로 다른 두 계통이라 별도로 산정한다(사용자 확인):
// ① 옆 온수탱크로 보충되는 물 — 월 360톤(=360㎥)으로 이미 실측/고정된 값
// ② 보일러 자체로 들어가는 물 — 500L/hr 유량이라 "한 달 몇 ㎥"인지는 가동시간을 곱해 계산해야 함
//    (냉각탑과 동일하게, 별도 가동시간 데이터가 없어 24시간 연속가동을 가정 — 실제 가동시간을
//    알면 이 가정만 바꾸면 된다)
/** 옆 온수탱크로 보충되는 월평균 보충수(톤=㎥, 실측 고정값). */
export const BOILER_TANK_MONTHLY_TON = 360;
export const BOILER_TANK_MONTHLY_M3 = BOILER_TANK_MONTHLY_TON; // 물 1톤 = 1㎥

/** 보일러 자체 유입 유량(스펙, 월 사용량은 daysInMonth 기준으로 별도 계산). */
export const BOILER_FLOW_RATE_LPH = 500;

/** 보일러 자체 사용량 — 24시간 연속가동 가정 하의 월간 ㎥. */
export function boilerOwnMonthlyM3(ym: string): number {
  return (BOILER_FLOW_RATE_LPH * 24 * daysInMonth(ym)) / 1000;
}

/** 보일러 계열(온수탱크 보충 + 보일러 자체) 월간 합계 ㎥ — 일반용수에서 이만큼을 뺀 나머지가 하수처리장으로 간다. */
export function boilerTotalMonthlyM3(ym: string): number {
  return BOILER_TANK_MONTHLY_M3 + boilerOwnMonthlyM3(ym);
}

/** 냉각탑(쿨링타워) 1대 스펙. */
export const COOLING_TOWER_CAPACITY_KCAL_HR = 1_170_000;
export const COOLING_TOWER_FLOW_LPM = 3900;

// 증발잠열 상수 재검증(웹 조사 결과, 2026-08):
// - 국제적으로 흔히 쓰는 근사식(Delta Cooling Towers 등)은 물의 끓는점(100℃) 기준 잠열
//   540 kcal/kg을 쓴다: 증발량 = 냉각열량(Q) / 540
// - 반면 국내 냉각탑 실무 자료(turbosolution 등 HVAC 엔지니어링 레퍼런스)는 냉각탑의 실제
//   운전온도(통상 20~35℃) 기준 잠열로 600 kcal/kg을 표준으로 쓴다: WE = Q/600
//   (물의 증발잠열은 온도가 낮을수록 커지므로, 100℃ 기준인 540보다 상온 기준인 600이
//   냉각탑 실제 운전조건에 더 가깝다 — 국내 냉각탑 설계 실무 관행을 그대로 채택)
// 이 사이트가 국내 사업장 설비라 국내 냉각탑 설계 표준값인 600을 기본값으로 쓴다.
// (국제 일반식 540을 쓰고 싶으면 이 상수만 540으로 바꾸면 됨 — 나머지 계산은 동일)
export const LATENT_HEAT_KCAL_PER_KG = 600;

/** 냉각탑 스펙(냉각용량 ÷ 증발잠열) 기준 이론 증발량 — 시간당 ㎥. */
export function coolingTowerEvaporationM3PerHour(): number {
  const kgPerHour = COOLING_TOWER_CAPACITY_KCAL_HR / LATENT_HEAT_KCAL_PER_KG;
  return kgPerHour / 1000; // 물 밀도 1000kg/㎥
}

// 스펙 정합성 교차검증용: 냉각탑은 통상 "냉각능력 1톤(냉동톤)당 순환수량 3GPM"을 표준으로
// 설계한다(국내외 냉각탑 실무 공통 기준). 국내 냉동톤 = 3,320 kcal/hr(KS 표준)로 환산하면,
// 이 설비의 냉각용량(1,170,000kcal/hr)에서 기대되는 순환유량을 역산해 스펙표의 3,900LPM과
// 비교할 수 있다 — 두 값이 비슷하면 입력한 스펙 자체가 서로 정합적이라는 뜻.
const REFRIGERATION_TON_KCAL_HR = 3320;
const GPM_PER_TON = 3;
const LITERS_PER_GALLON = 3.785;

export function coolingTowerRefrigerationTons(): number {
  return COOLING_TOWER_CAPACITY_KCAL_HR / REFRIGERATION_TON_KCAL_HR;
}

/** "냉각능력 1톤당 3GPM" 표준 설계기준으로 역산한 기대 순환유량(LPM) — 실제 스펙(3,900LPM)과 비교용. */
export function expectedFlowLpmFromCapacity(): number {
  return coolingTowerRefrigerationTons() * GPM_PER_TON * LITERS_PER_GALLON;
}

/** "YYYY-MM" -> 그 달의 일수. */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** 24시간 연속가동 가정 하의 냉각탑 월간 이론 증발량(㎥). */
export function coolingTowerEvaporationMonthly(ym: string): number {
  return coolingTowerEvaporationM3PerHour() * 24 * daysInMonth(ym);
}

/** 순환수(Water flow rate) 대비 증발률(%) — 통상 0.5~1.5% 범위면 스펙과 정합적이라는 참고용 검증치. */
export function evaporationRatePercentOfCirculation(): number {
  const evapLpm = (coolingTowerEvaporationM3PerHour() * 1000) / 60; // ㎥/hr -> L/min
  return (evapLpm / COOLING_TOWER_FLOW_LPM) * 100;
}
