import { Suspense } from "react";
import { ProductDetail } from "@/components/product-detail";

export default function ProductPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading product…</p>}>
      <ProductDetail />
    </Suspense>
  );
}
