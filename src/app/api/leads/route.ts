import { createPublicServerClient } from "@/lib/supabase/public-server";

function optionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue.length > 0 ? cleanedValue : null;
}

function requiredText(
  value: FormDataEntryValue | null,
  fieldName: string,
): string {
  const cleanedValue = optionalText(value);

  if (!cleanedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return cleanedValue;
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    // Honeypot spam field
    const website = optionalText(formData.get("website"));

    if (website) {
      return redirectTo("/thank-you");
    }

    const name = requiredText(formData.get("name"), "Name");
    const phone = requiredText(formData.get("phone"), "Phone");

    const projectType = requiredText(
      formData.get("projectType"),
      "Project type",
    );

    const description = requiredText(
      formData.get("description"),
      "Project description",
    );

    const requestedDate = optionalText(formData.get("requestedDate"));
    const requestedTime = optionalText(formData.get("requestedTime"));

    const consultationWasRequested = Boolean(
      requestedDate || requestedTime,
    );

    const supabase = createPublicServerClient();

    const { error } = await supabase.from("leads").insert({
      name,
      phone,
      email: optionalText(formData.get("email")),
      property_address: optionalText(
        formData.get("propertyAddress"),
      ),
      project_type: projectType,
      description,
      estimated_budget: optionalText(
        formData.get("estimatedBudget"),
      ),
      desired_timeline: optionalText(
        formData.get("desiredTimeline"),
      ),
      preferred_contact_method:
        optionalText(formData.get("preferredContactMethod")) ??
        "phone",
      requested_date: requestedDate,
      requested_time: requestedTime,
      alternate_date: optionalText(formData.get("alternateDate")),
      alternate_time: optionalText(formData.get("alternateTime")),
      consultation_status: consultationWasRequested
        ? "pending"
        : "not_requested",
      lead_status: "new",
      lead_source: "website",
    });

    if (error) {
      console.error("Supabase lead submission error:", error);

      return redirectTo("/contact?error=submission");
    }

    return redirectTo("/thank-you");
  } catch (error) {
    console.error("Project request error:", error);

    return redirectTo("/contact?error=submission");
  }
}