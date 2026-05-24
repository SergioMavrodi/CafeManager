#!/usr/bin/env tsx
/**
 * Migration + Seed:
 *  - Add waiter_id to orders
 *  - Add shifts table
 *  - Expand cafe_tables to 20 tables (5-6 seats)
 *  - Add 7 waiters to staff
 *  - Generate ~300 historical orders over last 30 days
 *  - Seed shifts schedule
 *
 * Run: SUPABASE_PAT=gp_... npx tsx scripts/migrate-waiters-seed.ts
 */
export {}

const PROJECT_REF = "davpdesbbjowkqnswsty"
const PAT = process.env.SUPABASE_PAT
const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}`

async function runSql(query: string) {
  const res = await fetch(`${API_BASE}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL Error: ${await res.text()}`)
  return res.json()
}

// ─── Step 1: Schema migrations ────────────────────────────────────────────────
const SQL_SCHEMA = `
-- Add waiter_id + waiter_name to orders if not exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS waiter_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS waiter_name text;

-- Shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  shift_type text NOT NULL CHECK (shift_type IN ('morning','evening','full','day_off')),
  schedule_type text NOT NULL DEFAULT '2x2',
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shifts_date_idx ON public.shifts(work_date);
CREATE INDEX IF NOT EXISTS shifts_staff_idx ON public.shifts(staff_id);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY shifts_select ON public.shifts FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY shifts_write ON public.shifts FOR ALL TO authenticated USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`

// ─── Step 2: Expand tables to 20 ──────────────────────────────────────────────
const SQL_TABLES = `
-- Delete old tables and re-insert 20 tables
TRUNCATE TABLE public.cafe_tables CASCADE;
INSERT INTO public.cafe_tables (number, seats) VALUES
(1,5),(2,5),(3,6),(4,6),(5,5),(6,6),(7,5),(8,6),(9,5),(10,6),
(11,5),(12,6),(13,5),(14,6),(15,5),(16,6),(17,5),(18,6),(19,4),(20,4);
`

// ─── Step 3: Add waiters to staff ─────────────────────────────────────────────
const SQL_WAITERS = `
-- Remove old staff, insert fresh with waiters
DELETE FROM public.staff WHERE role = 'Waiter';
INSERT INTO public.staff (name, role, phone, email) VALUES
('Akzhol',    'Waiter', '+996 700 111 001', 'akzhol@cafe.com'),
('Alinur',    'Waiter', '+996 700 111 002', 'alinur@cafe.com'),
('Asel',      'Waiter', '+996 700 111 003', 'asel@cafe.com'),
('Baiel',     'Waiter', '+996 700 111 004', 'baiel@cafe.com'),
('Erturan',   'Waiter', '+996 700 111 005', 'erturan@cafe.com'),
('Kobilzhon', 'Waiter', '+996 700 111 006', 'kobilzhon@cafe.com'),
('Nurzhan',   'Waiter', '+996 700 111 007', 'nurzhan@cafe.com');
`

// ─── Step 4: Shifts seed (DO block using staff ids) ───────────────────────────
// We generate 30 days of shifts per waiter based on their schedule type
// Akzhol, Alinur: 2x2 morning
// Asel, Baiel: 2x2 evening
// Erturan: 5x2
// Kobilzhon: 5x2
// Nurzhan: full day weekends only
const SQL_SHIFTS = `
DO $$
DECLARE
  v_staff RECORD;
  v_date date;
  v_day_offset int;
  v_cycle_day int;
  v_is_work bool;
