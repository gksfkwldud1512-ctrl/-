import Link from "next/link";
import { getEmployeeCount, getEmployeeSummaryByDepartment } from "@/lib/db/repo";
import { EmployeeRosterUploadForm } from "@/components/EmployeeRosterUploadForm";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const [total, summary] = await Promise.all([getEmployeeCount(), getEmployeeSummaryByDepartment()]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">임직원 명부 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          부서/공정(포지션) 드롭다운과 부서별 교육명단(서명지)에 쓰이는 사원명부입니다. 신규입사자나
          인원변경이 있으면 최신 엑셀 파일을 그대로 업로드해 전체를 교체하세요.
        </p>
      </div>

      <EmployeeRosterUploadForm />

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-700">현재 등록된 인원: {total}명</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-medium">부서</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">포지션(공정)별 인원</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">합계</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {summary.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-zinc-400">
                  등록된 사원명부가 없습니다. 위에서 xlsx를 업로드해 주세요.
                </td>
              </tr>
            )}
            {summary.map((d) => (
              <tr key={d.department}>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-800">{d.department}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {d.positions.map((p) => `${p.label}(${p.count})`).join(", ")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{d.total}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
