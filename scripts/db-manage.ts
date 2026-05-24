#!/usr/bin/env tsx
/**
 * Supabase DB Management Script
 * Использует Management API с PAT (Personal Access Token)
 *
 * Команды:
 *   npx tsx scripts/db-manage.ts reset      - пересоздать все таблицы + RLS + триггеры + тестовые данные
 *   npx tsx scripts/db-manage.ts seed       - добавить тестовые данные
 *   npx tsx scripts/db-manage.ts clear      - очистить данные (таблицы остаются)
 *   npx tsx scripts/db-manage.ts users      - пересоздать всех пользователей
 *   npx tsx scripts/db-manage.ts bootstrap  - синхронизировать profiles и понизить лишних админов
 */

const PROJECT_REF = "davpdesbbjowkqnswsty"
const PAT = process.env.SUPABASE_PAT
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`

const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}`

const ADMIN_EMAIL = "admin@cafe.com"

async function getServiceRoleKey(): Promise<string> {
  const res = await fetch(`${API_BASE}/api-keys`, {
    headers: { Authorization: `Bearer ${PAT}` },
  })
  if (!res.ok) throw new Error(`Failed to get API keys: ${await res.text()}`)
  const keys = (await res.json()) as Array<{ name: string; api_key: string }>
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key
  if (!serviceKey) throw new Error("service_role key not found")
  return serviceKey
}

const USERS = [
  { email: "admin@cafe.com", password: "admin", role: "admin", name: "Super Admin" },
  { email: "manager@cafe.com", password: "123456", role: "manager", name: "Bakyt Manager" },
  { email: "aibek@cafe.com", password: "1234", role: "staff", name: "Aibek" },
  { email: "nurbol@cafe.com", password: "1234", role: "staff", name: "Nurbol" },
  { email: "aigerim@cafe.com", password: "1234", role: "staff", name: "Aigerim" },
  { email: "aijan@cafe.com", password: "1234", role: "staff", name: "Aijan" },
]

// ============================================================================
// SQL: DROP
// ============================================================================
const SQL_DROP_ALL = `
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_manager_or_admin() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.inventory_history CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.cafe_tables CASCADE;
DROP TABLE IF EXISTS public.schedules CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.staff_members CASCADE;
DROP TABLE IF EXISTS public.daily_revenue CASCADE;
`

