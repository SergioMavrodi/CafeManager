"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Trash2, X } from "lucide-react"

import {
  addMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  updateMenuItem,
} from "@/app/(dashboard)/menu/actions"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { can, type Role } from "@/lib/rbac"

export type MenuRow = {
  id: string
  name: string
  category: string
  price: number
  cost_price: number
  is_available: boolean
  description?: string | null
  image_url?: string | null
  ingredients?: string | null
  weight_grams?: number | null
}

type MenuViewProps = { initialRows: MenuRow[]; role?: Role }

export function MenuView({ initialRows, role = "staff" }: MenuViewProps) {
  const canWrite = can(role, "menu.write")
  const router = useRouter()
  const [rows, setRows] = React.useState<MenuRow[]>(initialRows)
  const [loadingId, setLoadingId] = React.useState<string | null>(null)

  // Add dialog
  const [addOpen, setAddOpen] = React.useState(false)
  const [addName, setAddName] = React.useState("")
  const [addCategory, setAddCategory] = React.useState("")
  const [addPrice, setAddPrice] = React.useState("")
  const [addCost, setAddCost] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  // Edit dialog
  const [editRow, setEditRow] = React.useState<MenuRow | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editCategory, setEditCategory] = React.useState("")
  const [editPrice, setEditPrice] = React.useState("")
  const [editCost, setEditCost] = React.useState("")
  const [editDesc, setEditDesc] = React.useState("")
  const [editImage, setEditImage] = React.useState("")
  const [editIngredients, setEditIngredients] = React.useState("")
  const [editWeight, setEditWeight] = React.useState("")
  const [editAvail, setEditAvail] = React.useState(true)
  const [editError, setEditError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)

  // Details modal
  const [detailRow, setDetailRow] = React.useState<MenuRow | null>(null)

  // Delete dialog
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => { setRows(initialRows) }, [initialRows])

  function resetAdd() {
    setAddName(""); setAddCategory(""); setAddPrice(""); setAddCost(""); setAddError(null)
  }

  function openEdit(row: MenuRow) {
    setEditRow(row)
    setEditName(row.name)
    setEditCategory(row.category)
    setEditPrice(String(row.price))
    setEditCost(String(row.cost_price))
    setEditDesc(row.description ?? "")
    setEditImage(row.image_url ?? "")
    setEditIngredients(row.ingredients ?? "")
    setEditWeight(row.weight_grams ? String(row.weight_grams) : "")
    setEditAvail(row.is_available)
    setEditError(null)
  }

  function closeEdit() {
    setEditRow(null)
    setEditError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const p = parseFloat(addPrice)
    const cp = parseFloat(addCost || "0")
    if (!addName.trim() || !addCategory.trim() || isNaN(p)) return
    setAdding(true); setAddError(null)
    const result = await addMenuItem({ name: addName, category: addCategory, price: p, cost_price: cp })
    setAdding(false)
    if (!result.ok) { setAddError(result.error); return }
    setAddOpen(false)
    resetAdd()
    router.refresh()
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    const p = parseFloat(editPrice)
    const cp = parseFloat(editCost || "0")
    const w = editWeight ? parseFloat(editWeight) : undefined
    if (!editName.trim() || !editCategory.trim() || isNaN(p)) return
    setEditing(true); setEditError(null)
    const result = await updateMenuItem(editRow.id, {
      name: editName,
      category: editCategory,
      price: p,
      cost_price: cp,
      is_available: editAvail,
      description: editDesc || undefined,
      image_url: editImage || undefined,
      ingredients: editIngredients || undefined,
      weight_grams: w,
    })
    setEditing(false)
    if (!result.ok) { setEditError(result.error); return }
    closeEdit()
    router.refresh()
  }

  async function handleToggle(row: MenuRow) {
    setLoadingId(row.id)
    await toggleMenuItemAvailability(row.id, !row.is_available)
    setLoadingId(null)
    router.refresh()
  }

  async function handleConfirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await deleteMenuItem(deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (editRow?.id === deleteId) closeEdit()
    if (detailRow?.id === deleteId) setDetailRow(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {canWrite ? "Click a row to view details. Toggle availability to change status." : "View menu items and availability."}
        </p>
        {canWrite && (
          <Button type="button" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add Item
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground text-sm">No menu items yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Available</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setDetailRow(row)}
                >
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-right tabular-nums">${Number(row.price).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">${Number(row.cost_price).toFixed(2)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canWrite ? (
                      <button
                        onClick={() => handleToggle(row)}
                        disabled={loadingId === row.id}
                        className="disabled:opacity-50"
                      >
                        {row.is_available ? (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">Available</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200">Hidden</Badge>
                        )}
                      </button>
                    ) : (
                      row.is_available ? (
                        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">Available</Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200">Hidden</Badge>
                      )
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          disabled={loadingId === row.id}
                          onClick={() => setDeleteId(row.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Dialog */}
      {canWrite && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md" showCloseButton>
            <form onSubmit={handleAdd}>
              <DialogHeader>
                <DialogTitle>Add menu item</DialogTitle>
                <DialogDescription>Add a new item to the menu.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {addError && <p className="text-destructive text-sm" role="alert">{addError}</p>}
                <div className="grid gap-2">
                  <Label htmlFor="m-name">Name</Label>
                  <Input id="m-name" placeholder="Flat White" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="m-cat">Category</Label>
                  <Input id="m-cat" placeholder="Coffee" value={addCategory} onChange={(e) => setAddCategory(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="m-price">Price ($)</Label>
                    <Input id="m-price" type="number" min={0} step={0.01} placeholder="4.50" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="m-cost">Cost ($)</Label>
                    <Input id="m-cost" type="number" min={0} step={0.01} placeholder="1.20" value={addCost} onChange={(e) => setAddCost(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={adding}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={adding}>{adding ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {canWrite && (
        <Dialog open={editRow !== null} onOpenChange={(open) => !open && closeEdit()}>
          <DialogContent className="sm:max-w-lg" showCloseButton>
            <form onSubmit={handleEditSave}>
              <DialogHeader>
                <DialogTitle>Edit menu item</DialogTitle>
                <DialogDescription>Update item details and availability.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
                {editError && <p className="text-destructive text-sm" role="alert">{editError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="e-name">Name</Label>
                    <Input id="e-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e-cat">Category</Label>
                    <Input id="e-cat" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="e-price">Price ($)</Label>
                    <Input id="e-price" type="number" min={0} step={0.01} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e-cost">Cost ($)</Label>
                    <Input id="e-cost" type="number" min={0} step={0.01} value={editCost} onChange={(e) => setEditCost(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e-weight">Weight (g)</Label>
                    <Input id="e-weight" type="number" min={0} step={1} placeholder="250" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="e-img">Image URL</Label>
                  <Input id="e-img" placeholder="https://…" value={editImage} onChange={(e) => setEditImage(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="e-desc">Description</Label>
                  <Input id="e-desc" placeholder="Short description…" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="e-ing">Ingredients</Label>
                  <Input id="e-ing" placeholder="Coffee, milk, sugar…" value={editIngredients} onChange={(e) => setEditIngredients(e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="e-avail" className="cursor-pointer">Available</Label>
                    <p className="text-muted-foreground text-xs">Show this item on the menu</p>
                  </div>
                  <Switch id="e-avail" checked={editAvail} onCheckedChange={setEditAvail} />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteId(editRow?.id ?? null)}
                  disabled={editing}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={editing}>Cancel</Button>
                  </DialogClose>
                  <Button type="submit" disabled={editing}>{editing ? "Saving…" : "Save"}</Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Details Modal */}
      <Dialog open={detailRow !== null} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{detailRow?.name}</DialogTitle>
            <DialogDescription>{detailRow?.category}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {detailRow?.image_url ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detailRow.image_url}
                  alt={detailRow.name}
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              </div>
            ) : (
              <div className="aspect-video w-full rounded-lg border bg-muted flex items-center justify-center text-muted-foreground text-sm">
                No image
              </div>
            )}
            <div className="space-y-2">
              {detailRow?.description && (
                <p className="text-sm text-muted-foreground">{detailRow.description}</p>
              )}
              {detailRow?.ingredients && (
                <div className="text-sm">
                  <span className="font-medium">Ingredients:</span>{" "}
                  <span className="text-muted-foreground">{detailRow.ingredients}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Weight</span>
                <span>{detailRow?.weight_grams ? `${detailRow.weight_grams}g` : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">${Number(detailRow?.price ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Availability</span>
                {detailRow?.is_available ? (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">Available</Badge>
                ) : (
                  <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200">Hidden</Badge>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            {canWrite && detailRow && (
              <Button variant="outline" onClick={() => { setDetailRow(null); openEdit(detailRow); }}>
                <Pencil className="size-4 mr-2" />
                Edit
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button"><X className="size-4 mr-2" />Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete menu item?</DialogTitle>
            <DialogDescription>
              <strong>{rows.find(r => r.id === deleteId)?.name}</strong> will be permanently removed.
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
