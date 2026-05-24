"use client"

import { Toaster as SonnerToaster, type ToasterProps } from "sonner"

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      theme="system"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border bg-card text-card-foreground shadow",
        },
      }}
      {...props}
    />
  )
}
