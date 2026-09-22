import { desc } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { money } from "@/lib/utils";

export default async function OrdersPage() {
  const rows = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt));

  return (
    <div>
      <div>
        <p className="text-sm text-neutral-500">
          Operations
        </p>

        <h1 className="mt-1 text-3xl font-semibold">
          Orders
        </h1>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-neutral-500">
            No orders yet.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {rows.map((order) => (
              <div
                key={order.id}
                className="grid gap-4 p-5 sm:grid-cols-4"
              >
                <div>
                  <p className="text-xs text-neutral-400">
                    ORDER
                  </p>

                  <p className="mt-1 font-medium">
                    {order.orderNumber}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-neutral-400">
                    CUSTOMER
                  </p>

                  <p className="mt-1 text-sm">
                    {order.customerPhone}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-neutral-400">
                    TOTAL
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {money(order.total)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-neutral-400">
                    STATUS
                  </p>

                  <p className="mt-1 text-sm">
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}