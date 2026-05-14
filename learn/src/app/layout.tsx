import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import PWARegister from "@/components/PWARegister";
import AudioUnlock from "@/components/AudioUnlock";
import { TimerProvider } from "@/context/TimerContext";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "NewHat — 60 Ngày Thay Đổi",
  description: "Học Full-Stack & Tiếng Anh trong 60 ngày",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "NewHat" },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" href="/icon-192.png" type="image/png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NewHat" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body style={{ background: "var(--bg)", color: "var(--text)" }}>
        <PWARegister />
        <AudioUnlock />
        <TimerProvider>
          <AppShell session={session}>
            {children}
          </AppShell>
        </TimerProvider>
      </body>
    </html>
  );
}
