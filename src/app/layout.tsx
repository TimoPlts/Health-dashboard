import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/ui/TabBar";
import { isDemoMode } from "@/server/env";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Baseline",
  description: "Your personal health and training baseline",
  applicationName: "Baseline",
  appleWebApp: { capable: true, title: "Baseline", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f5" },
    { media: "(prefers-color-scheme: dark)", color: "#050608" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="ambient" aria-hidden="true" />
        {demo && (
          <div role="status" className="sticky top-0 z-[60] bg-warn px-4 pt-[max(env(safe-area-inset-top),4px)] pb-1 text-center text-[12px] font-semibold text-black">
            DEMO MODE — all values are fictional and not real measurements
          </div>
        )}
        <main className="safe-bottom-pad mx-auto w-full max-w-[560px] px-4">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
