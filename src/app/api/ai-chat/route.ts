// AI chat endpoint - connects to Groq (llama 3.3)

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getAuthContext } from "@/lib/rbac.server"

// groq api - using openai-compatible endpoint
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

// pull all relevant data from db to give the AI context about our business
async function gatherBusinessContext() {
  const supabase = await createClient()

  const [menuRes, staffRes, productsRes, tasksRes, logsRes, ordersRes] = await Promise.all([
    supabase.from("menu_items").select("name, category, price, is_available"),
    supabase.from("staff").select("name, role, email"),
    supabase.from("products").select("name, category, quantity, unit, min_quantity"),
    supabase.from("tasks").select("title, status, assigned_to, completed_at, created_at"),
    supabase.from("activity_logs").select("action, actor_email, entity_type, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("orders").select("total, status, waiter_name, created_at, order_items(name, quantity, price)").order("created_at", { ascending: false }).limit(300),
  ])

  const menu = menuRes.data ?? []
  const staff = staffRes.data ?? []
  const products = productsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const logs = logsRes.data ?? []
  const orders = ordersRes.data ?? []
  const closedOrders = orders.filter(o => o.status === "closed")
  const revenue = closedOrders.reduce((sum, o) => sum + Number(o.total), 0)
  const waiterRevenue: Record<string, number> = {}
  closedOrders.forEach(o => {
    if (o.waiter_name) waiterRevenue[o.waiter_name] = (waiterRevenue[o.waiter_name] || 0) + Number(o.total)
  })

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

ORDERS (${orders.length} recent):
Closed orders: ${closedOrders.length}
Recent revenue: ${revenue.toFixed(2)} KGS
Revenue by waiter: ${JSON.stringify(waiterRevenue)}

RECENT ACTIVITY (last 50):
${logs.slice(0, 20).map(l => `${l.action} by ${l.actor_email} on ${l.entity_type}`).join("\n")}
`
}

function isCafeQuestion(text: string) {
  const value = text.toLowerCase().trim()
  if (value.length <= 2) return false
  if (value.includes("weather") || value.includes("политик") || value.includes("dating")) return false
  const allowed = [
    "cafe", "coffee", "кафе", "кофе", "выруч", "доход", "revenue", "sales", "profit",
    "order", "orders", "заказ", "menu", "меню", "stock", "inventory", "склад",
    "staff", "employee", "employees", "worker", "workers", "name", "names", "working",
    "сотруд", "работ", "имя", "имена", "персонал", "waiter", "официант",
    "shift", "смен", "task", "задач", "recommend", "рекоменд", "analytics",
    "аналит", "peak", "пик", "table", "стол", "bonus", "прем", "закаж", "закуп", "purchase",
    "expense", "expenses", "расход", "salary", "зарплат", "rent", "аренд", "supplier",
    "постав", "schedule", "план", "plan", "forecast", "прогноз", "customer", "клиент",
    "receipt", "чек", "dashboard", "page", "interface", "ui", "button", "report",
    "отчет", "problem", "issue", "fix", "improve", "улучш", "help", "помоги",
    "what", "why", "how", "кто", "что", "почему", "как", "сколько", "when", "где"
  ]
  return allowed.some(word => value.includes(word))
}

function isManagerCommand(text: string) {
  const value = text.toLowerCase()
  return hasAny(value, [
    "заполни смен", "создай смен", "поставь смен", "create shifts", "generate shifts",
    "schedule shifts", "fill shifts", "make shifts", "shift for next week",
    "закаж", "закуп", "order products", "buy products", "purchase products", "restock",
    "создай зада", "create task", "add task", "make task",
  ])
}

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word))
}

function canAutomate(role: string | undefined) {
  return role === "admin" || role === "manager"
}

function pickShift(role: string) {
  const value = role.toLowerCase()
  if (value.includes("cleaner")) return { shift_type: "morning", start_time: "07:00", end_time: "15:00" }
  if (value.includes("waiter")) return Math.random() > 0.5
    ? { shift_type: "morning", start_time: "09:00", end_time: "17:00" }
    : { shift_type: "evening", start_time: "14:00", end_time: "22:00" }
  if (value.includes("barista")) return Math.random() > 0.5
    ? { shift_type: "morning", start_time: "08:00", end_time: "16:00" }
    : { shift_type: "evening", start_time: "13:00", end_time: "21:00" }
  return { shift_type: "morning", start_time: "09:00", end_time: "17:00" }
}

async function handleAutomationCommand(text: string) {
  const ctx = await getAuthContext()
  if (!canAutomate(ctx?.role)) {
    return "Only a manager or admin can run automation actions."
  }

  const supabase = await createClient()
  const value = text.toLowerCase()

  if (hasAny(value, ["заполни смен", "создай смен", "поставь смен", "create shifts", "generate shifts", "schedule shifts", "fill shifts", "make shifts", "shift for next week"])) {
    const { data: staff } = await supabase.from("staff").select("id, name, role").order("name")
    const workers = (staff ?? []).filter((person) => !String(person.role).toLowerCase().includes("manager"))
    const shifts = []
    const today = new Date()
    const firstDay = new Date(today)
    firstDay.setDate(today.getDate() + 1)
    const lastDay = new Date(today)
    lastDay.setDate(today.getDate() + 7)
    const { data: existingShifts } = await supabase
      .from("shifts")
      .select("staff_id, work_date")
      .gte("work_date", firstDay.toISOString().slice(0, 10))
      .lte("work_date", lastDay.toISOString().slice(0, 10))
    const existing = new Set((existingShifts ?? []).map((shift) => `${shift.staff_id}-${shift.work_date}`))

    for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
      const day = new Date(today)
      day.setDate(today.getDate() + dayIndex)
      if (day.getDay() === 1) continue
      for (const person of workers) {
        if (Math.random() < 0.2) continue
        const workDate = day.toISOString().slice(0, 10)
        if (existing.has(`${person.id}-${workDate}`)) continue
        const shift = pickShift(person.role)
        shifts.push({
          staff_id: person.id,
          staff_name: person.name,
          work_date: workDate,
          ...shift,
        })
      }
    }

    if (shifts.length === 0) return "No new shifts were created. The next week may already be scheduled, or I could not find staff members."
    const { error } = await supabase.from("shifts").insert(shifts)
    if (error) return `Could not create shifts: ${error.message}`
    revalidatePath("/staff")
    revalidatePath("/dashboard")
    return `Done. I created ${shifts.length} shifts for the next week. Check Staff → Shift schedule.`
  }

  if (hasAny(value, ["закаж", "закуп", "order products", "buy products", "purchase products", "restock"])) {
    const { data: products } = await supabase
      .from("products")
      .select("name, quantity, unit, min_quantity")
      .order("quantity", { ascending: true })

    const low = (products ?? []).filter((product) => Number(product.quantity) <= Number(product.min_quantity))
    if (low.length === 0) return "There are no low stock products right now. No purchase tasks are needed."

    const { data: pendingTasks } = await supabase
      .from("tasks")
      .select("title")
      .eq("status", "pending")
    const existingTaskTitles = new Set((pendingTasks ?? []).map((task) => task.title.toLowerCase()))

    const now = new Date().toISOString()
    const tasks = low
      .map((product) => ({
        title: `Order more ${product.name}`,
        description: `Current stock: ${product.quantity} ${product.unit}. Minimum: ${product.min_quantity}. Please contact supplier and restock.`,
        status: "pending",
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        assigned_to: null,
        assigned_at: null,
        created_by: ctx!.profileId,
        created_at: now,
      }))
      .filter((task) => !existingTaskTitles.has(task.title.toLowerCase()))

    if (tasks.length === 0) return "Low stock products already have pending purchase tasks."

    const { error } = await supabase.from("tasks").insert(tasks)
    if (error) return `Could not create purchase tasks: ${error.message}`
    revalidatePath("/tasks")
    revalidatePath("/inventory")
    revalidatePath("/dashboard")
    return `Done. I created ${tasks.length} purchase tasks for low stock products: ${low.map((p) => p.name).join(", ")}.`
  }

  if (hasAny(value, ["создай зада", "create task", "add task", "make task"])) {
    const title = text.replace(/создай задачу|создай зада|create task|add task|make task/gi, "").trim() || "Manager requested task"
    const { error } = await supabase.from("tasks").insert({
      title,
      description: "Created by AI assistant",
      status: "pending",
      assigned_to: null,
      assigned_at: null,
      created_by: ctx!.profileId,
    })
    if (error) return `Could not create the task: ${error.message}`
    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    return `Done. Created task: ${title}`
  }

  return null
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

  const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")
  if (!lastUserMessage || !isCafeQuestion(String(lastUserMessage.content ?? ""))) {
    return NextResponse.json({
      content: "I can help with this cafe's management, analytics, operations, staff, shifts, orders, inventory, revenue, expenses, reports, and recommendations. Please ask about the cafe or its dashboard.",
    })
  }

  const userText = String(lastUserMessage.content ?? "")
  if (isManagerCommand(userText)) {
    const result = await handleAutomationCommand(userText)
    if (result) return NextResponse.json({ content: result })
  }

  const businessContext = await gatherBusinessContext()

  const systemPrompt = `You are an AI assistant for this specific cafe management system. You have access to real-time cafe data from the database. Answer a wide range of cafe-related questions: revenue, orders, menu, inventory, staff, waiter performance, shifts, tasks, tables, customers, expenses, salaries, rent, suppliers, purchasing, reports, UI/dashboard usage, planning, forecasting, and business recommendations.

${businessContext}

Guidelines:
- Refuse only clearly unrelated questions. If the question can reasonably connect to cafe operations, answer it.
- Questions about employee names, staff members, waiters, managers, who works here, or who is assigned to tasks ARE related to the cafe and must be answered from the snapshot.
- Always answer in English.
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
