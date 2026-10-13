"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ShoppingCart, User } from "lucide-react";

const nav = [
  { href: "/", label: "Home", icon: House },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/account", label: "Account", icon: User },
];

// usePathname suspends on dynamic routes under cacheComponents, so show unhighlighted tabs meanwhile
export function BottomNav() {
  return (
    <Suspense fallback={<Tabs />}>
      <ActiveTabs />
    </Suspense>
  );
}

function ActiveTabs() {
  return <Tabs pathname={usePathname()} />;
}

function Tabs({ pathname }: { pathname?: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t bg-background md:hidden">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
