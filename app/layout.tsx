import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KhelGrid — Academy Desk",
  description: "The operating desk for grassroots sports academies.",
  applicationName: "KhelGrid",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico", apple: "/favicon.ico" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "KhelGrid" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
