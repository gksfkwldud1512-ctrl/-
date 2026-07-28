import { FISCAL_MONTHS, type MonthlyPoint } from "@/lib/kpi/parseDetails";

function formatValue(v: number | undefined, decimals: number): string {
  if (v === undefined) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

export function KpiTable({
  title,
  unit,
  points,
  decimals = 1,
}: {
  title: string;
  unit: string;
  points: MonthlyPoint[];
  decimals?: number;
}) {
  const fiscalYears = Array.from(new Set(points.map((p) => p.fiscalYear))).sort();
  const byKey = new Map(points.map((p) => [`${p.fiscalYear}|${p.month}`, p.value]));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-zinc-500">단위: {unit}</p>
      </div>
      {fiscalYears.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-400">데이터가 없습니다. 아래에서 파일을 업로드해 주세요.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium sticky left-0 bg-zinc-50">회계연도</th>
                {FISCAL_MONTHS.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fiscalYears.map((fy) => (
                <tr key={fy}>
                  <td className="px-3 py-2 font-medium text-zinc-700 sticky left-0 bg-white whitespace-nowrap">
                    {fy}
                  </td>
                  {FISCAL_MONTHS.map((m) => (
                    <td key={m} className="px-2 py-2 text-right text-zinc-600">
                      {formatValue(byKey.get(`${fy}|${m}`), decimals)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
