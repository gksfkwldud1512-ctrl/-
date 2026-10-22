// 내 컴퓨터에서 실행할 때 필요한 로그인 설정(.env.local)을 처음 한 번만 만든다.
// 이미 있으면 아무것도 하지 않는다. 비밀번호는 무작위로 만들고 "로그인정보(비공개).txt"에 적어 둔다.
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const credPath = path.join(root, "..", "로그인정보(비공개).txt");

if (existsSync(envPath)) process.exit(0);

const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};
const pw = () => randomBytes(6).toString("base64url"); // 8자

const accounts = [
  { id: "ehs", name: "EHS 담당자", role: "ehs_officer", pw: pw() },
  { id: "admin", name: "관리자", role: "admin", pw: pw() },
  { id: "viewer", name: "조회 전용", role: "viewer", pw: pw() },
];

const users = accounts.map(({ id, name, role, pw: p }) => ({ id, name, role, hash: hash(p) }));
writeFileSync(
  envPath,
  `CC_SESSION_SECRET=${randomBytes(32).toString("hex")}\nCC_USERS='${JSON.stringify(users)}'\n`,
  "utf8",
);
writeFileSync(
  credPath,
  [
    "AI 관제센터 로그인 정보 (내 컴퓨터 전용 / 외부에 공유하지 마세요)",
    "",
    ...accounts.map((a) => `아이디: ${a.id}   비밀번호: ${a.pw}   (${a.name})`),
    "",
    "- ehs: 승인·반려·재검토 가능",
    "- admin: 감사 로그 열람 가능(승인은 불가)",
    "- viewer: 조회만 가능",
    "",
  ].join("\r\n"),
  "utf8",
);
console.log("Login settings created. See the credentials text file in the AI folder.");
