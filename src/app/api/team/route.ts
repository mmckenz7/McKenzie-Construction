import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";

import { NextResponse } from "next/server";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

const allowedRoles = new Set([
  "owner",
  "admin",
  "sales",
  "estimator",
  "project_manager",
  "superintendent",
  "field_employee",
  "office",
]);

const allowedStatuses = new Set([
  "active",
  "inactive",
  "invited",
]);

type CreateTeamMemberBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  jobTitle?: unknown;
  roles?: unknown;
  status?: unknown;
  notes?: unknown;
};

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0
    ? trimmedValue
    : null;
}

function validateRoles(value: unknown) {
  if (!Array.isArray(value)) {
    return {
      roles: [] as string[],
      error: "Choose at least one employee role.",
    };
  }

  const roles = Array.from(
    new Set(
      value
        .filter(
          (role): role is string =>
            typeof role === "string",
        )
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  );

  if (roles.length === 0) {
    return {
      roles,
      error: "Choose at least one employee role.",
    };
  }

  const invalidRole = roles.find(
    (role) => !allowedRoles.has(role),
  );

  if (invalidRole) {
    return {
      roles,
      error: `Invalid employee role: ${invalidRole}.`,
    };
  }

  return {
    roles,
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
    .from("team_members")
    .select(
      `
        id,
        name,
        email,
        phone,
        job_title,
        roles,
        status,
        is_default_lead_owner,
        is_default_estimator,
        is_default_project_manager,
        notes,
        created_at,
        updated_at
      `,
    )
    .order("status", {
      ascending: true,
    })
    .order("name", {
      ascending: true,
    });

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

  return NextResponse.json({
    success: true,
    members: data ?? [],
  });
}

export async function POST(request: Request) {
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

  let body: CreateTeamMemberBody;

  try {
    body =
      (await request.json()) as CreateTeamMemberBody;
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

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error: "Employee name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const email = optionalText(body.email);

  if (
    email &&
    !email.includes("@")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Enter a valid employee email address.",
      },
      {
        status: 400,
      },
    );
  }

  const roleResult = validateRoles(body.roles);

  if (roleResult.error) {
    return NextResponse.json(
      {
        success: false,
        error: roleResult.error,
      },
      {
        status: 400,
      },
    );
  }

  const status =
    typeof body.status === "string"
      ? body.status.trim()
      : "active";

  if (!allowedStatuses.has(status)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid employee status.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("team_members")
    .insert({
      name,
      email,
      phone: optionalText(body.phone),
      job_title: optionalText(body.jobTitle),
      roles: roleResult.roles,
      status,
      notes: optionalText(body.notes),
      updated_at: new Date().toISOString(),
    })
    .select(
      `
        id,
        name,
        email,
        phone,
        job_title,
        roles,
        status,
        is_default_lead_owner,
        is_default_estimator,
        is_default_project_manager,
        notes,
        created_at,
        updated_at
      `,
    )
    .single();

  if (error) {
    const isDuplicateEmail =
      error.code === "23505";

    return NextResponse.json(
      {
        success: false,
        error: isDuplicateEmail
          ? "An employee with that email address already exists."
          : error.message,
      },
      {
        status: isDuplicateEmail
          ? 409
          : 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      member: data,
    },
    {
      status: 201,
    },
  );
}