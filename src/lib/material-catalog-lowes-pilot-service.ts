import "server-only";

import { canPerformCatalogAction, type CatalogCapability } from "@/lib/material-catalog-access-policy";
import type { MaterialCatalogAuthorization } from "@/lib/material-catalog-access";
import {
  buildLowesPilotManifest,
  LOWES_EAST_KNOXVILLE_PILOT_VERSION,
} from "@/lib/material-catalog-lowes-pilot";
import { buildLowesPilotStageRows } from "@/lib/material-catalog-lowes-pilot-workflow";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export class LowesPilotWorkflowError extends Error {
  constructor(message = "The bounded Lowe's pilot workflow could not be completed.") {
    super(message);
    this.name = "LowesPilotWorkflowError";
  }
}

function requireCapability(
  authorization: MaterialCatalogAuthorization,
  capability: CatalogCapability,
) {
  if (!canPerformCatalogAction(authorization.capabilities, capability)) {
    throw new LowesPilotWorkflowError("The requested catalog action is not authorized.");
  }
}

function requireRpcData<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) throw new LowesPilotWorkflowError();
  return result.data;
}

export async function stageLowesEastKnoxvillePilot(
  authorization: MaterialCatalogAuthorization,
) {
  requireCapability(authorization, "upload_supplier_imports");
  const supabase = createAdminServerClient();
  const stage = buildLowesPilotStageRows();
  const rows = stage.rows.map((row) => ({
    source_row_number: row.source_row_number,
    raw_row: row.raw_row,
    raw_row_sha256: row.raw_row_sha256,
    normalized_row: row.normalized_row,
    normalized_supplier_sku: row.normalized_supplier_sku,
    normalized_manufacturer_name: row.normalized_manufacturer_name,
    normalized_manufacturer_part_number: row.normalized_manufacturer_part_number,
    normalized_description: row.normalized_description,
    normalized_unit_code: row.normalized_unit_code,
  }));
  return requireRpcData(await supabase.rpc("stage_material_catalog_web_lookup_import", {
    requested_company_id: authorization.companyId,
    requested_auth_user_id: authorization.authUserId,
    requested_manifest_sha256: stage.batch.file_sha256,
    requested_parser_version: LOWES_EAST_KNOXVILLE_PILOT_VERSION,
    requested_rows: rows,
  }));
}

export async function reviewLowesEastKnoxvillePilot(
  authorization: MaterialCatalogAuthorization,
  importId: string,
) {
  requireCapability(authorization, "review_product_mappings");
  return requireRpcData(await createAdminServerClient().rpc(
    "review_material_catalog_web_lookup_import",
    {
      requested_import_id: importId,
      requested_company_id: authorization.companyId,
      requested_auth_user_id: authorization.authUserId,
    },
  ));
}

export async function previewLowesEastKnoxvillePilot(
  authorization: MaterialCatalogAuthorization,
  importId: string,
) {
  requireCapability(authorization, "preview_price_changes");
  return requireRpcData(await createAdminServerClient().rpc(
    "preview_material_catalog_web_lookup_import",
    {
      requested_import_id: importId,
      requested_company_id: authorization.companyId,
      requested_auth_user_id: authorization.authUserId,
    },
  ));
}

export async function approveLowesEastKnoxvillePilot(
  authorization: MaterialCatalogAuthorization,
  importId: string,
  previewId: string,
) {
  requireCapability(authorization, "publish_supplier_prices");
  return requireRpcData(await createAdminServerClient().rpc(
    "approve_material_catalog_import",
    {
      requested_import_id: importId,
      requested_preview_id: previewId,
      requested_company_id: authorization.companyId,
      requested_auth_user_id: authorization.authUserId,
    },
  ));
}

export async function publishLowesEastKnoxvillePilot(
  authorization: MaterialCatalogAuthorization,
  importId: string,
  previewId: string,
  previewSha256: string,
) {
  requireCapability(authorization, "publish_supplier_prices");
  return requireRpcData(await createAdminServerClient().rpc(
    "publish_material_catalog_import",
    {
      requested_import_id: importId,
      requested_preview_id: previewId,
      requested_preview_sha256: previewSha256,
      requested_idempotency_key: `material-catalog:${importId}:${previewSha256}`,
      requested_company_id: authorization.companyId,
      requested_auth_user_id: authorization.authUserId,
    },
  ));
}

export async function loadLowesEastKnoxvillePilotState(
  authorization: MaterialCatalogAuthorization,
) {
  requireCapability(authorization, "upload_supplier_imports");
  const supabase = createAdminServerClient();
  const { manifestSha256 } = buildLowesPilotManifest();
  const supplier = await supabase.from("suppliers").select("id").eq("slug", "lowes").maybeSingle();
  if (supplier.error) throw new LowesPilotWorkflowError();
  if (!supplier.data) return { state: "not_staged" as const, importId: null, previewId: null, previewSha256: null, reviewedRows: 0 };
  const batch = await supabase.from("material_catalog_import_batches")
    .select("id,status,approved_preview_sha256")
    .eq("company_id", authorization.companyId)
    .eq("supplier_id", supplier.data.id)
    .eq("file_sha256", manifestSha256)
    .neq("status", "cancelled").maybeSingle();
  if (batch.error) throw new LowesPilotWorkflowError();
  if (!batch.data) return { state: "not_staged" as const, importId: null, previewId: null, previewSha256: null, reviewedRows: 0 };
  const preview = await supabase.from("material_import_change_previews")
    .select("id,content_sha256")
    .eq("import_id", batch.data.id)
    .order("preview_version", { ascending: false }).limit(1).maybeSingle();
  if (preview.error) throw new LowesPilotWorkflowError();
  const reviewed = await supabase.from("material_price_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", batch.data.id).eq("company_id", authorization.companyId)
    .eq("row_status", "reviewed");
  if (reviewed.error) throw new LowesPilotWorkflowError();
  return {
    state: batch.data.status as string,
    importId: batch.data.id as string,
    previewId: preview.data?.id as string | undefined ?? null,
    previewSha256: preview.data?.content_sha256 as string | undefined ??
      batch.data.approved_preview_sha256 as string | undefined ?? null,
    reviewedRows: reviewed.count ?? 0,
  };
}
