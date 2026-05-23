"use client"

// Chat widget for the analytics page
// Talks to our /api/ai-chat endpoint which uses Groq

import * as React from "react"
import { Bot, Send, User, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Message = { role: "user" | "assistant"; content: string }

// quick prompts so users dont have to type common questions
const QUICK_PROMPTS = [
  { label: "📊 Business Overview", prompt: "Give me a full business overview with key metrics and recommendations." },
  { label: "⚠️ Low Stock", prompt: "What items are running low in inventory? What should I reorder?" },
  { label: "📋 Task Status", prompt: "Summarize the current task situation. Who has the most pending work?" },
  { label: "💡 Recommendations", prompt: "Give me 5 actionable recommendations to improve cafe operations." },
]

export function AIChat() {
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: "user", content: text.trim() }
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
      if (data.error) {
        setMessages([...next, { role: "assistant", content: `❌ Error: ${data.error}` }])
      } else {
        setMessages([...next, { role: "assistant", content: data.content }])
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "❌ Failed to connect to AI service." }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col rounded-2xl border bg-card overflow-hidden" style={{ height: "520px" }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3 bg-muted/30">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">AI Assistant</p>
          <p className="text-xs text-muted-foreground">Powered by Groq · Real-time data</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Ask anything about your business</p>
              <p className="text-xs text-muted-foreground mt-1">I have access to your menu, inventory, staff, and tasks data</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q.label}
                  onClick={() => sendMessage(q.prompt)}
                  className="rounded-xl border bg-muted/50 px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                <Bot className="size-3.5 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                <User className="size-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
              <Bot className="size-3.5 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your business..."
          disabled={loading}
          className="rounded-xl"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0 rounded-xl">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

// basic markdown to html - not perfect but good enough for chat
// TODO: maybe use a proper markdown library later
function formatMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-muted-foreground/10 px-1 rounded text-xs">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold mt-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold mt-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>")
}
