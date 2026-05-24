/**
 * Role-Based Access Control (RBAC) — pure types and helpers.
 * Safe to import from client components.
 *
 * Server-only helpers (getAuthContext, requirePermission, etc.) live in
 * `@/lib/rbac.server`.
 */

export type Role = "admin" | "manager" | "staff"

export const ALL_ROLES: readonly Role[] = ["admin", "manager", "staff"] as const

export const PERMISSIONS = {
  // Account management
  "users.read": ["admin", "manager"],
  "users.create": ["admin", "manager"],
  "users.delete": ["admin", "manager"],
  "users.changeRole": ["admin"],
  "users.resetPassword": ["admin", "manager"],
  "users.viewPassword": ["admin", "manager"],

  // Inventory
  "inventory.read": ["admin", "manager", "staff"],
  "inventory.write": ["admin", "manager"],
  "inventory.reduce": ["admin", "manager", "staff"], // staff can only reduce

  // Menu
  "menu.read": ["admin", "manager", "staff"],
  "menu.write": ["admin", "manager"],

  // Tasks
  "tasks.readAll": ["admin", "manager"],
  "tasks.create": ["admin", "manager"],
  "tasks.assign": ["admin", "manager"],
  "tasks.delete": ["admin", "manager"],
  "tasks.start": ["admin", "manager", "staff"],
  "tasks.complete": ["admin", "manager", "staff"],

  // Staff (HR roster)
  "staff.read": ["admin", "manager", "staff"],
  "staff.write": ["admin", "manager"],

  // Analytics & Dashboard
  "analytics.view": ["admin", "manager"],
  "dashboard.view": ["admin", "manager"],

  // Orders
  "orders.read": ["admin", "manager", "staff"],
  "orders.create": ["admin", "manager", "staff"],
  "orders.close": ["admin", "manager", "staff"],
  "orders.delete": ["admin", "manager"],

  // Audit
  "audit.view": ["admin"],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[perm] as readonly Role[]).includes(role)
}

/**
 * Role-based route access. Used by middleware to gate top-level routes.
 */
export const ROUTE_ACCESS: Record<string, readonly Role[]> = {
  "/dashboard": ["admin", "manager"],
  "/revenue": ["admin", "manager"],
  "/analytics": ["admin", "manager"],
  "/inventory": ["admin", "manager", "staff"],
  "/menu": ["admin", "manager", "staff"],
  "/staff": ["admin", "manager", "staff"],
  "/tasks": ["admin", "manager", "staff"],
  "/orders": ["admin", "manager", "staff"],
  "/audit": ["admin"],
}

export const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  manager: "/dashboard",
  staff: "/tasks",
}

/** Resolve top-level route segment (e.g. /tasks/123 → /tasks). */
export function topLevelRoute(pathname: string): string {
  const m = pathname.match(/^\/[^/]+/)
  return m ? m[0] : pathname
}

export function isRouteAllowed(pathname: string, role: Role): boolean {
  const top = topLevelRoute(pathname)
  const allowed = ROUTE_ACCESS[top]
  if (!allowed) return true
  return allowed.includes(role)
}
