"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Short, readable order number from the order's uuid
const orderNo = (id: string) => "#" + id.slice(0, 8).toUpperCase();

function OrderNumbers() {
  const ids = useSearchParams().get("ids")?.split(",").filter(Boolean) ?? [];
  return (
    <ul className="flex flex-col gap-1 font-mono text-sm">
      {ids.map((id) => (
        <li key={id} title={id}>
          Order {orderNo(id)}
        </li>
      ))}
    </ul>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-8 text-center">
      <CircleCheck className="size-12 text-primary" aria-hidden />
      <h1 className="text-xl font-semibold">Order placed</h1>
      {/* useSearchParams needs Suspense under cacheComponents */}
      <Suspense>
        <OrderNumbers />
      </Suspense>
      <p className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">Pay cash when your order arrives</p>
      <div className="flex w-full flex-col gap-2">
        <Link href="/orders" className={cn(buttonVariants({ size: "lg" }), "h-11 text-base")}>
          My orders
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 text-base")}>
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
