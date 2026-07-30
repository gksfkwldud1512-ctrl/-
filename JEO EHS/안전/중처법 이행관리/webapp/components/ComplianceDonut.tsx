// 순수 SVG로 그리는 도넛(원형) 진행률 차트 — 별도 차트 라이브러리 의존성 없이, 이 프로젝트의 다른
// webapp(안전 피라미드 SVG 등)과 동일한 방식으로 strokeDasharray/strokeDashoffset 트릭을 쓴다.
export function ComplianceDonut({
  percent,
  size = 96,
  strokeWidth = 10,
  label,
}: {
  /** 0~100, null이면 "해당없음"으로 표시(적용 대상이 아닌 항목). */
  percent: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  if (percent === null) {
    return (
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e4e4e7" strokeWidth={strokeWidth} strokeDasharray="4 4" />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-xs font-semibold text-zinc-400">해당없음</span>
        </div>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 80 ? "#16a34a" : clamped >= 40 ? "#F58220" : "#a1a1aa";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eeeeee" strokeWidth={strokeWidth} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold" style={{ color }}>{clamped}%</span>
        {label && <span className="text-[10px] text-zinc-500">{label}</span>}
      </div>
    </div>
  );
}
