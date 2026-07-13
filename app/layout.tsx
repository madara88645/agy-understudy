import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGY Live Inspector",
  description: "Yerel AGY koşularını canlı izleme ekranı.",
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
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
