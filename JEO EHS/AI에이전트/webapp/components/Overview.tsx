"use client";

import type { AgentId, AgentState } from "@/lib/types";
import { AgentCard } from "./AgentCard";
import { Robot } from "./Robot";

// 가운데 캔버스는 viewBox 1000×900 기준 좌표를 쓴다(카드는 퍼센트 위치, 화살표는 SVG).
type Slot = { id: AgentId; left: string; top: string };
const TOP = "0%";
const BOTTOM = "80%";
const SLOTS: Slot[] = [
  { id: "safety", left: "0%", top: TOP }, { id: "legal", left: "35%", top: TOP }, { id: "environment", left: "70%", top: TOP },
  { id: "report", left: "0%", top: BOTTOM }, { id: "action", left: "35%", top: BOTTOM }, { id: "qa", left: "70%", top: BOTTOM },
];

// 번호 화살표(참고 이미지의 1~6 흐름) — 카드 ↔ 허브
const ARROWS = [
  { n: 1, label: "안전 점검", d: "M150 188 C150 295 250 345 385 365", lx: 60, ly: 300 },
  { n: 2, label: "법령 검토", d: "M500 188 L500 226", lx: 520, ly: 214 },
  { n: 3, label: "환경 점검", d: "M850 188 C850 295 750 345 615 365", lx: 760, ly: 300 },
  { n: 4, label: "보고 초안", d: "M395 470 C250 490 150 570 150 714", lx: 60, ly: 580 },
  { n: 5, label: "승인 후 실행", d: "M500 676 L500 714", lx: 520, ly: 702 },
  { n: 6, label: "QA 검증", d: "M605 470 C750 490 850 570 850 714", lx: 760, ly: 580 },
] as const;

export function Overview({
  states, selected, onSelect,
}: { states: AgentState[]; selected: AgentId | null; onSelect: (id: AgentId | null) => void }) {
  const stateOf = (id: AgentId) => states.find((s) => s.id === id)!;
  const toggle = (id: AgentId) => onSelect(selected === id ? null : id);

  return (
    <section aria-label="가상 AI 사무실">
      {/* 넓은 화면: 사진과 같은 허브 + 화살표 구도 */}
      <div className="relative mx-auto hidden aspect-[1000/900] w-full max-w-[860px] lg:block">
        <svg viewBox="0 0 1000 900" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <marker id="arrow" markerWidth="12" markerHeight="12" refX="8" refY="6" orient="auto">
              <path d="M1 1 L10 6 L1 11 Z" fill="#0b8fc4" />
            </marker>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {ARROWS.map((a) => (
            <g key={a.n}>
              <path d={a.d} fill="none" stroke="#0b8fc4" strokeOpacity="0.18" strokeWidth="6" filter="url(#glow)" />
              <path d={a.d} fill="none" stroke="#0b8fc4" strokeWidth="2.5" className="flow-line" markerEnd="url(#arrow)" />
              <text x={a.lx} y={a.ly} fill="#0f2a44" fontSize="21" fontWeight="600" style={{ paintOrder: "stroke" }} stroke="#f4f8fc" strokeWidth="5">{a.n}. {a.label}</text>
            </g>
          ))}
        </svg>

        {SLOTS.map((s) => (
          <div key={s.id} className="absolute w-[30%]" style={{ left: s.left, top: s.top, height: "20%" }}>
            <AgentCard state={stateOf(s.id)} selected={selected === s.id} onSelect={() => toggle(s.id)} compact />
          </div>
        ))}

        <div className="pointer-events-none absolute left-1/2 top-[26.1%] w-[34%] -translate-x-1/2">
          <Robot className="w-full" />
          <div className="-mt-1 text-center">
            <div className="text-lg font-bold tracking-wide text-white">JEO EHS AGENT</div>
            <div className="text-xs text-sky-200/80">안전한 업무 흐름을 조율합니다</div>
          </div>
        </div>
      </div>

      {/* 좁은 화면: 허브 + 카드 격자 */}
      <div className="lg:hidden">
        <div className="mx-auto w-48"><Robot className="w-full" /></div>
        <div className="-mt-2 mb-3 text-center">
          <div className="font-bold text-white">JEO EHS AGENT</div>
          <div className="text-xs text-sky-200/80">안전한 업무 흐름을 조율합니다</div>
        </div>
        <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {SLOTS.map((s) => (
            <li key={s.id}><AgentCard state={stateOf(s.id)} selected={selected === s.id} onSelect={() => toggle(s.id)} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
