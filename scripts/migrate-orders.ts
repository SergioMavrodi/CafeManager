#!/usr/bin/env tsx
/**
 * Migration: add cafe_tables, orders, order_items
 * Run: npx tsx scripts/migrate-orders.ts
 * Requires: SUPABASE_PAT in environment
 */
export {}

const PROJECT_REF = "davpdesbbjowkqnswsty"
const PAT = process.env.SUPABASE_PAT
const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}`

async function runSql(query: string) {
  const res = await fetch(`${API_BASE}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`SQL Error: ${err}`)
  }
  return await res.json()
}

const SQL = `
-- cafe_tables
CREATE TABLE IF NOT EXISTS public.cafe_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number int NOT NULL UNIQUE,
  seats int NOT NULL DEFAULT 4,
  status text NOT NULL CHECK (status IN ('free','occupied','reserved')) DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.cafe_tables(id) ON DELETE SET NULL,
  table_number int,
  status text NOT NULL CHECK (status IN ('open','closed','cancelled')) DEFAULT 'open',
  note text,
  total numeric(10,2) NOT NULL DEFAULT 0,
  opened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_by_email text,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);

-- order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);

-- RLS
ALTER TABLE public.cafe_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- cafe_tables policies
DO $$ BEGIN
  CREATE POLICY tables_select ON public.cafe_tables FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tables_write ON public.cafe_tables FOR ALL TO authenticated
    USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- orders policies
DO $$ BEGIN
  CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY orders_delete ON public.orders FOR DELETE TO authenticated USING (public.is_manager_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- order_items policies
DO $$ BEGIN
  CREATE POLICY order_items_select ON public.order_items FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY order_items_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY order_items_delete ON public.order_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed tables if empty
INSERT INTO public.cafe_tables (number, seats)
SELECT * FROM (VALUES (1,2),(2,2),(3,4),(4,4),(5,4),(6,6),(7,6),(8,2)) AS t(number, seats)
WHERE NOT EXISTS (SELECT 1 FROM public.cafe_tables LIMIT 1);
`

async function main() {
  if (!PAT) {
    console.error("❌ SUPABASE_PAT not set")
    process.exit(1)
  }
  console.log("🚀 Running orders migration...")
  try {
    await runSql(SQL)
    console.log("✅ Migration complete! Tables created: cafe_tables, orders, order_items")
  } catch (e) {
    console.error("❌ Migration failed:", e)
    process.exit(1)
  }
}

main()
