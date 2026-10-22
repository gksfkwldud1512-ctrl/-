// ── 카카오톡 메시지 API: 매일 단가표를 나 + 팀원(가족)에게 발송 ─────────
// 카카오 개발자 앱의 팀원에게는 검수 없이 하루 30건까지 무료 발송 가능
// 설정·토큰은 data/kakao_settings.json (커밋 안 함)
const fs   = require('fs');
const path = require('path');

const KAUTH = 'https://kauth.kakao.com';
const KAPI  = 'https://kapi.kakao.com';
const TEXT_MAX = 200;              // 텍스트 템플릿 글자 수 한도
const SEND_FROM = 9, SEND_UNTIL = 21; // 이 시간대에만 자동 발송 (늦게 켜진 날은 생략)
const NEARBY_COUNT = 5;

const SETTINGS_DEFAULT = {
  restKey: '',
  clientSecret: '',
  tokens: null,          // { access, refresh, expiresAt, refreshExpiresAt }
  recipients: [],        // [{ uuid, name }]
  sendToMe: true,
  enabled: true,
  lastSentDate: '',
  lastResult: null,      // { at, ok, error, sent }
};

const file = dataDir => path.join(dataDir, 'kakao_settings.json');

function loadSettings(dataDir) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file(dataDir), 'utf8')); } catch {}
  return { ...JSON.parse(JSON.stringify(SETTINGS_DEFAULT)), ...saved };
}
function saveSettings(dataDir, s) {
  fs.writeFileSync(file(dataDir), JSON.stringify(s, null, 2), 'utf8');
}

const ymd = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// state=family 는 가족 동의용 링크 — 콜백이 와도 토큰을 저장하지 않음
function authUrl(s, redirectUri, state = 'owner') {
  const qs = new URLSearchParams({
    client_id: s.restKey, redirect_uri: redirectUri, response_type: 'code',
    scope: 'talk_message,friends', state,
  });
  return `${KAUTH}/oauth/authorize?${qs}`;
}

async function postForm(url, params, accessToken, fetchImpl) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetchImpl(url, { method: 'POST', headers, body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`카카오 ${res.status}: ${json.msg || json.error_description || json.error || '오류'}`);
  return json;
}

function storeTokens(s, t, now) {
  s.tokens = {
    access: t.access_token,
    refresh: t.refresh_token || (s.tokens && s.tokens.refresh),
    expiresAt: now + (t.expires_in || 0) * 1000,
    refreshExpiresAt: t.refresh_token_expires_in
      ? now + t.refresh_token_expires_in * 1000
      : (s.tokens && s.tokens.refreshExpiresAt) || 0,
  };
}

async function handleCallback(dataDir, code, redirectUri, { fetchImpl = fetch, now = Date.now() } = {}) {
  const s = loadSettings(dataDir);
  const params = { grant_type: 'authorization_code', client_id: s.restKey, redirect_uri: redirectUri, code };
  if (s.clientSecret) params.client_secret = s.clientSecret;
  const t = await postForm(`${KAUTH}/oauth/token`, params, null, fetchImpl);
  storeTokens(s, t, now);
  saveSettings(dataDir, s);
}

// access 토큰 만료 10분 전이면 갱신 (refresh 토큰도 만료 임박 시 새로 내려옴)
async function ensureToken(dataDir, { fetchImpl = fetch, now = Date.now() } = {}) {
  const s = loadSettings(dataDir);
  if (!s.tokens || !s.tokens.refresh) throw new Error('카카오 연결이 안 되어 있습니다. 설정에서 [카카오 연결]을 누르세요.');
  if (s.tokens.expiresAt - now > 10 * 60 * 1000) return s.tokens.access;
  if (s.tokens.refreshExpiresAt && s.tokens.refreshExpiresAt < now) {
    throw new Error('카카오 연결이 만료되었습니다. 설정에서 [카카오 연결]을 다시 누르세요.');
  }
  const params = { grant_type: 'refresh_token', client_id: s.restKey, refresh_token: s.tokens.refresh };
  if (s.clientSecret) params.client_secret = s.clientSecret;
  const t = await postForm(`${KAUTH}/oauth/token`, params, null, fetchImpl);
  storeTokens(s, t, now);
  saveSettings(dataDir, s);
  return s.tokens.access;
}

async function listFriends(dataDir, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const token = await ensureToken(dataDir, opts);
  const res = await fetchImpl(`${KAPI}/v1/api/talk/friends?limit=100`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`카카오 친구 목록 ${res.status}: ${json.msg || '오류'}`);
  return (json.elements || []).map(f => ({ uuid: f.uuid, name: f.profile_nickname || '' }));
}

const template = text => JSON.stringify({
  object_type: 'text', text,
  link: { web_url: 'http://localhost:3000/board.html', mobile_web_url: 'http://localhost:3000/board.html' },
});

