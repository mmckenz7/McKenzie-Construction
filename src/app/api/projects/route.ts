import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  projectManagerIsRequired,
  resolveProjectManager,
  validateActiveAssignee,
  type CompanyAssignmentSettings,
} from "@/lib/crm/assignment";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedProjectStatuses = new Set([
  "planning",
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "canceled",
]);

type RequestBody = {
  customerId?: unknown;
  projectName?: unknown;
  projectType?: unknown;
  description?: unknown;
  propertyAddress?: unknown;
  status?: unknown;
  projectManagerId?: unknown;
  estimatedValue?: unknown;
  contractValue?: unknown;
  startDate?: unknown;
  targetCompletionDate?: unknown;
  notes?: unknown;
  metadata?: unknown;
};

type CustomerRecord = {
  id: string;
  customer_name: string;
  project_type: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  assigned_to: string | null;
};

function cleanText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function cleanOptionalText(
  value: unknown,
): string | null {
  const cleaned =
    cleanText(value);

  return cleaned || null;
}

function cleanOptionalId(
  value: unknown,
): string | null {
  const cleaned =
    cleanText(value);

  return cleaned || null;
}

function parseOptionalMoney(
  value: unknown,
): {
  value: number | null;
  error: string | null;
} {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .replace(/[$,\s]/g, ""),
        );

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return {
      value: null,
      error:
        "Project values must be valid non-negative numbers.",
    };
  }

  return {
    value:
      Math.round(parsed * 100) /
      100,
    error: null,
  };
}

