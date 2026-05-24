"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, CalendarPlus, Pencil, Plus, Trash2, Users } from "lucide-react"

import { addShift, deleteShift, generateWeeklyShifts, saveWeeklyShiftPlan, updateShift } from "@/app/(dashboard)/staff/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { can, type Role } from "@/lib/rbac"

type StaffOption = {
  id: string
  name: string
  role: string
}

export type ShiftRow = {
  id: string
  staff_id: string
  work_date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  staff: StaffOption | null
}

type StaffShiftsProps = {
  shifts: ShiftRow[]
  staff: StaffOption[]
  role: Role
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}

function defaultTime(type: string) {
  if (type === "morning") return { startTime: "09:00", endTime: "17:00" }
  if (type === "evening") return { startTime: "14:00", endTime: "22:00" }
  if (type === "night") return { startTime: "22:00", endTime: "06:00" }
  return { startTime: "", endTime: "" }
}

function shiftLabel(type: string) {
  if (type === "morning") return "Morning"
  if (type === "evening") return "Evening"
  if (type === "night") return "Night"
  if (type === "day_off") return "Day off"
  return "Custom"
}

export function StaffShifts({ shifts, staff, role }: StaffShiftsProps) {
  const router = useRouter()
  const canEdit = can(role, "staff.write")
  const today = todayKey()
  const todayShifts = shifts.filter((shift) => shift.work_date === today && shift.shift_type !== "day_off")
  const [open, setOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<ShiftRow | null>(null)
  const [staffId, setStaffId] = React.useState("")
  const [workDate, setWorkDate] = React.useState(today)
  const [shiftType, setShiftType] = React.useState("morning")
  const [startTime, setStartTime] = React.useState("09:00")
  const [endTime, setEndTime] = React.useState("17:00")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [weekOpen, setWeekOpen] = React.useState(false)
  const [weekStart, setWeekStart] = React.useState(today)
  const [includeManagers, setIncludeManagers] = React.useState(false)
  const [weekError, setWeekError] = React.useState<string | null>(null)
  const [weekResult, setWeekResult] = React.useState<string | null>(null)
  const [weekSaving, setWeekSaving] = React.useState(false)
  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const [manualPlan, setManualPlan] = React.useState<Record<string, string>>({})
  const shiftsByDay = React.useMemo(() => {
    const groups = new Map<string, ShiftRow[]>()
    for (const shift of shifts) {
      const list = groups.get(shift.work_date) ?? []
      list.push(shift)
      groups.set(shift.work_date, list)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [shifts])

  React.useEffect(() => {
    const next: Record<string, string> = {}
    for (const person of staff) {
      for (const day of weekDays) {
        const existing = shifts.find((shift) => shift.staff_id === person.id && shift.work_date === day)
        next[`${person.id}-${day}`] = existing?.shift_type ?? "off"
      }
    }
    setTimeout(() => setManualPlan(next), 0)
  }, [staff, shifts, weekDays])

  function openAdd() {
    setEditTarget(null)
    setStaffId(staff[0]?.id ?? "")
    setWorkDate(today)
    setShiftType("morning")
    setStartTime("09:00")
    setEndTime("17:00")
    setError(null)
    setOpen(true)
  }

  function openEdit(shift: ShiftRow) {
    setEditTarget(shift)
    setStaffId(shift.staff_id)
    setWorkDate(shift.work_date)
    setShiftType(shift.shift_type)
    setStartTime(shift.start_time ?? "")
    setEndTime(shift.end_time ?? "")
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staffId || !workDate) return
    setSaving(true)
    setError(null)
    const input = { staffId, workDate, shiftType, startTime, endTime }
    const result = editTarget ? await updateShift(editTarget.id, input) : await addShift(input)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  async function handleDelete(shift: ShiftRow) {
    if (!confirm("Delete this shift?")) return
    await deleteShift(shift.id)
    router.refresh()
  }

  async function handleGenerateWeek(e: React.FormEvent) {
    e.preventDefault()
    setWeekSaving(true)
    setWeekError(null)
    setWeekResult(null)
    const result = await generateWeeklyShifts({ startDate: weekStart, includeManagers })
    setWeekSaving(false)
    if (!result.ok) {
      setWeekError(result.error)
      return
    }
    setWeekResult(`Created ${result.created} shifts. Skipped ${result.skipped} existing or rest-day slots.`)
    router.refresh()
  }

  async function handleSaveManualPlan() {
    setWeekSaving(true)
    setWeekError(null)
    setWeekResult(null)
    const rows = []
    for (const person of staff) {
      for (const day of weekDays) {
        const type = manualPlan[`${person.id}-${day}`] ?? "off"
        if (type === "off") continue
        const time = defaultTime(type)
        rows.push({
          staffId: person.id,
          workDate: day,
          shiftType: type,
          startTime: time.startTime,
          endTime: time.endTime,
        })
      }
    }
    const result = await saveWeeklyShiftPlan({ shifts: rows })
    setWeekSaving(false)
    if (!result.ok) {
      setWeekError(result.error)
      return
    }
    setWeekResult(`Saved ${result.saved} manual shifts.`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarPlus className="size-5 text-amber-500" />
                  Weekly shift planner
                </CardTitle>
                <CardDescription>Generate a clean 7-day schedule automatically, then edit any shift manually.</CardDescription>
              </div>
              <Button className="gap-2" onClick={() => setWeekOpen(true)}>
                <CalendarPlus className="size-4" />
                Plan week
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border bg-background/40 p-3">
                <p className="text-muted-foreground">Workers</p>
                <p className="mt-1 text-xl font-semibold">{staff.length}</p>
              </div>
              <div className="rounded-xl border bg-background/40 p-3">
                <p className="text-muted-foreground">Upcoming shifts</p>
                <p className="mt-1 text-xl font-semibold">{shifts.length}</p>
              </div>
              <div className="rounded-xl border bg-background/40 p-3">
                <p className="text-muted-foreground">Today assigned</p>
                <p className="mt-1 text-xl font-semibold">{todayShifts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5 text-amber-500" />
                  Today on shift
                </CardTitle>
                <CardDescription>Who is scheduled to work today.</CardDescription>
              </div>
              <Badge variant="outline">{todayShifts.length} people</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shifts today.</p>
            ) : (
              todayShifts.map((shift) => (
                <div key={shift.id} className="flex items-center justify-between rounded-xl border bg-background/40 p-3">
                  <div>
                    <p className="font-medium">{shift.staff?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{shift.staff?.role ?? "Staff"}</p>
                  </div>
                  <div className="text-right text-sm">
                    <Badge variant="secondary">{shiftLabel(shift.shift_type)}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{shift.start_time ?? "—"} - {shift.end_time ?? "—"}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-5 text-amber-500" />
                  Shift schedule
                </CardTitle>
                <CardDescription>Upcoming shift schedule.</CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" className="gap-1" onClick={openAdd}>
                  <Plus className="size-4" />
                  Add shift
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shifts have been added yet.</p>
            ) : (
              shiftsByDay.map(([day, dayShifts]) => (
                <div key={day} className="rounded-xl border bg-background/40">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <p className="font-medium">{day}</p>
                    <Badge variant="outline">{dayShifts.length} shifts</Badge>
                  </div>
                  <div className="grid gap-2 p-2">
                    {dayShifts.map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{shift.staff?.name ?? "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{shift.start_time ?? "—"} - {shift.end_time ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={shift.shift_type === "day_off" ? "outline" : "secondary"}>{shiftLabel(shift.shift_type)}</Badge>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(shift)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => handleDelete(shift)}>
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editTarget ? "Edit shift" : "Add shift"}</DialogTitle>
              <DialogDescription>Choose employee, date and working time.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-3">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="grid gap-2">
                <Label>Employee</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name} · {person.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shift-date">Date</Label>
                <Input id="shift-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label>Shift type</Label>
                <Select value={shiftType} onValueChange={setShiftType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="day_off">Day off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="start-time">Start</Label>
                  <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end-time">End</Label>
                  <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={weekOpen} onOpenChange={setWeekOpen}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-6xl" showCloseButton>
          <form onSubmit={handleGenerateWeek}>
            <DialogHeader>
              <DialogTitle>Plan a full week</DialogTitle>
              <DialogDescription>
                Use auto-generation or manually choose shifts in the weekly grid.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid gap-4 py-3">
              {weekError && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{weekError}</p>}
              {weekResult && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">{weekResult}</p>}
              <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                <div className="grid gap-2">
                  <Label htmlFor="week-start">Week start date</Label>
                  <Input id="week-start" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} required />
                </div>
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Auto planner creates role-based shifts. Manual planner lets you choose Morning, Evening, Night, or Off for each worker/day.
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background/40 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeManagers}
                  onChange={(e) => setIncludeManagers(e.target.checked)}
                />
                <span>
                  <span className="block font-medium">Include managers</span>
                  <span className="text-muted-foreground">By default only regular workers are scheduled.</span>
                </span>
              </label>
              <div className="rounded-xl border bg-background/40">
                <div className="border-b p-3">
                  <p className="font-medium">Manual weekly plan</p>
                  <p className="text-sm text-muted-foreground">Select shifts for each employee. Off means no shift will be saved for that day.</p>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[900px]">
                    <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                      <div className="p-2">Employee</div>
                      {weekDays.map((day) => (
                        <div key={day} className="border-l p-2">{day.slice(5)}</div>
                      ))}
                    </div>
                    {staff.map((person) => (
                      <div key={person.id} className="grid grid-cols-[180px_repeat(7,1fr)] border-b last:border-b-0">
                        <div className="p-2">
                          <p className="truncate text-sm font-medium">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{person.role}</p>
                        </div>
                        {weekDays.map((day) => {
                          const key = `${person.id}-${day}`
                          return (
                            <div key={key} className="border-l p-2">
                              <Select
                                value={manualPlan[key] ?? "off"}
                                onValueChange={(value) => setManualPlan((prev) => ({ ...prev, [key]: value }))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="off">Off</SelectItem>
                                  <SelectItem value="morning">Morning</SelectItem>
                                  <SelectItem value="evening">Evening</SelectItem>
                                  <SelectItem value="night">Night</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWeekOpen(false)} disabled={weekSaving}>Close</Button>
              <Button type="button" variant="secondary" onClick={handleSaveManualPlan} disabled={weekSaving}>{weekSaving ? "Saving…" : "Save manual plan"}</Button>
              <Button type="submit" disabled={weekSaving}>{weekSaving ? "Planning…" : "Auto-generate week"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
