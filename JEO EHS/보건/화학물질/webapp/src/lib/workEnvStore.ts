import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { EMPTY_STATE, type WorkEnvState } from "@/lib/workEnv";

// 작업환경측정 예비조사 상태(야간근무자 체크·제외 확인)를 한 줄 JSON으로 저장한다.
// - 기존 테이블과 무관한 독립 테이블이며, 첫 저장 때 CREATE TABLE IF NOT EXISTS로 만든다
//   (이 DB에는 다른 앱 테이블도 있어 drizzle-kit push를 쓰지 않는다).
// - 이 앱의 Blob 저장소는 공개 전용이라 이름이 들어가는 데이터를 Blob에 두지 않는다.
const STATE_ID = "default";

type Rows = { rows?: { data: WorkEnvState }[] } | { data: WorkEnvState }[];

function firstRow(res: Rows): { data: WorkEnvState } | undefined {
  return Array.isArray(res) ? res[0] : res.rows?.[0];
}

/** 읽기 전용 — 테이블이 아직 없으면 빈 상태를 돌려주고 아무것도 만들지 않는다. */
export async function loadWorkEnvState(): Promise<WorkEnvState> {
  try {
    const res = (await db.execute(sql`SELECT data FROM work_env_state WHERE id = ${STATE_ID}`)) as unknown as Rows;
    const row = firstRow(res);
    if (!row) return { ...EMPTY_STATE };
    const d = row.data;
    return {
      updatedAt: d.updatedAt ?? "",
      nightWorkers: Array.isArray(d.nightWorkers) ? d.nightWorkers : [],
      exclusions: d.exclusions && typeof d.exclusions === "object" ? d.exclusions : {},
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function ensureTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS work_env_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/** 읽고-고치고-쓰기. 요청이 짧아 동시 저장 충돌은 마지막 저장 우선으로 둔다. */
export async function updateWorkEnvState(mutate: (s: WorkEnvState) => void): Promise<WorkEnvState> {
  await ensureTable();
  const state = await loadWorkEnvState();
  mutate(state);
  state.updatedAt = new Date().toISOString();
  await db.execute(sql`INSERT INTO work_env_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${JSON.stringify(state)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`);
  return state;
}
