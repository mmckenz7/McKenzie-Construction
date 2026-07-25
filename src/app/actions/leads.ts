"use server";

import { redirect } from "next/navigation";
import { createPublicServerClient } from "@/lib/supabase/public-server";

function getOptionalText(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue.length > 0 ? cleanedValue : null;
}

function getRequiredText(
  value: FormDataEntryValue | null,
  fieldName: string,
): string {
  const cleanedValue = getOptionalText(value);

  if (!cleanedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return cleanedValue;
}

export async function submitProjectRequest(formData: FormData) {
  const spamField = getOptionalText(formData.get("website"));

  if (spamField) {
    redirect("/thank-you");
  }

  const name = getRequiredText(formData.get("name"), "Name");
  const phone = getRequiredText(formData.get("phone"), "Phone");
  const projectType = getRequiredText(
    formData.get("projectType"),
    "Project type",
  );
  const description = getRequiredText(
    formData.get("description"),
    "Project description",
  );

  const requestedDate = getOptionalText(
    formData.get("requestedDate"),
  );
  const requestedTime = getOptionalText(
    formData.get("requestedTime"),
  );

  const consultationWasRequested =
    Boolean(requestedDate) || Boolean(requestedTime);

  const supabase = createPublicServerClient();

  const { error } = await supabase.from("leads").insert({
    name,
    phone,
    email: getOptionalText(formData.get("email")),
    property_address: getOptionalText(
      formData.get("propertyAddress"),
    ),
    project_type: projectType,
    description,
    estimated_budget: getOptionalText(
      formData.get("estimatedBudget"),
    ),
    desired_timeline: getOptionalText(
      formData.get("desiredTimeline"),
    ),
    preferred_contact_method:
      getOptionalText(formData.get("preferredContactMethod")) ??
      "phone",
    requested_date: requestedDate,
    requested_time: requestedTime,
    alternate_date: getOptionalText(formData.get("alternateDate")),
    alternate_time: getOptionalText(formData.get("alternateTime")),
    consultation_status: consultationWasRequested
      ? "pending"
      : "not_requested",
    lead_status: "new",
    lead_source: "website",
  });

  if (error) {
    console.error("Lead submission failed:", error);

    throw new Error(
      "Your request could not be submitted. Please call 865-263-3811.",
    );
  }

  redirect("/thank-you");
}