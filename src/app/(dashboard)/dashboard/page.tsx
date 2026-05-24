import { DashboardCards } from "@/components/dashboard/dashboard-cards"
import { getDashboardStats } from "@/lib/db/dashboard"
import { requirePermissionOrRedirect } from "@/lib/rbac.server"

export default async function DashboardPage() {
  await requirePermissionOrRedirect("dashboard.view")
  const stats = await getDashboardStats()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-pretty">
          Overview of sales, shifts, and daily operations.
        </p>
      </div>

      <DashboardCards
        todayRevenue={stats.todayRevenue}
        todayOrders={stats.todayOrders}
        todayShifts={stats.todayShifts}
        lowStockCount={stats.lowStockCount}
        staffOnShift={stats.staffOnShift}
        pendingTasks={stats.pendingTasks}
      />
    </div>
  )
}
