import { createClient } from "@/lib/supabase/server"

export type DashboardStats = {
  todayRevenue: number
  lowStockCount: number
  staffOnShift: number
  pendingTasks: number
  todayOrders: DashboardOrder[]
  todayShifts: DashboardShift[]
}

export type DashboardShift = {
  id: string
  work_date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  staff: {
    name: string
    role: string
    phone: string | null
  } | null
}

export type DashboardOrder = {
  id: string
  table_number: number
  total: number
  waiter_name: string | null
  opened_by_email: string | null
  created_at: string
  closed_at: string | null
  order_items: {
    id: string
    name: string
    price: number
    quantity: number
  }[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [productsResult, shiftsResult, tasksResult, ordersResult] = await Promise.all([
    supabase.from("products").select("quantity, min_quantity"),
    supabase
      .from("shifts")
      .select("id, work_date, shift_type, start_time, end_time, staff:staff_id(name, role, phone)")
      .eq("work_date", today)
      .neq("shift_type", "day_off"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("id, table_number, total, waiter_name, opened_by_email, created_at, closed_at, order_items(id, name, price, quantity)")
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
    todayOrders: (ordersResult.data ?? []) as DashboardOrder[],
    lowStockCount,
    staffOnShift: shiftsResult.data?.length ?? 0,
    todayShifts: (shiftsResult.data ?? []).map((shift) => ({
      ...shift,
      staff: Array.isArray(shift.staff) ? shift.staff[0] ?? null : shift.staff,
    })) as DashboardShift[],
    pendingTasks: tasksResult.count ?? 0,
  }
}
