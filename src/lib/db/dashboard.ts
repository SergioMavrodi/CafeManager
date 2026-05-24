import { createClient } from "@/lib/supabase/server"

export type DashboardStats = {
  todayRevenue: number
  lowStockCount: number
  staffOnShift: number
  pendingTasks: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [productsResult, shiftsResult, tasksResult, ordersResult] = await Promise.all([
    supabase.from("products").select("quantity, min_quantity"),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("work_date", today)
      .neq("shift_type", "day_off"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("total")
      .eq("status", "closed")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`),
  ])

  const lowStockCount =
    productsResult.data?.filter(
      (item) => Number(item.quantity) <= Number(item.min_quantity),
    ).length ?? 0

  const todayRevenue =
    ordersResult.data?.reduce((sum, o) => sum + Number(o.total), 0) ?? 0

  return {
    todayRevenue,
    lowStockCount,
    staffOnShift: shiftsResult.count ?? 0,
    pendingTasks: tasksResult.count ?? 0,
  }
}
