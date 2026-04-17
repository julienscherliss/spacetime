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
      feedback: {
        Row: {
          admin_response: string | null
          app_version: string | null
          browser: string | null
          created_at: string
          current_route: string | null
          expected_behavior: string | null
          followup_email: string | null
          id: string
          internal_notes: string | null
          location_context: string | null
          message: string
          metadata: Json | null
          os: string | null
          platform: string | null
          priority: string
          resolved_at: string | null
          response_sent_at: string | null
          reviewed_at: string | null
          screen_size: string | null
          screenshot_url: string | null
          status: string
          title: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          app_version?: string | null
          browser?: string | null
          created_at?: string
          current_route?: string | null
          expected_behavior?: string | null
          followup_email?: string | null
          id?: string
          internal_notes?: string | null
          location_context?: string | null
          message: string
          metadata?: Json | null
          os?: string | null
          platform?: string | null
          priority?: string
          resolved_at?: string | null
          response_sent_at?: string | null
          reviewed_at?: string | null
          screen_size?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          app_version?: string | null
          browser?: string | null
          created_at?: string
          current_route?: string | null
          expected_behavior?: string | null
          followup_email?: string | null
          id?: string
          internal_notes?: string | null
          location_context?: string | null
          message?: string
          metadata?: Json | null
          os?: string | null
          platform?: string | null
          priority?: string
          resolved_at?: string | null
          response_sent_at?: string | null
          reviewed_at?: string | null
          screen_size?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
      library_categories: {
        Row: {
          created_at: string
          id: string
          label: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      library_items: {
        Row: {
          attachments: Json
          category: string | null
          created_at: string
          default_duration: number | null
          due_date: string | null
          id: string
          is_important: boolean
          is_urgent: boolean
          note: string | null
          subtasks: Json
          title: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          category?: string | null
          created_at?: string
          default_duration?: number | null
          due_date?: string | null
          id?: string
          is_important?: boolean
          is_urgent?: boolean
          note?: string | null
          subtasks?: Json
          title: string
          user_id: string
        }
        Update: {
          attachments?: Json
          category?: string | null
          created_at?: string
          default_duration?: number | null
          due_date?: string | null
          id?: string
          is_important?: boolean
          is_urgent?: boolean
          note?: string | null
          subtasks?: Json
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
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          current_uses: number
          discount_percent: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          type: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          type?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          type?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          id: string
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          lifetime_access: boolean
          plan: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string
          trial_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          lifetime_access?: boolean
          plan?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          trial_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          lifetime_access?: boolean
          plan?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          trial_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          attachments: Json | null
          category: string | null
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
          attachments?: Json | null
          category?: string | null
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
          attachments?: Json | null
          category?: string | null
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
