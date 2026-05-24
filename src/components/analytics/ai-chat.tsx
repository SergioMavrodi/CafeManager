"use client"

import * as React from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Message = {
  role: "user" | "assistant"
  content: string
}

const quickPrompts = [
  "What needs attention today?",
  "Which products are running low?",
  "Order products that are low",
  "Generate shifts for next week",
  "Create task check refrigerators",
  "Restock low inventory and create purchase tasks",
  "Give me revenue recommendations",
  "Which waiter generated the most revenue?",
]

export function AIChat() {
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: "user", content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      setMessages([...next, { role: "assistant", content: data.content ?? data.error ?? "No response" }])
    } catch {
      setMessages([...next, { role: "assistant", content: "Failed to get response." }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="rounded-xl border border-amber-500/10 bg-card/80 ring-1 ring-foreground/10 backdrop-blur flex flex-col h-[620px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10">
        <div>
          <h2 className="text-sm font-semibold">Cafe AI Assistant</h2>
          <p className="text-xs text-muted-foreground">Only cafe analytics, stock, revenue, menu and recommendations</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Ask about this cafe only</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="text-xs border border-amber-500/15 rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-amber-500/40 hover:bg-amber-500/10 transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
              msg.role === "user"
                ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
                : "bg-muted text-foreground"
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-amber-500/10">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about cafe revenue, stock, menu..."
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
