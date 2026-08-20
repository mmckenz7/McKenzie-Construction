import "server-only";

import type { createAdminServerClient } from "@/lib/supabase/admin-server";

type AdminSupabaseClient = ReturnType<typeof createAdminServerClient>;

export async function communicationWorkspaceMatchesSingletonCompany(
  supabase: AdminSupabaseClient,
  companyId: string,
) {
  const result = await supabase
    .from("company_settings")
    .select("id")
    .limit(2);

  return !result.error && result.data?.length === 1 && result.data[0].id === companyId;
}
