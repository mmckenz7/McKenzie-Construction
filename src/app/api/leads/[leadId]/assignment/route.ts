import { NextResponse } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    leadId: string;
  }>;
};

type AssignmentRequestBody = {
  responsiblePersonId?: unknown;
  transferOpenTasks?: unknown;
};

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
};

function parseResponsiblePersonId(
  value: unknown,
) {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { leadId: rawLeadId } =
      await context.params;

    const leadId = rawLeadId.trim();

    if (!leadId) {
      return NextResponse.json(
        {
          success: false,
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
      data: lead,
      error: leadError,
    } = await supabase
      .from("leads")
      .select(
        `
          id,
          responsible_person_id,
          assigned_at,
          responsible_person:team_members!leads_responsible_person_id_fkey (
            id,
            name,
            email,
            phone,
            job_title,
            roles,
            status
          )
        `,
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json(
        {
          success: false,
          error: leadError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!lead) {
      return NextResponse.json(
        {
          success: false,
          error: "Lead not found.",
        },
        {
          status: 404,
        },
      );
    }

    const {
      data: teamMembers,
      error: teamError,
    } = await supabase
      .from("team_members")
      .select(
        `
          id,
          name,
          email,
          phone,
          job_title,
          roles,
          status
        `,
      )
      .eq("status", "active")
      .order("name", {
        ascending: true,
      });

    if (teamError) {
      return NextResponse.json(
        {
          success: false,
          error: teamError.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      lead,
      teamMembers: teamMembers ?? [],
    });
  } catch (error) {
    console.error(
      "Unable to load lead assignment:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load lead assignment.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const { leadId: rawLeadId } =
      await context.params;

    const leadId = rawLeadId.trim();

    if (!leadId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid lead ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    let body: AssignmentRequestBody;

    try {
      body =
        (await request.json()) as AssignmentRequestBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        },
      );
    }

    const responsiblePersonId =
      parseResponsiblePersonId(
        body.responsiblePersonId,
      );

    if (
      responsiblePersonId === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid responsible person selection.",
        },
        {
          status: 400,
        },
      );
    }

    const transferOpenTasks =
      typeof body.transferOpenTasks ===
      "boolean"
        ? body.transferOpenTasks
        : true;

    const supabase =
      createAdminServerClient();

    const {
      data: existingLead,
      error: leadReadError,
    } = await supabase
      .from("leads")
      .select(
        `
          id,
          name,
          responsible_person_id
        `,
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadReadError) {
      return NextResponse.json(
        {
          success: false,
          error:
            leadReadError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!existingLead) {
      return NextResponse.json(
        {
          success: false,
          error: "Lead not found.",
        },
        {
          status: 404,
        },
      );
    }

    const {
      data: companySettings,
      error: settingsError,
    } = await supabase
      .from("company_settings")
      .select(
        `
          require_responsible_person,
          allow_unassigned_leads
        `,
      )
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      return NextResponse.json(
        {
          success: false,
          error:
            settingsError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (
      !responsiblePersonId &&
      companySettings?.require_responsible_person
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company settings require every lead to have a responsible person.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !responsiblePersonId &&
      companySettings?.allow_unassigned_leads ===
        false
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company settings do not allow unassigned leads.",
        },
        {
          status: 400,
        },
      );
    }

    let newResponsiblePerson:
      | TeamMember
      | null = null;

    if (responsiblePersonId) {
      const {
        data: selectedMember,
        error: memberError,
      } = await supabase
        .from("team_members")
        .select(
          `
            id,
            name,
            email,
            phone,
            job_title,
            roles,
            status
          `,
        )
        .eq("id", responsiblePersonId)
        .maybeSingle();

      if (memberError) {
        return NextResponse.json(
          {
            success: false,
            error:
              memberError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (!selectedMember) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The selected employee does not exist.",
          },
          {
            status: 404,
          },
        );
      }

      if (
        selectedMember.status !==
        "active"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only active employees can be assigned to leads.",
          },
          {
            status: 400,
          },
        );
      }

      newResponsiblePerson =
        selectedMember as TeamMember;
    }

    let previousResponsiblePersonName =
      "Unassigned";

    if (
      existingLead.responsible_person_id
    ) {
      const {
        data: previousMember,
        error: previousMemberError,
      } = await supabase
        .from("team_members")
        .select("name")
        .eq(
          "id",
          existingLead.responsible_person_id,
        )
        .maybeSingle();

      if (previousMemberError) {
        return NextResponse.json(
          {
            success: false,
            error:
              previousMemberError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (previousMember?.name) {
        previousResponsiblePersonName =
          previousMember.name;
      }
    }

    if (
      existingLead.responsible_person_id ===
      responsiblePersonId
    ) {
      return NextResponse.json({
        success: true,
        message:
          "The lead is already assigned to that person.",
        lead: {
          ...existingLead,
          responsible_person:
            newResponsiblePerson,
        },
        transferredTaskCount: 0,
        transferredLeadTaskCount: 0,
        transferredCompanyTaskCount: 0,
      });
    }

    const assignmentTimestamp =
      new Date().toISOString();

    const {
      data: updatedLead,
      error: leadUpdateError,
    } = await supabase
      .from("leads")
      .update({
        responsible_person_id:
          responsiblePersonId,
        assigned_at:
          assignmentTimestamp,
        assigned_by_id: null,
        updated_at:
          assignmentTimestamp,
      })
      .eq("id", leadId)
      .select(
        `
          id,
          name,
          responsible_person_id,
          assigned_at
        `,
      )
      .single();

    if (leadUpdateError) {
      return NextResponse.json(
        {
          success: false,
          error:
            leadUpdateError.message,
        },
        {
          status: 500,
        },
      );
    }

    let transferredLeadTaskCount = 0;
    let transferredCompanyTaskCount = 0;

    if (transferOpenTasks) {
      const taskAssignment = {
        assigned_to_id:
          responsiblePersonId,
        assigned_at:
          responsiblePersonId
            ? assignmentTimestamp
            : null,
        updated_at:
          assignmentTimestamp,
      };

      const [
        legacyTaskResult,
        companyTaskResult,
      ] = await Promise.all([
        supabase
          .from("lead_tasks")
          .update(taskAssignment)
          .eq("lead_id", leadId)
          .in("status", [
            "open",
            "in_progress",
          ])
          .select("id"),

        supabase
          .from("tasks")
          .update(taskAssignment)
          .eq("lead_id", leadId)
          .in("status", [
            "open",
            "in_progress",
          ])
          .select("id"),
      ]);

      if (legacyTaskResult.error) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The lead assignment was saved, but its lead workflow tasks could not be reassigned.",
            details:
              legacyTaskResult.error.message,
          },
          {
            status: 500,
          },
        );
      }

      if (companyTaskResult.error) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The lead assignment was saved, but its Daily Action List tasks could not be reassigned.",
            details:
              companyTaskResult.error.message,
          },
          {
            status: 500,
          },
        );
      }

      transferredLeadTaskCount =
        legacyTaskResult.data?.length ??
        0;

      transferredCompanyTaskCount =
        companyTaskResult.data?.length ??
        0;
    }

    const transferredTaskCount =
      Math.max(
        transferredLeadTaskCount,
        transferredCompanyTaskCount,
      );

    const newResponsiblePersonName =
      newResponsiblePerson?.name ??
      "Unassigned";

    const { error: activityError } =
      await supabase
        .from("lead_activities")
        .insert({
          lead_id: leadId,
          activity_type:
            "assignment",
          channel: "internal",
          direction: "internal",
          summary: responsiblePersonId
            ? `Lead assigned to ${newResponsiblePersonName}.`
            : "Lead assignment removed.",
          details:
            previousResponsiblePersonName ===
            "Unassigned"
              ? responsiblePersonId
                ? `${newResponsiblePersonName} is now responsible for this lead.`
                : "The lead remains unassigned."
              : responsiblePersonId
                ? `Responsibility changed from ${previousResponsiblePersonName} to ${newResponsiblePersonName}.`
                : `${previousResponsiblePersonName} was removed as the responsible person.`,
          occurred_at:
            assignmentTimestamp,
          metadata: {
            previous_responsible_person_id:
              existingLead.responsible_person_id,
            previous_responsible_person_name:
              previousResponsiblePersonName,
            new_responsible_person_id:
              responsiblePersonId,
            new_responsible_person_name:
              newResponsiblePersonName,
            transfer_open_tasks:
              transferOpenTasks,
            transferred_open_task_count:
              transferredTaskCount,
            transferred_lead_task_count:
              transferredLeadTaskCount,
            transferred_company_task_count:
              transferredCompanyTaskCount,
          },
        });

    if (activityError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The assignment was saved, but the activity record could not be created.",
          details:
            activityError.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message: responsiblePersonId
        ? `Lead assigned to ${newResponsiblePersonName}.`
        : "Lead is now unassigned.",
      lead: {
        ...updatedLead,
        responsible_person:
          newResponsiblePerson,
      },
      transferredTaskCount,
      transferredLeadTaskCount,
      transferredCompanyTaskCount,
    });
  } catch (error) {
    console.error(
      "Unable to update lead assignment:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update lead assignment.",
      },
      {
        status: 500,
      },
    );
  }
}