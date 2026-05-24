import { type Role } from "@/lib/rbac"
import { type AuthContext } from "@/lib/rbac.server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type AppNotification = {
  id: string
  type: "task_assigned" | "task_completed" | "low_stock"
  title: string
  message: string
  href: string
  createdAt: string
  tone: "amber" | "emerald" | "red" | "blue"
}

function canManage(role: Role) {
  return role === "admin" || role === "manager"
}

export async function getAppNotifications(ctx: AuthContext | null): Promise<AppNotification[]> {
  if (!ctx) return []

  const supabase = createAdminClient() ?? await createClient()
  const notifications: AppNotification[] = []

  if (ctx.role === "staff") {
    const { data: assignedTasks } = await supabase
      .from("tasks")
      .select("id, title, description, due_date, assigned_at, created_at, status")
      .eq("assigned_to", ctx.profileId)
      .in("status", ["pending", "in_progress"])
      .order("assigned_at", { ascending: false, nullsFirst: false })
      .limit(10)

    for (const task of assignedTasks ?? []) {
      notifications.push({
        id: `task-assigned-${task.id}-${task.assigned_at ?? task.created_at}`,
        type: "task_assigned",
        title: "New task assigned",
        message: `${task.title}${task.due_date ? ` · due ${task.due_date}` : ""}`,
        href: "/tasks",
        createdAt: task.assigned_at ?? task.created_at,
        tone: task.status === "in_progress" ? "blue" : "amber",
      })
    }
  }

  if (canManage(ctx.role)) {
    const since = new Date()
    since.setDate(since.getDate() - 7)

    const [{ data: doneTasks }, { data: lowStock }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, completed_at, completer:completed_by(email, full_name)")
        .eq("status", "done")
        .gte("completed_at", since.toISOString())
        .order("completed_at", { ascending: false })
        .limit(10),
      supabase
        .from("products")
        .select("id, name, quantity, unit, min_quantity")
        .order("quantity", { ascending: true })
        .limit(100),
    ])

    for (const task of doneTasks ?? []) {
      const completer = Array.isArray(task.completer) ? task.completer[0] : task.completer
      const name = completer?.full_name || completer?.email || "Staff member"
      notifications.push({
        id: `task-completed-${task.id}-${task.completed_at}`,
        type: "task_completed",
        title: "Task completed",
        message: `${name} completed: ${task.title}`,
        href: "/tasks",
        createdAt: task.completed_at ?? new Date().toISOString(),
        tone: "emerald",
      })
    }

    for (const product of lowStock ?? []) {
      if (Number(product.quantity) > Number(product.min_quantity)) continue
      notifications.push({
        id: `low-stock-${product.id}-${product.quantity}-${product.min_quantity}`,
        type: "low_stock",
        title: "Low stock warning",
        message: `${product.name}: ${product.quantity} ${product.unit} left, min ${product.min_quantity}. Need to order more.`,
        href: "/inventory",
        createdAt: new Date().toISOString(),
        tone: Number(product.quantity) === 0 ? "red" : "amber",
      })
    }
  }

  return notifications
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)
}
