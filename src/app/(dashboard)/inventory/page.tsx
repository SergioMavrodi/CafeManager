import { InventoryView, type InventoryHistoryRow } from "@/components/inventory/inventory-view"
import { getInventoryItems } from "@/lib/db/inventory"
import { can } from "@/lib/rbac"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export default async function InventoryPage() {
  const ctx = await getAuthContext()
  const role = ctx?.role ?? "staff"
  const items = await getInventoryItems()

  let history: InventoryHistoryRow[] = []
  if (can(role, "inventory.write")) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("inventory_history")
      .select("id, product_name, delta, quantity_after, reason, changed_by_email, changed_at")
      .order("changed_at", { ascending: false })
      .limit(50)
    history = (data ?? []).map((r) => ({
      id: r.id,
      product_name: r.product_name,
      delta: Number(r.delta),
      quantity_after: Number(r.quantity_after),
      reason: r.reason,
      changed_by_email: r.changed_by_email,
      changed_at: r.changed_at,
    }))
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground text-pretty">
          Stock levels, suppliers, and reorder alerts.
        </p>
      </div>
      <InventoryView initialRows={items} role={role} history={history} />
    </div>
  )
}