function parseOptionalDate(
  value: unknown,
  fieldName: string,
): {
  value: string | null;
  error: string | null;
} {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      value: null,
      error: null,
    };
  }

  const cleaned =
    cleanText(value);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      cleaned,
    )
  ) {
    return {
      value: null,
      error:
        `${fieldName} must use the YYYY-MM-DD format.`,
    };
  }

  const date =
    new Date(
      `${cleaned}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date
      .toISOString()
      .slice(0, 10) !==
      cleaned
  ) {
    return {
      value: null,
      error:
        `${fieldName} is not a valid date.`,
    };
  }

  return {
    value: cleaned,
    error: null,
  };
}

function parseMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

function buildCustomerAddress(
  customer: CustomerRecord,
): string | null {
  const street = [
    customer.address_line_1,
    customer.address_line_2,
  ]
    .filter(
      (
        part,
      ): part is string =>
        Boolean(
          part?.trim(),
        ),
    )
    .join(", ");

  const cityState = [
    customer.city,
    customer.state,
  ]
    .filter(
      (
        part,
      ): part is string =>
        Boolean(
          part?.trim(),
        ),
    )
    .join(", ");

  const locality = [
    cityState,
    customer.postal_code,
  ]
    .filter(
      (
        part,
      ): part is string =>
        Boolean(
          part?.trim(),
        ),
    )
    .join(" ");

  const address = [
    street,
    locality,
  ]
    .filter(Boolean)
    .join(", ");

  return address || null;
}

export async function GET(
  request: Request,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  try {
    const requestUrl =
      new URL(request.url);

    const customerId =
      cleanOptionalId(
        requestUrl.searchParams.get(
          "customerId",
        ),
      );

    const projectManagerId =
      cleanOptionalId(
        requestUrl.searchParams.get(
          "projectManagerId",
        ),
      );

    const status =
      cleanOptionalText(
        requestUrl.searchParams.get(
          "status",
        ),
      );

    if (
      status &&
      !allowedProjectStatuses.has(
        status,
      )
    ) {
      return Response.json(
        {
          error:
            "Choose a valid project status.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    let query = supabase
      .from("projects")
      .select(
        `
          id,
          customer_id,
          project_name,
          project_type,
          description,
          property_address,
          status,
          project_manager_id,
          estimated_value,
          contract_value,
          start_date,
          target_completion_date,
          completed_at,
          notes,
          metadata,
          created_at,
          updated_at,
          customers (
            id,
            customer_name,
            email,
            phone
          ),
          team_members (
            id,
            name,
            email,
            job_title,
            status
          )
        `,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      );

    if (customerId) {
      query = query.eq(
        "customer_id",
        customerId,
      );
    }

    if (projectManagerId) {
      query = query.eq(
        "project_manager_id",
        projectManagerId,
      );
    }

    if (status) {
      query = query.eq(
        "status",
        status,
      );
    }

    const {
      data: projects,
      error,
    } = await query;

    if (error) {
      console.error(
        "Unable to load projects:",
        error,
      );

      return Response.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        },
      );
    }

    return Response.json({
      success: true,
      projects:
        projects ?? [],
    });
  } catch (error) {
    console.error(
      "Project list request error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load projects.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  try {
    const body =
      (await request.json()) as RequestBody;

    const customerId =
      cleanOptionalId(
        body.customerId,
      );

    const projectName =
      cleanText(
        body.projectName,
      );

    const requestedProjectType =
      cleanOptionalText(
        body.projectType,
      );

    const description =
      cleanOptionalText(
        body.description,
      );

    const requestedPropertyAddress =
      cleanOptionalText(
        body.propertyAddress,
      );

    const requestedStatus =
      cleanOptionalText(
        body.status,
      ) ?? "planning";

    const selectedProjectManagerId =
      cleanOptionalId(
        body.projectManagerId,
      );

    const notes =
      cleanOptionalText(
        body.notes,
      );

    if (!customerId) {
      return Response.json(
        {
          error:
            "A customer is required before creating a project.",
        },
        {
          status: 400,
        },
      );
    }

    if (!projectName) {
      return Response.json(
        {
          error:
            "The project name is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !allowedProjectStatuses.has(
        requestedStatus,
      )
    ) {
      return Response.json(
        {
          error:
            "Choose a valid project status.",
        },
        {
          status: 400,
        },
      );
    }

    const estimatedValueResult =
      parseOptionalMoney(
        body.estimatedValue,
      );

    if (
      estimatedValueResult.error
    ) {
      return Response.json(
        {
          error:
            estimatedValueResult.error,
        },
        {
          status: 400,
        },
      );
    }

    const contractValueResult =
      parseOptionalMoney(
        body.contractValue,
      );

    if (
      contractValueResult.error
    ) {
      return Response.json(
        {
          error:
            contractValueResult.error,
        },
        {
          status: 400,
        },
      );
    }

    const startDateResult =
      parseOptionalDate(
        body.startDate,
        "The start date",
      );

    if (
      startDateResult.error
    ) {
      return Response.json(
        {
          error:
            startDateResult.error,
        },
        {
          status: 400,
        },
      );
    }

    const targetDateResult =
      parseOptionalDate(
        body.targetCompletionDate,
        "The target completion date",
      );

    if (
      targetDateResult.error
    ) {
      return Response.json(
        {
          error:
            targetDateResult.error,
        },
        {
          status: 400,
        },
      );
    }

    if (
      startDateResult.value &&
      targetDateResult.value &&
      targetDateResult.value <
        startDateResult.value
    ) {
      return Response.json(
        {
          error:
            "The target completion date cannot be before the start date.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      createAdminServerClient();

    const [
      customerResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("customers")
        .select(
          `
            id,
            customer_name,
            project_type,
            address_line_1,
            address_line_2,
            city,
            state,
            postal_code,
            assigned_to
          `,
        )
        .eq(
          "id",
          customerId,
        )
        .single(),

      supabase
        .from("company_settings")
        .select(
          `
            automatically_assign_new_leads,
            automatically_assign_new_tasks,
            automatically_assign_converted_projects,
            allow_unassigned_leads,
            allow_unassigned_tasks,
            require_responsible_person,
            require_task_assignee,
            require_project_manager,
            default_lead_owner_id,
            default_estimator_id,
            default_project_manager_id
          `,
        )
        .limit(1)
        .maybeSingle(),
    ]);

    if (
      customerResult.error ||
      !customerResult.data
    ) {
      console.error(
        "Unable to load the project customer:",
        customerResult.error,
      );

      return Response.json(
        {
          error:
            customerResult.error
              ?.message ??
            "The selected customer could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      settingsResult.error ||
      !settingsResult.data
    ) {
      console.error(
        "Unable to load project assignment settings:",
        settingsResult.error,
      );

      return Response.json(
        {
          error:
            "Company assignment settings could not be loaded.",
        },
        {
          status: 500,
        },
      );
    }

    const customer =
      customerResult.data as CustomerRecord;

    const companySettings =
      settingsResult.data as CompanyAssignmentSettings;

    if (
      selectedProjectManagerId
    ) {
      let activeSelectedManager:
        | string
        | null;

      try {
        activeSelectedManager =
          await validateActiveAssignee(
            supabase,
            selectedProjectManagerId,
          );
      } catch (error) {
        console.error(
          "Unable to validate the selected project manager:",
          error,
        );

        return Response.json(
          {
            error:
              "The selected project manager could not be validated.",
          },
          {
            status: 500,
          },
        );
      }

      if (
        !activeSelectedManager
      ) {
        return Response.json(
          {
            error:
              "The selected project manager is not an active team member.",
          },
          {
            status: 400,
          },
        );
      }
    }

    let projectManagerId:
      | string
      | null;

    try {
      projectManagerId =
        await resolveProjectManager(
          supabase,
          companySettings,
          selectedProjectManagerId,
        );
    } catch (error) {
      console.error(
        "Unable to resolve the project manager:",
        error,
      );

      return Response.json(
        {
          error:
            "The project manager could not be determined.",
        },
        {
          status: 500,
        },
      );
    }

    if (
      !projectManagerId &&
      projectManagerIsRequired(
        companySettings,
      )
    ) {
      return Response.json(
        {
          error:
            "An active project manager is required before creating this project.",
        },
        {
          status: 400,
        },
      );
    }

    const projectType =
      requestedProjectType ??
      customer.project_type;

    const propertyAddress =
      requestedPropertyAddress ??
      buildCustomerAddress(
        customer,
      );

    const metadata = {
      ...parseMetadata(
        body.metadata,
      ),
      created_by:
        "crm_project_api",
      created_by_auth_user_id:
        user.id,
      assignment: {
        automatically_assign_converted_projects:
          companySettings
            .automatically_assign_converted_projects,
        selected_project_manager_id:
          selectedProjectManagerId,
        default_project_manager_id:
          companySettings
            .default_project_manager_id,
        resolved_project_manager_id:
          projectManagerId,
      },
    };

    const nowIso =
      new Date().toISOString();

    const completedAt =
      requestedStatus ===
      "completed"
        ? nowIso
        : null;

    const {
      data: newProject,
      error: projectError,
    } = await supabase
      .from("projects")
      .insert({
        customer_id:
          customerId,
        project_name:
          projectName,
        project_type:
          projectType,
        description,
        property_address:
          propertyAddress,
        status:
          requestedStatus,
        project_manager_id:
          projectManagerId,
        estimated_value:
          estimatedValueResult.value,
        contract_value:
          contractValueResult.value,
        start_date:
          startDateResult.value,
        target_completion_date:
          targetDateResult.value,
        completed_at:
          completedAt,
        notes,
        metadata,
      })
      .select(
        `
          id,
          customer_id,
          project_name,
          project_type,
          description,
          property_address,
          status,
          project_manager_id,
          estimated_value,
          contract_value,
          start_date,
          target_completion_date,
          completed_at,
          notes,
          metadata,
          created_at,
          updated_at
        `,
      )
      .single();

    if (
      projectError ||
      !newProject
    ) {
      console.error(
        "Unable to create project:",
        projectError,
      );

      return Response.json(
        {
          error:
            projectError?.message ??
            "The project could not be created.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      error: customerUpdateError,
    } = await supabase
      .from("customers")
      .update({
        project_type:
          projectType,
        assigned_to:
          customer.assigned_to ??
          projectManagerId,
      })
      .eq(
        "id",
        customerId,
      );

    if (
      customerUpdateError
    ) {
      console.error(
        "Unable to update the customer after project creation:",
        customerUpdateError,
      );
    }

    const sourceLeadIdResult =
      await supabase
        .from("customers")
        .select(
          "source_lead_id",
        )
        .eq(
          "id",
          customerId,
        )
        .single();

    const sourceLeadId =
      sourceLeadIdResult.data
        ?.source_lead_id ??
      null;

    if (sourceLeadId) {
      const {
        error:
          activityError,
      } = await supabase
        .from("lead_activities")
        .insert({
          lead_id:
            sourceLeadId,
          activity_type:
            "project_created",
          channel:
            "system",
          direction:
            "internal",
          summary:
            "Customer project created",
          details:
            `${projectName} was created for ${customer.customer_name}.`,
          occurred_at:
            nowIso,
          metadata: {
            customer_id:
              customerId,
            project_id:
              newProject.id,
            project_manager_id:
              projectManagerId,
            project_status:
              requestedStatus,
          },
        });

      if (activityError) {
        console.error(
          "Unable to record project creation activity:",
          activityError,
        );
      }
    }

    return Response.json(
      {
        success: true,
        project:
          newProject,
        projectManagerId,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Project creation request error:",
      error,
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create the project.",
      },
      {
        status: 500,
      },
    );
  }
}