// ============================================================================
// SQL: SCHEMA + RLS + TRIGGERS
// ============================================================================
const SQL_CREATE_SCHEMA = `
-- ----------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- profiles: mirror of auth.users with role
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text NOT NULL CHECK (role IN ('admin','manager','staff')) DEFAULT 'staff',
  plaintext_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on auth user insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER bypasses RLS to avoid recursion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', false)
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin','manager'), false)
$$;

-- ----------------------------------------------------------------------------
-- products (inventory)
-- ----------------------------------------------------------------------------
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL,
  min_quantity numeric(12,2) NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- staff (HR roster — not access control)
-- ----------------------------------------------------------------------------
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  phone text,
  email text,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- menu_items
-- ----------------------------------------------------------------------------
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  cost_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  description text,
  image_url text,
  ingredients text,
  weight_grams numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER menu_items_updated_at BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- tasks with lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('pending','in_progress','done')) DEFAULT 'pending',
  due_date date,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- inventory_history (audit of stock changes)
-- ----------------------------------------------------------------------------
CREATE TABLE public.inventory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text,
  delta numeric(12,2) NOT NULL,
  quantity_after numeric(12,2) NOT NULL,
  reason text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_history_product_idx ON public.inventory_history(product_id);
CREATE INDEX inventory_history_changed_at_idx ON public.inventory_history(changed_at DESC);

-- ----------------------------------------------------------------------------
-- activity_logs (audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX activity_logs_actor_idx ON public.activity_logs(actor_id);
CREATE INDEX activity_logs_action_idx ON public.activity_logs(action);

-- ----------------------------------------------------------------------------
-- cafe_tables (physical tables in the cafe)
-- ----------------------------------------------------------------------------
CREATE TABLE public.cafe_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number int NOT NULL UNIQUE,
  seats int NOT NULL DEFAULT 4,
  status text NOT NULL CHECK (status IN ('free','occupied','reserved')) DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- orders
-- ----------------------------------------------------------------------------
CREATE TABLE public.orders (
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
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);

-- ----------------------------------------------------------------------------
-- order_items
-- ----------------------------------------------------------------------------
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  price numeric(10,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

-- ----------------------------------------------------------------------------
-- RLS: enable on all tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_admin_write ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- products: all auth read; manager/admin write
CREATE POLICY products_select ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY products_write ON public.products
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

-- staff (HR roster): all auth read; manager/admin write
CREATE POLICY staff_select ON public.staff
  FOR SELECT TO authenticated USING (true);
CREATE POLICY staff_write ON public.staff
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

-- menu_items: all auth read; manager/admin write
CREATE POLICY menu_select ON public.menu_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY menu_write ON public.menu_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

-- tasks: staff sees only assigned; manager/admin see all
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_manager_or_admin() OR assigned_to = auth.uid() OR assigned_to IS NULL);
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin());
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin() OR assigned_to = auth.uid() OR assigned_to IS NULL)
  WITH CHECK (public.is_manager_or_admin() OR assigned_to = auth.uid() OR assigned_to IS NULL);
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_manager_or_admin());

-- inventory_history: manager/admin read; any auth insert (server actions)
CREATE POLICY inv_hist_select ON public.inventory_history
  FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());
CREATE POLICY inv_hist_insert ON public.inventory_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- activity_logs: admin read; any auth insert
CREATE POLICY act_logs_select ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY act_logs_insert ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- cafe_tables: all auth read; manager/admin write
CREATE POLICY tables_select ON public.cafe_tables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tables_write ON public.cafe_tables
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

-- orders: all auth read + insert; manager/admin can close/delete
CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY orders_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY orders_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_manager_or_admin());

-- order_items: all auth read + write (tied to orders)
CREATE POLICY order_items_select ON public.order_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY order_items_delete ON public.order_items
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
`

