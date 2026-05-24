"use server"

import { revalidatePath } from "next/cache"

import { logActivity } from "@/lib/audit"
import { requirePermission } from "@/lib/rbac.server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type TaskActionResult<T = undefined> = T extends undefined ? { ok: true } | { ok: false; error: string } : { ok: true; data: T } | { ok: false; error: string }

export async function addTask(input: {
  title: string
  description: string
  due_date: string
  assigned_to?: string | null
}): Promise<TaskActionResult> {
  const ctx = await requirePermission("tasks.create")
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title.trim(),
      description: input.description.trim() || null,
      status: "pending",
      due_date: input.due_date || null,
      assigned_to: input.assigned_to || null,
      assigned_at: input.assigned_to ? now : null,
      created_by: ctx.profileId,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.create",
    entityType: "task",
    entityId: data.id,
    metadata: { title: input.title, assigned_to: input.assigned_to ?? null },
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true }
}

export async function assignTask(taskId: string, assigneeId: string | null): Promise<TaskActionResult> {
  const ctx = await requirePermission("tasks.assign")
  const supabase = await createClient()
  const { error } = await supabase
    .from("tasks")
    .update({
      assigned_to: assigneeId,
      assigned_at: assigneeId ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.assign",
    entityType: "task",
    entityId: taskId,
    metadata: { assignee: assigneeId },
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true }
}

export async function startTask(taskId: string): Promise<TaskActionResult<{ assigned_to: string; started_at: string }>> {
  const ctx = await requirePermission("tasks.start")
  const supabase = createAdminClient() ?? await createClient()
  // Read task to know if unassigned (Everyone) — staff auto-claims it.
  const { data: task } = await supabase
    .from("tasks")
    .select("assigned_to, status")
    .eq("id", taskId)
    .single()
  if (!task) return { ok: false, error: "Task not found" }
  if (task.status !== "pending") return { ok: false, error: "Task was already started" }
  if (ctx.role === "staff" && task.assigned_to && task.assigned_to !== ctx.profileId) {
    return { ok: false, error: "This task is assigned to another worker" }
  }
  const claim = task && task.assigned_to == null
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "in_progress",
      started_at: now,
      ...(claim ? { assigned_to: ctx.profileId, assigned_at: now } : {}),
    })
    .eq("id", taskId)
    .eq("status", "pending")
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.start",
    entityType: "task",
    entityId: taskId,
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true, data: { assigned_to: task?.assigned_to ?? ctx.profileId, started_at: now } }
}

export async function completeTask(taskId: string): Promise<TaskActionResult> {
  const ctx = await requirePermission("tasks.complete")
  const supabase = createAdminClient() ?? await createClient()
  const { data: task } = await supabase
    .from("tasks")
    .select("assigned_to, status")
    .eq("id", taskId)
    .single()
  if (!task) return { ok: false, error: "Task not found" }
  if (ctx.role === "staff" && task.assigned_to !== ctx.profileId) {
    return { ok: false, error: "Only the assigned worker can complete this task" }
  }
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: ctx.profileId,
    })
    .eq("id", taskId)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.complete",
    entityType: "task",
    entityId: taskId,
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true }
}

export async function reopenTask(taskId: string): Promise<TaskActionResult> {
  const ctx = await requirePermission("tasks.assign")
  const supabase = await createClient()
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "pending",
      started_at: null,
      completed_at: null,
      completed_by: null,
    })
    .eq("id", taskId)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.update",
    entityType: "task",
    entityId: taskId,
    metadata: { reopened: true },
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true }
}

export async function deleteTask(id: string): Promise<TaskActionResult> {
  const ctx = await requirePermission("tasks.delete")
  const supabase = await createClient()
  const { error } = await supabase.from("tasks").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  await logActivity({
    action: "task.delete",
    entityType: "task",
    entityId: id,
    ctx,
  })
  revalidatePath("/tasks")
  return { ok: true }
}
