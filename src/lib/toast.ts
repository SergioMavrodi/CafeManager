"use client"

import { toast } from "sonner"

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Run a server action and show a toast for the result.
 * Returns the original result so callers can branch on success.
 */
export async function runWithToast<T extends ActionResult>(
  action: () => Promise<T>,
  messages: { success?: string; error?: string; loading?: string },
): Promise<T> {
  const id = messages.loading ? toast.loading(messages.loading) : undefined
  try {
    const result = await action()
    if (result.ok) {
      if (messages.success) toast.success(messages.success, { id })
      else if (id) toast.dismiss(id)
    } else {
      toast.error(result.error || messages.error || "Something went wrong", { id })
    }
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error"
    toast.error(msg, { id })
    throw e
  }
}

export { toast }
