"use server";

import { revalidatePath } from "next/cache";
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
  formData: FormData
): Promise<void> {
  const status = formData.get("status");

  if (
    typeof status !== "string" ||
    !allowedStatuses.includes(status)
  ) {
    throw new Error("A valid lead status is required.");
  }

  const supabase = createAdminServerClient();

  const { error } = await supabase
    .from("leads")
    .update({
      lead_status: status,
    })
    .eq("id", leadId);

  if (error) {
    throw new Error(`Unable to update lead status: ${error.message}`);
  }

  revalidatePath("/admin");
}