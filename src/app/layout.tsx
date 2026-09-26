import type { Metadata, Viewport } from "next";
// Self-hosted font (no build-time call to Google Fonts); the package declares per-subset unicode ranges.
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ethelius Admin", template: "%s · Ethelius Admin" },
  description: "Employees, projects, billing, payments and payroll for Ethelius.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#090b0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
