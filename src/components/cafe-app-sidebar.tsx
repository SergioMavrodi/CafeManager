"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  ClipboardList,
  Coffee,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  UtensilsCrossed,
  Users,
} from "lucide-react"

import { logout } from "@/app/auth/actions"
import { Button } from "@/components/ui/button"
import { ROUTE_ACCESS, type Role } from "@/lib/rbac"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const allNavItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Tasks", href: "/tasks", icon: ClipboardList },
  { title: "Orders", href: "/orders", icon: ShoppingCart },
  { title: "Inventory", href: "/inventory", icon: Package },
  { title: "Menu", href: "/menu", icon: UtensilsCrossed },
  { title: "Staff", href: "/staff", icon: Users },
  { title: "Revenue", href: "/revenue", icon: BarChart3 },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Audit", href: "/audit", icon: History },
] as const

type CafeAppSidebarProps = {
  role?: Role
  variant?: "sidebar" | "floating" | "inset"
}

export function CafeAppSidebar({ role = "staff", variant }: CafeAppSidebarProps) {
  const pathname = usePathname()
  const navItems = allNavItems.filter((item) => {
    const allowed = ROUTE_ACCESS[item.href]
    return allowed ? allowed.includes(role) : true
  })

  return (
    <Sidebar collapsible="icon" variant={variant} style={{ "--sidebar-width": "13rem" } as React.CSSProperties}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Coffee className="size-4" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Cafe Manager</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`))

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <Icon aria-hidden />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        </form>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
