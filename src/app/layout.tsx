import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { signOut } from "@/app/actions";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "cre-copilot",
  description: "Ask questions grounded in your real CRE documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <header className="border-b-2 border-hairline">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/vault" className="flex items-baseline gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
              <span className="font-display text-lg font-medium tracking-tight">
                cre-copilot
              </span>
            </a>
            <div className="flex items-center gap-6">
              <a
                href="/vault"
                className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
              >
                Vault
              </a>
              <a
                href="/chat"
                className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
              >
                Ask the Brain
              </a>
              <form action={signOut}>
                <button
                  type="submit"
                  className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-brick"
                >
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
