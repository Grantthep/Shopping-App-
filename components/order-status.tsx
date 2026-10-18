import type { Database } from "@/lib/db/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

// Short, readable order number from the order's uuid
export const orderNo = (id: string) => "#" + id.slice(0, 8).toUpperCase();

const styles: Record<OrderStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  paid: "bg-sky-100 text-sky-900",
  shipped: "bg-accent text-accent-foreground",
  delivered: "bg-green-100 text-green-900",
  completed: "bg-primary text-primary-foreground",
  cancelled: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[status]}`}>{status}</span>
  );
}
