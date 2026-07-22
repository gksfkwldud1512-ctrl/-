import { FACILITIES, POWER_FACILITIES, daysInMonth, dateCode } from "./facilities";

export type BoilerUnit = 0 | 1 | 2; // 0=휴무, 1=1호기, 2=2호기
export type Calendar = Record<number, BoilerUnit>; // day -> 배정

export type MeterReading = { first: number; last: number };
export type MeterReadings = Record<string, MeterReading>; // facility.key -> reading

export function isWorkday(calendar: Calendar, day: number): boolean {
  return (calendar[day] ?? 0) !== 0;
}

export function countWorkdays(calendar: Calendar, year: number, month: number): number {
  const n = daysInMonth(year, month);
  let count = 0;
  for (let d = 1; d <= n; d++) if (isWorkday(calendar, d)) count++;
  return count;
}

export type GongdongRow = {
  outletFacilityId: string;
  outletSerial: string;
  permitOutletSerial: string;
  outletName: string;
  date: string;
  hours: number;
  minutes: number;
};

export function computeGongdongRows(year: number, month: number, calendar: Calendar): GongdongRow[] {
  const n = daysInMonth(year, month);
  const rows: GongdongRow[] = [];
  for (const f of FACILITIES) {
    for (let d = 1; d <= n; d++) {
      const assigned = calendar[d] ?? 0;
      const running = f.isBoiler ? assigned === f.boilerUnit : assigned !== 0;
      rows.push({
        outletFacilityId: f.outletFacilityId,
        outletSerial: f.outletSerial,
        permitOutletSerial: f.permitOutletSerial,
        outletName: f.outletName,
        date: dateCode(year, month, d),
        hours: running ? 24 : 0,
        minutes: 0,
      });
    }
  }
  return rows;
}

export type UnjeonRow = {
  outletSerial: string;
  permitOutletSerial: string;
  outletName: string;
  preventionFacilityId: string;
  preventionSerial: string;
  permitPreventionNo: string;
  preventionName: string;
  meterNo: string;
  date: string;
  reading: number; // 보일러(계량기 없음)는 항상 0
};

// 일별 누적 계량값 계산: 근무일마다 (마지막-첫날)/근무일수 만큼 균등 증가, 비근무일은 직전값 유지
export function computeDailyMeterValues(
  year: number,
  month: number,
  calendar: Calendar,
  first: number,
  last: number,
): number[] {
  const n = daysInMonth(year, month);
  const workdays = countWorkdays(calendar, year, month);
  const increment = workdays > 0 ? (last - first) / workdays : 0;
  const values: number[] = [];
  let cumulative = first;
  for (let d = 1; d <= n; d++) {
    if (isWorkday(calendar, d)) cumulative += increment;
    values.push(Math.round(cumulative * 100) / 100);
  }
  return values;
}

export function computeUnjeonRows(
  year: number,
  month: number,
  calendar: Calendar,
  meterReadings: MeterReadings,
): UnjeonRow[] {
  const n = daysInMonth(year, month);
  const rows: UnjeonRow[] = [];
  for (const f of FACILITIES) {
    let dailyValues: number[] | null = null;
    if (!f.isBoiler) {
      const reading = meterReadings[f.key] ?? { first: 0, last: 0 };
      dailyValues = computeDailyMeterValues(year, month, calendar, reading.first, reading.last);
    }
    for (let d = 1; d <= n; d++) {
      rows.push({
        outletSerial: f.outletSerial,
        permitOutletSerial: f.permitOutletSerial,
        outletName: f.outletName,
        preventionFacilityId: f.preventionFacilityId,
        preventionSerial: f.preventionSerial,
        permitPreventionNo: f.permitPreventionNo,
        preventionName: f.preventionName,
        meterNo: f.meterNo,
        date: dateCode(year, month, d),
        reading: dailyValues ? dailyValues[d - 1] : 0,
      });
    }
  }
  return rows;
}

export { FACILITIES, POWER_FACILITIES };
