"use client"

import * as React from "react"
import { CalendarDays, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StaffShifts, type ShiftRow } from "@/components/staff/staff-shifts"
import { StaffView, type StaffRow } from "@/components/staff/staff-view"
import type { Role } from "@/lib/rbac"

type StaffOption = {
  id: string
  name: string
  role: string
}

type StaffSectionsProps = {
  shifts: ShiftRow[]
  staffOptions: StaffOption[]
  staffRows: StaffRow[]
  role: Role
  currentUserId: string
}

export function StaffSections({ shifts, staffOptions, staffRows, role, currentUserId }: StaffSectionsProps) {
  const [tab, setTab] = React.useState<"shifts" | "staff">("shifts")

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle>Staff workspace</CardTitle>
          <CardDescription>Switch between shift planning and staff roster without long scrolling.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 rounded-2xl border bg-muted/30 p-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={tab === "shifts" ? "default" : "ghost"}
              className="justify-start gap-2"
              onClick={() => setTab("shifts")}
            >
              <CalendarDays className="size-4" />
              Shifts
            </Button>
            <Button
              type="button"
              variant={tab === "staff" ? "default" : "ghost"}
              className="justify-start gap-2"
              onClick={() => setTab("staff")}
            >
              <Users className="size-4" />
              Staff roster
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "shifts" ? (
        <StaffShifts shifts={shifts} staff={staffOptions} role={role} />
      ) : (
        <StaffView initialRows={staffRows} role={role} currentUserId={currentUserId} />
      )}
    </div>
  )
}
