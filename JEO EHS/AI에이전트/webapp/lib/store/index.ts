import { buildSeed } from "../approval/seed";
import { MemoryStore } from "./memory";

// 개발 서버의 핫리로드에도 같은 인스턴스를 쓰도록 globalThis에 둔다.
const g = globalThis as unknown as { __ccStore?: MemoryStore };

export function getStore(): MemoryStore {
  return (g.__ccStore ??= new MemoryStore(buildSeed()));
}

/** 테스트 전용 */
export function resetStore(store?: MemoryStore) {
  g.__ccStore = store ?? new MemoryStore(buildSeed());
}
