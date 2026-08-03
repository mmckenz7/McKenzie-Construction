import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";

import { NextResponse } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

type UpdateCompanySettingsBody = {
  requireResponsiblePerson?: unknown;
  requireTaskAssignee?: unknown;
  requireProjectManager?: unknown;
  allowUnassignedLeads?: unknown;
  allowUnassignedTasks?: unknown;
  automaticallyAssignNewLeads?: unknown;
  automaticallyAssignNewTasks?: unknown;
  automaticallyAssignConvertedProjects?: unknown;
  defaultLeadOwnerId?: unknown;
  defaultEstimatorId?: unknown;
  defaultProjectManagerId?: unknown;
  manualTaskDueMode?: unknown;
  manualTaskDueOffset?: unknown;
  endOfBusinessTime?: unknown;
  consultationStartTime?: unknown;
  consultationEndTime?: unknown;
};

type AssignmentField =
  | "defaultLeadOwnerId"
  | "defaultEstimatorId"
  | "defaultProjectManagerId";

const allowedDueModes = new Set([
  "same_day",
  "business_days",
  "calendar_days",
  "no_due_date",
]);

const settingsSelect = `
  id,
  company_name,
  require_responsible_person,
  require_task_assignee,
  require_project_manager,
  allow_unassigned_leads,
  allow_unassigned_tasks,
  automatically_assign_new_leads,
  automatically_assign_new_tasks,
  automatically_assign_converted_projects,
  default_lead_owner_id,
  default_estimator_id,
  default_project_manager_id,
  manual_task_due_mode,
  manual_task_due_offset,
  end_of_business_time
  ,consultation_start_time
  ,consultation_end_time
`;

function optionalId(value: unknown) {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue || null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean"
    ? value
    : undefined;
}

function parseDueOffset(
  value: unknown,
  dueMode: string,
) {
  if (
    dueMode === "same_day" ||
    dueMode === "no_due_date"
  ) {
    return 0;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 0 ||
    numberValue > 365
  ) {
    return undefined;
  }

  return numberValue;
}

function parseBusinessTime(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  const matches = trimmedValue.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/,
  );

  if (!matches) {
    return undefined;
  }

  const seconds = matches[3] ?? "00";

  return `${matches[1]}:${matches[2]}:${seconds}`;
}

async function validateActiveTeamMember(
  memberId: string | null,
  fieldName: AssignmentField,
) {
  if (!memberId) {
    return {
      valid: true,
      error: null,
    };
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, status")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    return {
      valid: false,
      error: error.message,
    };
  }

  if (!data) {
    return {
      valid: false,
      error: `The selected ${fieldName} employee does not exist.`,
    };
  }

  if (data.status !== "active") {
    return {
      valid: false,
      error: `${data.name} must be active before being selected as a default employee.`,
    };
  }

  return {
    valid: true,
    error: null,
  };
}

export async function GET(
  request: Request,
) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  if (
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    return createForbiddenApiResponse(
      request,
    );
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("company_settings")
    .select(settingsSelect)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error: "Company settings were not found.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    success: true,
    settings: data,
  });
}

