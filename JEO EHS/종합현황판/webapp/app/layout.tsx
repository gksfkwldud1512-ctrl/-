import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "안전환경보건 종합업무현황판",
  description: "안전·보건·환경·가스·위험물 법정 업무의 월별 이행 현황",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
