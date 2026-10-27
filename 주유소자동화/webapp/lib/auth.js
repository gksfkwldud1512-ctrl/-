'use strict';
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// 외부 접속(Tailscale Funnel 등 터널) 로그인
//   이 PC(localhost)에서 직접 연 요청은 지금처럼 로그인 없이 통과.
//   터널은 이 PC 안에서 localhost로 들어오므로 소켓 주소만 보면 안 됨 → 프록시 헤더가 하나라도 있으면 외부로 봄.
// data/auth.json = { salt, hash, secret }  (비밀번호는 scrypt 해시만 저장, secret은 세션 쿠키 서명용)
const COOKIE     = 'miso_sess';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS  = 5;
const LOCK_MS    = 10 * 60 * 1000;
const GLOBAL_MAX_FAILS = 30;   // IP를 바꿔 가며 시도해도 10분에 30번 넘게 틀리면 모두 잠금
const PROXY_HEADERS = ['tailscale-funnel-request', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'ngrok-trace-id'];

function createAuth(dataDir) {
  const file = path.join(dataDir, 'auth.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; } };
  const fails = new Map();   // ip → { n, until }
  let globalFails = [];      // 최근 10분 안의 실패 시각
  let globalUntil = 0;

  function isExternal(req) {
    if (PROXY_HEADERS.some(h => req.headers[h] != null)) return true;
    const a = req.socket?.remoteAddress || '';
    return !(a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1');
  }
  // X-Forwarded-For 앞쪽은 접속한 쪽이 마음대로 넣을 수 있음 → 터널이 마지막에 붙인 값을 씀
  const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',').pop().trim();

  const hashOf = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const hasPassword = () => !!load().hash;

  function setPassword(pw) {
    if (String(pw || '').length < 8) throw new Error('비밀번호는 8자 이상');
    const cur = load();
    const salt = crypto.randomBytes(16).toString('hex');
    // 비밀번호를 바꾸면 secret도 바꿔 기존 로그인(쿠키)을 모두 끊음
    fs.writeFileSync(file, JSON.stringify({ ...cur, salt, hash: hashOf(pw, salt), secret: crypto.randomBytes(32).toString('hex') }, null, 2));
  }

  function checkPassword(pw) {
    const a = load();
    if (!a.hash) return false;
    const h = Buffer.from(hashOf(pw, a.salt), 'hex');
    return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
  }

  const sign = (exp, secret) => crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  function makeCookie(secure) {
    const exp = Date.now() + SESSION_MS;
    return `${COOKIE}=${exp}.${sign(exp, load().secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
  }
  function validSession(req) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([0-9a-f]{64})`));
    const secret = load().secret;
    if (!m || !secret || Number(m[1]) < Date.now()) return false;
    return crypto.timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(sign(m[1], secret), 'hex'));
  }

  // 로그인 시도 → { ok } | { ok:false, error, status }
  function login(req, pw) {
    const ip = clientIp(req);
    const f = fails.get(ip);
    if (globalUntil > Date.now()) return { ok: false, status: 429, error: '로그인 실패가 너무 많아 잠시 잠겼습니다. 10분 뒤 다시 시도하세요.' };
    if (f?.until > Date.now()) return { ok: false, status: 429, error: `로그인을 ${MAX_FAILS}번 틀려 ${Math.ceil((f.until - Date.now()) / 60000)}분 동안 잠겼습니다.` };
    if (!hasPassword()) return { ok: false, status: 403, error: '아직 비밀번호가 없습니다. 주유소 PC에서 설정 탭 → 외부 접속 비밀번호를 먼저 정하세요.' };
    if (checkPassword(pw)) { fails.delete(ip); return { ok: true }; }
    globalFails = globalFails.filter(t => t > Date.now() - LOCK_MS).concat(Date.now());
    if (globalFails.length > GLOBAL_MAX_FAILS) { globalUntil = Date.now() + LOCK_MS; globalFails = []; }
    const n = (f?.until && f.until <= Date.now() ? 0 : f?.n || 0) + 1;
    fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    return { ok: false, status: 401, error: n >= MAX_FAILS ? `${MAX_FAILS}번 틀려 10분 동안 잠깁니다.` : `비밀번호가 다릅니다. (${n}/${MAX_FAILS})` };
  }

  // 외부 요청은 로그인해야 통과. 로그인 화면과 로그인 API만 예외
  const OPEN = new Set(['/login.html', '/api/auth/login', '/api/auth/status']);
  function middleware(req, res, next) {
    if (!isExternal(req) || OPEN.has(req.path) || validSession(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.', needLogin: true });
    return res.redirect('/login.html');
  }

  // 이 PC에서만 쓰는 기능(사내 BOS DB, 홈택스 자동입력, 메일·카카오 계정 설정 등)
  function localOnly(req, res, next) {
    if (!isExternal(req)) return next();
    return res.status(403).json({ ok: false, error: '이 기능은 주유소 PC에서만 쓸 수 있습니다.' });
  }

  return { isExternal, hasPassword, setPassword, checkPassword, makeCookie, validSession, login, middleware, localOnly, COOKIE };
}

module.exports = { createAuth };
