import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BCC Media Network — Workspace",
  description: "Internal productivity platform for BCC Media Network",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
