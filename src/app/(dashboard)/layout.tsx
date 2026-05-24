import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { CafeAppSidebar } from "@/components/cafe-app-sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { ProfileButton } from "@/components/profile-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getAppNotifications } from "@/lib/notifications"
import { getAuthContext } from "@/lib/rbac.server"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const ctx = await getAuthContext()
  const role = ctx?.role ?? "staff"
  const supabase = await createClient()

  const [{ data: profile }, { data: staff }] = await Promise.all([
    ctx
      ? supabase.from("profiles").select("full_name, email").eq("id", ctx.profileId).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx?.email
      ? supabase.from("staff").select("name, role, phone").eq("email", ctx.email).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const profileName = staff?.name || profile?.full_name || ctx?.email || "User"
  const profileEmail = profile?.email || ctx?.email || ""
  const notifications = await getAppNotifications(ctx)

  return (
    <TooltipProvider>
      <SidebarProvider>
        <CafeAppSidebar role={role} />
        <div className="min-w-0 flex-1 transition-all duration-200 ease-linear">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-amber-500/10 bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-1 h-6" />
            <span className="flex-1 text-sm font-medium text-muted-foreground">
              Cafe management
            </span>
            <ThemeToggle />
            <NotificationBell notifications={notifications} />
            <ProfileButton
              name={profileName}
              email={profileEmail}
              role={role}
              jobTitle={staff?.role ?? null}
              phone={staff?.phone ?? null}
            />
          </header>
          <main className="app-shell-bg min-h-[calc(100vh-3.5rem)]">
            <div className="flex flex-1 flex-col gap-4 p-4 md:px-5 md:py-6">{children}</div>
          </main>

          {/* Global FAB - New Order */}
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              asChild
              size="lg"
              className="rounded-2xl shadow-xl h-16 w-16 p-0 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 border-0"
              aria-label="New Order"
            >
              <Link href="/orders?new=1">
                <ShoppingCart className="size-7 text-white" strokeWidth={2} />
              </Link>
            </Button>
          </div>
        </div>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  )
}
