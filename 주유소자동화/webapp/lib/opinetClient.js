// ── 오피넷 유가정보 API: 미소주유소·주변 주유소·평균가 단가표 ─────────
// 일반 API(무료, 1500call/일). 키는 data/opinet_settings.json (커밋 안 함)
// 1회 갱신 = 상세 1 + 반경 3(휘발유·경유·등유) + 평균 3 = 7call, 30분 캐시
const fs   = require('fs');
const path = require('path');

const API = 'https://www.opinet.co.kr/api/';
const PRODUCTS = { B027: '휘발유', D047: '경유', C004: '등유' };
const BRANDS = {
  SKE: 'SK', GSC: 'GS', HDO: '현대', SOL: 'S-OIL', RTE: '알뜰', RTX: '고속도로알뜰',
  NHO: '농협알뜰', ETC: '자가', E1G: 'E1', SKG: 'SK가스',
};
const CACHE_MS  = 30 * 60 * 1000;
const FORCE_MIN = 60 * 1000;     // 강제 새로고침도 1분에 한 번만 (호출 한도 보호)

const SETTINGS_DEFAULT = {
  certkey: '',
  myStationId: '',
  myStationName: '미소',
  myAddressHint: '대금로 199',
  radius: 5000,
  pinned: [],
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function files(dataDir) {
  return {
    settings: path.join(dataDir, 'opinet_settings.json'),
    cache:    path.join(dataDir, 'opinet_cache.json'),
    history:  path.join(dataDir, 'opinet_history.json'),
  };
}

function loadSettings(dataDir) {
  return { ...JSON.parse(JSON.stringify(SETTINGS_DEFAULT)), ...readJson(files(dataDir).settings, {}) };
}
function saveSettings(dataDir, s) {
  writeJson(files(dataDir).settings, s);
}

// 응답이 UTF-8이 아니면(깨짐 문자) EUC-KR로 다시 해석
async function call(endpoint, params, fetchImpl) {
  const qs = new URLSearchParams({ out: 'json', ...params }).toString();
  const res = await fetchImpl(`${API}${endpoint}?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`오피넷 ${endpoint} HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let text = buf.toString('utf8');
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`오피넷 ${endpoint} 응답 해석 실패`); }
  const oil = json && json.RESULT && json.RESULT.OIL;
  return Array.isArray(oil) ? oil : (oil ? [oil] : []);
}

const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const brandOf = o => BRANDS[o.POLL_DIV_CD || o.POLL_DIV_CO] || (o.POLL_DIV_CD || o.POLL_DIV_CO || '');

// 상호로 우리 주유소 ID 찾기 (주소 힌트로 동명 주유소 구분)
async function findMyStation(s, fetchImpl) {
  const list = await call('searchByName.do', { certkey: s.certkey, osnm: s.myStationName }, fetchImpl);
  const hint = (s.myAddressHint || '').replace(/\s/g, '');
  const hit = list.find(o => (String(o.NEW_ADR || '') + String(o.VAN_ADR || '')).replace(/\s/g, '').includes(hint))
           || list.find(o => /대소면/.test(String(o.NEW_ADR || '') + String(o.VAN_ADR || '')));
  return hit ? String(hit.UNI_ID) : '';
}

