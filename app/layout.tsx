import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import AccountNav from "@/components/AccountNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CrisisSignal",
  description: "Did they actually say it?",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-navy-700 bg-navy-900">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-50">
              <ShieldCheck className="h-5 w-5 text-sky-400" aria-hidden />
              CrisisSignal
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-1 text-sm">
              <Link href="/check" className="rounded-md px-3 py-2 text-slate-300 hover:bg-navy-800 hover:text-slate-50">
                Check
              </Link>
              <Link href="/alerts" className="rounded-md px-3 py-2 text-slate-300 hover:bg-navy-800 hover:text-slate-50">
                Official Alerts
              </Link>
              <Suspense fallback={null}>
                <AccountNav />
              </Suspense>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
