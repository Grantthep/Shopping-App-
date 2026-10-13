import { Suspense } from "react";
import { SellerOrder } from "./seller-order";

export default function SellerOrderPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading order…</p>}>
      <SellerOrder />
    </Suspense>
  );
}
