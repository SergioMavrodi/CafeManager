import { TasksView, type TaskRow, type AssigneeOption } from "@/components/tasks/tasks-view"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

type TaskJoinedRow = {
  id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  assigned_to: string | null
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  assignee: { email: string; full_name: string | null } | null
  completer: { email: string; full_name: string | null } | null
}

export default async function TasksPage() {
  const ctx = await getAuthContext()
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from("tasks")
    .select(`
      id, title, description, status, due_date,
      assigned_to, assigned_at, started_at, completed_at, completed_by, created_at,
      assignee:assigned_to(email, full_name),
      completer:completed_by(email, full_name)
    `)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<TaskJoinedRow[]>()

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .order("email")

  const rows: TaskRow[] = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TaskRow["status"],
    due_date: t.due_date,
    assigned_to: t.assigned_to,
    assignee_label: t.assignee?.full_name || t.assignee?.email || null,
    assigned_at: t.assigned_at,
    started_at: t.started_at,
    completed_at: t.completed_at,
    completer_label: t.completer?.full_name || t.completer?.email || null,
  }))

  // Filter: exclude admin from assignee list (manager/staff only)
  const assignees: AssigneeOption[] = (profiles ?? [])
    .filter((p) => p.role !== "admin")
    .map((p) => ({
      id: p.id,
      label: p.full_name || p.email,
      role: p.role as "admin" | "manager" | "staff",
    }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">Opening/closing checklists and team to-dos.</p>
      </div>
      <TasksView
        initialRows={rows}
        role={ctx?.role ?? "staff"}
        currentUserId={ctx?.profileId ?? ""}
        assignees={assignees}
      />
    </div>
  )
}
