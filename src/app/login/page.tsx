"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Coffee } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const displayError = error ?? searchParams.get("error")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) { setError(authError.message); return }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-sm ring-1 ring-foreground/5 space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coffee className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Cafe Manager</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="manager@cafe.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <span className="text-xs text-muted-foreground cursor-default">Forgot password?</span>
              </div>
              <Input id="password" type="password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" />
            </div>
            {displayError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2" role="alert">
                {displayError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  )
}