// ============================================================================
// SQL: SEED
// ============================================================================
const SQL_SEED = `
-- Products
INSERT INTO public.products (name, category, quantity, unit, min_quantity) VALUES
('Colombian Coffee Beans', 'Coffee', 25, 'kg', 5),
('Espresso Beans', 'Coffee', 12, 'kg', 3),
('Milk 3.2%', 'Dairy', 30, 'L', 10),
('Oat Milk', 'Dairy', 8, 'L', 5),
('Sugar White', 'Ingredients', 50, 'kg', 10),
('Vanilla Syrup', 'Syrups', 3, 'bottles', 2),
('Caramel Syrup', 'Syrups', 4, 'bottles', 2),
('Cups Small', 'Packaging', 500, 'pcs', 100),
('Cups Medium', 'Packaging', 300, 'pcs', 100),
('Lids', 'Packaging', 800, 'pcs', 200),
('Croissants', 'Pastry', 15, 'pcs', 5),
('Muffins', 'Pastry', 8, 'pcs', 5);

-- Staff (HR roster)
INSERT INTO public.staff (name, role, phone, email) VALUES
('Aibek', 'Barista', '+996 555 123 456', 'aibek@cafe.com'),
('Nurbol', 'Barista', '+996 555 234 567', 'nurbol@cafe.com'),
('Aigerim', 'Cashier', '+996 555 345 678', 'aigerim@cafe.com'),
('Bakyt', 'Manager', '+996 555 456 789', 'manager@cafe.com'),
('Aijan', 'Cleaner', '+996 555 567 890', 'aijan@cafe.com');

-- Menu Items
INSERT INTO public.menu_items (name, category, price, cost_price, is_available, description, ingredients, weight_grams, image_url) VALUES
('Espresso', 'Coffee', 2.50, 0.80, true, 'Rich double shot of pure espresso.', 'Espresso beans, water', 30, 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=600'),
('Americano', 'Coffee', 3.00, 1.00, true, 'Espresso diluted with hot water.', 'Espresso, hot water', 240, 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=600'),
('Cappuccino', 'Coffee', 3.50, 1.20, true, 'Equal parts espresso, steamed milk and foam.', 'Espresso, milk, milk foam', 180, 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600'),
('Latte', 'Coffee', 3.50, 1.30, true, 'Smooth espresso with steamed milk.', 'Espresso, milk', 300, 'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=600'),
('Mocha', 'Coffee', 4.00, 1.50, true, 'Latte with chocolate syrup.', 'Espresso, milk, chocolate syrup', 300, 'https://images.unsplash.com/photo-1607681034540-2c46cc71896d?w=600'),
('Flat White', 'Coffee', 3.50, 1.25, true, 'Velvety microfoam over espresso.', 'Espresso, milk', 180, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=600'),
('Caramel Macchiato', 'Coffee', 4.50, 1.80, true, 'Layered espresso with caramel and milk.', 'Espresso, milk, caramel syrup', 360, 'https://images.unsplash.com/photo-1497636577773-f1231844b336?w=600'),
('Vanilla Latte', 'Coffee', 4.00, 1.60, false, 'Latte with vanilla syrup.', 'Espresso, milk, vanilla syrup', 300, 'https://images.unsplash.com/photo-1593443320739-77f74939d0da?w=600'),
('Iced Coffee', 'Cold Drinks', 3.50, 1.10, true, 'Chilled coffee over ice.', 'Coffee, ice, optional milk', 350, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600'),
('Croissant', 'Pastry', 2.50, 1.00, true, 'Buttery flaky French croissant.', 'Flour, butter, yeast, sugar', 70, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'),
('Blueberry Muffin', 'Pastry', 3.00, 1.20, true, 'Soft muffin loaded with blueberries.', 'Flour, blueberries, sugar, eggs', 110, 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=600'),
('Chocolate Cookie', 'Pastry', 2.00, 0.70, true, 'Crunchy cookie with chocolate chips.', 'Flour, chocolate, butter, sugar', 50, 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=600');

-- Cafe tables
INSERT INTO public.cafe_tables (number, seats) VALUES
(1, 2), (2, 2), (3, 4), (4, 4), (5, 4), (6, 6), (7, 6), (8, 2);

-- Tasks (unassigned initially; can be assigned via UI)
INSERT INTO public.tasks (title, description, status, due_date) VALUES
('Clean espresso machine', 'Deep clean and descale', 'pending', CURRENT_DATE),
('Check milk expiration', 'Remove expired items', 'pending', CURRENT_DATE),
('Order coffee beans', 'Colombian and Espresso low stock', 'pending', CURRENT_DATE + INTERVAL '1 day'),
('Wipe tables', 'All customer areas', 'pending', CURRENT_DATE),
('Restock pastries', 'Get fresh croissants from bakery', 'pending', CURRENT_DATE),
('Count cash register', 'End of day count', 'pending', CURRENT_DATE);
`

const SQL_CLEAR = `
TRUNCATE TABLE
  public.activity_logs,
  public.inventory_history,
  public.order_items,
  public.orders,
  public.cafe_tables,
  public.tasks,
  public.menu_items,
  public.staff,
  public.products
CASCADE;
`

// ============================================================================
// HTTP helpers
// ============================================================================
async function runSql(query: string) {
  const url = `${API_BASE}/database/query`
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`SQL Error: ${error}`)
  }
  return await response.json()
}

async function deleteAllUsers(serviceKey: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) throw new Error(`List users failed: ${await res.text()}`)
  const data = (await res.json()) as { users: Array<{ id: string; email: string }> }
  for (const u of data.users) {
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (del.ok) console.log(`  🗑️  deleted ${u.email}`)
  }
}

async function createUser(
  serviceKey: string,
  email: string,
  password: string,
  role: string,
  name: string,
) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: name },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.log(`  ⚠️  ${email}: ${err}`)
    return
  }
  console.log(`  ✅ ${email} (${role}) / ${password}`)
}

