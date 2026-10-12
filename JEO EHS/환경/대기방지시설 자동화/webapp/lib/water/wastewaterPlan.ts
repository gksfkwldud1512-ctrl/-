import { lastSixDigits, type Manifest } from "./manifests";

export const MAX_STORAGE_M3 = 36; // 폐수 보관 한도
export const START_STORAGE_M3 = 1; // 1/1 시작 보관량
export const RESIDUAL_AFTER_HAUL_M3 = 8; // 위탁 직후 남겨 둘 보관량(목표)

export type LogDay = {
  date: string; // YYYY-MM-DD
  water: number; // 용수사용량(㎥)  (폐수발생량과 동일)
  waste: number; // 폐수발생량(㎥)
  haul: number; // 위탁량(㎥), 없으면 0
  serials: string[]; // 위탁·수탁 확인서 일련번호
  companies: string[]; // 처리업소명
  storage: number; // 그날 마감 보관폐수량(㎥)
};

export type LogPlan = {
  year: number;
  days: LogDay[];
  maxStorage: number; // 위탁 직전 기준 최대 보관량
  warnings: string[];
};

const UNIT = 10; // 0.1㎥ 단위로 정수 계산해 부동소수 오차를 피한다
const toUnits = (v: number) => Math.round(v * UNIT);
const fromUnits = (u: number) => u / UNIT;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

/**
 * total(0.1㎥ 단위)을 n일에 최대한 고르게 나눈다(나머지는 구간 안에 흩어 배치).
 * 합이 정수 ㎥이면 하루 값도 정수 ㎥가 되도록 1㎥ 단위로 나눈다(일지가 읽기 쉬움).
 */
function spread(total: number, n: number): number[] {
  const step = total % UNIT === 0 ? UNIT : 1;
  const t = total / step;
  const base = Math.floor(t / n);
  const rem = t - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = Math.floor(((i + 1) * rem) / n) - Math.floor((i * rem) / n);
    out.push((base + extra) * step);
  }
  return out;
}

/**
 * 위탁(인계) 내역으로 해당 연도 1/1부터 마지막 인계일까지의 폐수일지를 계산한다.
 * - 용수사용량 = 폐수발생량(매일 동일)
 * - 1/1 보관량 = 1㎥ 에서 시작, 위탁 직후에는 RESIDUAL(기본 8㎥)을 남긴다.
 *   (위탁량 + 잔량이 36㎥를 넘으면 잔량을 줄여 보관량 ≤ 36 을 지킨다)
 * - 보관량(마감) = 전일 보관량 + 당일 폐수발생량 − 당일 위탁량
 * - 구간(직전 위탁일 다음날 ~ 이번 위탁일)의 발생량 합 = 이번 위탁량 + 위탁 후 잔량 − 직전 잔량
 */
export function buildWastewaterPlan(manifests: Manifest[], year: number): LogPlan {
  const warnings: string[] = [];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // 같은 날 여러 건은 하루 한 줄로 합친다.
  const byDate = new Map<string, { amount: number; serials: string[]; companies: Set<string> }>();
  for (const m of manifests) {
    if (m.date < yearStart || m.date > yearEnd) continue;
    const g = byDate.get(m.date) ?? { amount: 0, serials: [], companies: new Set<string>() };
    g.amount += m.amountM3;
    g.serials.push(lastSixDigits(m.serialNo)); // 저장된 값과 무관하게 항상 뒤 6자리
    if (m.company) g.companies.add(m.company);
    byDate.set(m.date, g);
  }
  const haulDates = Array.from(byDate.keys()).sort();
  if (haulDates.length === 0) return { year, days: [], maxStorage: 0, warnings: ["해당 연도의 인계 내역이 없습니다."] };

  const days: LogDay[] = [];
  let prevEnd = addDays(yearStart, -1); // 직전 위탁일(없으면 1/1 하루 전)
  let storageUnits = 0; // 직전 마감 보관량
  let first = true;
  const maxU = toUnits(MAX_STORAGE_M3);

  for (const hd of haulDates) {
    const g = byDate.get(hd)!;
    const k = toUnits(g.amount);
    let residual = toUnits(RESIDUAL_AFTER_HAUL_M3);
    if (k + residual > maxU) {
      residual = Math.max(0, maxU - k);
      warnings.push(`${hd}: 위탁량 ${g.amount}㎥ + 잔량이 ${MAX_STORAGE_M3}㎥를 넘어 위탁 후 잔량을 ${fromUnits(residual)}㎥로 줄였습니다.`);
    }
    if (k > maxU) warnings.push(`${hd}: 위탁량 ${g.amount}㎥가 보관 한도 ${MAX_STORAGE_M3}㎥보다 큽니다.`);

    const len = diffDays(prevEnd, hd); // 구간 일수(위탁일 포함)
    let generated = k + residual - storageUnits;
    if (generated < 0) {
      // 직전 잔량이 이번 위탁량+잔량보다 큰 경우: 발생량 0으로 두고 잔량을 맞춘다
      warnings.push(`${hd}: 인계량이 작아 구간 발생량이 음수가 되어 0으로 보정했습니다.`);
      generated = 0;
    }

    let perDay: number[];
    if (first) {
      // 1/1 은 시작 보관량 1㎥ 이 되도록 고정하고 나머지를 나눈다.
      const firstDay = Math.min(toUnits(START_STORAGE_M3), generated);
      perDay = len === 1 ? [generated] : [firstDay, ...spread(generated - firstDay, len - 1)];
    } else {
      perDay = spread(generated, len);
    }

    for (let i = 0; i < len; i++) {
      const date = addDays(prevEnd, i + 1);
      const isHaul = date === hd;
      storageUnits += perDay[i] - (isHaul ? k : 0);
      days.push({
        date,
        water: fromUnits(perDay[i]),
        waste: fromUnits(perDay[i]),
        haul: isHaul ? fromUnits(k) : 0,
        serials: isHaul ? g.serials : [],
        companies: isHaul ? Array.from(g.companies) : [],
        storage: fromUnits(storageUnits),
      });
    }
    prevEnd = hd;
    first = false;
  }

  const maxStorage = Math.max(...days.map((d) => d.storage + d.haul));
  if (maxStorage > MAX_STORAGE_M3) warnings.push(`보관 폐수량이 ${MAX_STORAGE_M3}㎥를 넘는 날이 있습니다 (최대 ${maxStorage}㎥).`);
  if (days.some((d) => d.storage < 0)) warnings.push("보관 폐수량이 음수가 되는 날이 있습니다.");
  return { year, days, maxStorage, warnings };
}
