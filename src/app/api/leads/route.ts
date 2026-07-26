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
      notes?: unknown;
    };

    const leadId =
      typeof body.leadId === "string" ||
      typeof body.leadId === "number"
        ? String(body.leadId).trim()
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

    const updates: {
      lead_status?: string;
      notes?: string | null;
    } = {};

    if (body.status !== undefined) {
      const status =
        typeof body.status === "string"
          ? body.status.trim()
          : "";

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

      updates.lead_status = status;
    }

    if (body.notes !== undefined) {
      if (typeof body.notes !== "string") {
        return Response.json(
          {
            error: "Notes must be valid text.",
          },
          {
            status: 400,
          },
        );
      }

      const cleanedNotes = body.notes.trim();

      updates.notes =
        cleanedNotes.length > 0 ? cleanedNotes : null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        {
          error: "No valid lead changes were provided.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase = createAdminServerClient();

    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select("id, lead_status, notes")
      .single();

    if (error) {
      console.error("Supabase lead update error:", error);

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
    console.error("Lead update request error:", error);

    return Response.json(
      {
        error: "Unable to update the lead.",
      },
      {
        status: 500,
      },
    );
  }
}