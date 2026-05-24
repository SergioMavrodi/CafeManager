import { createClient } from "@/lib/supabase/server"
import { OrdersView, type Order } from "@/components/orders/orders-view"
import { requirePermissionOrRedirect } from "@/lib/rbac.server"

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ new?: string }>
}) {
  const ctx = await requirePermissionOrRedirect("orders.read")
  const params = await searchParams

  const supabase = await createClient()

  const ordersQuery = supabase
    .from("orders")
    .select("id, table_number, status, total, note, opened_by_email, waiter_id, waiter_name, created_at, closed_at, order_items(id, name, price, quantity)")
    .order("created_at", { ascending: false })
    .limit(100)

  if (ctx.role === "staff") {
    ordersQuery.or(`status.eq.open,and(status.neq.open,opened_by.eq.${ctx.profileId})`)
  }

  const [menuRes, tablesRes, ordersRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, category, price, is_available, image_url")
      .order("category")
      .order("name"),
    supabase
      .from("cafe_tables")
      .select("id, number, seats, status")
      .order("number"),
    ordersQuery,
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <OrdersView
        menuItems={menuRes.data ?? []}
        tables={tablesRes.data ?? []}
        orders={(ordersRes.data ?? []) as Order[]}
        role={ctx?.role ?? "staff"}
        initialNewOrderOpen={params?.new === "1"}
      />
    </div>
  )
}
