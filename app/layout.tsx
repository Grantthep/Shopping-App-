import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { House, Search, ShoppingCart, User } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  title: "Shopping App",
  description: "Buy and sell across Myanmar",
};

const nav = [
  { href: "/", label: "Home", icon: House },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/account", label: "Account", icon: User },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-16 font-sans md:pb-0">
        <header className="sticky top-0 z-10 border-b bg-background">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="shrink-0 text-lg font-semibold">
              Shopping App
            </Link>
            {/* Plain GET form: submits to /?q=… without any client JS */}
            <form action="/" role="search" className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                placeholder="Search products"
                aria-label="Search products"
                className="pl-8"
              />
            </form>
            <nav className="hidden gap-4 text-sm md:flex">
              {nav.slice(1).map(({ href, label }) => (
                <Link key={href} href={href} className="hover:underline">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

        <footer className="border-t py-6 text-center text-sm text-muted-foreground">
          © Shopping App · Myanmar marketplace
        </footer>

        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t bg-background md:hidden">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-0.5 py-2 text-xs">
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
      </body>
    </html>
  );
}
