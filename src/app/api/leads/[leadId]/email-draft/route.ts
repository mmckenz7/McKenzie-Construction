import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { leadId: rawLeadId } = await context.params;
    const leadId = rawLeadId.trim();

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

    const supabase = createAdminServerClient();

    const { data: lead, error: leadError } =
      await supabase
        .from("leads")
        .select("id, name, email")
        .eq("id", leadId)
        .single();

    if (leadError || !lead) {
      return Response.json(
        {
          error:
            leadError?.message ??
            "The lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const { data: draft, error: draftError } =
      await supabase
        .from("email_drafts")
        .select(
          `
            id,
            lead_id,
            template_key,
            to_email,
            cc_email,
            subject,
            body,
            status,
            approved_at,
            sent_at,
            canceled_at,
            external_message_id,
            error_message,
            metadata,
            created_at,
            updated_at
          `,
        )
        .eq("lead_id", leadId)
        .in("status", ["draft", "approved"])
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (draftError) {
      return Response.json(
        {
          error: draftError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!draft) {
      return Response.json({
        success: true,
        hasDraft: false,
        draft: null,
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
        },
      });
    }

    return Response.json({
      success: true,
      hasDraft: true,
      draft,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
      },
    });
  } catch (error) {
    console.error(
      "Lead email draft lookup error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to load the lead email draft.",
      },
      {
        status: 500,
      },
    );
  }
}