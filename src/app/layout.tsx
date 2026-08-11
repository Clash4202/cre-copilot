import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { signOut } from "@/app/actions";
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
  title: "cre-copilot",
  description: "Ask questions grounded in your real CRE documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex items-center justify-between border-b px-6 py-3">
          <span className="font-semibold">cre-copilot</span>
          <div className="flex items-center gap-4">
            <a href="/vault" className="text-sm hover:underline">
              Vault
            </a>
            <a href="/chat" className="text-sm hover:underline">
              Ask the Brain
            </a>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-black">
                Sign out
              </button>
            </form>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
