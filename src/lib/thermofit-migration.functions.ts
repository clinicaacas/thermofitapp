// Painel de Migração — leitura restrita a super_admin.
// Nunca retorna valores de secrets nem a service role key.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_ENV = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER", "LANG", "TERM",
  "PWD", "SHELL", "NODE_ENV", "DENO_REGION", "DENO_DEPLOYMENT_ID",
]);

export type MigrationTable = {
  table_name: string;
  estimated_rows: number;
  column_count: number;
  rls_enabled: boolean;
  policy_count: number;
  has_tenant_id: boolean;
  has_user_id: boolean;
};

export type MigrationSnapshot = {
  projectUrl: string;
  anonKey: string;
  secretNames: string[];
  tables: MigrationTable[];
  dbFunctions: { name: string; security_definer: boolean }[];
  storageBuckets: { name: string; public: boolean }[];
  generatedAt: string;
};

export const getMigrationSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MigrationSnapshot> => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("profile, status")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status !== "ativo" || profile.profile !== "super_admin") {
      throw new Error("Acesso restrito ao super administrador.");
    }

    const { data, error } = await supabase.rpc("migration_schema_overview");
    if (error) throw new Error(error.message);

    const env = process.env as Record<string, string | undefined>;
    const secretNames = Object.keys(env)
      .filter((k) => !SYSTEM_ENV.has(k) && !k.startsWith("XDG"))
      .sort();

    return {
      projectUrl: env["SUPABASE_URL"] ?? "",
      anonKey: env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
      secretNames,
      tables: (data?.tables ?? []) as MigrationTable[],
      dbFunctions: (data?.db_functions ?? []) as { name: string; security_definer: boolean }[],
      storageBuckets: (data?.storage_buckets ?? []) as { name: string; public: boolean }[],
      generatedAt: (data?.generated_at ?? new Date().toISOString()) as string,
    };
  });
