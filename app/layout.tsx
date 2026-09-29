import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUJI NOW | 후지산 관측",
  description: "가와구치코 기상과 카메라를 함께 보고 후지산 가시성을 기록합니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
