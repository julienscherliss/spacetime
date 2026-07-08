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
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          new_state: Json
          object_id: string
          object_type: string
          platform: string
          prev_state: Json
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: Json
          object_id?: string
          object_type?: string
          platform?: string
          prev_state?: Json
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: Json
          object_id?: string
          object_type?: string
          platform?: string
          prev_state?: Json
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          archived: boolean
          created_at: string
          email: string
          id: string
          name: string
          notes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          archived?: boolean
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          archived?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deleted_records_recovery: {
        Row: {
          delete_reason: string | null
          deleted_at: string
          deleted_by: string | null
          id: string
          original_row_id: string
          original_table: string
          row_data: Json
          user_id: string | null
        }
        Insert: {
          delete_reason?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          original_row_id: string
          original_table: string
          row_data: Json
          user_id?: string | null
        }
        Update: {
          delete_reason?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          original_row_id?: string
          original_table?: string
          row_data?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
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
          device_id: string | null
          email: string | null
          id: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          device_id?: string | null
          email?: string | null
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          device_id?: string | null
          email?: string | null
          id?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          hours: number
          id: string
          invoice_id: string
          rate: number
          rate_type: string
          tag_value: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          hours?: number
          id?: string
          invoice_id: string
          rate?: number
          rate_type: string
          tag_value: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          hours?: number
          id?: string
          invoice_id?: string
          rate?: number
          rate_type?: string
          tag_value?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_style_settings: {
        Row: {
          accent_color: string
          body_font: string
          business_address: string
          business_email: string
          business_name: string
          created_at: string
          default_currency: string
          footer_note: string
          heading_font: string
          id: string
          payment_instructions: string
          template: string
          terms_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          body_font?: string
          business_address?: string
          business_email?: string
          business_name?: string
          created_at?: string
          default_currency?: string
          footer_note?: string
          heading_font?: string
          id?: string
          payment_instructions?: string
          template?: string
          terms_text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string
          body_font?: string
          business_address?: string
          business_email?: string
          business_name?: string
          created_at?: string
          default_currency?: string
          footer_note?: string
          heading_font?: string
          id?: string
          payment_instructions?: string
          template?: string
          terms_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string | null
          client_name: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          notes: string
          paid_at: string | null
          range_end: string | null
          range_start: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          notes?: string
          paid_at?: string | null
          range_end?: string | null
          range_start?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string
          paid_at?: string | null
          range_end?: string | null
          range_start?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      library_categories: {
        Row: {
          archived: boolean
          created_at: string
          icon: string | null
          id: string
          label: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          label: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          icon?: string | null
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
          completed: boolean
          completed_at: string | null
          created_at: string
          default_duration: number | null
          deleted_at: string | null
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
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          default_duration?: number | null
          deleted_at?: string | null
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
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          default_duration?: number | null
          deleted_at?: string | null
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
      live_activity_device_plans: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          device_id: string
          end_at: string | null
          id: string
          is_free_time: boolean
          last_dispatch_error: string | null
          last_dispatch_event: string | null
          last_dispatched_at: string | null
          last_dispatched_signature: string | null
          next_start_at: string | null
          next_title: string | null
          payload: Json
          plan_signature: string
          start_at: string | null
          symbol_name: string | null
          task_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          device_id: string
          end_at?: string | null
          id?: string
          is_free_time?: boolean
          last_dispatch_error?: string | null
          last_dispatch_event?: string | null
          last_dispatched_at?: string | null
          last_dispatched_signature?: string | null
          next_start_at?: string | null
          next_title?: string | null
          payload?: Json
          plan_signature?: string
          start_at?: string | null
          symbol_name?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          device_id?: string
          end_at?: string | null
          id?: string
          is_free_time?: boolean
          last_dispatch_error?: string | null
          last_dispatch_event?: string | null
          last_dispatched_at?: string | null
          last_dispatched_signature?: string | null
          next_start_at?: string | null
          next_title?: string | null
          payload?: Json
          plan_signature?: string
          start_at?: string | null
          symbol_name?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_activity_devices: {
        Row: {
          created_at: string
          current_activity_task_id: string | null
          current_activity_token: string | null
          device_id: string
          id: string
          last_seen_at: string
          apns_environment: string
          bundle_identifier: string
          platform: string
          push_to_start_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_activity_task_id?: string | null
          current_activity_token?: string | null
          device_id: string
          id?: string
          last_seen_at?: string
          apns_environment?: string
          bundle_identifier?: string
          platform?: string
          push_to_start_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_activity_task_id?: string | null
          current_activity_token?: string | null
          device_id?: string
          id?: string
          last_seen_at?: string
          apns_environment?: string
          bundle_identifier?: string
          platform?: string
          push_to_start_token?: string | null
          updated_at?: string
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
          apple_auto_renew: boolean | null
          apple_environment: string | null
          apple_expires_at: string | null
          apple_latest_transaction_id: string | null
          apple_original_transaction_id: string | null
          apple_product_id: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          lifetime_access: boolean
          payment_source: string | null
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
          apple_auto_renew?: boolean | null
          apple_environment?: string | null
          apple_expires_at?: string | null
          apple_latest_transaction_id?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          lifetime_access?: boolean
          payment_source?: string | null
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
          apple_auto_renew?: boolean | null
          apple_environment?: string | null
          apple_expires_at?: string | null
          apple_latest_transaction_id?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          lifetime_access?: boolean
          payment_source?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tag_billing_settings: {
        Row: {
          billable: boolean
          client_id: string | null
          client_name: string
          created_at: string
          currency: string
          flat_items: Json
          flat_rate: number
          hourly_rate: number
          id: string
          parent_only: boolean
          rate_type: string
          tag_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          flat_items?: Json
          flat_rate?: number
          hourly_rate?: number
          id?: string
          parent_only?: boolean
          rate_type?: string
          tag_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          flat_items?: Json
          flat_rate?: number
          hourly_rate?: number
          id?: string
          parent_only?: boolean
          rate_type?: string
          tag_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_billing_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_notes: {
        Row: {
          created_at: string
          id: string
          notes: string
          tag_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          tag_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          tag_value?: string
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
          group_id: string | null
          group_order: number | null
          icon: string | null
          id: string
          in_waiting_room: boolean | null
          is_recurrence_instance: boolean | null
          is_routine: boolean | null
          linked: boolean | null
          linked_group_id: string | null
          move_count: number
          original_priority: number
          preferred_duration: number | null
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
          group_id?: string | null
          group_order?: number | null
          icon?: string | null
          id?: string
          in_waiting_room?: boolean | null
          is_recurrence_instance?: boolean | null
          is_routine?: boolean | null
          linked?: boolean | null
          linked_group_id?: string | null
          move_count?: number
          original_priority?: number
          preferred_duration?: number | null
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
          group_id?: string | null
          group_order?: number | null
          icon?: string | null
          id?: string
          in_waiting_room?: boolean | null
          is_recurrence_instance?: boolean | null
          is_routine?: boolean | null
          linked?: boolean | null
          linked_group_id?: string | null
          move_count?: number
          original_priority?: number
          preferred_duration?: number | null
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
      user_color_schemes: {
        Row: {
          active_dark_scheme_id: string
          active_light_scheme_id: string
          custom_schemes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          active_dark_scheme_id?: string
          active_light_scheme_id?: string
          custom_schemes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          active_dark_scheme_id?: string
          active_light_scheme_id?: string
          custom_schemes?: Json
          updated_at?: string
          user_id?: string
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purge_old_recovery_records: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      restore_deleted_record: {
        Args: { _recovery_id: string }
        Returns: string
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
