import { Suspense } from "react";
import { EditProduct } from "./edit-product";

export default function EditProductPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EditProduct />
    </Suspense>
  );
}
