import { MenuView, type MenuRow } from "@/components/menu/menu-view"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export default async function MenuPage() {
  const ctx = await getAuthContext()
  const supabase = await createClient()
  const { data } = await supabase
    .from("menu_items")
    .select("id, name, category, price, cost_price, is_available, description, image_url, ingredients, weight_grams")
    .order("category")
    .order("name")

  const rows: MenuRow[] = (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    price: d.price,
    cost_price: d.cost_price,
    is_available: d.is_available,
    description: d.description,
    image_url: d.image_url,
    ingredients: d.ingredients,
    weight_grams: d.weight_grams,
  }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
        <p className="text-muted-foreground">Drinks, food items, prices, and availability.</p>
      </div>
      <MenuView initialRows={rows} role={ctx?.role ?? "staff"} />
    </div>
  )
}
