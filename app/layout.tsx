import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUJI NOW | 후지 5호 후지산 라이브",
  description: "후지 5호의 라이브 카메라와 기상청 MSM 예보로 지금 후지산이 보이는지 확인합니다.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
