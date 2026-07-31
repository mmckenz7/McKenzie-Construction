import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type CreateNoteBody = {
  title?: string;
  description?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  let body: CreateNoteBody;

  try {
    body =
      (await request.json()) as CreateNoteBody;
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

  const title =
    body.title?.trim() ?? "";

  const description =
    body.description?.trim() ?? "";

  if (!title || !description) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A note title and details are required.",
      },
      {
        status: 400,
      },
    );
  }

  if (title.length > 150) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The note title must be 150 characters or fewer.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "add_project_activity_note",
      {
        requested_project_id:
          projectId,
        requested_auth_user_id:
          authUser.id,
        requested_title: title,
        requested_description:
          description,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    note: data,
  });
}
