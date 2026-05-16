import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excel 情感分析平台",
  description: "面向评论表格的情感分析与结果导出平台"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
