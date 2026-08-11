import { redirect } from "next/navigation";

import { getWorkspaceAccess } from "@/lib/workspace-access";

export default async function FinancialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { access } = await getWorkspaceAccess();

  if (
    access?.portal_access?.admin !== true ||
    access.permissions?.view_profit !== true
  ) {
    redirect("/admin");
  }

  return children;
}
