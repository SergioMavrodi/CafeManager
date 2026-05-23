import { statusFromQuantity, type InventoryRow } from "@/lib/inventory-utils"
import { createClient } from "@/lib/supabase/server"

export async function getInventoryItems(): Promise<InventoryRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, quantity, unit, min_quantity")
    .order("name")

  if (error) {
    console.error("Failed to load inventory:", error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const quantity = Number(row.quantity)
    const min_quantity = Number(row.min_quantity)
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      quantity,
      unit: row.unit,
      min_quantity,
      status: statusFromQuantity(quantity, min_quantity),
    }
  })
}
