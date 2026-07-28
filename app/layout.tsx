import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知识星球材料库",
  description: "面向私募研究的尽调报告与路演材料本地工作台",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
