import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type LeadRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  project_type: string | null;
  description: string | null;
  notes: string | null;
  lead_status: string | null;
  responsible_person_id: string | null;
};

function splitCustomerName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: null,
      lastName: null,
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: null,
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildCustomerNotes(
  leadNotes: string | null,
  projectDescription: string | null,
) {
  const sections: string[] = [];

  if (leadNotes?.trim()) {
    sections.push(leadNotes.trim());
  }

  if (projectDescription?.trim()) {
    sections.push(
      `Original project description:\n${projectDescription.trim()}`,
    );
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : null;
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  try {
    const { leadId: rawLeadId } =
      await context.params;

    const leadId = rawLeadId.trim();

    if (!leadId) {
      return Response.json(
        {
          error:
            "A valid lead ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    const {
      data: leadData,
      error: leadError,
    } = await supabase
      .from("leads")
      .select(
        `
          id,
          name,
          email,
          phone,
          property_address,
          project_type,
          description,
          notes,
          lead_status,
          responsible_person_id
        `,
      )
      .eq("id", leadId)
      .single();

    if (leadError || !leadData) {
      console.error(
        "Unable to load lead for customer conversion:",
        leadError,
      );

      return Response.json(
        {
          error:
            leadError?.message ??
            "Lead could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const lead = leadData as LeadRecord;

    const customerName =
      lead.name?.trim() || "Unnamed Customer";

    const {
      data: existingCustomer,
      error: existingCustomerError,
    } = await supabase
      .from("customers")
      .select("id, customer_name")
      .eq("source_lead_id", leadId)
      .maybeSingle();

    if (existingCustomerError) {
      console.error(
        "Unable to check for an existing customer:",
        existingCustomerError,
      );

      return Response.json(
        {
          error:
            existingCustomerError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (existingCustomer) {
      if (lead.lead_status !== "won") {
        await supabase
          .from("leads")
          .update({
            lead_status: "won",
            follow_up_at: null,
          })
          .eq("id", leadId);
      }

      return Response.json({
        success: true,
        alreadyConverted: true,
        customerId: existingCustomer.id,
        customerName:
          existingCustomer.customer_name,
      });
    }

    const {
      firstName,
      lastName,
    } = splitCustomerName(customerName);

    const {
      data: newCustomer,
      error: customerError,
    } = await supabase
      .from("customers")
      .insert({
        source_lead_id: leadId,
        customer_name: customerName,
        first_name: firstName,
        last_name: lastName,
        email: lead.email,
        phone: lead.phone,
        address_line_1:
          lead.property_address,
        address_line_2: null,
        city: null,
        state: null,
        postal_code: null,
        project_type:
          lead.project_type,
        notes: buildCustomerNotes(
          lead.notes,
          lead.description,
        ),
        status: "active",
        assigned_to:
          lead.responsible_person_id,
      })
      .select(
        `
          id,
          customer_name
        `,
      )
      .single();

    if (customerError || !newCustomer) {
      console.error(
        "Unable to create customer:",
        customerError,
      );

      return Response.json(
        {
          error:
            customerError?.message ??
            "Unable to create the customer.",
        },
        {
          status: 500,
        },
      );
    }

    const nowIso =
      new Date().toISOString();

    const {
      error: leadUpdateError,
    } = await supabase
      .from("leads")
      .update({
        lead_status: "won",
        follow_up_at: null,
      })
      .eq("id", leadId);

    if (leadUpdateError) {
      console.error(
        "Unable to mark converted lead won:",
        leadUpdateError,
      );

      await supabase
        .from("customers")
        .delete()
        .eq("id", newCustomer.id);

      return Response.json(
        {
          error:
            leadUpdateError.message,
        },
        {
          status: 500,
        },
      );
    }

    const [
      leadTasksResult,
      companyTasksResult,
      activityResult,
    ] = await Promise.all([
      supabase
        .from("lead_tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note:
            "Lead converted to customer.",
        })
        .eq("lead_id", leadId)
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("tasks")
        .update({
          status: "completed",
          completed_at: nowIso,
          completion_note:
            "Lead converted to customer.",
        })
        .eq("lead_id", leadId)
        .in("status", [
          "open",
          "in_progress",
        ]),

      supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type:
            "converted_to_customer",
          channel: "system",
          direction: "internal",
          summary:
            "Lead converted to customer",
          details: `${customerName} was added to the customer list.`,
          occurred_at: nowIso,
          metadata: {
            customer_id:
              newCustomer.id,
            previous_lead_status:
              lead.lead_status,
          },
        }),
    ]);

    if (leadTasksResult.error) {
      console.error(
        "Unable to close converted lead tasks:",
        leadTasksResult.error,
      );
    }

    if (companyTasksResult.error) {
      console.error(
        "Unable to close converted company tasks:",
        companyTasksResult.error,
      );
    }

    if (activityResult.error) {
      console.error(
        "Unable to record customer conversion activity:",
        activityResult.error,
      );
    }

    return Response.json({
      success: true,
      alreadyConverted: false,
      customerId: newCustomer.id,
      customerName:
        newCustomer.customer_name,
    });
  } catch (error) {
    console.error(
      "Customer conversion request error:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to convert the lead to a customer.",
      },
      {
        status: 500,
      },
    );
  }
}