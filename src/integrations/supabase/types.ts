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
      approvals: {
        Row: {
          client_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          reason: string
          responsible_id: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string
          responsible_id?: string | null
          status?: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string
          responsible_id?: string | null
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          avatar_initial: string
          birth_date: string | null
          clinical_notes: string
          complaint: string
          created_at: string
          created_by: string | null
          email: string
          goal: string
          hydration_goal_ml: number
          id: string
          name: string
          phone: string
          plan: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_initial?: string
          birth_date?: string | null
          clinical_notes?: string
          complaint?: string
          created_at?: string
          created_by?: string | null
          email?: string
          goal?: string
          hydration_goal_ml?: number
          id?: string
          name: string
          phone?: string
          plan?: string
          start_date?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_initial?: string
          birth_date?: string | null
          clinical_notes?: string
          complaint?: string
          created_at?: string
          created_by?: string | null
          email?: string
          goal?: string
          hydration_goal_ml?: number
          id?: string
          name?: string
          phone?: string
          plan?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          client_id: string
          created_at: string
          data_processing: boolean
          id: string
          photos_internal: boolean
          photos_marketing: boolean
          privacy: boolean
          tenant_id: string
          terms: boolean
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data_processing?: boolean
          id?: string
          photos_internal?: boolean
          photos_marketing?: boolean
          privacy?: boolean
          tenant_id: string
          terms?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data_processing?: boolean
          id?: string
          photos_internal?: boolean
          photos_marketing?: boolean
          privacy?: boolean
          tenant_id?: string
          terms?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          equipment: string
          id: string
          muscle_group: string
          reps: string
          sets: number
          status: string
          tenant_id: string
          title: string
          updated_at: string
          video_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          equipment?: string
          id?: string
          muscle_group?: string
          reps?: string
          sets?: number
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          video_url?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          equipment?: string
          id?: string
          muscle_group?: string
          reps?: string
          sets?: number
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          client_id: string | null
          created_at: string
          id: string
          recipients_count: number
          sent_by: string | null
          template: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          recipients_count?: number
          sent_by?: string | null
          template?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          recipients_count?: number
          sent_by?: string | null
          template?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          last_access: string | null
          must_change_password: boolean
          name: string
          permissions: Json
          phone: string
          profile: Database["public"]["Enums"]["profile_role"]
          role: string
          status: Database["public"]["Enums"]["user_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          last_access?: string | null
          must_change_password?: boolean
          name: string
          permissions?: Json
          phone?: string
          profile?: Database["public"]["Enums"]["profile_role"]
          role?: string
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_access?: string | null
          must_change_password?: boolean
          name?: string
          permissions?: Json
          phone?: string
          profile?: Database["public"]["Enums"]["profile_role"]
          role?: string
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          client_id: string
          cost_miles: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          notes: string
          reward_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          cost_miles?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string
          reward_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          cost_miles?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string
          reward_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          cost_miles: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          image_url: string
          name: string
          status: string
          stock: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_miles?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          image_url?: string
          name: string
          status?: string
          stock?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cost_miles?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          image_url?: string
          name?: string
          status?: string
          stock?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_alerts: {
        Row: {
          client_id: string | null
          created_at: string
          description: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string
          account_type: string
          brand_name: string
          brand_short_name: string
          city: string
          client_limit: number
          clinic_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          custom_domain: string
          default_theme: string
          footer_text: string
          id: string
          owner_name: string
          plan_id: Database["public"]["Enums"]["plan_id"]
          primary_color: string
          public_app_url: string
          secondary_color: string
          slug: string
          state: string
          status: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          system_name: string
          system_subtitle: string
          updated_at: string
          user_limit: number
          white_label_enabled: boolean
        }
        Insert: {
          accent_color?: string
          account_type?: string
          brand_name?: string
          brand_short_name?: string
          city?: string
          client_limit?: number
          clinic_name: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          custom_domain?: string
          default_theme?: string
          footer_text?: string
          id?: string
          owner_name?: string
          plan_id?: Database["public"]["Enums"]["plan_id"]
          primary_color?: string
          public_app_url?: string
          secondary_color?: string
          slug: string
          state?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string
          system_name: string
          system_subtitle: string
          updated_at?: string
          user_limit?: number
          white_label_enabled?: boolean
        }
        Update: {
          accent_color?: string
          account_type?: string
          brand_name?: string
          brand_short_name?: string
          city?: string
          client_limit?: number
          clinic_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          custom_domain?: string
          default_theme?: string
          footer_text?: string
          id?: string
          owner_name?: string
          plan_id?: Database["public"]["Enums"]["plan_id"]
          primary_color?: string
          public_app_url?: string
          secondary_color?: string
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string
          system_name?: string
          system_subtitle?: string
          updated_at?: string
          user_limit?: number
          white_label_enabled?: boolean
        }
        Relationships: []
      }
      videos: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          duration_seconds: number
          id: string
          status: string
          tenant_id: string
          thumbnail_url: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          duration_seconds?: number
          id?: string
          status?: string
          tenant_id: string
          thumbnail_url?: string
          title: string
          updated_at?: string
          url?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          duration_seconds?: number
          id?: string
          status?: string
          tenant_id?: string
          thumbnail_url?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_profile_manager: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      plan_id:
        | "essencial"
        | "profissional"
        | "premium"
        | "enterprise"
        | "interno"
      profile_role: "super_admin" | "dono" | "admin" | "equipe"
      tenant_status: "ativa" | "suspensa" | "cancelada"
      user_status: "ativo" | "inativo" | "bloqueado" | "convite_pendente"
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
      plan_id: [
        "essencial",
        "profissional",
        "premium",
        "enterprise",
        "interno",
      ],
      profile_role: ["super_admin", "dono", "admin", "equipe"],
      tenant_status: ["ativa", "suspensa", "cancelada"],
      user_status: ["ativo", "inativo", "bloqueado", "convite_pendente"],
    },
  },
} as const