async function fetchBoard(s, fetchImpl) {
  if (!s.certkey) throw new Error('오피넷 인증키가 없습니다. 설정에서 입력하세요.');
  let notes = [];
  if (!s.myStationId) {
    s.myStationId = await findMyStation(s, fetchImpl);
    if (!s.myStationId) throw new Error(`오피넷에서 '${s.myStationName}' 주유소를 찾지 못했습니다. 인증키가 맞는지 확인하고, 맞다면 설정에서 주유소 ID를 직접 입력하세요.`);
    notes.push('stationIdFound');
  }

  const [detail] = await call('detailById.do', { certkey: s.certkey, id: s.myStationId }, fetchImpl);
  if (!detail) throw new Error('오피넷 응답이 비어 있습니다. 인증키 또는 주유소 ID를 확인하세요.');

  const my = {
    id: String(detail.UNI_ID), name: detail.OS_NM, brand: brandOf(detail),
    address: detail.NEW_ADR || detail.VAN_ADR || '', prices: {}, tradeAt: '',
  };
  for (const p of [].concat(detail.OIL_PRICE || [])) {
    if (!PRODUCTS[p.PRODCD]) continue;
    my.prices[p.PRODCD] = num(p.PRICE);
    const at = `${p.TRADE_DT || ''}${String(p.TRADE_TM || '').padStart(6, '0')}`;
    if (at > my.tradeAt) my.tradeAt = at;
  }
  const x = detail.GIS_X_COOR, y = detail.GIS_Y_COOR;
  const sigun = String(detail.SIGUNCD || '');
  const sido  = sigun.slice(0, 2);

  const prodcds = Object.keys(PRODUCTS);
  const [aroundLists, avgAll, avgSido, avgSigun] = await Promise.all([
    Promise.all(prodcds.map(prodcd => call('aroundAll.do',
      { certkey: s.certkey, x, y, radius: Math.min(5000, Number(s.radius) || 5000), prodcd, sort: 2 }, fetchImpl))),
    call('avgAllPrice.do', { certkey: s.certkey }, fetchImpl),
    sido ? call('avgSidoPrice.do', { certkey: s.certkey, sido }, fetchImpl) : [],
    sigun ? call('avgSigunPrice.do', { certkey: s.certkey, sido, sigun }, fetchImpl) : [],
  ]);

  // 제품별 반경 결과를 주유소 하나로 합침
  const byId = new Map();
  aroundLists.forEach((list, i) => {
    for (const o of list) {
      const id = String(o.UNI_ID);
      if (!byId.has(id)) byId.set(id, { id, name: o.OS_NM, brand: brandOf(o), distance: num(o.DISTANCE), prices: {} });
      byId.get(id).prices[prodcds[i]] = num(o.PRICE);
    }
  });
  const nearby = [...byId.values()]
    .map(st => ({ ...st, isMine: st.id === my.id }))
    .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  const avgRow = (label, list) => {
    const prices = {};
    for (const o of list) if (PRODUCTS[o.PRODCD]) prices[o.PRODCD] = { price: num(o.PRICE), diff: num(o.DIFF) };
    const name = list[0] && (list[0].SIGUNNM || list[0].SIDONM);
    return { label: name || label, prices, tradeDt: (list[0] && list[0].TRADE_DT) || '' };
  };
  const averages = [avgRow('전국', avgAll), avgRow('시도', avgSido), avgRow('시군', avgSigun)]
    .filter(a => Object.keys(a.prices).length);

  return { my, averages, nearby, radius: Math.min(5000, Number(s.radius) || 5000), notes };
}

// 하루 1건(그날 마지막 값) 쌓기 — 나중에 추이 보기용
function appendHistory(dataDir, board) {
  const f = files(dataDir).history;
  const h = readJson(f, {});
  const d = new Date(board.updatedAt);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  h[day] = {
    at: board.updatedAt,
    my: board.my.prices,
    averages: Object.fromEntries(board.averages.map(a => [a.label, Object.fromEntries(
      Object.entries(a.prices).map(([k, v]) => [k, v.price]))])),
    nearby: Object.fromEntries(board.nearby.map(n => [n.id, { name: n.name, ...n.prices }])),
  };
  writeJson(f, h);
}

let memCache = null;
let lastForced = 0;
let inflight = null;

// 캐시 우선. 오피넷 오류 시 마지막 값 + error 를 돌려줌
async function getBoard(dataDir, { force = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const f = files(dataDir);
  if (!memCache) memCache = readJson(f.cache, null);
  const age = memCache ? now - Date.parse(memCache.updatedAt) : Infinity;
  const canForce = force && now - lastForced >= FORCE_MIN;
  if (memCache && !memCache.error && age < CACHE_MS && !canForce) return { ...memCache, cached: true };
  if (force) lastForced = now;

  if (!inflight) {
    inflight = (async () => {
      const s = loadSettings(dataDir);
      const before = s.myStationId;
      try {
        const b = await fetchBoard(s, fetchImpl);
        if (s.myStationId !== before) saveSettings(dataDir, s);
        const board = { ok: true, updatedAt: new Date(now).toISOString(), ...b };
        memCache = board;
        writeJson(f.cache, board);
        try { appendHistory(dataDir, board); } catch (e) { console.error('[opinet history]', e.message); }
        return board;
      } catch (e) {
        if (memCache && memCache.my) return { ...memCache, ok: true, stale: true, error: e.message };
        return { ok: false, error: e.message };
      }
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

function resetCache(dataDir) {
  memCache = null;
  lastForced = 0;
  try { fs.unlinkSync(files(dataDir).cache); } catch {}
}

module.exports = { getBoard, loadSettings, saveSettings, resetCache, PRODUCTS, SETTINGS_DEFAULT };
