import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { createPublicServerClient } from "@/lib/supabase/public-server";

const allowedLeadStatuses = [
  "new",
  "contacted",
  "consultation_scheduled",
  "proposal_sent",
  "won",
  "lost",
];

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

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      leadId?: unknown;
      status?: unknown;
    };

    const leadId =
      typeof body.leadId === "string" ||
      typeof body.leadId === "number"
        ? String(body.leadId).trim()
        : "";

    const status =
      typeof body.status === "string"
        ? body.status.trim()
        : "";

    if (!leadId) {
      return Response.json(
        {
          error: "A valid lead ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!allowedLeadStatuses.includes(status)) {
      return Response.json(
        {
          error: "A valid lead status is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase = createAdminServerClient();

    const { data, error } = await supabase
      .from("leads")
      .update({
        lead_status: status,
      })
      .eq("id", leadId)
      .select("id, lead_status")
      .single();

    if (error) {
      console.error("Supabase lead status update error:", error);

      return Response.json(
        {
          error: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return Response.json({
      success: true,
      lead: data,
    });
  } catch (error) {
    console.error("Lead status request error:", error);

    return Response.json(
      {
        error: "Unable to update the lead status.",
      },
      {
        status: 500,
      },
    );
  }
}