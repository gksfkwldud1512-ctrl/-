import type { TaskDef, TaskSettings } from "@/lib/types";

/** 설정(없으면 기본값)으로 해당 여부를 판단 — 모달에서 단일 업무용으로 사용 */
export function isEnabledSimple(task: TaskDef, settings: TaskSettings | undefined): boolean {
  return settings?.enabled ?? task.defaultEnabled;
}
