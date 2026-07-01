// =============================================
// 설정값 - 나중에 실제 값으로 교체
// =============================================
const FIXED_TIMES = [3, 7, 9, 15, 17, 23]; // 판정 시각 (시)
const THRESHOLD = 33;                       // 쉬는시간 부여 기준 (평균 체감온도)
const PROCESS_NAMES = [
  '1P 성형-소결',
  '1P 소결-정형',
  '1P 후처리',
  '2P 성형-소결',
  '2P 소결-정형',
  '2P 선별포장',
];

const TICK_MS = 15000; // 판정 재계산 주기
const CLOCK_MS = 1000; // 시계만 갱신하는 주기

// 판정 시각(T) -> 화면 전환 시각(T-30분, 분 단위) 매핑, 오름차순 정렬
const REVEAL_TABLE = FIXED_TIMES
  .map(T => ({ T, revealMinutes: T * 60 - 30 }))
  .sort((a, b) => a.revealMinutes - b.revealMinutes);

const pad2 = n => String(n).padStart(2, '0');
const fmtHM = (h, m) => `${pad2(h)}:${pad2(m)}`;

// -------------------------------------------
// 시간 계산 (Asia/Seoul 고정, 전광판 PC의 OS 시간대 설정에 의존하지 않음)
// -------------------------------------------
function getSeoulParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  let hour = +parts.hour;
  if (hour === 24) hour = 0; // 일부 브라우저에서 자정을 24시로 반환하는 것 보정

  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour, minute: +parts.minute, second: +parts.second,
  };
}

const weekdayFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
function getSeoulWeekday(date = new Date()) {
  return weekdayFmt.format(date); // 예: '월', '화' ...
}

// 현재 시각이 어느 판정 세그먼트에 속하는지 계산 (자정 넘어가는 구간 포함, 순환 처리)
function getActiveT(nowMinutes) {
  for (let i = REVEAL_TABLE.length - 1; i >= 0; i--) {
    if (nowMinutes >= REVEAL_TABLE[i].revealMinutes) return REVEAL_TABLE[i].T;
  }
  // 첫 세그먼트의 reveal 시각보다 이른 새벽 시간대 -> 전날 마지막 세그먼트 결과 유지
  return REVEAL_TABLE[REVEAL_TABLE.length - 1].T;
}

// -------------------------------------------
// 데이터 연결 지점
// TODO: 하드웨어/API 연결 시 이 함수만 Supabase/AIR 플랫폼 호출로 교체
// (windowStart, windowEnd는 { h, m } 형태, 판정에 쓸 30분 측정창)
// -------------------------------------------
async function fetchWindowData(windowStart, windowEnd) {
  const baseAvg = testState.enabled ? testState.avg : 28 + Math.random() * 3;
  return PROCESS_NAMES.map(name => ({
    name,
    value: +(baseAvg + (Math.random() - 0.5) * 2).toFixed(1),
  }));
}

function computeDecision(readings) {
  const avg = readings.reduce((sum, r) => sum + r.value, 0) / readings.length;
  return { avg: +avg.toFixed(1), granted: avg >= THRESHOLD };
}

// -------------------------------------------
// 렌더링
// -------------------------------------------
function render(state) {
  document.getElementById('clock').textContent =
    `${pad2(state.parts.hour)}:${pad2(state.parts.minute)}:${pad2(state.parts.second)}`;
  document.getElementById('date').textContent =
    `${state.parts.year}년 ${pad2(state.parts.month)}월 ${pad2(state.parts.day)}일 (${getSeoulWeekday()})`;

  const screen = document.getElementById('screen');
  screen.className = 'screen ' + (state.decision.granted ? 'state-granted' : 'state-not-granted');

  document.getElementById('banner-time').textContent = state.breakLabel;
  document.getElementById('banner-text').textContent =
    state.decision.granted ? '쉬는시간 부여' : '쉬는시간 없음';

  document.getElementById('avg-temp').textContent = `${state.decision.avg}°C`;
  document.getElementById('window-range').textContent = `측정창: ${state.windowLabel}`;

  const grid = document.getElementById('process-grid');
  grid.innerHTML = '';
  state.readings.forEach(r => {
    const cell = document.createElement('div');
    cell.className = 'process-cell' + (r.value >= THRESHOLD ? ' over' : '');
    cell.innerHTML = `<div class="name">${r.name}</div><div class="value">${r.value}°C</div>`;
    grid.appendChild(cell);
  });
}

function updateClockOnly() {
  const parts = getCurrentParts();
  document.getElementById('clock').textContent =
    `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  document.getElementById('date').textContent =
    `${parts.year}년 ${pad2(parts.month)}월 ${pad2(parts.day)}일 (${getSeoulWeekday()})`;
}

// -------------------------------------------
// 테스트 패널 상태 (하드웨어 연결 전 화면 확인용 - 배포 시 board/index.html의
// test-panel 섹션과 이 블록을 함께 제거하면 됩니다)
// -------------------------------------------
const testState = { enabled: false, avg: 34.0, timeOverride: null };

function getCurrentParts() {
  if (testState.timeOverride) {
    const [h, m] = testState.timeOverride.split(':').map(Number);
    return { ...getSeoulParts(), hour: h, minute: m, second: 0 };
  }
  return getSeoulParts();
}

function setupTestPanel() {
  const enabledEl = document.getElementById('test-enabled');
  const avgEl = document.getElementById('test-avg');
  const timeEl = document.getElementById('test-time');
  const applyBtn = document.getElementById('test-apply');

  applyBtn.addEventListener('click', () => {
    testState.enabled = enabledEl.checked;
    testState.avg = parseFloat(avgEl.value) || 0;
    const t = timeEl.value.trim();
    testState.timeOverride = /^\d{1,2}:\d{2}$/.test(t) ? t : null;
    tick();
  });
}

// -------------------------------------------
// 메인 루프
// -------------------------------------------
async function tick() {
  const parts = getCurrentParts();
  const nowMinutes = parts.hour * 60 + parts.minute;
  const T = getActiveT(nowMinutes);

  const windowStart = { h: T - 1, m: 0 };
  const windowEnd = { h: T - 1, m: 30 };
  const breakStart = { h: T, m: 0 };
  const breakEnd = { h: T, m: 10 };

  const readings = await fetchWindowData(windowStart, windowEnd);
  const decision = computeDecision(readings);

  render({
    parts, T, readings, decision,
    windowLabel: `${fmtHM(windowStart.h, windowStart.m)} ~ ${fmtHM(windowEnd.h, windowEnd.m)}`,
    breakLabel: `${fmtHM(breakStart.h, breakStart.m)} ~ ${fmtHM(breakEnd.h, breakEnd.m)}`,
  });
}

function start() {
  setupTestPanel();
  tick();
  setInterval(tick, TICK_MS);
  setInterval(updateClockOnly, CLOCK_MS);
}

start();
