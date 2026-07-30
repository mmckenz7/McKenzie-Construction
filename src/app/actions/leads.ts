"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedApiUser } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedStatuses = [
  "new",
  "contacted",
  "consultation_scheduled",
  "proposal_sent",
  "won",
  "lost",
];

export async function updateLeadStatus(
  leadId: string,
  formData: FormData,
): Promise<void> {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    throw new Error(
      "You must be signed in to update a lead.",
    );
  }

  const cleanedLeadId = leadId.trim();

  if (!cleanedLeadId) {
    throw new Error(
      "A valid lead ID is required.",
    );
  }

  const status = formData.get("status");

  if (
    typeof status !== "string" ||
    !allowedStatuses.includes(status)
  ) {
    throw new Error(
      "A valid lead status is required.",
    );
  }

  const supabase =
    createAdminServerClient();

  const { error } = await supabase
    .from("leads")
    .update({
      lead_status: status,
    })
    .eq("id", cleanedLeadId);

  if (error) {
    throw new Error(
      `Unable to update lead status: ${error.message}`,
    );
  }

  revalidatePath("/admin");
  revalidatePath(
    `/admin/leads/${cleanedLeadId}`,
  );
}
