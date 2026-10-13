"use client";

import { ProductForm } from "@/components/product-form";
import { NoShopYet, SellerGate, SellerNav, useSeller } from "@/components/seller";

export default function NewProductPage() {
  const seller = useSeller();
  if (seller.state !== "ready") return <SellerGate seller={seller} />;
  if (!seller.shop) return <NoShopYet />;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Add product</h1>
        <SellerNav />
      </div>
      <ProductForm shopId={seller.shop.id} userId={seller.user.id} />
    </div>
  );
}
