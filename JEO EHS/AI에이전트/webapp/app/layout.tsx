import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EHS AI Control Center",
  description: "EHS 담당 에이전트 6명의 실행 현황과 승인 관리",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
