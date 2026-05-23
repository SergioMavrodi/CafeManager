// AI chat endpoint - connects to Groq (llama 3.3)

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// groq api - using openai-compatible endpoint
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

// pull all relevant data from db to give the AI context about our business
async function gatherBusinessContext() {
  const supabase = await createClient()

  const [menuRes, staffRes, productsRes, tasksRes, logsRes] = await Promise.all([
    supabase.from("menu_items").select("name, category, price, is_available"),
    supabase.from("staff").select("name, role, email"),
    supabase.from("products").select("name, category, quantity, unit, min_quantity"),
    supabase.from("tasks").select("title, status, assigned_to, completed_at, created_at"),
    supabase.from("activity_logs").select("action, actor_email, entity_type, created_at").order("created_at", { ascending: false }).limit(50),
  ])

  const menu = menuRes.data ?? []
  const staff = staffRes.data ?? []
  const products = productsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const logs = logsRes.data ?? []

  // figure out which items are low
  const lowStock = products.filter(p => Number(p.quantity) <= Number(p.min_quantity))
  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
  }

  const menuByCategory: Record<string, number> = {}
  menu.forEach(m => { menuByCategory[m.category] = (menuByCategory[m.category] || 0) + 1 })

  return `
=== BUSINESS DATA SNAPSHOT ===

MENU (${menu.length} items):
Categories: ${JSON.stringify(menuByCategory)}
Price range: ${Math.min(...menu.map(m => m.price))} - ${Math.max(...menu.map(m => m.price))} KGS

STAFF (${staff.length} members):
${staff.map(s => `- ${s.name} (${s.role})`).join("\n")}

INVENTORY (${products.length} products):
Low stock alerts (${lowStock.length}): ${lowStock.map(p => `${p.name}: ${p.quantity}${p.unit} (min: ${p.min_quantity})`).join(", ") || "None"}

TASKS: ${JSON.stringify(taskStats)}

RECENT ACTIVITY (last 50):
${logs.slice(0, 20).map(l => `${l.action} by ${l.actor_email} on ${l.entity_type}`).join("\n")}
`
}

export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    console.error("[ai-chat] GROQ_API_KEY is missing from env")
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 })
  }

  const { messages } = await req.json()
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "messages required" }, { status: 400 })
  }

  const businessContext = await gatherBusinessContext()

  const systemPrompt = `You are an AI business analyst for a cafe management system. You have access to real-time data from the database. Answer questions about the business, provide recommendations, identify trends, and help optimize operations.

${businessContext}

Guidelines:
- Be concise and actionable
- Use data from the snapshot above to back your answers
- Provide specific recommendations when asked
- Format responses with markdown for readability
- Currency is KGS (Kyrgyz som)
- If asked about graphs/charts, describe the data in a structured way
- Identify problems proactively (low stock, unbalanced workload, etc.)`

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  try {
    // send to groq - same format as openai api
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: chatMessages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error("[ai-chat] groq returned error:", err)
      return NextResponse.json({ error: `AI API error: ${err}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? "No response generated."

    return NextResponse.json({ content: text })
  } catch (error) {
    console.error("[ai-chat] fetch failed:", error)
    return NextResponse.json({ error: `Failed to call AI: ${String(error)}` }, { status: 500 })
  }
}