BEGIN
  FOR v_staff IN SELECT id, name FROM public.staff WHERE role = 'Waiter' LOOP
    FOR v_day_offset IN 0..59 LOOP
      v_date := CURRENT_DATE - 59 + v_day_offset;
      v_cycle_day := v_day_offset % 4;

      -- Akzhol, Alinur: 2x2 morning (work day 0,1 off 2,3)
      IF v_staff.name IN ('Akzhol','Alinur') THEN
        v_is_work := v_cycle_day IN (0,1);
        IF v_is_work THEN
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'morning', '2x2', v_date, '08:00', '16:00');
        ELSE
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'day_off', '2x2', v_date, '08:00', '08:00');
        END IF;

      -- Asel, Baiel: 2x2 evening (work day 1,2 off 3,0)
      ELSIF v_staff.name IN ('Asel','Baiel') THEN
        v_cycle_day := v_day_offset % 4;
        v_is_work := v_cycle_day IN (1,2);
        IF v_is_work THEN
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'evening', '2x2', v_date, '16:00', '00:00');
        ELSE
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'day_off', '2x2', v_date, '16:00', '16:00');
        END IF;

      -- Erturan: 5x2 morning
      ELSIF v_staff.name = 'Erturan' THEN
        v_cycle_day := v_day_offset % 7;
        v_is_work := v_cycle_day BETWEEN 0 AND 4;
        IF v_is_work THEN
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'morning', '5x2', v_date, '09:00', '17:00');
        ELSE
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'day_off', '5x2', v_date, '09:00', '09:00');
        END IF;

      -- Kobilzhon: 5x2 evening
      ELSIF v_staff.name = 'Kobilzhon' THEN
        v_cycle_day := v_day_offset % 7;
        v_is_work := v_cycle_day BETWEEN 0 AND 4;
        IF v_is_work THEN
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'evening', '5x2', v_date, '15:00', '23:00');
        ELSE
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'day_off', '5x2', v_date, '15:00', '15:00');
        END IF;

      -- Nurzhan: full day, weekends
      ELSIF v_staff.name = 'Nurzhan' THEN
        v_is_work := EXTRACT(DOW FROM v_date) IN (0,5,6); -- fri/sat/sun
        IF v_is_work THEN
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'full', 'weekend', v_date, '10:00', '22:00');
        ELSE
          INSERT INTO public.shifts (staff_id, staff_name, shift_type, schedule_type, work_date, start_time, end_time)
          VALUES (v_staff.id, v_staff.name, 'day_off', 'weekend', v_date, '10:00', '10:00');
        END IF;
      END IF;

    END LOOP;
  END LOOP;
END $$;
`

// ─── Step 5: Historical orders seed ───────────────────────────────────────────
// ~300 orders over 30 days. Peak hours: 8-10, 12-14, 18-20.
// Each order has 1-4 items, assigned to a waiter on shift that day.
const SQL_ORDERS_SEED = `
DO $$
DECLARE
  v_menu_items uuid[];
  v_menu_prices numeric[];
  v_menu_names text[];
  v_waiters uuid[];
  v_waiter_names text[];
  v_tables int[];
  v_table_ids uuid[];

  v_order_id uuid;
  v_waiter_idx int;
  v_waiter_id uuid;
  v_waiter_name text;
  v_table_idx int;
  v_table_id uuid;
  v_table_num int;
  v_item_count int;
  v_item_idx int;
  v_item_id uuid;
  v_item_price numeric;
  v_item_name text;
  v_total numeric;
  v_qty int;

  v_day int;
  v_order_in_day int;
  v_orders_per_day int;
  v_hour int;
  v_minute int;
  v_order_ts timestamptz;
  v_close_ts timestamptz;
  v_date date;
  v_peak_roll float;
