import {
  MaterialCatalogPreviewError,
  MaterialCatalogPreviewState,
  MaterialCatalogPreviewView,
} from "@/components/material-catalog-preview-view";
import { getMaterialCatalogAuthorizationDecision } from "@/lib/material-catalog-access";
import {
  loadMaterialCatalogPreview,
  parseMaterialCatalogPreviewFilters,
} from "@/lib/material-catalog-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MaterialCatalogPreviewPage({ searchParams }: PageProps) {
  const decision = await getMaterialCatalogAuthorizationDecision(
    "view_supplier_comparisons",
  );

  if (decision.state !== "authorized") {
    return <MaterialCatalogPreviewState state={decision.state} />;
  }

  const filters = parseMaterialCatalogPreviewFilters(await searchParams);
  let preview;
  try {
    preview = await loadMaterialCatalogPreview(
      decision.authorization.companyId,
      filters,
    );
  } catch {
    return <MaterialCatalogPreviewError />;
  }
  return <MaterialCatalogPreviewView preview={preview} />;
}
