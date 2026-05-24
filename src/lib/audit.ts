/**
 * Audit logging — write entries to public.activity_logs.
 *
 * Use from server actions after a successful mutation. Failures are logged
 * but never thrown back to the caller (audit must not break user flow).
 */
import { createClient } from "@/lib/supabase/server"
import type { AuthContext } from "@/lib/rbac.server"

export type AuditAction =
  | "user.create"
  | "user.delete"
  | "user.changeRole"
  | "user.resetPassword"
  | "task.create"
  | "task.assign"
  | "task.start"
  | "task.complete"
  | "task.delete"
  | "task.update"
  | "inventory.create"
  | "inventory.update"
  | "inventory.delete"
  | "inventory.adjust"
  | "menu.create"
  | "menu.update"
  | "menu.delete"
  | "menu.toggleAvailable"
  | "staff.create"
  | "staff.update"
  | "staff.delete"
  | "shift.create"
  | "shift.update"
  | "shift.delete"

export type AuditEntityType =
  | "user"
  | "task"
  | "product"
  | "menu_item"
  | "staff"
  | "shift"

export type LogActivityInput = {
  action: AuditAction
  entityType?: AuditEntityType
  entityId?: string
  metadata?: Record<string, unknown>
  /** Optional pre-resolved auth context to avoid an extra DB call. */
  ctx?: AuthContext
}

export async function logActivity({
  action,
  entityType,
  entityId,
  metadata = {},
  ctx,
}: LogActivityInput): Promise<void> {
  try {
    const supabase = await createClient()
    let actorId: string | undefined
    let actorEmail: string | undefined
    let actorRole: string | undefined

    if (ctx) {
      actorId = ctx.profileId
      actorEmail = ctx.email
      actorRole = ctx.role
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        actorId = user.id
        actorEmail = user.email ?? undefined
        actorRole = (user.user_metadata?.role as string | undefined) ?? undefined
      }
    }

    await supabase.from("activity_logs").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      actor_role: actorRole,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    })
  } catch (error) {
    console.error("[audit] failed to log activity", { action, error })
  }
}
