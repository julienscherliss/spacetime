export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      google_calendars: {
        Row: {
          color: string | null
          connection_id: string
          created_at: string | null
          google_calendar_id: string
          id: string
          name: string
          visible: boolean | null
        }
        Insert: {
          color?: string | null
          connection_id: string
          created_at?: string | null
          google_calendar_id: string
          id?: string
          name: string
          visible?: boolean | null
        }
        Update: {
          color?: string | null
          connection_id?: string
          created_at?: string | null
          google_calendar_id?: string
          id?: string
          name?: string
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendars_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "google_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connections: {
        Row: {
          access_token: string
          created_at: string | null
          device_id: string
          email: string | null
          id: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          device_id: string
          email?: string | null
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          device_id?: string
          email?: string | null
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      library_items: {
        Row: {
          category: string | null
          created_at: string
          default_duration: number | null
          id: string
          note: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_duration?: number | null
          id?: string
          note?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_duration?: number | null
          id?: string
          note?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          completed: boolean
          created_at: string
          date: string
          description: string | null
          detached_from_series: boolean
          due_date: string | null
          duration: number | null
          id: string
          in_waiting_room: boolean | null
          is_recurrence_instance: boolean | null
          is_routine: boolean | null
          linked: boolean | null
          linked_group_id: string | null
          move_count: number
          original_priority: number
          priority: number
          recurrence: Json | null
          recurrence_parent_id: string | null
          series_id: string | null
          subtasks: Json | null
          time: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          waiting_room_count: number | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          completed?: boolean
          created_at?: string
          date: string
          description?: string | null
          detached_from_series?: boolean
          due_date?: string | null
          duration?: number | null
          id?: string
          in_waiting_room?: boolean | null
          is_recurrence_instance?: boolean | null
          is_routine?: boolean | null
          linked?: boolean | null
          linked_group_id?: string | null
          move_count?: number
          original_priority?: number
          priority?: number
          recurrence?: Json | null
          recurrence_parent_id?: string | null
          series_id?: string | null
          subtasks?: Json | null
          time?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
          waiting_room_count?: number | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          completed?: boolean
          created_at?: string
          date?: string
          description?: string | null
          detached_from_series?: boolean
          due_date?: string | null
          duration?: number | null
          id?: string
          in_waiting_room?: boolean | null
          is_recurrence_instance?: boolean | null
          is_routine?: boolean | null
          linked?: boolean | null
          linked_group_id?: string | null
          move_count?: number
          original_priority?: number
          priority?: number
          recurrence?: Json | null
          recurrence_parent_id?: string | null
          series_id?: string | null
          subtasks?: Json | null
          time?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          waiting_room_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
