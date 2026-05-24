"use server"

import { revalidatePath } from "next/cache"

import { logActivity } from "@/lib/audit"
import { can, type Role } from "@/lib/rbac"
import { getAuthContext, requirePermission } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export type StaffActionResult = { ok: true } | { ok: false; error: string }

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey)
}

// ============================================================================
// Staff roster (HR records in public.staff)
// ============================================================================

export async function addStaffMember(input: {
  name: string
  role: string
  phone: string
  email: string
}): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("staff")
    .insert({
      name: input.name.trim(),
      role: input.role.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "staff.create",
    entityType: "staff",
    entityId: data.id,
    metadata: { name: input.name, role: input.role, email: input.email },
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

export async function updateStaffMember(
  id: string,
  input: { name: string; role: string; phone: string; email: string },
): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { error } = await supabase
    .from("staff")
    .update({
      name: input.name.trim(),
      role: input.role.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "staff.update",
    entityType: "staff",
    entityId: id,
    metadata: input,
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

export async function deleteStaffMember(id: string): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { error } = await supabase.from("staff").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "staff.delete",
    entityType: "staff",
    entityId: id,
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

// ============================================================================
// Account management (auth.users + profiles) — used by Staff Edit dialog
// ============================================================================

export type StaffAccountInfo = {
  exists: boolean
  userId?: string
  role?: Role
  isLinkedAdmin?: boolean
  password?: string | null
}

/** Look up auth account by email (for the Edit dialog). */
export async function getAccountByEmail(email: string): Promise<StaffAccountInfo> {
  if (!email || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { exists: false }
  const ctx = await getAuthContext()
  if (!ctx || !can(ctx.role, "users.read")) return { exists: false }

  const service = getServiceClient()
  const { data, error } = await service.auth.admin.listUsers()
  if (error) return { exists: false }
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) return { exists: false }
  const role = ((user.user_metadata?.role as Role | undefined) ?? "staff")

  let password: string | null = null
  if (can(ctx.role, "users.viewPassword")) {
    const supabase = await createClient()
    const { data: prof } = await supabase
      .from("profiles")
      .select("plaintext_password")
      .eq("id", user.id)
      .single()
    password = (prof?.plaintext_password as string | null) ?? null
  }

  return {
    exists: true,
    userId: user.id,
    role,
    isLinkedAdmin: role === "admin",
    password,
  }
}

/** Create an auth account for a staff member (manager or staff role only). */
export async function createStaffAccount(input: {
  email: string
  password: string
  role: "manager" | "staff"
  staffId?: string
}): Promise<StaffActionResult> {
  const ctx = await requirePermission("users.create")

  // Manager cannot create admin accounts (already enforced by `role` literal type
  // but double-check at runtime)
  if ((input.role as Role) === "admin") {
    return { ok: false, error: "Cannot create admin accounts" }
  }

  const service = getServiceClient()
  const { data, error } = await service.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    user_metadata: { role: input.role },
    email_confirm: true,
  })
  if (error) return { ok: false, error: error.message }

  // Link to staff record if provided + store plaintext password
  if (data.user) {
    const supabase = await createClient()
    await supabase
      .from("profiles")
      .update({ plaintext_password: input.password })
      .eq("id", data.user.id)
    if (input.staffId) {
      await supabase
        .from("staff")
        .update({ profile_id: data.user.id, email: input.email })
        .eq("id", input.staffId)
    }
  }

  await logActivity({
    action: "user.create",
    entityType: "user",
    entityId: data.user?.id,
    metadata: { email: input.email, role: input.role, linkedStaffId: input.staffId },
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

/** Reset (set) password for a linked auth account. Admin only. */
export async function resetAccountPassword(input: {
  email: string
  newPassword: string
}): Promise<StaffActionResult> {
  const ctx = await requirePermission("users.resetPassword")
  const service = getServiceClient()
  const { data: list, error: listErr } = await service.auth.admin.listUsers()
  if (listErr) return { ok: false, error: listErr.message }
  const user = list.users.find((u) => u.email?.toLowerCase() === input.email.toLowerCase())
  if (!user) return { ok: false, error: "No auth account found for this email" }

  const { error } = await service.auth.admin.updateUserById(user.id, {
    password: input.newPassword,
  })
  if (error) return { ok: false, error: error.message }

  // Sync plaintext copy
  const supabase = await createClient()
  await supabase.from("profiles").update({ plaintext_password: input.newPassword }).eq("id", user.id)

  await logActivity({
    action: "user.resetPassword",
    entityType: "user",
    entityId: user.id,
    metadata: { email: input.email },
    ctx,
  })
  return { ok: true }
}

/** Toggle manager role on a linked auth account. Admin only. */
export async function setAccountManager(input: {
  email: string
  makeManager: boolean
}): Promise<StaffActionResult> {
  const ctx = await requirePermission("users.changeRole")
  const service = getServiceClient()
  const { data: list, error: listErr } = await service.auth.admin.listUsers()
  if (listErr) return { ok: false, error: listErr.message }
  const user = list.users.find((u) => u.email?.toLowerCase() === input.email.toLowerCase())
  if (!user) return { ok: false, error: "No auth account found for this email" }

  const targetRole = ((user.user_metadata?.role as Role | undefined) ?? "staff")
  if (targetRole === "admin") {
    return { ok: false, error: "Cannot modify admin accounts" }
  }

  const newRole: Role = input.makeManager ? "manager" : "staff"
  const { error } = await service.auth.admin.updateUserById(user.id, {
    user_metadata: { role: newRole },
  })
  if (error) return { ok: false, error: error.message }

  // Sync profiles table (trigger only fires on insert, not metadata update)
  const supabase = await createClient()
  await supabase.from("profiles").update({ role: newRole }).eq("id", user.id)

  await logActivity({
    action: "user.changeRole",
    entityType: "user",
    entityId: user.id,
    metadata: { email: input.email, from: targetRole, to: newRole },
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

/** Delete the auth account linked to a staff email. Admin/manager (manager can't touch admin). */
export async function deleteAccountByEmail(email: string): Promise<StaffActionResult> {
  const ctx = await requirePermission("users.delete")
  const service = getServiceClient()
  const { data: list, error: listErr } = await service.auth.admin.listUsers()
  if (listErr) return { ok: false, error: listErr.message }
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) return { ok: false, error: "No auth account found for this email" }

  if (user.id === ctx.profileId) {
    return { ok: false, error: "You cannot delete your own account" }
  }
  const targetRole = ((user.user_metadata?.role as Role | undefined) ?? "staff")
  if (ctx.role === "manager" && targetRole === "admin") {
    return { ok: false, error: "Managers cannot delete admin accounts" }
  }

  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "user.delete",
    entityType: "user",
    entityId: user.id,
    metadata: { email, role: targetRole },
    ctx,
  })
  revalidatePath("/staff")
  return { ok: true }
}

export async function addShift(input: {
  staffId: string
  workDate: string
  shiftType: string
  startTime: string
  endTime: string
}): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { data: staff } = await supabase.from("staff").select("name").eq("id", input.staffId).single()
  const { error } = await supabase.from("shifts").insert({
    staff_id: input.staffId,
    staff_name: staff?.name ?? "Unknown",
    work_date: input.workDate,
    shift_type: input.shiftType,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
  })
  if (error) return { ok: false, error: error.message }

  await logActivity({ action: "shift.create", entityType: "shift", metadata: input, ctx })
  revalidatePath("/staff")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function updateShift(
  id: string,
  input: { staffId: string; workDate: string; shiftType: string; startTime: string; endTime: string },
): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { data: staff } = await supabase.from("staff").select("name").eq("id", input.staffId).single()
  const { error } = await supabase
    .from("shifts")
    .update({
      staff_id: input.staffId,
      staff_name: staff?.name ?? "Unknown",
      work_date: input.workDate,
      shift_type: input.shiftType,
      start_time: input.startTime || null,
      end_time: input.endTime || null,
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({ action: "shift.update", entityType: "shift", entityId: id, metadata: input, ctx })
  revalidatePath("/staff")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function deleteShift(id: string): Promise<StaffActionResult> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const { error } = await supabase.from("shifts").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({ action: "shift.delete", entityType: "shift", entityId: id, ctx })
  revalidatePath("/staff")
  revalidatePath("/dashboard")
  return { ok: true }
}


function weeklyShiftForRole(role: string, index: number) {
  const value = role.toLowerCase()
  if (value.includes("cleaner")) return { shift_type: "morning", start_time: "07:00", end_time: "15:00" }
  if (value.includes("barista")) {
    return index % 2 === 0
      ? { shift_type: "morning", start_time: "08:00", end_time: "16:00" }
      : { shift_type: "evening", start_time: "13:00", end_time: "21:00" }
  }
  if (value.includes("waiter")) {
    return index % 2 === 0
      ? { shift_type: "morning", start_time: "09:00", end_time: "17:00" }
      : { shift_type: "evening", start_time: "14:00", end_time: "22:00" }
  }
  if (value.includes("cashier")) return { shift_type: "morning", start_time: "09:00", end_time: "17:00" }
  return { shift_type: "morning", start_time: "09:00", end_time: "17:00" }
}

export async function generateWeeklyShifts(input: {
  startDate: string
  includeManagers?: boolean
}): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const start = new Date(`${input.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Invalid start date" }

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, name, role")
    .order("name")
  if (staffError) return { ok: false, error: staffError.message }

  const workers = (staff ?? []).filter((person) => {
    if (input.includeManagers) return true
    return !String(person.role).toLowerCase().includes("manager")
  })
  if (workers.length === 0) return { ok: false, error: "No workers found" }

  const { data: existingShifts } = await supabase
    .from("shifts")
    .select("staff_id, work_date")
    .gte("work_date", start.toISOString().slice(0, 10))
    .lte("work_date", end.toISOString().slice(0, 10))
  const existing = new Set((existingShifts ?? []).map((shift) => `${shift.staff_id}-${shift.work_date}`))
  const shifts = []
  let skipped = 0

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const day = new Date(start)
    day.setDate(start.getDate() + dayIndex)
    const workDate = day.toISOString().slice(0, 10)
    const isMonday = day.getDay() === 1

    for (let workerIndex = 0; workerIndex < workers.length; workerIndex++) {
      const person = workers[workerIndex]
      if (existing.has(`${person.id}-${workDate}`)) {
        skipped++
        continue
      }
      if (isMonday && workerIndex % 2 === 1) {
        skipped++
        continue
      }
      shifts.push({
        staff_id: person.id,
        staff_name: person.name,
        work_date: workDate,
        ...weeklyShiftForRole(person.role, dayIndex + workerIndex),
      })
    }
  }

  if (shifts.length === 0) return { ok: false, error: "No new shifts to create. This week may already be scheduled." }
  const { error } = await supabase.from("shifts").insert(shifts)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "shift.create",
    entityType: "shift",
    metadata: { generated: shifts.length, startDate: input.startDate, endDate: end.toISOString().slice(0, 10) },
    ctx,
  })
  revalidatePath("/staff")
  revalidatePath("/dashboard")
  return { ok: true, created: shifts.length, skipped }
}


export async function saveWeeklyShiftPlan(input: {
  shifts: Array<{
    staffId: string
    workDate: string
    shiftType: string
    startTime: string
    endTime: string
  }>
}): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const ctx = await requirePermission("staff.write")
  const supabase = await createClient()
  const rows = input.shifts.filter((shift) => shift.staffId && shift.workDate && shift.shiftType)
  if (rows.length === 0) return { ok: false, error: "No shifts selected" }

  const { data: staffRows, error: staffError } = await supabase
    .from("staff")
    .select("id, name")
    .in("id", Array.from(new Set(rows.map((shift) => shift.staffId))))
  if (staffError) return { ok: false, error: staffError.message }
  const names = new Map((staffRows ?? []).map((person) => [person.id, person.name]))

  let saved = 0
  for (const shift of rows) {
    const { data: existing } = await supabase
      .from("shifts")
      .select("id")
      .eq("staff_id", shift.staffId)
      .eq("work_date", shift.workDate)
      .maybeSingle()

    const payload = {
      staff_id: shift.staffId,
      staff_name: names.get(shift.staffId) ?? "Unknown",
      work_date: shift.workDate,
      shift_type: shift.shiftType,
      start_time: shift.shiftType === "day_off" ? null : shift.startTime || null,
      end_time: shift.shiftType === "day_off" ? null : shift.endTime || null,
    }

    const { error } = existing?.id
      ? await supabase.from("shifts").update(payload).eq("id", existing.id)
      : await supabase.from("shifts").insert(payload)
    if (error) return { ok: false, error: error.message }
    saved++
  }

  await logActivity({
    action: "shift.update",
    entityType: "shift",
    metadata: { saved, mode: "weekly_manual_plan" },
    ctx,
  })
  revalidatePath("/staff")
  revalidatePath("/dashboard")
  return { ok: true, saved }
}

