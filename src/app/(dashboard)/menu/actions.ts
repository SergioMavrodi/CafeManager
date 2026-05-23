"use server"

import { revalidatePath } from "next/cache"

import { logActivity } from "@/lib/audit"
import { requirePermission } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export type MenuActionResult = { ok: true } | { ok: false; error: string }

export async function addMenuItem(input: {
  name: string
  category: string
  price: number
  cost_price: number
}): Promise<MenuActionResult> {
  const ctx = await requirePermission("menu.write")
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      name: input.name.trim(),
      category: input.category.trim(),
      price: input.price,
      cost_price: input.cost_price,
      is_available: true,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "menu.create",
    entityType: "menu_item",
    entityId: data.id,
    metadata: input,
    ctx,
  })
  revalidatePath("/menu")
  return { ok: true }
}

export async function toggleMenuItemAvailability(
  id: string,
  is_available: boolean,
): Promise<MenuActionResult> {
  const ctx = await requirePermission("menu.write")
  const supabase = await createClient()
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "menu.toggleAvailable",
    entityType: "menu_item",
    entityId: id,
    metadata: { is_available },
    ctx,
  })
  revalidatePath("/menu")
  return { ok: true }
}

export async function updateMenuItem(
  id: string,
  input: {
    name?: string
    category?: string
    price?: number
    cost_price?: number
    is_available?: boolean
    description?: string
    image_url?: string
    ingredients?: string
    weight_grams?: number
  },
): Promise<MenuActionResult> {
  const ctx = await requirePermission("menu.write")
  const supabase = await createClient()
  const { error } = await supabase.from("menu_items").update(input).eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "menu.update",
    entityType: "menu_item",
    entityId: id,
    metadata: input,
    ctx,
  })
  revalidatePath("/menu")
  return { ok: true }
}

export async function deleteMenuItem(id: string): Promise<MenuActionResult> {
  const ctx = await requirePermission("menu.write")
  const supabase = await createClient()
  const { error } = await supabase.from("menu_items").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "menu.delete",
    entityType: "menu_item",
    entityId: id,
    ctx,
  })
  revalidatePath("/menu")
  return { ok: true }
}
