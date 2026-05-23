export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      inventory_items: {
        Row: {
          id: string
          name: string
          category: string
          quantity: number
          unit: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          quantity?: number
          unit: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          quantity?: number
          unit?: string
          created_at?: string
          updated_at?: string
        }
      }
      staff_members: {
        Row: {
          id: string
          name: string
          role: string
          on_shift: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          role: string
          on_shift?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: string
          on_shift?: boolean
          created_at?: string
        }
      }
      menu_items: {
        Row: {
          id: string
          name: string
          category: string
          price: number
          available: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          price: number
          available?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          price?: number
          available?: boolean
          created_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          completed: boolean
          due_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          completed?: boolean
          due_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          completed?: boolean
          due_at?: string | null
          created_at?: string
        }
      }
      daily_revenue: {
        Row: {
          id: string
          date: string
          amount: number
        }
        Insert: {
          id?: string
          date?: string
          amount?: number
        }
        Update: {
          id?: string
          date?: string
          amount?: number
        }
      }
    }
  }
}