async function listAuthUsers(serviceKey: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) throw new Error(`List users failed: ${await res.text()}`)
  return (await res.json()) as {
    users: Array<{ id: string; email: string; user_metadata: { role?: string } }>
  }
}

async function setUserRole(serviceKey: string, userId: string, role: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_metadata: { role } }),
  })
  if (!res.ok) throw new Error(`Set role failed: ${await res.text()}`)
}

// ============================================================================
// Commands
// ============================================================================
async function reset() {
  console.log("🗑️  Dropping all tables, functions and triggers...")
  await runSql(SQL_DROP_ALL)
  console.log("✅ Dropped")

  console.log("🏗️  Creating schema, RLS, triggers...")
  await runSql(SQL_CREATE_SCHEMA)
  console.log("✅ Schema created")

  console.log("🌱 Seeding data...")
  await runSql(SQL_SEED)
  console.log("✅ Done!")
}

async function seed() {
  console.log("🌱 Seeding data...")
  await runSql(SQL_SEED)
  console.log("✅ Done!")
}

async function clear() {
  console.log("🧹 Clearing all data...")
  await runSql(SQL_CLEAR)
  console.log("✅ Done!")
}

async function users() {
  console.log("🔑 Getting service role key...")
  const serviceKey = await getServiceRoleKey()
  console.log("🗑️  Deleting existing users...")
  await deleteAllUsers(serviceKey)
  console.log("👥 Creating users...")
  for (const u of USERS) {
    await createUser(serviceKey, u.email, u.password, u.role, u.name)
  }
  // Trigger handle_new_user auto-creates profiles. Store plaintext + link staff by email.
  console.log("� Storing plaintext passwords + linking staff...")
  const passwordCases = USERS.map((u) => `WHEN lower(p.email) = lower('${u.email}') THEN '${u.password}'`).join(" ")
  await runSql(`
    UPDATE public.profiles p SET plaintext_password = CASE ${passwordCases} ELSE p.plaintext_password END;
    UPDATE public.staff s
       SET profile_id = p.id
      FROM public.profiles p
     WHERE lower(s.email) = lower(p.email);
  `)
  console.log("✅ Done!")
}

// Bootstrap for existing DBs: ensure only admin@cafe.com is admin and sync profiles
async function bootstrap() {
  console.log("🔑 Getting service role key...")
  const serviceKey = await getServiceRoleKey()

  console.log("🔍 Listing auth users...")
  const { users: authUsers } = await listAuthUsers(serviceKey)

  console.log("⬇️  Demoting non-super admins to staff...")
  for (const u of authUsers) {
    const role = u.user_metadata?.role
    if (role === "admin" && u.email !== ADMIN_EMAIL) {
      await setUserRole(serviceKey, u.id, "staff")
      console.log(`  ⬇️  ${u.email}: admin → staff`)
    }
  }

  console.log("🔗 Syncing profiles from auth.users...")
  // Insert missing profiles + sync role from user_metadata
  await runSql(`
    INSERT INTO public.profiles (id, email, role, full_name)
    SELECT
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'role', 'staff'),
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
    FROM auth.users u
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role;
  `)

  console.log("🔗 Linking staff.profile_id by email...")
  await runSql(`
    UPDATE public.staff s
       SET profile_id = p.id
      FROM public.profiles p
     WHERE lower(s.email) = lower(p.email);
  `)
  console.log("✅ Done!")
}

// ============================================================================
// Main
// ============================================================================
const command = process.argv[2]

switch (command) {
  case "reset":
    reset().catch(console.error)
    break
  case "seed":
    seed().catch(console.error)
    break
  case "clear":
    clear().catch(console.error)
    break
  case "users":
    users().catch(console.error)
    break
  case "bootstrap":
    bootstrap().catch(console.error)
    break
  default:
    console.log("Usage: npx tsx scripts/db-manage.ts [reset|seed|clear|users|bootstrap]")
    process.exit(1)
}
