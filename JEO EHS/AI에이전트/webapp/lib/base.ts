// 포털 안에 같은 주소(예: https://포털주소/control-center)로 붙일 때만 NEXT_PUBLIC_BASE_PATH=/control-center 로 빌드한다.
// 로컬(BAT)에서는 비워 두므로 http://localhost:3917 그대로 열린다. 브라우저 fetch/이동은 Next가 자동으로 붙여 주지 않아 withBase로 감싼다.
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// "/"는 끝에 슬래시를 붙이면 Next가 다시 리다이렉트하므로 BASE 그대로 쓴다.
export const withBase = (path: string) => (path === "/" ? BASE || "/" : `${BASE}${path}`);
