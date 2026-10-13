import { TASK_CATALOG } from "@/lib/taskCatalog";
import { loadRecords, loadSettings } from "@/lib/store";
import { loadAutoBundle } from "@/lib/sources";
import { StatusBoard } from "@/components/StatusBoard";

export const dynamic = "force-dynamic";

/** 한국 시간 기준 오늘(연·월·일) */
function seoulToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const today = seoulToday();
  const year = Number(yearParam) || today.year;

  const [settings, records, bundle] = await Promise.all([loadSettings(), loadRecords(), loadAutoBundle(year, today)]);
  const tasks = [...TASK_CATALOG, ...bundle.dynamicTasks];

  return <StatusBoard year={year} today={today} tasks={tasks} settings={settings} records={records} autoByTask={bundle.autoByTask} />;
}
