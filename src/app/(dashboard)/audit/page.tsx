import { requirePermissionOrRedirect } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AuditLog = {
  id: string
  action: string
  entity: string
  details: string | null
  created_by_email: string | null
  created_at: string
}

type ActivityLog = {
  id: string
  action: string
  entity_type: string | null
  actor_email: string | null
  created_at: string
}

export default async function AuditPage() {
  await requirePermissionOrRedirect("audit.view")
  const supabase = await createClient()

  const { data: auditLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, details, created_by_email, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  const { data: activityLogs } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, actor_email, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  const logs: AuditLog[] =
    auditLogs && auditLogs.length > 0
      ? auditLogs
      : ((activityLogs ?? []) as ActivityLog[]).map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity_type ?? "system",
          details: null,
          created_by_email: log.actor_email,
          created_at: log.created_at,
        }))

  const total = logs.length
  const actors = new Set(logs.map((l) => l.created_by_email).filter(Boolean)).size
  const entities = new Set(logs.map((l) => l.entity).filter(Boolean)).size

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-pretty">
          Recent system actions, updates, and operational activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AuditStat title="Total events" value={String(total)} />
        <AuditStat title="Active users" value={String(actors)} />
        <AuditStat title="Entity types" value={String(entities)} />
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-amber-500/10 bg-card/80 p-8 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground text-sm">No audit records yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/10 bg-card/80 ring-1 ring-foreground/10 overflow-x-auto backdrop-blur">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {log.action.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{log.entity}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {log.created_by_email ?? "System"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-md truncate">
                    {formatDetails(log.details)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function AuditStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-500/10 bg-card/80 p-5 ring-1 ring-foreground/10 backdrop-blur">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function formatDetails(details: string | null) {
  if (!details) return "—"
  try {
    const parsed = JSON.parse(details)
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ")
  } catch {
    return details
  }
}
