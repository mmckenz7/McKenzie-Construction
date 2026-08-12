import { LowesPilotReview } from "@/components/lowes-pilot-review";
import { getMaterialCatalogMutationAuthorizationDecision } from "@/lib/material-catalog-access";
import {
  buildLowesPilotEvidence,
  LOWES_EAST_KNOXVILLE_PILOT_ITEMS,
} from "@/lib/material-catalog-lowes-pilot";
import {
  loadLowesEastKnoxvillePilotState,
  LowesPilotWorkflowError,
} from "@/lib/material-catalog-lowes-pilot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LowesEastKnoxvillePilotPage() {
  const decision = await getMaterialCatalogMutationAuthorizationDecision(
    "upload_supplier_imports",
  );
  if (decision.state !== "authorized") {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Lowe&apos;s pilot unavailable</h1>
          <p className="mt-2 text-slate-300">Authorized supplier-management access is required.</p>
        </div>
      </main>
    );
  }

  let workflow;
  try {
    workflow = await loadLowesEastKnoxvillePilotState(decision.authorization);
  } catch (error) {
    if (!(error instanceof LowesPilotWorkflowError)) throw error;
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-400/40 bg-red-400/10 p-6">
          <h1 className="text-xl font-semibold">Pilot state could not be verified</h1>
          <p className="mt-2 text-red-100">No action was performed. Try again after the catalog connection is restored.</p>
        </div>
      </main>
    );
  }
  const capabilities = decision.authorization.capabilities;
  const items = LOWES_EAST_KNOXVILLE_PILOT_ITEMS.map((item) => ({
    itemNumber: item.itemNumber,
    modelNumber: item.modelNumber,
    brand: item.brand,
    canonicalName: item.canonicalName,
    priceAmount: item.priceAmount,
    sellUnitCode: item.sellUnitCode,
    packageQuantity: item.packageQuantity,
    identitySourceReference: buildLowesPilotEvidence(item).identitySourceReference,
    priceSourceReference: buildLowesPilotEvidence(item).priceSourceReference,
  }));
  return (
    <LowesPilotReview
      items={items}
      workflow={workflow}
      canStage={capabilities.canUploadSupplierImports}
      canReview={capabilities.canReviewProductMappings}
      canPreview={capabilities.canPreviewPriceChanges}
      canPublish={capabilities.canPublishSupplierPrices}
    />
  );
}
