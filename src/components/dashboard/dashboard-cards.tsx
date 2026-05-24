"use client"

import * as React from "react"
import Link from "next/link"
import { DollarSign, ListTodo, Package, Users } from "lucide-react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type DashboardOrder, type DashboardShift } from "@/lib/db/dashboard"

function formatKGS(amount: number) {
  return `${amount.toLocaleString("ru-RU")} KGS`
}

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

type DashboardCardsProps = {
  todayRevenue: number
  todayOrders: DashboardOrder[]
  todayShifts: DashboardShift[]
  lowStockCount: number
  staffOnShift: number
  pendingTasks: number
}

export function DashboardCards({
  todayRevenue,
  todayOrders,
  todayShifts,
  lowStockCount,
  staffOnShift,
  pendingTasks,
}: DashboardCardsProps) {
  const [revenueOpen, setRevenueOpen] = React.useState(false)
  const [shiftsOpen, setShiftsOpen] = React.useState(false)
  const [selectedOrder, setSelectedOrder] = React.useState<DashboardOrder | null>(null)

  const cards = [
    {
      title: "Low Stock Items",
      value: String(lowStockCount),
      description: "Items below minimum stock",
      hint: "Click to check inventory",
      icon: Package,
      href: "/inventory",
      accent: lowStockCount > 0 ? "text-red-500 dark:text-red-400" : undefined,
    },
    {
      title: "Pending Tasks",
      value: String(pendingTasks),
      description: "Tasks waiting for completion",
      hint: "Click to open tasks",
      icon: ListTodo,
      href: "/tasks",
      accent: pendingTasks > 0 ? "text-orange-500 dark:text-orange-400" : undefined,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button type="button" className="group block text-left" onClick={() => setRevenueOpen(true)}>
          <Card className="h-full border-amber-500/10 bg-card/80 shadow-none backdrop-blur transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-amber-500/30 group-hover:shadow-[0_10px_30px_rgba(245,158,11,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">Today&apos;s Revenue</CardTitle>
              <CardDescription className="text-xs">Revenue for today</CardDescription>
              <CardAction>
                <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <DollarSign className="size-4" aria-hidden />
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-0">
              <p className={`text-3xl font-semibold tracking-tight tabular-nums ${todayRevenue > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {formatKGS(todayRevenue)}
              </p>
              <p className="text-muted-foreground mt-2 text-xs group-hover:text-foreground/60 transition-colors">
                Click to view orders
              </p>
            </CardContent>
          </Card>
        </button>

        <button type="button" className="group block text-left" onClick={() => setShiftsOpen(true)}>
          <Card className="h-full border-amber-500/10 bg-card/80 shadow-none backdrop-blur transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-amber-500/30 group-hover:shadow-[0_10px_30px_rgba(245,158,11,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">Staff on Shift</CardTitle>
              <CardDescription className="text-xs">Working today</CardDescription>
              <CardAction>
                <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Users className="size-4" aria-hidden />
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{staffOnShift}</p>
              <p className="text-muted-foreground mt-2 text-xs group-hover:text-foreground/60 transition-colors">
                Click to view shifts
              </p>
            </CardContent>
          </Card>
        </button>

        {cards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.title} href={stat.href} className="group block">
              <Card className="border-amber-500/10 bg-card/80 shadow-none backdrop-blur transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-amber-500/30 group-hover:shadow-[0_10px_30px_rgba(245,158,11,0.08)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-sm font-medium">{stat.title}</CardTitle>
                  <CardDescription className="text-xs">{stat.description}</CardDescription>
                  <CardAction>
                    <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-4" aria-hidden />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className={`text-3xl font-semibold tracking-tight tabular-nums ${stat.accent ?? ""}`}>{stat.value}</p>
                  <p className="text-muted-foreground mt-2 text-xs group-hover:text-foreground/60 transition-colors">{stat.hint}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Dialog open={revenueOpen} onOpenChange={setRevenueOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Today&apos;s orders</DialogTitle>
            <DialogDescription>Who made each order, which table, and how much revenue it brought.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {todayOrders.length === 0 ? (
              <div className="rounded-xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                No closed orders today.
              </div>
            ) : (
              todayOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="w-full rounded-xl border bg-card p-4 text-left transition hover:border-amber-500/40 hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">Table №{order.table_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.waiter_name || order.opened_by_email || "Unknown worker"} · closed {fmtTime(order.closed_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatKGS(Number(order.total))}</p>
                      <p className="text-xs text-muted-foreground">{order.order_items.reduce((sum, item) => sum + item.quantity, 0)} items</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftsOpen} onOpenChange={setShiftsOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Today&apos;s shift</DialogTitle>
            <DialogDescription>Who is working today and at what time.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {todayShifts.length === 0 ? (
              <div className="rounded-xl border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                Nobody is scheduled for today.
              </div>
            ) : (
              todayShifts.map((shift) => (
                <div key={shift.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
                  <div>
                    <p className="font-medium">{shift.staff?.name ?? "Unknown worker"}</p>
                    <p className="text-sm text-muted-foreground">{shift.staff?.role ?? "Staff"} · {shift.staff?.phone ?? "no phone"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium capitalize">{shift.shift_type.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{shift.start_time ?? "—"} - {shift.end_time ?? "—"}</p>
                  </div>
                </div>
              ))
            )}
            <Link href="/staff" className="block">
              <Button variant="outline" className="w-full">Open staff schedule</Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedOrder !== null} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Receipt · Table №{selectedOrder?.table_number}</DialogTitle>
            <DialogDescription>{selectedOrder?.waiter_name || selectedOrder?.opened_by_email || "Unknown worker"}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="rounded-xl border overflow-hidden">
                {selectedOrder.order_items.map((item, index) => (
                  <div key={item.id} className={`flex items-center justify-between px-4 py-2.5 text-sm ${index > 0 ? "border-t" : ""}`}>
                    <span>{item.name} <span className="text-muted-foreground">×{item.quantity}</span></span>
                    <span className="font-medium tabular-nums">{formatKGS(Number(item.price) * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatKGS(Number(selectedOrder.total))}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="rounded-lg border p-3">
                  <span className="block text-foreground font-medium">Opened</span>
                  {fmtTime(selectedOrder.created_at)}
                </div>
                <div className="rounded-lg border p-3">
                  <span className="block text-foreground font-medium">Closed</span>
                  {fmtTime(selectedOrder.closed_at)}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
