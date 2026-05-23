"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Minus, Pencil, Plus, Trash2 } from "lucide-react"

import {
  addInventoryItem,
  adjustStock,
  deleteInventoryItem,
  updateInventoryItem,
} from "@/app/(dashboard)/inventory/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type InventoryRow, type StockStatus } from "@/lib/inventory-utils"
import { can, type Role } from "@/lib/rbac"
import { runWithToast } from "@/lib/toast"

export type InventoryHistoryRow = {
  id: string
  product_name: string | null
  delta: number
  quantity_after: number
  reason: string | null
  changed_by_email: string | null
  changed_at: string
}

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === "Critical") return <Badge variant="destructive">Critical</Badge>
  if (status === "Low") {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        Low
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
      OK
    </Badge>
  )
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

type InventoryViewProps = {
  initialRows: InventoryRow[]
  role: Role
  history: InventoryHistoryRow[]
}

export function InventoryView({ initialRows, role, history }: InventoryViewProps) {
  const router = useRouter()
  const canWrite = can(role, "inventory.write")
  const canSeeHistory = can(role, "inventory.write")

  const [rows, setRows] = React.useState<InventoryRow[]>(initialRows)
  const [tab, setTab] = React.useState<"stock" | "history">("stock")
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // Add dialog
  const [addOpen, setAddOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [quantity, setQuantity] = React.useState("")
  const [unit, setUnit] = React.useState("")
  const [minQty, setMinQty] = React.useState("5")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Edit dialog
  const [editTarget, setEditTarget] = React.useState<InventoryRow | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editCategory, setEditCategory] = React.useState("")
  const [editUnit, setEditUnit] = React.useState("")
  const [editMin, setEditMin] = React.useState("5")
  const [editSaving, setEditSaving] = React.useState(false)
  const [editError, setEditError] = React.useState<string | null>(null)

  // Adjust stock dialog
  const [adjustTarget, setAdjustTarget] = React.useState<InventoryRow | null>(null)
  const [adjustMode, setAdjustMode] = React.useState<"add" | "subtract">("subtract")
  const [adjustAmount, setAdjustAmount] = React.useState("")
  const [adjustReason, setAdjustReason] = React.useState("")
  const [adjusting, setAdjusting] = React.useState(false)
  const [adjustError, setAdjustError] = React.useState<string | null>(null)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => { setRows(initialRows) }, [initialRows])

  function resetAddForm() {
    setName(""); setCategory(""); setQuantity(""); setUnit(""); setMinQty("5"); setError(null)
  }
  function handleAddOpenChange(open: boolean) {
    setAddOpen(open)
    if (!open) resetAddForm()
  }
  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    const qty = Number.parseFloat(quantity)
    const min = Number.parseFloat(minQty)
    if (!name.trim() || !category.trim() || !unit.trim() || Number.isNaN(qty) || qty < 0) return
    setSaving(true); setError(null)
    const result = await addInventoryItem({
      name, category, unit, quantity: qty,
      min_quantity: Number.isNaN(min) ? 5 : min,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    handleAddOpenChange(false)
    router.refresh()
  }

  function openEdit(row: InventoryRow) {
    setEditTarget(row)
    setEditName(row.name)
    setEditCategory(row.category)
    setEditUnit(row.unit)
    setEditMin(String(row.min_quantity ?? 5))
    setEditError(null)
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true); setEditError(null)
    const min = Number.parseFloat(editMin)
    const result = await updateInventoryItem(editTarget.id, {
      name: editName, category: editCategory, unit: editUnit,
      min_quantity: Number.isNaN(min) ? 5 : min,
    })
    setEditSaving(false)
    if (!result.ok) { setEditError(result.error); return }
    setEditTarget(null)
    router.refresh()
  }

  function openAdjust(row: InventoryRow, mode: "add" | "subtract") {
    setAdjustTarget(row)
    setAdjustMode(mode)
    setAdjustAmount("")
    setAdjustReason("")
    setAdjustError(null)
  }

  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustTarget) return
    const amt = Number.parseFloat(adjustAmount)
    if (Number.isNaN(amt) || amt <= 0) {
      setAdjustError("Enter a positive amount")
      return
    }
    setAdjusting(true); setAdjustError(null)
    setBusyId(adjustTarget.id)
    const delta = adjustMode === "add" ? amt : -amt
    const result = await runWithToast(
      () => adjustStock({
        productId: adjustTarget.id,
        delta,
        reason: adjustReason || undefined,
      }),
      {
        success: `${adjustMode === "add" ? "Added" : "Reduced"} ${amt} ${adjustTarget.unit} · ${adjustTarget.name}`,
      },
    )
    setAdjusting(false)
    setBusyId(null)
    if (!result.ok) { setAdjustError(result.error); return }
    setAdjustTarget(null)
    router.refresh()
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await runWithToast(() => deleteInventoryItem(deleteTarget.id), { success: "Item deleted" })
    setDeleting(false)
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm transition ${tab === "stock" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("stock")}
          >
            Stock
          </button>
          {canSeeHistory && (
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-sm transition ${tab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab("history")}
            >
              History
            </button>
          )}
        </div>
        {canWrite && tab === "stock" && (
          <Button type="button" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add Item
          </Button>
        )}
      </div>

      {tab === "stock" && (
        rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
            <p className="text-muted-foreground text-sm">No inventory items yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card ring-1 ring-foreground/10 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                    <TableCell>{row.unit}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          title="Reduce stock"
                          disabled={busyId === row.id}
                          onClick={() => openAdjust(row, "subtract")}
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </Button>
                        {canWrite && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            title="Add stock"
                            disabled={busyId === row.id}
                            onClick={() => openAdjust(row, "add")}
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Edit"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {tab === "history" && canSeeHistory && (
        history.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
            <p className="text-muted-foreground text-sm">No stock changes recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card ring-1 ring-foreground/10 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">{fmtDateTime(h.changed_at)}</TableCell>
                    <TableCell className="font-medium">{h.product_name ?? "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums ${h.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {h.delta > 0 ? `+${h.delta}` : h.delta}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.quantity_after}</TableCell>
                    <TableCell className="text-muted-foreground">{h.reason ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{h.changed_by_email ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* Add Dialog */}
      {canWrite && (
        <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
          <DialogContent className="sm:max-w-md" showCloseButton>
            <form onSubmit={handleAddSubmit}>
              <DialogHeader>
                <DialogTitle>Add inventory item</DialogTitle>
                <DialogDescription>Enter the basics for a new stock item.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
                <div className="grid gap-2">
                  <Label htmlFor="inv-name">Name</Label>
                  <Input id="inv-name" placeholder="e.g. Colombian whole bean" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-category">Category</Label>
                  <Input id="inv-category" placeholder="e.g. Coffee" value={category} onChange={(e) => setCategory(e.target.value)} required />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="inv-qty">Quantity</Label>
                    <Input id="inv-qty" type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-unit">Unit</Label>
                    <Input id="inv-unit" placeholder="kg, L, pcs" value={unit} onChange={(e) => setUnit(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-min">Min</Label>
                    <Input id="inv-min" type="number" min={0} step="0.01" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={saving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit item</DialogTitle>
              <DialogDescription>Update product details. Use +/- to change stock.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {editError && <p className="text-destructive text-sm" role="alert">{editError}</p>}
              <div className="grid gap-2">
                <Label htmlFor="ei-name">Name</Label>
                <Input id="ei-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2 col-span-2">
                  <Label htmlFor="ei-cat">Category</Label>
                  <Input id="ei-cat" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ei-unit">Unit</Label>
                  <Input id="ei-unit" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ei-min">Min quantity (reorder threshold)</Label>
                <Input id="ei-min" type="number" min={0} step="0.01" value={editMin} onChange={(e) => setEditMin(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={editSaving}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustTarget !== null} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form onSubmit={handleAdjustSubmit}>
            <DialogHeader>
              <DialogTitle>{adjustMode === "add" ? "Add stock" : "Reduce stock"}</DialogTitle>
              <DialogDescription>
                <strong>{adjustTarget?.name}</strong> · current {adjustTarget?.quantity} {adjustTarget?.unit}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {adjustError && <p className="text-destructive text-sm" role="alert">{adjustError}</p>}
              <div className="grid gap-2">
                <Label htmlFor="aa">Amount {adjustTarget && `(${adjustTarget.unit})`}</Label>
                <Input
                  id="aa"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ar">Reason (optional)</Label>
                <Input
                  id="ar"
                  placeholder={adjustMode === "add" ? "Restock from supplier" : "Used for orders"}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={adjusting}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={adjusting}>
                {adjusting ? "Saving…" : adjustMode === "add" ? "Add" : "Reduce"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
