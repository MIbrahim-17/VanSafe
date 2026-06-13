import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Bus } from "@/components/icons";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "VanSafe — Safer school van rides",
  description:
    "VanSafe helps parents find trusted school van drivers, track rides live, and get instant WhatsApp safety alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}>
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
        <footer className="mt-8 border-t border-slate-200/70 bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row">
            <span className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-700 text-white">
                <Bus size={14} />
              </span>
              <span className="font-semibold text-slate-700">VanSafe</span>
              <span className="text-slate-400">· Safer school transport</span>
            </span>
            <span className="text-xs text-slate-400">
              Civic Innovation Hackathon · Lahore &amp; Karachi
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
