import { CafeAppSidebar } from "@/components/cafe-app-sidebar"
import { LogoutButton } from "@/components/logout-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getAuthContext } from "@/lib/rbac.server"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const ctx = await getAuthContext()
  const role = ctx?.role ?? "staff"

  return (
    <TooltipProvider>
      <SidebarProvider>
        <CafeAppSidebar role={role} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-1 h-6" />
            <span className="flex-1 text-sm font-medium text-muted-foreground">
              Cafe management
            </span>
            <ThemeToggle />
            <LogoutButton />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  )
}
