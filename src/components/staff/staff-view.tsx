"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, KeyRound, Pencil, Plus, Shield, Trash2, UserPlus } from "lucide-react"

import {
  addStaffMember,
  createStaffAccount,
  deleteAccountByEmail,
  deleteStaffMember,
  getAccountByEmail,
  resetAccountPassword,
  setAccountManager,
  updateStaffMember,
  type StaffAccountInfo,
} from "@/app/(dashboard)/staff/actions"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { can, type Role } from "@/lib/rbac"

export type StaffRow = {
  id: string
  name: string
  role: string
  phone: string | null
  email: string | null
}

type StaffViewProps = {
  initialRows: StaffRow[]
  role: Role
  currentUserId: string
}

export function StaffView({ initialRows, role, currentUserId }: StaffViewProps) {
  const router = useRouter()
  const canWrite = can(role, "staff.write")
  const canCreateAccount = can(role, "users.create")
  const canChangeRole = can(role, "users.changeRole")
  const canResetPassword = can(role, "users.resetPassword")
  const canDeleteAccount = can(role, "users.delete")

  const [rows, setRows] = React.useState<StaffRow[]>(initialRows)

  // Add staff dialog
  const [addOpen, setAddOpen] = React.useState(false)
  const [addName, setAddName] = React.useState("")
  const [addRole, setAddRole] = React.useState("")
  const [addPhone, setAddPhone] = React.useState("")
  const [addEmail, setAddEmail] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  // Edit dialog
  const [editTarget, setEditTarget] = React.useState<StaffRow | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editRole, setEditRole] = React.useState("")
  const [editPhone, setEditPhone] = React.useState("")
  const [editEmail, setEditEmail] = React.useState("")
  const [editError, setEditError] = React.useState<string | null>(null)
  const [editSaving, setEditSaving] = React.useState(false)

  // Linked account state (loaded async after open)
  const [account, setAccount] = React.useState<StaffAccountInfo>({ exists: false })
  const [accountLoaded, setAccountLoaded] = React.useState(false)
  const [creatingAccount, setCreatingAccount] = React.useState(false)
  const [acctPassword, setAcctPassword] = React.useState("")
  const [acctRoleSel, setAcctRoleSel] = React.useState<"manager" | "staff">("staff")
  const [togglingManager, setTogglingManager] = React.useState(false)
  const [resetPwOpen, setResetPwOpen] = React.useState(false)
  const [newPassword, setNewPassword] = React.useState("")
  const [resettingPw, setResettingPw] = React.useState(false)
  const [showPw, setShowPw] = React.useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<StaffRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteAlsoAccount, setDeleteAlsoAccount] = React.useState(true)

  // ---- Add staff ----
  function resetAddForm() {
    setAddName(""); setAddRole(""); setAddPhone(""); setAddEmail(""); setAddError(null)
  }
  function handleAddOpenChange(open: boolean) {
    setAddOpen(open)
    if (!open) resetAddForm()
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim() || !addRole.trim()) return
    setAdding(true); setAddError(null)
    const result = await addStaffMember({ name: addName, role: addRole, phone: addPhone, email: addEmail })
    setAdding(false)
    if (!result.ok) { setAddError(result.error); return }
    handleAddOpenChange(false)
    router.refresh()
  }

  // ---- Edit staff ----
  async function openEdit(row: StaffRow) {
    setEditTarget(row)
    setEditName(row.name)
    setEditRole(row.role)
    setEditPhone(row.phone ?? "")
    setEditEmail(row.email ?? "")
    setEditError(null)
    setAccount({ exists: false })
    setAccountLoaded(false)
    setAcctPassword("")
    setAcctRoleSel("staff")
    if (row.email) {
      const info = await getAccountByEmail(row.email)
      setAccount(info)
      setAccountLoaded(true)
    } else {
      setAccountLoaded(true)
    }
  }
  function closeEdit() {
    setEditTarget(null)
    setEditError(null)
    setResetPwOpen(false)
    setShowPw(false)
  }
  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true); setEditError(null)
    const result = await updateStaffMember(editTarget.id, {
      name: editName, role: editRole, phone: editPhone, email: editEmail,
    })
    setEditSaving(false)
    if (!result.ok) { setEditError(result.error); return }
    closeEdit()
    router.refresh()
  }

  // ---- Account: create ----
  async function handleCreateAccount() {
    if (!editTarget?.email) {
      setEditError("Add an email first")
      return
    }
    if (!acctPassword.trim()) {
      setEditError("Enter a temporary password")
      return
    }
    setCreatingAccount(true); setEditError(null)
    const result = await createStaffAccount({
      email: editTarget.email,
      password: acctPassword,
      role: acctRoleSel,
      staffId: editTarget.id,
    })
    setCreatingAccount(false)
    if (!result.ok) { setEditError(result.error); return }
    setAcctPassword("")
    // Refresh account info
    const info = await getAccountByEmail(editTarget.email)
    setAccount(info)
    router.refresh()
  }

  // ---- Account: toggle manager ----
  async function handleToggleManager(checked: boolean) {
    if (!editTarget?.email) return
    setTogglingManager(true); setEditError(null)
    const result = await setAccountManager({ email: editTarget.email, makeManager: checked })
    setTogglingManager(false)
    if (!result.ok) { setEditError(result.error); return }
    setAccount((a) => ({ ...a, role: checked ? "manager" : "staff" }))
    router.refresh()
  }

  // ---- Account: reset password ----
  async function handleResetPassword() {
    if (!editTarget?.email || !newPassword.trim()) return
    setResettingPw(true); setEditError(null)
    const result = await resetAccountPassword({ email: editTarget.email, newPassword })
    setResettingPw(false)
    if (!result.ok) { setEditError(result.error); return }
    setNewPassword("")
    setResetPwOpen(false)
  }

  // ---- Delete staff ----
  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    if (deleteAlsoAccount && deleteTarget.email && account.exists) {
      await deleteAccountByEmail(deleteTarget.email)
    }
    await deleteStaffMember(deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    closeEdit()
    router.refresh()
  }

  const isSelfAccount = account.exists && account.userId === currentUserId

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">Roster, contacts, and account access.</p>
        {canWrite && (
          <Button type="button" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Add Member
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground text-sm">No staff yet. Add your first team member.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(row)}
                        title="Edit member"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Dialog */}
      {canWrite && (
        <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
          <DialogContent className="sm:max-w-md" showCloseButton>
            <form onSubmit={handleAdd}>
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
                <DialogDescription>Fill in the details for the new staff member.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {addError && <p className="text-destructive text-sm" role="alert">{addError}</p>}
                <div className="grid gap-2">
                  <Label htmlFor="s-name">Name</Label>
                  <Input id="s-name" placeholder="Alex Smith" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-role">Role</Label>
                  <Input id="s-role" placeholder="Barista" value={addRole} onChange={(e) => setAddRole(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-phone">Phone</Label>
                  <Input id="s-phone" type="tel" placeholder="+1 555 000 0000" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-email">Email</Label>
                  <Input id="s-email" type="email" placeholder="alex@cafe.com" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={adding}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={adding}>{adding ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) closeEdit() }}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit team member</DialogTitle>
              <DialogDescription>Update details and account access.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {editError && <p className="text-destructive text-sm" role="alert">{editError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="e-name">Name</Label>
                  <Input id="e-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="e-role">Role</Label>
                  <Input id="e-role" value={editRole} onChange={(e) => setEditRole(e.target.value)} required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="e-phone">Phone</Label>
                <Input id="e-phone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="e-email">Email</Label>
                <Input id="e-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>

              {/* Account section */}
              {(canCreateAccount || canChangeRole) && (
                <div className="bg-muted/40 rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="text-primary size-4" aria-hidden />
                      <span className="text-sm font-medium">Account access</span>
                    </div>
                    {accountLoaded && (
                      <Badge variant={account.exists ? "default" : "outline"}>
                        {account.exists ? account.role : "no account"}
                      </Badge>
                    )}
                  </div>

                  {!accountLoaded && (
                    <p className="text-muted-foreground text-xs">Loading account…</p>
                  )}

                  {accountLoaded && !editTarget?.email && (
                    <p className="text-muted-foreground text-xs">Add an email to manage account access.</p>
                  )}

                  {accountLoaded && editTarget?.email && !account.exists && canCreateAccount && (
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs">No account yet. Create one with a temporary password.</p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder="Temporary password"
                          value={acctPassword}
                          onChange={(e) => setAcctPassword(e.target.value)}
                          className="flex-1"
                        />
                        <select
                          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                          value={acctRoleSel}
                          onChange={(e) => setAcctRoleSel(e.target.value as "manager" | "staff")}
                        >
                          {canChangeRole && <option value="manager">Manager</option>}
                          <option value="staff">Staff</option>
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateAccount}
                          disabled={creatingAccount || !acctPassword.trim()}
                        >
                          <UserPlus className="size-3.5" aria-hidden />
                          {creatingAccount ? "Creating…" : "Create"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {accountLoaded && account.exists && (
                    <div className="space-y-3">
                      {account.password !== undefined && (
                        <div className="grid gap-1">
                          <Label className="text-xs">Current password</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              type={showPw ? "text" : "password"}
                              value={account.password ?? "— not stored —"}
                              className="font-mono text-sm"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="shrink-0"
                              onClick={() => setShowPw((s) => !s)}
                              disabled={!account.password}
                              title={showPw ? "Hide" : "Show"}
                            >
                              {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                            </Button>
                          </div>
                        </div>
                      )}
                      {account.isLinkedAdmin ? (
                        <p className="text-muted-foreground text-xs">
                          This is an admin account; role cannot be changed.
                        </p>
                      ) : (
                        <>
                          {canChangeRole && (
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label htmlFor="e-mgr" className="cursor-pointer text-sm">Make manager</Label>
                                <p className="text-muted-foreground text-xs">Grants manager access (almost full).</p>
                              </div>
                              <Switch
                                id="e-mgr"
                                checked={account.role === "manager"}
                                disabled={togglingManager || isSelfAccount}
                                onCheckedChange={handleToggleManager}
                              />
                            </div>
                          )}
                        </>
                      )}
                      {canResetPassword && !account.isLinkedAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={() => { setNewPassword(""); setResetPwOpen(true) }}
                        >
                          <KeyRound className="size-3.5" aria-hidden />
                          Change password
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              {canWrite && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => { setDeleteAlsoAccount(true); setDeleteTarget(editTarget) }}
                  disabled={editSaving || !editTarget}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={editSaving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save"}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{editTarget?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="np">New password</Label>
            <Input
              id="np"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={resettingPw}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleResetPassword} disabled={resettingPw || !newPassword.trim()}>
              {resettingPw ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete team member?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. <strong>{deleteTarget?.name}</strong> will be removed from the roster.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget?.email && account.exists && canDeleteAccount && !account.isLinkedAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deleteAlsoAccount}
                onChange={(e) => setDeleteAlsoAccount(e.target.checked)}
                className="size-4"
              />
              Also delete linked account ({deleteTarget.email})
            </label>
          )}
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
