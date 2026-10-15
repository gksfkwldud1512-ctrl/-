import Link from "next/link";
import { getAllEmployees, getDashboardData } from "@/lib/db/repo";
import { loadWorkEnvState } from "@/lib/workEnvStore";
import { buildProcesses, EXCLUSION_CRITERIA } from "@/lib/workEnv";
import { GUIDE_ITEMS, GUIDE_NOTICE } from "@/lib/workEnvGuide";
import { WorkEnvBoard } from "@/components/WorkEnvBoard";

export const dynamic = "force-dynamic";

export default async function WorkEnvPage() {
  const [employees, rows, state] = await Promise.all([getAllEmployees(), getDashboardData(), loadWorkEnvState()]);
  const processes = buildProcesses(employees, rows, state);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">작업환경측정 예비조사</h1>
        <p className="mt-1 text-sm text-zinc-500">
          공정별 인원·야간근무자와, 공정에서 쓰는 부자재 중 작업환경측정 대상 물질을 확인합니다. 단시간·임시작업은 사용시간을
          입력해 제외 후보를 확인하고, 담당자가 확인해야 제외로 확정됩니다.
        </p>
      </div>

      <WorkEnvBoard
        processes={processes}
        updatedAt={state.updatedAt}
        criteria={{ ...EXCLUSION_CRITERIA }}
        guide={{ notice: GUIDE_NOTICE, items: GUIDE_ITEMS }}
      />
    </main>
  );
}
