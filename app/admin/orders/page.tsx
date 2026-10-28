import { desc } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import AdminOrderHistory from "@/components/AdminOrderHistory";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OrdersPage() {
  if (!(await isAdmin())) redirect("/admin/login");

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

      <AdminOrderHistory orders={rows} />
    </div>
  );
}
