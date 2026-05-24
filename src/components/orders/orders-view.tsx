"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Minus, Plus } from "lucide-react"

import { createOrder, addItemsToOrder, closeOrder, cancelOrder, type CartItem } from "@/app/orders/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { can, type Role } from "@/lib/rbac"

export type MenuItem = {
  id: string
  name: string
  category: string
  price: number
  is_available: boolean
  image_url: string | null
}

export type CafeTable = {
  id: string
  number: number
  seats: number
  status: string
}

export type OrderItem = {
  id: string
  name: string
  price: number
  quantity: number
}

export type Order = {
  id: string
  table_number: number
  status: "open" | "closed" | "cancelled"
  total: number
  note: string | null
  opened_by_email: string | null
  waiter_id: string | null
  waiter_name: string | null
  created_at: string
  closed_at: string | null
  order_items: OrderItem[]
}

type Props = {
  menuItems: MenuItem[]
  tables: CafeTable[]
  orders: Order[]
  role: Role
  initialNewOrderOpen?: boolean
}

const CATEGORY_ORDER = [
  "Coffee", "Cold Drinks", "Pastry", "Burgers", "Desserts",
  "Drinks", "Meat", "Dough", "Sauces", "Other",
]

function fmtPrice(n: number) {
  return `${n.toFixed(2)} KGS`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

export function OrdersView({ menuItems, tables, orders: initialOrders, role, initialNewOrderOpen = false }: Props) {
  const router = useRouter()
  const [orders, setOrders] = React.useState<Order[]>(initialOrders)
  const [newOrderOpen, setNewOrderOpen] = React.useState(false)

  const [selectedTable, setSelectedTable] = React.useState<CafeTable | null>(null)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [note, setNote] = React.useState("")
  const [step, setStep] = React.useState<"menu" | "table" | "confirm">("menu")
  const [saving, setSaving] = React.useState(false)

  const [expandedOrderId, setExpandedOrderId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<"open" | "history">("open")
  const [addItemsTarget, setAddItemsTarget] = React.useState<Order | null>(null)
  const [addItemsCart, setAddItemsCart] = React.useState<CartItem[]>([])
  const [addingItems, setAddingItems] = React.useState(false)

  const canCreate = can(role, "orders.create")
  const canClose = can(role, "orders.close")
  const canDelete = can(role, "orders.delete")

  const openOrders = orders.filter((o) => o.status === "open")
  const closedOrders = orders.filter((o) => o.status !== "open")

  const tablesWithStatus = tables.map((t) => ({
    ...t,
    hasOpen: orders.some((o) => o.status === "open" && o.table_number === t.number),
  }))

  const menuByCategory = React.useMemo(() => {
    const map = new Map<string, MenuItem[]>()
    for (const item of menuItems.filter((i) => i.is_available)) {
      const cat = item.category || "Other"
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(item)
    }
    const sorted = Array.from(map.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0])
      const ib = CATEGORY_ORDER.indexOf(b[0])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    return sorted
  }, [menuItems])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === itemId)
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.menu_item_id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      }
      return prev.filter((c) => c.menu_item_id !== itemId)
    })
  }

  function getQty(itemId: string) {
    return cart.find((c) => c.menu_item_id === itemId)?.quantity ?? 0
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const addItemsTotal = addItemsCart.reduce((s, c) => s + c.price * c.quantity, 0)
  const addItemsCount = addItemsCart.reduce((s, c) => s + c.quantity, 0)

  function openNewOrder() {
    setCart([])
    setSelectedTable(null)
    setNote("")
    setStep("menu")
    setNewOrderOpen(true)
  }

  function addToExtraCart(item: MenuItem) {
    setAddItemsCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function removeFromExtraCart(itemId: string) {
    setAddItemsCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === itemId)
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.menu_item_id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      }
      return prev.filter((c) => c.menu_item_id !== itemId)
    })
  }

  function getExtraQty(itemId: string) {
    return addItemsCart.find((c) => c.menu_item_id === itemId)?.quantity ?? 0
  }

  function openAddItems(order: Order) {
    setAddItemsTarget(order)
    setAddItemsCart([])
  }

  React.useEffect(() => {
    if (initialNewOrderOpen && canCreate) {
      setTimeout(() => {
        setCart([])
        setSelectedTable(null)
        setNote("")
        setStep("menu")
        setNewOrderOpen(true)
        router.replace("/orders")
      }, 0)
    }
  }, [initialNewOrderOpen, canCreate, router])

  async function handlePlaceOrder() {
    if (!selectedTable || cart.length === 0) return
    setSaving(true)
    try {
      const createdOrder = await createOrder(selectedTable.id, selectedTable.number, cart, note)
      toast.success(`Order for table #${selectedTable.number} was created!`)
      setOrders((prev) => [createdOrder as Order, ...prev])
      setNewOrderOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  async function handleClose(orderId: string) {
    try {
      await closeOrder(orderId)
      toast.success("Order closed")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error")
    }
  }

  async function handleCancel(orderId: string) {
    try {
      await cancelOrder(orderId)
      toast.success("Order cancelled")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error")
    }
  }

  async function handleAddItems() {
    if (!addItemsTarget || addItemsCart.length === 0) return
    setAddingItems(true)
    try {
      const result = await addItemsToOrder(addItemsTarget.id, addItemsCart)
      toast.success("Items added to order")
      setOrders((prev) =>
        prev.map((order) =>
          order.id === addItemsTarget.id
            ? {
                ...order,
                total: Number(order.total) + result.extraTotal,
                order_items: [...order.order_items, ...result.order_items],
              }
            : order
        )
      )
      setAddItemsTarget(null)
      setAddItemsCart([])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error")
    } finally {
      setAddingItems(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-pretty">Take orders, track tables, and manage service.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-card p-1">
        <button
          type="button"
          className={`rounded-md px-3 py-1 text-sm transition ${activeTab === "open" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("open")}
        >
          Open ({openOrders.length})
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1 text-sm transition ${activeTab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("history")}
        >
          History ({closedOrders.length})
        </button>
      </div>

      {/* Orders list */}
      <div className="grid gap-3">
        {(activeTab === "open" ? openOrders : closedOrders).map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            showHistoryDetails={role === "admin" || role === "manager" || order.status !== "open"}
            isExpanded={expandedOrderId === order.id}
            onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
            onClose={canClose ? () => handleClose(order.id) : undefined}
            onCancel={canDelete ? () => handleCancel(order.id) : undefined}
            onAddItems={canCreate ? () => openAddItems(order) : undefined}
          />
        ))}
        {(activeTab === "open" ? openOrders : closedOrders).length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
            <p className="text-muted-foreground text-sm">
              {activeTab === "open" ? "No open orders." : "No history yet."}
            </p>
          </div>
        )}
      </div>

      {/* New Order Dialog */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl grid-rows-none flex-col overflow-hidden border-amber-500/10 bg-card p-0 sm:rounded-2xl" showCloseButton>
          <DialogHeader className="border-b border-amber-500/10 px-6 py-4">
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>

          {step === "menu" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {menuByCategory.map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      {category}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {items.map((item) => {
                        const qty = getQty(item.id)
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border bg-card p-3 flex flex-col gap-2"
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full aspect-video object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                                No image
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium line-clamp-2">{item.name}</p>
                              <span className="text-sm font-semibold tabular-nums shrink-0">
                                {fmtPrice(item.price)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-auto pt-1">
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => removeFromCart(item.id)}
                                  disabled={qty === 0}
                                >
                                  <Minus className="size-3" />
                                </Button>
                                <span className="text-xs font-semibold tabular-nums w-4 text-center">
                                  {qty > 0 ? qty : ""}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => addToCart(item)}
                                >
                                  <Plus className="size-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t px-6 py-4 shrink-0 flex justify-between items-center">
                <div className="text-sm">
                  <span className="text-muted-foreground">Items: </span>
                  <span className="font-semibold">{cartCount}</span>
                  <span className="text-muted-foreground ml-3">Total: </span>
                  <span className="font-semibold">{fmtPrice(cartTotal)}</span>
                </div>
                <Button onClick={() => setStep("table")} disabled={cartCount === 0}>
                  Select Table →
                </Button>
              </div>
            </div>
          )}

          {step === "table" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 px-6 py-4 overflow-y-auto space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Table</p>
                  <div className="grid grid-cols-5 gap-2">
                    {tables.map((t) => {
                      const busy = tablesWithStatus.find((tw) => tw.id === t.id)?.hasOpen
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={!!busy}
                          onClick={() => setSelectedTable(t)}
                          className={`rounded-xl border p-3 text-center transition-all ${
                            selectedTable?.id === t.id
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                              : busy
                              ? "opacity-40 cursor-not-allowed bg-muted"
                              : "hover:border-foreground/40 bg-card"
                          }`}
                        >
                          <p className="text-lg font-bold leading-none">№{t.number}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t.seats} seats</p>
                          {busy && <p className="text-xs text-orange-500 mt-0.5">Busy</p>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order-note">Note (optional)</Label>
                  <Input
                    id="order-note"
                    placeholder="No onions, to-go, etc."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t px-6 py-4 shrink-0 flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep("menu")}>← Back</Button>
                <Button onClick={() => setStep("confirm")} disabled={!selectedTable}>
                  Confirm →
                </Button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
                <div className="rounded-xl border bg-muted/40 p-4 space-y-1">
                  <p className="text-sm font-medium">Table №{selectedTable?.number} · {selectedTable?.seats} seats</p>
                  <p className="text-xs text-muted-foreground">Waiter: current account</p>
                  {note && <p className="text-xs text-muted-foreground">Note: {note}</p>}
                </div>

                <div className="rounded-xl border overflow-hidden">
                  {cart.map((item, i) => (
                    <div key={item.menu_item_id} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? "border-t" : ""}`}>
                      <span>{item.name} <span className="text-muted-foreground">×{item.quantity}</span></span>
                      <span className="font-medium tabular-nums">{fmtPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 font-semibold text-sm">
                    <span>Total</span>
                    <span>{fmtPrice(cartTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t px-6 py-4 shrink-0 flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep("table")}>← Back</Button>
                <Button onClick={handlePlaceOrder} disabled={saving}>
                  {saving ? "Creating..." : "Place Order ✓"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addItemsTarget !== null} onOpenChange={(open) => !open && setAddItemsTarget(null)}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl grid-rows-none flex-col overflow-hidden border-amber-500/10 bg-card p-0 sm:rounded-2xl" showCloseButton>
          <DialogHeader className="border-b border-amber-500/10 px-6 py-4">
            <DialogTitle>Add items to table №{addItemsTarget?.table_number}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {menuByCategory.map(([category, items]) => (
              <div key={category}>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  {category}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const qty = getExtraQty(item.id)
                    return (
                      <div key={item.id} className="rounded-xl border bg-card p-3 flex flex-col gap-2">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full aspect-video object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                            No image
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium line-clamp-2">{item.name}</p>
                          <span className="text-sm font-semibold tabular-nums shrink-0">
                            {fmtPrice(item.price)}
                          </span>
                        </div>
                        <div className="mt-auto flex items-center gap-1 pt-2">
                          <Button type="button" variant="outline" size="icon" className="size-6" onClick={() => removeFromExtraCart(item.id)} disabled={qty === 0}>
                            <Minus className="size-3" />
                          </Button>
                          <span className="text-xs font-semibold tabular-nums w-4 text-center">
                            {qty > 0 ? qty : ""}
                          </span>
                          <Button type="button" variant="outline" size="icon" className="size-6" onClick={() => addToExtraCart(item)}>
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t px-6 py-4 shrink-0 flex justify-between items-center">
            <div className="text-sm">
              <span className="text-muted-foreground">New items: </span>
              <span className="font-semibold">{addItemsCount}</span>
              <span className="text-muted-foreground ml-3">Extra total: </span>
              <span className="font-semibold">{fmtPrice(addItemsTotal)}</span>
            </div>
            <Button onClick={handleAddItems} disabled={addingItems || addItemsCount === 0}>
              {addingItems ? "Adding..." : "Add to Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OrderCard({
  order,
  showHistoryDetails,
  isExpanded,
  onToggle,
  onClose,
  onCancel,
  onAddItems,
}: {
  order: Order
  showHistoryDetails: boolean
  isExpanded: boolean
  onToggle: () => void
  onClose?: () => void
  onCancel?: () => void
  onAddItems?: () => void
}) {
  const isOpen = order.status === "open"
  const itemCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="rounded-xl border bg-card ring-1 ring-foreground/10 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg font-bold">
            {order.table_number}
          </div>
          <div>
            <p className="font-medium">Table №{order.table_number}</p>
            <p className="text-xs text-muted-foreground">
              {fmtTime(order.created_at)}{order.waiter_name ? ` · ${order.waiter_name}` : ""}
            </p>
            {showHistoryDetails && !isOpen && (
              <p className="text-xs text-muted-foreground">
                Closed: {order.closed_at ? fmtTime(order.closed_at) : "—"} · {itemCount} dishes
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold tabular-nums">{fmtPrice(order.total)}</span>
          <Badge variant={isOpen ? "default" : order.status === "closed" ? "secondary" : "destructive"}>
            {isOpen ? "Open" : order.status === "closed" ? "Closed" : "Cancelled"}
          </Badge>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t px-4 py-4">
          {order.note && (
            <p className="text-sm text-muted-foreground mb-3">Note: {order.note}</p>
          )}
          {showHistoryDetails && (
            <div className="mb-3 grid gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-4">
              <div>
                <span className="block font-medium text-foreground">Waiter</span>
                {order.waiter_name ?? order.opened_by_email ?? "—"}
              </div>
              <div>
                <span className="block font-medium text-foreground">Table</span>
                №{order.table_number}
              </div>
              <div>
                <span className="block font-medium text-foreground">Created</span>
                {fmtTime(order.created_at)}
              </div>
              <div>
                <span className="block font-medium text-foreground">Items / Total</span>
                {itemCount} · {fmtPrice(order.total)}
              </div>
            </div>
          )}
          <div className="rounded-lg border overflow-hidden mb-3">
            {order.order_items.map((item, i) => (
              <div key={item.id} className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? "border-t" : ""}`}>
                <span>{item.name} × {item.quantity}</span>
                <span className="tabular-nums">{fmtPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {isOpen && onAddItems && (
              <Button size="sm" variant="outline" onClick={onAddItems}>Add items</Button>
            )}
            {isOpen && onClose && (
              <Button size="sm" onClick={onClose}>Close Order</Button>
            )}
            {isOpen && onCancel && (
              <Button size="sm" variant="destructive" onClick={onCancel}>Cancel</Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
