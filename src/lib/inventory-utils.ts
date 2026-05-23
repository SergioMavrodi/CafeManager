export type StockStatus = "OK" | "Low" | "Critical"

export type InventoryRow = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  min_quantity: number
  status: StockStatus
}

export function statusFromQuantity(qty: number, minQuantity: number = 5): StockStatus {
  if (qty === 0) return "Critical"
  if (qty <= minQuantity) return "Low"
  return "OK"
}
