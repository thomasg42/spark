import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProvider, THEME_BOOT_SCRIPT } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui";
import { themeCss } from "@/lib/domain/themes";
import { BASE_PATH } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "Spark", template: "%s · Spark" },
  description: "A private space for two: stay close, honest, and a little bit adventurous for the long run.",
  applicationName: "Spark",
  icons: { icon: `${BASE_PATH}/icon.svg`, apple: `${BASE_PATH}/icon-192.png` },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Spark", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF8F0" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1020" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-accent="rose" data-mode="system" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <AppProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
