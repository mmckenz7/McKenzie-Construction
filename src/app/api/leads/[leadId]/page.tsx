import { redirect } from "next/navigation";

type LeadPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export default async function LeadApiRedirectPage({
  params,
}: LeadPageProps) {
  const { leadId } = await params;

  redirect(
    `/admin/leads/${encodeURIComponent(
      leadId,
    )}`,
  );
}
