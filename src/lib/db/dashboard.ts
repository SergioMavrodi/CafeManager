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

  const [productsResult, schedulesResult, tasksResult] = await Promise.all([
    supabase.from("products").select("quantity, min_quantity"),
    supabase
      .from("schedules")
      .select("id", { count: "exact", head: true })
      .eq("date", today)
      .eq("status", "active"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ])

  const lowStockCount =
    productsResult.data?.filter(
      (item) => Number(item.quantity) <= Number(item.min_quantity),
    ).length ?? 0

  return {
    todayRevenue: 0,
    lowStockCount,
    staffOnShift: schedulesResult.count ?? 0,
    pendingTasks: tasksResult.count ?? 0,
  }
}
