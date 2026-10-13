import { Suspense } from "react";
import { ProductList } from "@/components/product-list";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading products…</p>}>
      <ProductList />
    </Suspense>
  );
}
