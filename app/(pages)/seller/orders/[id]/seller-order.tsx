"use client";

import { OrderDetail } from "@/components/order-detail";
import { SellerGate, SellerNav, useSeller } from "@/components/seller";

export function SellerOrder() {
  const seller = useSeller();
  if (seller.state !== "ready") return <SellerGate seller={seller} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-2xl">
        <SellerNav />
      </div>
      <OrderDetail seller />
    </div>
  );
}
