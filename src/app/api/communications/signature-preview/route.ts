import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";
import { communicationWorkspaceMatchesSingletonCompany } from "@/lib/communications/workspace-company";
import { loadCompanyEmailSignature } from "@/lib/communications/email-signature-server";
import { renderEmailSignature } from "@/lib/communications/email-signature";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function GET() {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) {
    return Response.json(
      { success: false, error: "Sign in to preview the company email signature." },
      { status: 401 },
    );
  }
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json(
      { success: false, error: "Sales access is required to preview the company email signature." },
      { status: 403 },
    );
  }

  const supabase = createAdminServerClient();
  if (!await communicationWorkspaceMatchesSingletonCompany(
    supabase,
    workspace.access!.company_id,
  )) {
    return Response.json(
      { success: false, error: "The company workspace could not be verified." },
      { status: 403 },
    );
  }

  try {
    const signature = await loadCompanyEmailSignature(
      supabase,
      workspace.user.id,
    );
    return Response.json({
      success: true,
      preview: signature.preview,
      variants: {
        off: {
          layout: "off",
          label: "Automatic company signature is off",
          lines: [],
          logoUrl: null,
        },
        compact: renderEmailSignature("compact", signature.facts)?.preview ?? null,
        branded: renderEmailSignature("branded", signature.facts)?.preview ?? null,
      },
      schemaAvailable: signature.schemaAvailable,
    });
  } catch {
    return Response.json(
      { success: false, error: "The company email signature preview could not be loaded." },
      { status: 500 },
    );
  }
}
