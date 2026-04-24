import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SkyBackground from "@/components/SkyBackground";

const mono = JetBrains_Mono({
  variable: "--font-mono-stack",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WEATHERVERSE // Temperature markets terminal",
  description:
    "A terminal-styled trading companion for Polymarket temperature markets: globe, forecasts, and the same-station history that markets resolve against.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`}>
      <body className="relative min-h-screen overflow-x-hidden">
        <SkyBackground />
        <div className="crt-vignette" />
        <main className="relative z-10 flex min-h-screen flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
