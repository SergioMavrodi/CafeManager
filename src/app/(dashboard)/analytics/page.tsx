import { AIChat } from "@/components/analytics/ai-chat"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { requirePermissionOrRedirect } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

function kgs(amount: number) {
  return `${Math.round(amount).toLocaleString("ru-RU")} KGS`
}

function pct(value: number, max: number) {
  if (max <= 0) return 0
  return Math.max(4, Math.round((value / max) * 100))
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function previousMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}

function estimatedUnitCost(product: { name?: string | null; category?: string | null }) {
  const text = `${product.name ?? ""} ${product.category ?? ""}`.toLowerCase()
  if (text.includes("coffee")) return 900
  if (text.includes("milk")) return 90
  if (text.includes("sugar")) return 75
  if (text.includes("tea")) return 500
  if (text.includes("syrup")) return 420
  if (text.includes("cup") || text.includes("pack")) return 6
  if (text.includes("cake") || text.includes("dessert")) return 180
  return 120
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>
}) {
  await requirePermissionOrRedirect("analytics.view")
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const lastMonthStart = previousMonthStart(now)
  const lastMonthEnd = monthEnd(lastMonthStart)
  const thisMonthStart = monthStart(now)
  const period = params?.period === "this-month" ? "this-month" : params?.period === "all" ? "all" : "last-month"
  const periodStart = period === "this-month" ? thisMonthStart : period === "last-month" ? lastMonthStart : new Date("2000-01-01")
  const periodEnd = period === "last-month" ? lastMonthEnd : now
  const periodLabel = period === "this-month" ? "This month" : period === "all" ? "All time" : "Last month"

  const [ordersRes, productsRes, menuRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, waiter_name, created_at, order_items(name, quantity, price)")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .order("created_at", { ascending: true }),
    supabase.from("products").select("name, category, quantity, min_quantity, unit"),
    supabase.from("menu_items").select("name, category, price, is_available"),
  ])

  const orders = ordersRes.data ?? []
  const closedOrders = orders.filter((o) => o.status === "closed")
  const totalRevenue = closedOrders.reduce((sum, o) => sum + Number(o.total), 0)
  const avgOrder = closedOrders.length > 0 ? totalRevenue / closedOrders.length : 0

  const revenueByDay = new Map<string, number>()
  const ordersByHour = new Map<number, number>()
  const waiterRevenue = new Map<string, number>()
  const categorySales = new Map<string, number>()
  const menuCategoryByName = new Map((menuRes.data ?? []).map((m) => [m.name, m.category]))

  for (const order of closedOrders) {
    const date = new Date(order.created_at)
    const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
    const hour = date.getHours()
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(order.total))
    ordersByHour.set(hour, (ordersByHour.get(hour) ?? 0) + 1)
    if (order.waiter_name) {
      waiterRevenue.set(order.waiter_name, (waiterRevenue.get(order.waiter_name) ?? 0) + Number(order.total))
    }
    for (const item of order.order_items ?? []) {
      const category = menuCategoryByName.get(item.name) ?? "Other"
      categorySales.set(category, (categorySales.get(category) ?? 0) + Number(item.price) * Number(item.quantity))
    }
  }

  const lowStock = (productsRes.data ?? []).filter((p) => Number(p.quantity) <= Number(p.min_quantity))
  const inventoryValue = (productsRes.data ?? []).reduce(
    (sum, product) => sum + Number(product.quantity ?? 0) * estimatedUnitCost(product),
    0,
  )
  const dayRows = Array.from(revenueByDay.entries()).slice(-7)
  const maxDayRevenue = Math.max(...dayRows.map(([, v]) => v), 0)
  const hourRows = Array.from(ordersByHour.entries()).sort((a, b) => a[0] - b[0])
  const maxHourOrders = Math.max(...hourRows.map(([, v]) => v), 0)
  const topWaiters = Array.from(waiterRevenue.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxWaiterRevenue = Math.max(...topWaiters.map(([, v]) => v), 0)
  const topCategories = Array.from(categorySales.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCategorySales = Math.max(...topCategories.map(([, v]) => v), 0)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-pretty">
            Revenue, peak hours, waiter performance, stock risks, and AI recommendations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={period === "last-month" ? "default" : "outline"} size="sm">
            <Link href="/analytics?period=last-month">Last month</Link>
          </Button>
          <Button asChild variant={period === "this-month" ? "default" : "outline"} size="sm">
            <Link href="/analytics?period=this-month">This month</Link>
          </Button>
          <Button asChild variant={period === "all" ? "default" : "outline"} size="sm">
            <Link href="/analytics?period=all">All time</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard title={`${periodLabel} revenue`} value={kgs(totalRevenue)} hint={`${closedOrders.length} closed orders`} />
        <MetricCard title="Average order" value={kgs(avgOrder)} hint="per closed order" />
        <MetricCard title="Low stock" value={String(lowStock.length)} hint="items need attention" danger={lowStock.length > 0} />
        <MetricCard title="Inventory value" value={kgs(inventoryValue)} hint="estimated stock cost" danger={inventoryValue === 0} />
        <MetricCard title="Menu items" value={String(menuRes.data?.length ?? 0)} hint="available and hidden" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
            <CardDescription>Last 7 active sales days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayRows.length === 0 ? <Empty /> : dayRows.map(([day, value]) => (
              <BarRow key={day} label={day} value={kgs(value)} width={pct(value, maxDayRevenue)} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Peak order hours</CardTitle>
            <CardDescription>When orders are most frequent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hourRows.length === 0 ? <Empty /> : hourRows.map(([hour, count]) => (
              <BarRow key={hour} label={`${hour}:00`} value={`${count} orders`} width={pct(count, maxHourOrders)} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Top waiters by revenue</CardTitle>
            <CardDescription>Useful for bonuses and performance reviews</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topWaiters.length === 0 ? <Empty /> : topWaiters.map(([name, value]) => (
              <BarRow key={name} label={name} value={kgs(value)} width={pct(value, maxWaiterRevenue)} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
            <CardDescription>Revenue grouped by menu category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topCategories.length === 0 ? <Empty /> : topCategories.map(([name, value]) => (
              <BarRow key={name} label={name} value={kgs(value)} width={pct(value, maxCategorySales)} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Stock risks</CardTitle>
            <CardDescription>Products at or below minimum quantity</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <Empty text="No low stock items right now." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {lowStock.slice(0, 8).map((p) => (
                  <div key={p.name} className="rounded-xl border border-amber-500/10 bg-background/50 p-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.quantity} {p.unit} left · min {p.min_quantity}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <AIChat />
      </div>
    </div>
  )
}

function MetricCard({ title, value, hint, danger }: { title: string; value: string; hint: string; danger?: boolean }) {
  return (
    <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tabular-nums ${danger ? "text-red-500" : ""}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function BarRow({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function Empty({ text = "No data yet." }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}
