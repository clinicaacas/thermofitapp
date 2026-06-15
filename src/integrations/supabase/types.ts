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
