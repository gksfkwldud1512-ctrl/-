import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 비어 있으면 undefined → 기본(루트) 동작. 설정 시 /control-center 아래에서만 서비스된다.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
