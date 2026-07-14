import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist는 워커 파일을 런타임에 동적으로 resolve하므로 번들링에서 제외해야
  // 서버(Node) 환경에서 정상적으로 동작한다.
  // @napi-rs/canvas는 플랫폼별 네이티브(.node) 바이너리를 담고 있어 번들링에서도
  // 반드시 제외해야 한다.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // Vercel 파일 트레이싱이 pdfjs-dist의 워커/폰트 파일과 @napi-rs/canvas의 네이티브
  // 바이너리를 동적 require라서 자동으로 감지하지 못하므로 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/upload": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/canvas*/**/*",
    ],
  },
};

export default nextConfig;
