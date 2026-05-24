/**
 * Server-only auth/role helpers. Do NOT import from client components.
 */
import "server-only"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import { can, type Permission, ROLE_HOME, type Role } from "@/lib/rbac"

export type AuthContext = {
  user: User
  role: Role
  profileId: string
  email: string
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single()

  const role = (profile?.role as Role | undefined)
    ?? (user.user_metadata?.role as Role | undefined)
    ?? "staff"

  return {
    user,
    role,
    profileId: user.id,
    email: profile?.email ?? user.email ?? "",
  }
}

/** Throws (server action) if user lacks permission. Returns ctx on success. */
export async function requirePermission(perm: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) {
    redirect("/login")
  }
  if (!can(ctx.role, perm)) {
    throw new Error(`Forbidden: missing permission ${perm}`)
  }
  return ctx
}

/** Like requirePermission but redirects on missing access (for pages). */
export async function requirePermissionOrRedirect(
  perm: Permission,
): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/login")
  if (!can(ctx.role, perm)) {
    redirect(ROLE_HOME[ctx.role])
  }
  return ctx
}
