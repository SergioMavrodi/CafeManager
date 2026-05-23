"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[dashboard] error:", error)
  }, [error])

  const isPermission = /Forbidden|missing permission/i.test(error.message)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {isPermission ? "Access denied" : "Something went wrong"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isPermission
            ? "You don't have permission to perform this action."
            : error.message || "An unexpected error occurred."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">Try again</Button>
    </div>
  )
}
