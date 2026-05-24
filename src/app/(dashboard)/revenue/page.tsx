import Link from "next/link"
import { ArrowRight, Banknote, CalendarDays, Coins, Package, ReceiptText, TrendingDown, TrendingUp, WalletCards } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { requirePermissionOrRedirect } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

function kgs(amount: number) {
  return `${Math.round(amount).toLocaleString("ru-RU")} KGS`
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
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

function daysBetween(from: Date, to: Date) {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
}

function inRange(value: string, from: Date, to: Date) {
  const date = new Date(value)
  return date >= from && date <= to
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

function roleRate(role: string) {
  const r = role.toLowerCase()
  if (r.includes("manager")) return 220
  if (r.includes("barista")) return 170
  if (r.includes("cashier")) return 160
  if (r.includes("waiter")) return 150
  if (r.includes("cleaner")) return 130
  return 145
}

function hours(start: string | null, end: string | null) {
  if (!start || !end) return 8
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const value = (eh + em / 60) - (sh + sm / 60)
  return value > 0 ? value : value + 24
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>
}) {
  await requirePermissionOrRedirect("analytics.view")
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStart = startOfDay(yesterday)
  const yesterdayEnd = endOfDay(yesterday)
  const thisMonthStart = monthStart(now)
  const lastMonthStart = previousMonthStart(now)
  const lastMonthEnd = monthEnd(lastMonthStart)
  const period = params?.period === "this-month" ? "this-month" : params?.period === "all" ? "all" : "last-month"
  const periodStart = period === "this-month" ? thisMonthStart : period === "last-month" ? lastMonthStart : new Date("2000-01-01")
  const periodEnd = period === "this-month" ? now : period === "last-month" ? lastMonthEnd : now
  const periodDays = period === "all" ? 30 : daysBetween(periodStart, periodEnd)
  const periodLabel = period === "this-month" ? "This month" : period === "all" ? "All time" : "Last month"

  const [ordersRes, productsRes, shiftsRes, historyRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, created_at, waiter_name")
      .eq("status", "closed")
      .order("created_at", { ascending: false }),
    supabase.from("products").select("name, category, quantity"),
    supabase
      .from("shifts")
      .select("work_date, shift_type, start_time, end_time, staff:staff_id(role)")
      .gte("work_date", periodStart.toISOString().slice(0, 10))
      .lte("work_date", periodEnd.toISOString().slice(0, 10))
      .neq("shift_type", "day_off"),
    supabase
      .from("inventory_history")
      .select("product_name, delta, quantity_after, reason, changed_at")
      .gte("changed_at", periodStart.toISOString())
      .lte("changed_at", periodEnd.toISOString()),
  ])

  const orders = ordersRes.data ?? []
  const orderRevenue = (from?: Date, to?: Date) => orders
    .filter((order) => {
      const date = new Date(order.created_at)
      return (!from || date >= from) && (!to || date <= to)
    })
    .reduce((sum, order) => sum + Number(order.total), 0)

  const todayRevenue = orderRevenue(todayStart, todayEnd)
  const yesterdayRevenue = orderRevenue(yesterdayStart, yesterdayEnd)
  const monthRevenue = orderRevenue(thisMonthStart)
  const lastMonthRevenue = orderRevenue(lastMonthStart, lastMonthEnd)
  const periodOrders = orders.filter((order) => inRange(order.created_at, periodStart, periodEnd))
  const periodRevenue = periodOrders.reduce((sum, order) => sum + Number(order.total), 0)
  const allRevenue = orderRevenue()

  const inventoryValue = (productsRes.data ?? []).reduce(
    (sum, product) => sum + Number(product.quantity ?? 0) * estimatedUnitCost(product),
    0,
  )
  const productPurchaseExpense = (historyRes.data ?? [])
    .filter((row) => Number(row.delta) > 0)
    .reduce((sum, row) => {
      const product = (productsRes.data ?? []).find((item) => item.name === row.product_name)
      return sum + Number(row.delta) * estimatedUnitCost(product ?? { name: row.product_name })
    }, 0)
  const estimatedProductCost = periodRevenue * 0.26
  const rentExpense = Math.round(75000 / 30 * periodDays)
  const utilitiesExpense = Math.round(28000 / 30 * periodDays)
  const suppliesExpense = Math.round(18000 / 30 * periodDays)
  const marketingExpense = Math.round(12000 / 30 * periodDays)

  const salaryExpense = (shiftsRes.data ?? []).reduce((sum, shift) => {
    const staff = Array.isArray(shift.staff) ? shift.staff[0] : shift.staff
    const rate = roleRate(staff?.role ?? "staff")
    return sum + rate * hours(shift.start_time, shift.end_time)
  }, 0)

  const fixedExpenses = rentExpense + utilitiesExpense + suppliesExpense + marketingExpense
  const totalExpenses = estimatedProductCost + salaryExpense + fixedExpenses
  const netProfit = periodRevenue - totalExpenses
  const margin = periodRevenue > 0 ? Math.round((netProfit / periodRevenue) * 100) : 0
  const averageOrder = periodOrders.length ? periodRevenue / periodOrders.length : 0

  const expenseRows = [
    { label: "Products / ingredients", value: estimatedProductCost, hint: `COGS estimate: 26% of sales${productPurchaseExpense > 0 ? ` · purchase records tracked: ${kgs(productPurchaseExpense)}` : ""}` },
    { label: "Salaries", value: salaryExpense, hint: `${shiftsRes.data?.length ?? 0} shifts × hourly role rates` },
    { label: "Rent", value: rentExpense, hint: `${periodDays} days of rent` },
    { label: "Utilities", value: utilitiesExpense, hint: "electricity, water, internet" },
    { label: "Supplies", value: suppliesExpense, hint: "cups, napkins, cleaning supplies" },
    { label: "Marketing", value: marketingExpense, hint: "ads and promos" },
  ]

  const topWaiters = new Map<string, number>()
  for (const order of periodOrders) {
    const name = order.waiter_name || "Unknown"
    topWaiters.set(name, (topWaiters.get(name) ?? 0) + Number(order.total))
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
          <p className="text-muted-foreground text-pretty">Revenue, real and estimated expenses, salaries, products, and net profit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={period === "last-month" ? "default" : "outline"} size="sm">
            <Link href="/revenue?period=last-month">Last month</Link>
          </Button>
          <Button asChild variant={period === "this-month" ? "default" : "outline"} size="sm">
            <Link href="/revenue?period=this-month">This month</Link>
          </Button>
          <Button asChild variant={period === "all" ? "default" : "outline"} size="sm">
            <Link href="/revenue?period=all">All time</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href="#expenses">Open expenses <ArrowRight className="size-4" /></a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Today" value={kgs(todayRevenue)} hint="revenue for today" icon={Banknote} />
        <Metric title="Yesterday" value={kgs(yesterdayRevenue)} hint="revenue for yesterday" icon={CalendarDays} />
        <Metric title="Last month" value={kgs(lastMonthRevenue)} hint="seed/demo period" icon={TrendingUp} />
        <Metric title="All time" value={kgs(allRevenue)} hint="all closed orders" icon={WalletCards} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>{periodLabel} profit overview</CardTitle>
            <CardDescription>
              {periodOrders.length} closed orders · average order {kgs(averageOrder)} · {periodDays} days counted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Revenue" value={kgs(periodRevenue)} tone="good" />
              <Summary label="Expenses" value={kgs(totalExpenses)} tone="bad" />
              <Summary label="Net profit" value={kgs(netProfit)} tone={netProfit >= 0 ? "good" : "bad"} />
            </div>
            <div className="rounded-2xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Profit margin</span>
                <span className={netProfit >= 0 ? "font-semibold text-emerald-500" : "font-semibold text-red-500"}>{margin}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-background">
                <div className={netProfit >= 0 ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-red-500"} style={{ width: `${Math.min(Math.abs(margin), 100)}%` }} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TinyStat label="Product cost" value={kgs(estimatedProductCost)} />
              <TinyStat label="Salary cost" value={kgs(salaryExpense)} />
              <TinyStat label="Fixed cost" value={kgs(fixedExpenses)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="size-5 text-amber-500" /> Inventory value</CardTitle>
            <CardDescription>Estimated money currently stored in products.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold text-amber-500">{kgs(inventoryValue)}</p>
            <p className="text-sm text-muted-foreground">
              Calculated as quantity × estimated market purchase cost for each product.
            </p>
            <div className="rounded-xl border bg-background/40 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Products tracked</span>
                <span className="font-medium">{productsRes.data?.length ?? 0}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-muted-foreground">Purchase records</span>
                <span className="font-medium">{historyRes.data?.length ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="expenses" className="grid gap-4 lg:grid-cols-2">
        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-amber-500" /> Expenses</CardTitle>
            <CardDescription>Expense breakdown for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {expenseRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 rounded-xl border bg-background/40 p-3">
                <div>
                  <p className="font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                </div>
                <p className="font-semibold tabular-nums">{kgs(row.value)}</p>
              </div>
            ))}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Total expenses</p>
                  <p className="text-xs text-muted-foreground">products + salaries + fixed costs</p>
                </div>
                <p className="font-semibold tabular-nums text-red-500">{kgs(totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Coins className="size-5 text-amber-500" /> Top staff revenue</CardTitle>
            <CardDescription>Staff members who generated the most revenue for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from(topWaiters.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border bg-background/40 p-3">
                <span className="font-medium">{name}</span>
                <span className="font-semibold tabular-nums">{kgs(value)}</span>
              </div>
            ))}
            {topWaiters.size === 0 && <p className="text-sm text-muted-foreground">No closed orders for the selected period yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          title="Cash health"
          value={netProfit >= 0 ? "Healthy" : "Needs attention"}
          text={netProfit >= 0 ? "Cafe is profitable for this period." : "Expenses are higher than revenue. Check salaries, product purchases, or rent assumptions."}
          good={netProfit >= 0}
        />
        <InsightCard
          title="Cost ratio"
          value={`${periodRevenue > 0 ? Math.round((totalExpenses / periodRevenue) * 100) : 0}%`}
          text="Expenses as a percentage of revenue."
          good={periodRevenue > 0 && totalExpenses / periodRevenue < 0.75}
        />
        <InsightCard
          title="Inventory coverage"
          value={kgs(inventoryValue)}
          text="Estimated value of products currently in stock."
          good={inventoryValue > 0}
        />
      </div>
    </div>
  )
}

function Metric({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-background/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${tone === "good" ? "text-emerald-500" : "text-red-500"}`}>{value}</p>
    </div>
  )
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function InsightCard({ title, value, text, good }: { title: string; value: string; text: string; good: boolean }) {
  return (
    <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
          <div className={`flex size-9 items-center justify-center rounded-lg ${good ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
            {good ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-semibold ${good ? "text-emerald-500" : "text-red-500"}`}>{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
