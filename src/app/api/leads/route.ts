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

const allowedConsultationStatuses = [
  "not_requested",
  "pending",
  "confirmed",
  "declined",
  "completed",
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
    const body = (await request.json()) as Record<string, unknown>;

    const rawLeadId = body.leadId ?? body.lead_id;

    const leadId =
      typeof rawLeadId === "string" ||
      typeof rawLeadId === "number"
        ? String(rawLeadId).trim()
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
      consultation_status?: string;
      notes?: string | null;
      follow_up_at?: string | null;
    } = {};

    const rawLeadStatus =
      body.status ?? body.leadStatus ?? body.lead_status;

    if (rawLeadStatus !== undefined) {
      const leadStatus =
        typeof rawLeadStatus === "string"
          ? rawLeadStatus.trim()
          : "";

      if (!allowedLeadStatuses.includes(leadStatus)) {
        return Response.json(
          {
            error: "A valid lead status is required.",
          },
          {
            status: 400,
          },
        );
      }

      updates.lead_status = leadStatus;
    }

    const rawConsultationStatus =
      body.consultationStatus ?? body.consultation_status;

    if (rawConsultationStatus !== undefined) {
      const consultationStatus =
        typeof rawConsultationStatus === "string"
          ? rawConsultationStatus.trim()
          : "";

      if (
        !allowedConsultationStatuses.includes(
          consultationStatus,
        )
      ) {
        return Response.json(
          {
            error: "A valid consultation status is required.",
          },
          {
            status: 400,
          },
        );
      }

      updates.consultation_status = consultationStatus;
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

    const rawFollowUpAt =
      body.followUpAt ?? body.follow_up_at;

    if (rawFollowUpAt !== undefined) {
      if (rawFollowUpAt === null || rawFollowUpAt === "") {
        updates.follow_up_at = null;
      } else if (typeof rawFollowUpAt === "string") {
        const followUpDate = new Date(rawFollowUpAt);

        if (Number.isNaN(followUpDate.getTime())) {
          return Response.json(
            {
              error: "A valid follow-up date and time is required.",
            },
            {
              status: 400,
            },
          );
        }

        updates.follow_up_at = followUpDate.toISOString();
      } else {
        return Response.json(
          {
            error: "A valid follow-up date and time is required.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      console.error("No recognized lead changes:", body);

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
      .select(
        "id, lead_status, consultation_status, notes, follow_up_at",
      )
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