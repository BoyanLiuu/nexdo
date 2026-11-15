import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: { default: "Today · Nexdo", template: "%s · Nexdo" },
  description:
    "Nexdo is a personal todo app that keeps you on what's next: type a task in plain words and see what it read before it saves.",
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2A3DB0"/><g fill="#fff"><rect x="6" y="7" width="3.6" height="17" rx="1.6"/><rect x="11.4" y="18" width="3.6" height="6" rx="1.3" opacity=".62"/><rect x="16.8" y="18" width="3.6" height="6" rx="1.3" opacity=".48"/><rect x="22.2" y="18" width="3.6" height="6" rx="1.3" opacity=".32"/></g></svg>`,
          ),
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#fcfcfb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
        {/* Undo lives in a toast, so this is load-bearing, not decoration. */}
        <Toaster position="bottom-center" closeButton />
      </body>
    </html>
  );
}
