/** 가운데 허브 로봇 — 참고 이미지의 푸른 빛나는 로봇 + 육각 받침대를 SVG로 그렸다. */
export function Robot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 330" className={className} role="img" aria-label="JEO EHS 에이전트 허브 로봇">
      <defs>
        <radialGradient id="rb-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#50c0f0" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#288ce4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#288ce4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f7fd8" />
          <stop offset="100%" stopColor="#0d3f86" />
        </linearGradient>
        <linearGradient id="rb-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4aa6f0" />
          <stop offset="100%" stopColor="#1c63b8" />
        </linearGradient>
        <linearGradient id="rb-plat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14456f" />
          <stop offset="100%" stopColor="#0a2540" />
        </linearGradient>
        <filter id="rb-blur"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      {/* 후광 */}
      <circle className="hub-glow" cx="150" cy="150" r="140" fill="url(#rb-halo)" />
      <circle cx="150" cy="150" r="118" fill="none" stroke="#50c0f0" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="150" cy="150" r="132" fill="none" stroke="#50c0f0" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="3 7" />

      {/* 육각 받침대 */}
      <polygon points="150,236 262,258 262,284 150,310 38,284 38,258" fill="url(#rb-plat)" stroke="#50c0f0" strokeOpacity="0.7" strokeWidth="1.5" />
      <polygon points="150,246 236,262 236,280 150,298 64,280 64,262" fill="none" stroke="#50c0f0" strokeOpacity="0.45" />
      <ellipse cx="150" cy="262" rx="70" ry="9" fill="#50c0f0" opacity="0.35" filter="url(#rb-blur)" />

      {/* 몸통 */}
      <path d="M78 258 C78 205 108 182 150 182 C192 182 222 205 222 258 Z" fill="url(#rb-body)" stroke="#7fd0ff" strokeOpacity="0.6" />
      <rect x="112" y="205" width="76" height="26" rx="13" fill="#0a2d5e" opacity="0.7" />
      <circle cx="150" cy="218" r="5" fill="#50c0f0" />

      {/* 머리 */}
      <rect x="86" y="86" width="128" height="104" rx="46" fill="url(#rb-head)" stroke="#9adcff" strokeOpacity="0.7" />
      <rect x="104" y="108" width="92" height="58" rx="28" fill="#08203f" stroke="#50c0f0" strokeOpacity="0.5" />
      <ellipse cx="128" cy="137" rx="9" ry="11" fill="#7fe3ff" />
      <ellipse cx="172" cy="137" rx="9" ry="11" fill="#7fe3ff" />
      <ellipse cx="128" cy="137" rx="14" ry="16" fill="#50c0f0" opacity="0.25" filter="url(#rb-blur)" />
      <ellipse cx="172" cy="137" rx="14" ry="16" fill="#50c0f0" opacity="0.25" filter="url(#rb-blur)" />
      {/* 귀 + 안테나 */}
      <rect x="70" y="124" width="16" height="36" rx="8" fill="#1c63b8" stroke="#9adcff" strokeOpacity="0.6" />
      <rect x="214" y="124" width="16" height="36" rx="8" fill="#1c63b8" stroke="#9adcff" strokeOpacity="0.6" />
      <line x1="150" y1="86" x2="150" y2="68" stroke="#9adcff" strokeWidth="3" />
      <circle cx="150" cy="64" r="6" fill="#50c0f0" />
    </svg>
  );
}
