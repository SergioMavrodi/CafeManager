"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, CheckCheck, ClipboardCheck, PackageOpen, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { type AppNotification } from "@/lib/notifications"

type NotificationBellProps = {
  notifications: AppNotification[]
}

const READ_KEY = "cafe-notifications-read"

function readIds() {
  if (typeof window === "undefined") return new Set<string>()
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]"))
  } catch {
    return new Set<string>()
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids).slice(-200)))
}

function toneClass(tone: AppNotification["tone"]) {
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
  if (tone === "red") return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
  if (tone === "blue") return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300"
  return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
}

function NotificationIcon({ type }: { type: AppNotification["type"] }) {
  if (type === "low_stock") return <PackageOpen className="size-4" />
  if (type === "task_completed") return <ClipboardCheck className="size-4" />
  return <Sparkles className="size-4" />
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function NotificationBell({ notifications }: NotificationBellProps) {
  const [open, setOpen] = React.useState(false)
  const [read, setRead] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    setTimeout(() => setRead(readIds()), 0)
  }, [])

  const unread = notifications.filter((item) => !read.has(item.id))

  function markOne(id: string) {
    setRead((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveReadIds(next)
      return next
    })
  }

  function markAll() {
    const next = new Set(read)
    for (const item of notifications) next.add(item.id)
    setRead(next)
    saveReadIds(next)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9 rounded-full" aria-label="Notifications">
          <Bell className="size-4" aria-hidden />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>Notifications</DialogTitle>
              <DialogDescription>Tasks, completed work, and low stock alerts.</DialogDescription>
            </div>
            {notifications.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={markAll}>
                <CheckCheck className="size-3.5" />
                Read all
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border bg-muted/30 p-8 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCheck className="size-5" />
              </div>
              <p className="font-medium">Everything is clear</p>
              <p className="mt-1 text-sm text-muted-foreground">No new alerts right now.</p>
            </div>
          ) : (
            notifications.map((item) => {
              const isRead = read.has(item.id)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    markOne(item.id)
                    setOpen(false)
                  }}
                  className={`block rounded-2xl border p-4 transition hover:border-amber-500/40 hover:bg-muted/20 ${isRead ? "bg-card/60 opacity-70" : "bg-card"}`}
                >
                  <div className="flex gap-3">
                    <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border ${toneClass(item.tone)}`}>
                      <NotificationIcon type={item.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium leading-tight">{item.title}</p>
                        {!isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-red-500" />}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{fmtTime(item.createdAt)}</p>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