BEGIN
  -- Load menu items
  SELECT array_agg(id), array_agg(price), array_agg(name)
  INTO v_menu_items, v_menu_prices, v_menu_names
  FROM public.menu_items WHERE is_available = true;

  -- Load waiters
  SELECT array_agg(id), array_agg(name)
  INTO v_waiters, v_waiter_names
  FROM public.staff WHERE role = 'Waiter';

  -- Load table ids/numbers
  SELECT array_agg(id), array_agg(number)
  INTO v_table_ids, v_tables
  FROM public.cafe_tables;

  -- Generate orders for last 30 days
  FOR v_day IN 0..29 LOOP
    v_date := CURRENT_DATE - 29 + v_day;

    -- Weekend = more orders
    IF EXTRACT(DOW FROM v_date) IN (0,6) THEN
      v_orders_per_day := 12 + (random() * 8)::int;
    ELSE
      v_orders_per_day := 7 + (random() * 6)::int;
    END IF;

    FOR v_order_in_day IN 1..v_orders_per_day LOOP
      -- Pick peak hour distribution
      v_peak_roll := random();
      IF v_peak_roll < 0.25 THEN
        v_hour := 8 + (random() * 2)::int;   -- morning peak 8-10
      ELSIF v_peak_roll < 0.55 THEN
        v_hour := 12 + (random() * 2)::int;  -- lunch peak 12-14
      ELSIF v_peak_roll < 0.85 THEN
        v_hour := 18 + (random() * 2)::int;  -- dinner peak 18-20
      ELSE
        v_hour := 10 + (random() * 8)::int;  -- other hours
      END IF;
      v_minute := (random() * 59)::int;

      v_order_ts := (v_date::text || ' ' || lpad(v_hour::text,2,'0') || ':' || lpad(v_minute::text,2,'0') || ':00')::timestamptz;
      v_close_ts := v_order_ts + ((15 + random()*40)::int || ' minutes')::interval;

      -- Pick waiter on shift that day (prefer those with shift on that date, fallback random)
      SELECT s.id, s.name INTO v_waiter_id, v_waiter_name
      FROM public.shifts sh
      JOIN public.staff s ON s.id = sh.staff_id
      WHERE sh.work_date = v_date AND sh.shift_type != 'day_off'
        AND (
          (sh.shift_type = 'morning' AND v_hour < 16) OR
          (sh.shift_type = 'evening' AND v_hour >= 15) OR
          sh.shift_type = 'full'
        )
      ORDER BY random()
      LIMIT 1;

      -- Fallback: any waiter
      IF v_waiter_id IS NULL THEN
        v_waiter_idx := 1 + (random() * (array_length(v_waiters,1)-1))::int;
        v_waiter_id := v_waiters[v_waiter_idx];
        v_waiter_name := v_waiter_names[v_waiter_idx];
      END IF;

      -- Pick table
      v_table_idx := 1 + (random() * (array_length(v_table_ids,1)-1))::int;
      v_table_id := v_table_ids[v_table_idx];
      v_table_num := v_tables[v_table_idx];

      -- Insert order
      v_order_id := gen_random_uuid();
      v_total := 0;

      INSERT INTO public.orders (id, table_id, table_number, status, waiter_id, waiter_name, opened_by_email, total, created_at, updated_at, closed_at)
      VALUES (v_order_id, v_table_id, v_table_num, 'closed', v_waiter_id, v_waiter_name, 'system@cafe.com', 0, v_order_ts, v_close_ts, v_close_ts);

      -- Add 1-4 items
      v_item_count := 1 + (random() * 3)::int;
      FOR v_item_idx IN 1..v_item_count LOOP
        v_table_idx := 1 + (random() * (array_length(v_menu_items,1)-1))::int;
        v_item_id := v_menu_items[v_table_idx];
        v_item_price := v_menu_prices[v_table_idx];
        v_item_name := v_menu_names[v_table_idx];
        v_qty := 1 + (random() * 2)::int;

        INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity)
        VALUES (v_order_id, v_item_id, v_item_name, v_item_price, v_qty);

        v_total := v_total + v_item_price * v_qty;
      END LOOP;

      -- Update total
      UPDATE public.orders SET total = v_total WHERE id = v_order_id;

    END LOOP;
  END LOOP;
END $$;
`

async function main() {
  if (!PAT) { console.error("❌ SUPABASE_PAT not set"); process.exit(1) }

  console.log("1/5 Schema migrations (waiter_id, shifts table)...")
  await runSql(SQL_SCHEMA)
  console.log("   ✅ done")

  console.log("2/5 Expanding tables to 20...")
  await runSql(SQL_TABLES)
  console.log("   ✅ done")

  console.log("3/5 Adding 7 waiters to staff...")
  await runSql(SQL_WAITERS)
  console.log("   ✅ done")

  console.log("4/5 Generating 60 days of shifts...")
  await runSql(SQL_SHIFTS)
  console.log("   ✅ done")

  console.log("5/5 Seeding ~300 historical orders...")
  await runSql(SQL_ORDERS_SEED)
  console.log("   ✅ done")

  console.log("\n🎉 All done! Waiters, shifts and order history are ready.")
}

main().catch((e) => { console.error("❌", e); process.exit(1) })
