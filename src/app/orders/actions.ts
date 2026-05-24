"use server"

import { revalidatePath } from "next/cache"

import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export type CartItem = {
  menu_item_id: string
  name: string
  price: number
  quantity: number
}

export async function createOrder(tableId: string, tableNumber: number, items: CartItem[], note?: string) {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error("Not authenticated")

  const supabase = await createClient()

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const { data: staffProfile } = await supabase
    .from("staff")
    .select("id, name")
    .eq("email", ctx.email)
    .maybeSingle()

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.profileId)
    .maybeSingle()

  const waiterName = staffProfile?.name || profile?.full_name || ctx.email

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      table_id: tableId,
      table_number: tableNumber,
      total,
      note: note || null,
      opened_by: ctx.profileId,
      opened_by_email: ctx.email,
      waiter_id: staffProfile?.id ?? null,
      waiter_name: waiterName,
      status: "open",
    })
    .select()
    .single()

  if (orderErr || !order) throw new Error(orderErr?.message ?? "Failed to create order")

  const orderItems = items.map((i) => ({
    order_id: order.id,
    menu_item_id: i.menu_item_id,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
  }))

  const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
  if (itemsErr) throw new Error(itemsErr.message)

  // Mark table as occupied
  await supabase.from("cafe_tables").update({ status: "occupied" }).eq("id", tableId)

  revalidatePath("/orders")
  return {
    ...order,
    order_items: orderItems.map((item, index) => ({
      id: `${order.id}-${index}`,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  }
}

export async function addItemsToOrder(orderId: string, items: CartItem[]) {
  if (!(await getAuthContext())) throw new Error("Not authenticated")
  if (items.length === 0) throw new Error("No items selected")

  const supabase = await createClient()

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, total, status")
    .eq("id", orderId)
    .single()

  if (orderErr || !order) throw new Error(orderErr?.message ?? "Order not found")
  if (order.status !== "open") throw new Error("Only open orders can be updated")

  const orderItems = items.map((i) => ({
    order_id: orderId,
    menu_item_id: i.menu_item_id,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
  }))

  const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
  if (itemsErr) throw new Error(itemsErr.message)

  const extraTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const { error: updateErr } = await supabase
    .from("orders")
    .update({ total: Number(order.total) + extraTotal })
    .eq("id", orderId)

  if (updateErr) throw new Error(updateErr.message)

  revalidatePath("/orders")
  return {
    extraTotal,
    order_items: orderItems.map((item, index) => ({
      id: `${orderId}-extra-${Date.now()}-${index}`,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  }
}

export async function closeOrder(orderId: string) {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error("Not authenticated")

  const supabase = await createClient()

  // Get the order to free the table
  const { data: order } = await supabase
    .from("orders")
    .select("table_id")
    .eq("id", orderId)
    .single()

  const { error } = await supabase
    .from("orders")
    .update({ status: "closed", closed_by: ctx.profileId, closed_at: new Date().toISOString() })
    .eq("id", orderId)

  if (error) throw new Error(error.message)

  // Free the table if no other open orders on it
  if (order?.table_id) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("table_id", order.table_id)
      .eq("status", "open")

    if ((count ?? 0) === 0) {
      await supabase.from("cafe_tables").update({ status: "free" }).eq("id", order.table_id)
    }
  }

  revalidatePath("/orders")
}

export async function cancelOrder(orderId: string) {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error("Not authenticated")

  const supabase = await createClient()

  const { data: order } = await supabase
    .from("orders")
    .select("table_id")
    .eq("id", orderId)
    .single()

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)

  if (error) throw new Error(error.message)

  if (order?.table_id) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("table_id", order.table_id)
      .eq("status", "open")

    if ((count ?? 0) === 0) {
      await supabase.from("cafe_tables").update({ status: "free" }).eq("id", order.table_id)
    }
  }

  revalidatePath("/orders")
}
