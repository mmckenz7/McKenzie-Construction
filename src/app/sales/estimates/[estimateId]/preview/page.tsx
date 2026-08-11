import { EstimateCustomerPreview } from "@/components/estimates/estimate-customer-preview";

export const dynamic = "force-dynamic";

export default async function EstimatePreviewPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  return <EstimateCustomerPreview estimateId={estimateId} />;
}
