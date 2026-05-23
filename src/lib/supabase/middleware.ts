import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { ROLE_HOME, ROUTE_ACCESS, type Role, topLevelRoute } from '@/lib/rbac'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Public routes
  if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname.startsWith('/auth/login'))) {
    const url = request.nextUrl.clone()
    url.pathname = ROLE_HOME[(user.user_metadata?.role as Role | undefined) ?? 'staff']
    return NextResponse.redirect(url)
  }

  // Role-based route gating
  if (user && pathname !== '/') {
    const role = ((user.user_metadata?.role as Role | undefined) ?? 'staff')
    const top = topLevelRoute(pathname)
    const allowed = ROUTE_ACCESS[top]
    if (allowed && !allowed.includes(role)) {
      const url = request.nextUrl.clone()
      url.pathname = ROLE_HOME[role]
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
