"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Play, Plus, RotateCcw, Trash2 } from "lucide-react"

import {
  addTask,
  assignTask,
  completeTask,
  deleteTask,
  reopenTask,
  startTask,
} from "@/app/(dashboard)/tasks/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { can, type Role } from "@/lib/rbac"
import { runWithToast, toast } from "@/lib/toast"

export type TaskStatus = "pending" | "in_progress" | "done"

export type TaskRow = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  due_date: string | null
  assigned_to: string | null
  assignee_label: string | null
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  completer_label: string | null
}

export type AssigneeOption = {
  id: string
  label: string
  role: Role
}

const EVERYONE = "__everyone__"

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "done")
    return <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">Done</Badge>
  if (status === "in_progress")
    return <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200">In progress</Badge>
  return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">Pending</Badge>
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

type TasksViewProps = {
  initialRows: TaskRow[]
  role: Role
  currentUserId: string
  assignees: AssigneeOption[]
}

export function TasksView({ initialRows, role, currentUserId, assignees }: TasksViewProps) {
  const router = useRouter()
  const canManage = can(role, "tasks.create")
  const canDelete = can(role, "tasks.delete")
  const canAssign = can(role, "tasks.assign")
  const canSeeAll = can(role, "tasks.readAll")

  const [rows, setRows] = React.useState<TaskRow[]>(initialRows)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<"active" | "done">("active")

  // Add dialog
  const [addOpen, setAddOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [addAssignee, setAddAssignee] = React.useState<string>(EVERYONE)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<TaskRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const visibleRows = rows.filter((r) => {
    const visibleForRole = canSeeAll || r.assigned_to === null || r.assigned_to === currentUserId
    const visibleForTab = tab === "active" ? r.status !== "done" : r.status === "done"
    return visibleForRole && visibleForTab
  })

  function resetAddForm() {
    setTitle(""); setDescription(""); setDueDate(""); setAddAssignee(EVERYONE); setError(null)
  }

  function handleAddOpenChange(open: boolean) {
    setAddOpen(open)
    if (!open) resetAddForm()
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setError(null)
    const result = await runWithToast(
      () => addTask({
        title,
        description,
        due_date: dueDate,
        assigned_to: addAssignee === EVERYONE ? null : addAssignee,
      }),
      { success: "Task created" },
    )
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    handleAddOpenChange(false)
    router.refresh()
  }

  async function handleStart(row: TaskRow) {
    setBusyId(row.id)
    const result = await runWithToast(() => startTask(row.id), { success: `Started: ${row.title}` })
    if (result.ok) {
      const assignee = assignees.find((a) => a.id === result.data.assigned_to)
      setRows((prev) =>
        prev.map((task) =>
          task.id === row.id
            ? {
                ...task,
                status: "in_progress",
                assigned_to: result.data.assigned_to,
                assignee_label: assignee?.label ?? "Me",
                assigned_at: result.data.started_at,
                started_at: result.data.started_at,
              }
            : task
        )
      )
    }
    setBusyId(null)
  }

  async function handleComplete(row: TaskRow) {
    setBusyId(row.id)
    await runWithToast(() => completeTask(row.id), { success: `Completed: ${row.title}` })
    setBusyId(null)
    router.refresh()
  }

  async function handleReopen(row: TaskRow) {
    setBusyId(row.id)
    await runWithToast(() => reopenTask(row.id), { success: "Task reopened" })
    setBusyId(null)
    router.refresh()
  }

  async function handleAssignChange(row: TaskRow, value: string) {
    setBusyId(row.id)
    const result = await assignTask(row.id, value === EVERYONE ? null : value)
    if (!result.ok) toast.error(result.error)
    setBusyId(null)
    router.refresh()
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await runWithToast(() => deleteTask(deleteTarget.id), { success: "Task deleted" })
    setDeleting(false)
    setDeleteTarget(null)
    router.refresh()
  }

  function rowActions(row: TaskRow): React.ReactNode {
    const isMine = row.assigned_to === currentUserId
    const isForEveryone = row.assigned_to === null
    const canStartTask = canManage || isMine || isForEveryone
    const canFinishTask = canManage || isMine
    const buttons: React.ReactNode[] = []

    if (row.status === "pending" && canStartTask) {
      buttons.push(
        <Button
          key="start"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          disabled={busyId === row.id}
          onClick={() => handleStart(row)}
        >
          <Play className="size-3.5" aria-hidden />
          Start
        </Button>
      )
    }
    if (row.status === "in_progress" && canFinishTask) {
      buttons.push(
        <Button
          key="complete"
          variant="outline"
          size="sm"
          className="h-8 gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          disabled={busyId === row.id}
          onClick={() => handleComplete(row)}
        >
          <CheckCircle2 className="size-3.5" aria-hidden />
          Complete
        </Button>
      )
    }
    if (row.status === "done" && canManage) {
      buttons.push(
        <Button
          key="reopen"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          disabled={busyId === row.id}
          onClick={() => handleReopen(row)}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reopen
        </Button>
      )
    }
    if (canDelete) {
      buttons.push(
        <Button
          key="del"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          disabled={busyId === row.id}
          onClick={() => setDeleteTarget(row)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      )
    }
    return <div className="flex flex-wrap items-center gap-1">{buttons}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm transition ${tab === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm transition ${tab === "done" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("done")}
          >
            Completed
          </button>
        </div>
        {canManage && (
          <Button type="button" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add Task
          </Button>
        )}
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground text-sm">
            {tab === "active" ? "No active tasks." : "No completed tasks yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card ring-1 ring-foreground/10 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                {canSeeAll && tab === "done" && <TableHead>Completed</TableHead>}
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.title}</div>
                    {row.description && (
                      <div className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{row.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {canAssign ? (
                      <Select
                        value={row.assigned_to ?? EVERYONE}
                        onValueChange={(v) => handleAssignChange(row, v)}
                        disabled={busyId === row.id}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EVERYONE}>Everyone</SelectItem>
                          {assignees.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground text-sm">{row.assignee_label ?? "Everyone"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{row.due_date ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  {canSeeAll && tab === "done" && (
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      <div>{row.completer_label ?? "—"}</div>
                      <div>{fmtDateTime(row.completed_at)}</div>
                    </TableCell>
                  )}
                  <TableCell>{rowActions(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Task Dialog */}
      {canManage && (
        <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
          <DialogContent className="sm:max-w-md" showCloseButton>
            <form onSubmit={handleAddSubmit}>
              <DialogHeader>
                <DialogTitle>Add task</DialogTitle>
                <DialogDescription>Create a new checklist item for the team.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
                <div className="grid gap-2">
                  <Label htmlFor="t-title">Title</Label>
                  <Input id="t-title" placeholder="Clean espresso machine" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="t-desc">Description</Label>
                  <Input id="t-desc" placeholder="Optional details…" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="t-due">Due date</Label>
                    <Input id="t-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="t-assignee">Assignee</Label>
                    <Select value={addAssignee} onValueChange={setAddAssignee}>
                      <SelectTrigger id="t-assignee">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EVERYONE}>Everyone</SelectItem>
                        {assignees.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={saving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.title}</strong> will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
