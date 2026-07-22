"use client";

import { useEffect, useState } from "react";
import CalendarGrid from "@/components/Calendar";
import MeterInputs from "@/components/MeterInputs";
import { POWER_FACILITIES } from "@/lib/facilities";
import type { Calendar, MeterReadings } from "@/lib/calc";
import { countWorkdays } from "@/lib/calc";

const today = new Date();

function calendarKey(year: number, month: number) {
  return `atm:calendar:${year}-${month}`;
}
function metersKey(year: number, month: number) {
  return `atm:meters:${year}-${month}`;
}
function lastKnownKey(facilityKey: string) {
  return `atm:lastKnown:${facilityKey}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [calendar, setCalendar] = useState<Calendar>({});
  const [meters, setMeters] = useState<MeterReadings>({});
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // 연/월 변경 시 저장된 데이터 로드 (없으면 지난달 마지막 전력계 값으로 첫날 값 미리 채움)
  useEffect(() => {
    const savedCalendar = loadJSON<Calendar>(calendarKey(year, month), {});
    const savedMeters = loadJSON<MeterReadings>(metersKey(year, month), {});
    const filled: MeterReadings = { ...savedMeters };
    for (const f of POWER_FACILITIES) {
      if (!filled[f.key]) {
        const lastKnown = loadJSON<number | null>(lastKnownKey(f.key), null);
        filled[f.key] = { first: lastKnown ?? 0, last: 0 };
      }
    }
    setCalendar(savedCalendar);
    setMeters(filled);
    setLoaded(true);
  }, [year, month]);

  // 변경사항 저장
  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(calendarKey(year, month), JSON.stringify(calendar));
  }, [calendar, year, month, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(metersKey(year, month), JSON.stringify(meters));
    for (const f of POWER_FACILITIES) {
      const r = meters[f.key];
      if (r && r.last) {
        window.localStorage.setItem(lastKnownKey(f.key), JSON.stringify(r.last));
      }
    }
  }, [meters, year, month, loaded]);

  const workdayCount = countWorkdays(calendar, year, month);

  async function download(kind: "gongdong" | "unjeon") {
    setDownloading(kind);
    try {
      const res = await fetch(`/api/xlsx/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, calendar, meterReadings: meters }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)$/);
      const filename = match ? decodeURIComponent(match[1]) : `${kind}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("다운로드 중 오류가 발생했습니다: " + (e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 1 + i);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        <header>
          <h1 className="text-xl font-bold">대기방지시설 운영기록부 자동생성</h1>
          <p className="text-sm text-neutral-500 mt-1">
            근무일과 전력계 첫/마지막 값만 입력하면 SEMS 업로드용 표준 양식(가동시간, 시설운전사항)을 자동으로
            생성합니다.
          </p>
        </header>

        <section className="flex items-center gap-3">
          <select
            className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </section>

        <section>
          <h2 className="font-semibold mb-2">1. 근무일 · 보일러 배정</h2>
          <CalendarGrid year={year} month={month} calendar={calendar} onChange={setCalendar} />
        </section>

        <section>
          <h2 className="font-semibold mb-2">2. 설비별 전력계 값</h2>
          <MeterInputs readings={meters} onChange={setMeters} workdayCount={workdayCount} />
        </section>

        <section className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => download("gongdong")}
            disabled={downloading !== null}
            className="flex-1 rounded-md bg-blue-600 text-white py-2 text-sm font-medium disabled:opacity-50"
          >
            {downloading === "gongdong" ? "생성 중..." : "가동시간 파일 다운로드"}
          </button>
          <button
            type="button"
            onClick={() => download("unjeon")}
            disabled={downloading !== null}
            className="flex-1 rounded-md bg-amber-600 text-white py-2 text-sm font-medium disabled:opacity-50"
          >
            {downloading === "unjeon" ? "생성 중..." : "시설운전사항 파일 다운로드"}
          </button>
        </section>

        <footer className="text-xs text-neutral-400 text-center">
          입력한 데이터는 이 브라우저에만 저장됩니다 (서버 저장 없음).
        </footer>
      </main>
    </div>
  );
}
