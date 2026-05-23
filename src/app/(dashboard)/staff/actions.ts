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
