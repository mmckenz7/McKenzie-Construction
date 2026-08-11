import { redirect } from "next/navigation";

type LegacyProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function LegacyProjectPage({ params }: LegacyProjectPageProps) {
  const { projectId } = await params;
  redirect(`/operations/projects/${encodeURIComponent(projectId)}`);
}
