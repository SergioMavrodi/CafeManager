"use server"

import { revalidatePath } from "next/cache"

import { logActivity } from "@/lib/audit"
import { can } from "@/lib/rbac"
import { requirePermission } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export type InventoryActionResult = { ok: true } | { ok: false; error: string }

export async function addInventoryItem(input: {
  name: string
  category: string
  quantity: number
  unit: string
  min_quantity?: number
}): Promise<InventoryActionResult> {
  const ctx = await requirePermission("inventory.write")
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name.trim(),
      category: input.category.trim(),
      quantity: input.quantity,
      unit: input.unit.trim(),
      min_quantity: input.min_quantity ?? 5,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  // Initial stock entry in history
  if (input.quantity > 0) {
    await supabase.from("inventory_history").insert({
      product_id: data.id,
      product_name: input.name.trim(),
      delta: input.quantity,
      quantity_after: input.quantity,
      reason: "Initial stock",
      changed_by: ctx.profileId,
      changed_by_email: ctx.email,
    })
  }

  await logActivity({
    action: "inventory.create",
    entityType: "product",
    entityId: data.id,
    metadata: { name: input.name, category: input.category, quantity: input.quantity },
    ctx,
  })
  revalidatePath("/inventory")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function updateInventoryItem(
  id: string,
  input: { name: string; category: string; unit: string; min_quantity: number },
): Promise<InventoryActionResult> {
  const ctx = await requirePermission("inventory.write")
  const supabase = await createClient()
  const { error } = await supabase
    .from("products")
    .update({
      name: input.name.trim(),
      category: input.category.trim(),
      unit: input.unit.trim(),
      min_quantity: input.min_quantity,
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "inventory.update",
    entityType: "product",
    entityId: id,
    metadata: input,
    ctx,
  })
  revalidatePath("/inventory")
  return { ok: true }
}

export async function deleteInventoryItem(id: string): Promise<InventoryActionResult> {
  const ctx = await requirePermission("inventory.write")
  const supabase = await createClient()
  const { error } = await supabase.from("products").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "inventory.delete",
    entityType: "product",
    entityId: id,
    ctx,
  })
  revalidatePath("/inventory")
  return { ok: true }
}

/**
 * Adjust stock by delta (positive = restock, negative = consume).
 * - Staff can only consume (delta < 0)
 * - Manager/admin can do both
 * Records change in inventory_history atomically (best-effort).
 */
export async function adjustStock(input: {
  productId: string
  delta: number
  reason?: string
}): Promise<InventoryActionResult> {
  const ctx = await requirePermission("inventory.reduce")
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    return { ok: false, error: "Delta must be non-zero" }
  }
  if (input.delta > 0 && !can(ctx.role, "inventory.write")) {
    return { ok: false, error: "Staff can only reduce stock" }
  }

  const supabase = await createClient()
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, name, quantity")
    .eq("id", input.productId)
    .single()
  if (pErr || !product) return { ok: false, error: pErr?.message ?? "Product not found" }

  const newQty = Number(product.quantity) + input.delta
  if (newQty < 0) {
    return { ok: false, error: "Insufficient stock" }
  }

  const { error: uErr } = await supabase
    .from("products")
    .update({ quantity: newQty })
    .eq("id", input.productId)
  if (uErr) return { ok: false, error: uErr.message }

  await supabase.from("inventory_history").insert({
    product_id: input.productId,
    product_name: product.name,
    delta: input.delta,
    quantity_after: newQty,
    reason: input.reason?.trim() || (input.delta > 0 ? "Restock" : "Consume"),
    changed_by: ctx.profileId,
    changed_by_email: ctx.email,
  })

  await logActivity({
    action: "inventory.adjust",
    entityType: "product",
    entityId: input.productId,
    metadata: {
      product: product.name,
      delta: input.delta,
      quantity_after: newQty,
      reason: input.reason ?? null,
    },
    ctx,
  })
  revalidatePath("/inventory")
  revalidatePath("/dashboard")
  return { ok: true }
}
