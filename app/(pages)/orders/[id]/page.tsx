import { Suspense } from "react";
import { OrderDetail } from "@/components/order-detail";

export default function OrderPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading order…</p>}>
      <OrderDetail />
    </Suspense>
  );
}