export async function PATCH(request: Request) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  if (
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    return createForbiddenApiResponse(
      request,
    );
  }

  let body: UpdateCompanySettingsBody;

  try {
    body =
      (await request.json()) as UpdateCompanySettingsBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const {
    data: existingSettings,
    error: settingsReadError,
  } = await supabase
    .from("company_settings")
    .select(settingsSelect)
    .limit(1)
    .maybeSingle();

  if (settingsReadError) {
    return NextResponse.json(
      {
        success: false,
        error: settingsReadError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existingSettings) {
    return NextResponse.json(
      {
        success: false,
        error: "Company settings were not found.",
      },
      {
        status: 404,
      },
    );
  }

  const defaultLeadOwnerId =
    body.defaultLeadOwnerId === undefined
      ? existingSettings.default_lead_owner_id
      : optionalId(body.defaultLeadOwnerId);

  const defaultEstimatorId =
    body.defaultEstimatorId === undefined
      ? existingSettings.default_estimator_id
      : optionalId(body.defaultEstimatorId);

  const defaultProjectManagerId =
    body.defaultProjectManagerId === undefined
      ? existingSettings.default_project_manager_id
      : optionalId(body.defaultProjectManagerId);

  if (defaultLeadOwnerId === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid default lead owner.",
      },
      {
        status: 400,
      },
    );
  }

  if (defaultEstimatorId === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid default estimator.",
      },
      {
        status: 400,
      },
    );
  }

  if (defaultProjectManagerId === undefined) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid default project manager.",
      },
      {
        status: 400,
      },
    );
  }

  const assignmentChecks = await Promise.all([
    validateActiveTeamMember(
      defaultLeadOwnerId,
      "defaultLeadOwnerId",
    ),
    validateActiveTeamMember(
      defaultEstimatorId,
      "defaultEstimatorId",
    ),
    validateActiveTeamMember(
      defaultProjectManagerId,
      "defaultProjectManagerId",
    ),
  ]);

  const failedCheck = assignmentChecks.find(
    (check) => !check.valid,
  );

  if (failedCheck) {
    return NextResponse.json(
      {
        success: false,
        error:
          failedCheck.error ??
          "A selected default employee is invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const requireResponsiblePerson =
    booleanValue(body.requireResponsiblePerson) ??
    existingSettings.require_responsible_person;

  const requireTaskAssignee =
    booleanValue(body.requireTaskAssignee) ??
    existingSettings.require_task_assignee;

  const requireProjectManager =
    booleanValue(body.requireProjectManager) ??
    existingSettings.require_project_manager;

  const allowUnassignedLeads =
    booleanValue(body.allowUnassignedLeads) ??
    existingSettings.allow_unassigned_leads;

  const allowUnassignedTasks =
    booleanValue(body.allowUnassignedTasks) ??
    existingSettings.allow_unassigned_tasks;

  const automaticallyAssignNewLeads =
    booleanValue(body.automaticallyAssignNewLeads) ??
    existingSettings.automatically_assign_new_leads;

  const automaticallyAssignNewTasks =
    booleanValue(body.automaticallyAssignNewTasks) ??
    existingSettings.automatically_assign_new_tasks;

  const automaticallyAssignConvertedProjects =
    booleanValue(
      body.automaticallyAssignConvertedProjects,
    ) ??
    existingSettings.automatically_assign_converted_projects;

  const manualTaskDueMode =
    body.manualTaskDueMode === undefined
      ? existingSettings.manual_task_due_mode
      : typeof body.manualTaskDueMode === "string"
        ? body.manualTaskDueMode.trim()
        : "";

  if (!allowedDueModes.has(manualTaskDueMode)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid manual task due timing.",
      },
      {
        status: 400,
      },
    );
  }

  const manualTaskDueOffset = parseDueOffset(
    body.manualTaskDueOffset === undefined
      ? existingSettings.manual_task_due_offset
      : body.manualTaskDueOffset,
    manualTaskDueMode,
  );

  if (manualTaskDueOffset === undefined) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Enter a valid number of days for manual tasks.",
      },
      {
        status: 400,
      },
    );
  }

  const endOfBusinessTime =
    body.endOfBusinessTime === undefined
      ? existingSettings.end_of_business_time
      : parseBusinessTime(body.endOfBusinessTime);

  if (!endOfBusinessTime) {
    return NextResponse.json(
      {
        success: false,
        error: "Enter a valid end-of-business time.",
      },
      {
        status: 400,
      },
    );
  }

  const consultationStartTime = body.consultationStartTime === undefined
    ? existingSettings.consultation_start_time
    : parseBusinessTime(body.consultationStartTime);
  const consultationEndTime = body.consultationEndTime === undefined
    ? existingSettings.consultation_end_time
    : parseBusinessTime(body.consultationEndTime);
  if (!consultationStartTime || !consultationEndTime || consultationStartTime >= consultationEndTime) {
    return NextResponse.json({ success: false, error: "Consultation hours must have a valid opening time before the closing time." }, { status: 400 });
  }

  if (
    requireResponsiblePerson &&
    !defaultLeadOwnerId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose a default lead owner before requiring lead assignments.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    requireProjectManager &&
    !defaultProjectManagerId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Choose a default project manager before requiring project assignments.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    requireResponsiblePerson &&
    allowUnassignedLeads
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Required lead assignments and allowing unassigned leads cannot both be turned on.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    requireTaskAssignee &&
    allowUnassignedTasks
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Required task assignments and allowing unassigned tasks cannot both be turned on.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: updatedSettings,
    error: updateError,
  } = await supabase
    .from("company_settings")
    .update({
      require_responsible_person:
        requireResponsiblePerson,
      require_task_assignee:
        requireTaskAssignee,
      require_project_manager:
        requireProjectManager,
      allow_unassigned_leads:
        allowUnassignedLeads,
      allow_unassigned_tasks:
        allowUnassignedTasks,
      automatically_assign_new_leads:
        automaticallyAssignNewLeads,
      automatically_assign_new_tasks:
        automaticallyAssignNewTasks,
      automatically_assign_converted_projects:
        automaticallyAssignConvertedProjects,
      default_lead_owner_id:
        defaultLeadOwnerId,
      default_estimator_id:
        defaultEstimatorId,
      default_project_manager_id:
        defaultProjectManagerId,
      manual_task_due_mode:
        manualTaskDueMode,
      manual_task_due_offset:
        manualTaskDueOffset,
      end_of_business_time:
        endOfBusinessTime,
      consultation_start_time: consultationStartTime,
      consultation_end_time: consultationEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingSettings.id)
    .select(settingsSelect)
    .single();

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        error: updateError.message,
      },
      {
        status: 500,
      },
    );
  }

  const { error: resetDefaultsError } =
    await supabase
      .from("team_members")
      .update({
        is_default_lead_owner: false,
        is_default_estimator: false,
        is_default_project_manager: false,
        updated_at: new Date().toISOString(),
      })
      .or(
        "is_default_lead_owner.eq.true,is_default_estimator.eq.true,is_default_project_manager.eq.true",
      );

  if (resetDefaultsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Company settings were saved, but employee default labels could not be refreshed.",
      },
      {
        status: 500,
      },
    );
  }

  if (defaultLeadOwnerId) {
    const { error } = await supabase
      .from("team_members")
      .update({
        is_default_lead_owner: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", defaultLeadOwnerId);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company settings were saved, but the default lead owner label could not be updated.",
        },
        {
          status: 500,
        },
      );
    }
  }

  if (defaultEstimatorId) {
    const { error } = await supabase
      .from("team_members")
      .update({
        is_default_estimator: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", defaultEstimatorId);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company settings were saved, but the default estimator label could not be updated.",
        },
        {
          status: 500,
        },
      );
    }
  }

  if (defaultProjectManagerId) {
    const { error } = await supabase
      .from("team_members")
      .update({
        is_default_project_manager: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", defaultProjectManagerId);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Company settings were saved, but the default project manager label could not be updated.",
        },
        {
          status: 500,
        },
      );
    }
  }

  return NextResponse.json({
    success: true,
    settings: updatedSettings,
  });
}
