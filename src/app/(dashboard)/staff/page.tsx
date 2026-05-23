import { StaffView } from "@/components/staff/staff-view"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export default async function StaffPage() {
  const ctx = await getAuthContext()
  const supabase = await createClient()
  const { data } = await supabase
    .from("staff")
    .select("id, name, role, phone, email")
    .order("name")

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">Team roster, roles, and contacts.</p>
      </div>
      <StaffView initialRows={data ?? []} role={ctx?.role ?? "staff"} currentUserId={ctx?.profileId ?? ""} />
    </div>
  )
}
