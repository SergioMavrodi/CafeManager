"use client"

import { LogOut } from "lucide-react"

import { logout } from "@/app/auth/actions"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Выйти"
      >
        <LogOut className="size-4" aria-hidden />
      </Button>
    </form>
  )
}
