"use client"

import { UserRound } from "lucide-react"

import { logout } from "@/app/auth/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { type Role } from "@/lib/rbac"

type ProfileButtonProps = {
  name: string
  email: string
  role: Role
  jobTitle?: string | null
  phone?: string | null
}

export function ProfileButton({ name, email, role, jobTitle, phone }: ProfileButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Profile">
          <UserRound className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Account profile</DialogTitle>
          <DialogDescription>Information about the currently signed in account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{email}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className="capitalize">{role}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Job</span>
              <span className="font-medium">{jobTitle || "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{phone || "—"}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <form action={logout} className="w-full">
            <Button type="submit" variant="destructive" className="w-full">
              Sign out
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
