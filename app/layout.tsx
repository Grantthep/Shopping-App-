import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/bottom-nav";
import { AccountName } from "@/components/account";
import { CartBadge } from "@/components/cart-badge";
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
  title: "Shwe",
  description: "Buy and sell across Myanmar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-16 font-sans md:pb-0">
        <header className="sticky top-0 z-10 bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="shrink-0 text-xl font-bold text-accent">
              Shwe
            </Link>
            {/* Plain GET form: submits to /?q=… without any client JS */}
            <form action="/" role="search" className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                placeholder="Search products"
                aria-label="Search products"
                className="border-transparent bg-white pl-8 text-foreground focus-visible:border-accent focus-visible:ring-accent/60"
              />
            </form>
            <nav className="hidden gap-4 text-sm md:flex">
              <Link href="/cart" className="flex items-center gap-1 hover:underline">
                Cart <CartBadge />
              </Link>
              <Link href="/account" className="hover:underline">
                <AccountName />
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t py-6 text-center text-sm text-muted-foreground">
          © Shwe · Myanmar marketplace
        </footer>

        <BottomNav />
      </body>
    </html>
  );
}
