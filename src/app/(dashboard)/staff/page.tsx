import type { ShiftRow } from "@/components/staff/staff-shifts"
import { StaffSections } from "@/components/staff/staff-sections"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export default async function StaffPage() {
  const ctx = await getAuthContext()
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)

  const [{ data }, { data: shifts }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, role, phone, email")
      .order("name"),
    supabase
      .from("shifts")
      .select("id, staff_id, work_date, shift_type, start_time, end_time, staff:staff_id(id, name, role)")
      .gte("work_date", today)
      .lte("work_date", nextWeek.toISOString().slice(0, 10))
      .order("work_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ])
  const shiftRows: ShiftRow[] = (shifts ?? []).map((shift) => ({
    ...shift,
    staff: Array.isArray(shift.staff) ? shift.staff[0] ?? null : shift.staff,
  }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">Team roster, roles, and contacts.</p>
      </div>
      <StaffSections
        shifts={shiftRows}
        staffOptions={(data ?? []).map((person) => ({ id: person.id, name: person.name, role: person.role }))}
        staffRows={data ?? []}
        role={ctx?.role ?? "staff"}
        currentUserId={ctx?.profileId ?? ""}
      />
    </div>
  )
}