async function sendText(dataDir, s, text, opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const token = await ensureToken(dataDir, opts);
  const sent = [];
  if (s.sendToMe) {
    await postForm(`${KAPI}/v2/api/talk/memo/default/send`, { template_object: template(text) }, token, fetchImpl);
    sent.push('나');
  }
  const uuids = s.recipients.map(r => r.uuid);
  for (let i = 0; i < uuids.length; i += 5) {   // 한 번에 최대 5명
    const r = await postForm(`${KAPI}/v1/api/talk/friends/message/default/send`,
      { receiver_uuids: JSON.stringify(uuids.slice(i, i + 5)), template_object: template(text) }, token, fetchImpl);
    for (const u of r.successful_receiver_uuids || []) {
      const who = s.recipients.find(x => x.uuid === u);
      sent.push(who ? who.name : u);
    }
  }
  return sent;
}

// ── 메시지 문구 ──
const won = n => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));
// "씨앤에스유통(주) 광원주유소" → "광원" (법인명 빼고 마지막 단어, '주유소' 생략)
const shortName = n => {
  const words = String(n || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, ' ').trim().split(/\s+/);
  return words[words.length - 1].replace(/주유소$/, '') || words[words.length - 1];
};

function fitLines(lines) {
  const out = [];
  for (const l of lines) {
    if ([...out, l].join('\n').length > TEXT_MAX) break;
    out.push(l);
  }
  return out.join('\n');
}

// 1통 = 우리 가격 + 평균가, 2통 = 주변 주유소(별표 업체 우선, 없으면 가까운 순)
function buildMessages(board, pinned = []) {
  const d = new Date(board.updatedAt);
  const m = board.my.prices;
  const head = [
    `[미소 단가 ${d.getMonth() + 1}/${d.getDate()}]`,
    `휘발유 ${won(m.B027)} / 경유 ${won(m.D047)} / 등유 ${won(m.C004)}`,
    '',
    '평균 (휘/경/등)',
    ...[...board.averages].reverse().map(a =>
      `${a.label} ${won(a.prices.B027 && a.prices.B027.price)} / ${won(a.prices.D047 && a.prices.D047.price)} / ${won(a.prices.C004 && a.prices.C004.price)}`),
  ];

  const pin = new Set(pinned.map(String));
  const others = board.nearby.filter(n => !n.isMine);
  const pick = (others.some(n => pin.has(n.id)) ? others.filter(n => pin.has(n.id)) : others)
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
    .slice(0, NEARBY_COUNT);
  const diff = (p, mine) => (p == null || mine == null ? '' : `(${p - mine > 0 ? '+' : ''}${Math.round(p - mine)})`);
  const near = [
    '[주변 주유소] 휘발유/경유 (우리 대비)',
    ...pick.map(n => `${shortName(n.name)}(${n.brand}) ${won(n.prices.B027)}${diff(n.prices.B027, m.B027)} / ${won(n.prices.D047)}${diff(n.prices.D047, m.D047)}`),
  ];
  return [fitLines(head), fitLines(near)];
}

// ── 매일 자동 발송: 하루 1번, 09~21시, 오늘 09시 이후 받은 단가일 때만 ──
function dueToday(s, board, now) {
  const h = new Date(now).getHours();
  const nine = new Date(now); nine.setHours(SEND_FROM, 0, 0, 0);
  return s.enabled && s.tokens && s.lastSentDate !== ymd(now)
    && h >= SEND_FROM && h < SEND_UNTIL
    && board && board.ok && !board.stale && Date.parse(board.updatedAt) >= nine.getTime();
}

async function send(dataDir, board, pinned, opts = {}) {
  const s = loadSettings(dataDir);
  if (!s.sendToMe && !s.recipients.length) throw new Error('받을 사람이 없습니다.');
  let sent = [];
  for (const text of buildMessages(board, pinned)) sent = await sendText(dataDir, s, text, opts);
  return sent;
}

async function sendDaily(dataDir, board, pinned, opts = {}) {
  const now = opts.now || Date.now();
  if (!dueToday(loadSettings(dataDir), board, now)) return null;
  let result;
  try {
    const sent = await send(dataDir, board, pinned, opts);
    result = { at: new Date(now).toISOString(), ok: true, sent };
  } catch (e) {
    result = { at: new Date(now).toISOString(), ok: false, error: e.message };
  }
  const s = loadSettings(dataDir);   // send 중 토큰이 갱신됐을 수 있어 다시 읽음
  if (result.ok) s.lastSentDate = ymd(now);
  s.lastResult = result;
  saveSettings(dataDir, s);
  return result;
}

module.exports = {
  loadSettings, saveSettings, authUrl, handleCallback, listFriends,
  buildMessages, dueToday, send, sendDaily,
};
