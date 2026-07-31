import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type CreateMessageBody = {
  projectId?: string;
  subcontractorId?: string;
  preferredLanguage?: "en" | "es";
  originalText?: string;
  translatedText?: string | null;
};

function normalizeProject(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.project_name ??
        record.title ??
        "Unnamed project",
    ),
    address: String(
      record.address ??
        record.project_address ??
        record.job_address ??
        "",
    ),
  };
}

function normalizeTeamMember(
  record: Record<string, unknown>,
) {
  const rawRoles =
    record.roles ?? record.role ?? [];

  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.display_name ??
        record.full_name ??
        "Unnamed installer",
    ),
    phone:
      typeof record.phone === "string"
        ? record.phone
        : null,
    email:
      typeof record.email === "string"
        ? record.email
        : null,
    roles: Array.isArray(rawRoles)
      ? rawRoles.map(String)
      : typeof rawRoles === "string"
        ? [rawRoles]
        : [],
  };
}

function normalizeMessage(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    threadId: String(
      record.thread_id ?? "",
    ),
    projectId: String(
      record.project_id ?? "",
    ),
    subcontractorId: String(
      record.subcontractor_id ?? "",
    ),
    senderType: String(
      record.sender_type ?? "office",
    ),
    direction: String(
      record.direction ?? "outbound",
    ),
    originalLanguage: String(
      record.original_language ?? "en",
    ),
    recipientLanguage: String(
      record.recipient_language ?? "en",
    ),
    originalText: String(
      record.original_text ?? "",
    ),
    translatedText:
      typeof record.translated_text ===
      "string"
        ? record.translated_text
        : null,
    translationStatus: String(
      record.translation_status ??
        "not_requested",
    ),
    deliveryChannel: String(
      record.delivery_channel ??
        "in_app",
    ),
    deliveryStatus: String(
      record.delivery_status ?? "draft",
    ),
    sentAt:
      typeof record.sent_at === "string"
        ? record.sent_at
        : null,
    createdAt: String(
      record.created_at ?? "",
    ),
  };
}

function isInstallerRole(
  roles: string[],
) {
  return roles.some((role) => {
    const normalized =
      role.toLowerCase();

    return (
      normalized.includes(
        "subcontractor",
      ) ||
      normalized.includes("installer")
    );
  });
}

export async function GET(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const supabase =
    createAdminServerClient();

  const [
    projectsResult,
    teamResult,
    threadsResult,
    messagesResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("team_members")
      .select("*")
      .order("name", {
        ascending: true,
      }),

    supabase
      .from(
        "project_message_threads",
      )
      .select(`
        *,
        projects (*),
        team_members (*)
      `)
      .order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      }),

    supabase
      .from("project_messages")
      .select("*")
      .order("created_at", {
        ascending: true,
      }),
  ]);

  const firstError =
    projectsResult.error ??
    teamResult.error ??
    threadsResult.error ??
    messagesResult.error;

  if (firstError) {
    return NextResponse.json(
      {
        success: false,
        error: firstError.message,
      },
      {
        status: 500,
      },
    );
  }

  const projects = (
    projectsResult.data ?? []
  ).map((record) =>
    normalizeProject(
      record as Record<string, unknown>,
    ),
  );

  const subcontractors = (
    teamResult.data ?? []
  )
    .map((record) =>
      normalizeTeamMember(
        record as Record<string, unknown>,
      ),
    )
    .filter((member) =>
      isInstallerRole(member.roles),
    );

  const messagesByThread = new Map<
    string,
    ReturnType<typeof normalizeMessage>[]
  >();

  for (
    const record of
    messagesResult.data ?? []
  ) {
    const message = normalizeMessage(
      record as Record<string, unknown>,
    );

    const current =
      messagesByThread.get(
        message.threadId,
      ) ?? [];

    current.push(message);

    messagesByThread.set(
      message.threadId,
      current,
    );
  }

  const threads = (
    threadsResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    const project =
      raw.projects &&
      typeof raw.projects === "object"
        ? normalizeProject(
            raw.projects as Record<
              string,
              unknown
            >,
          )
        : null;

    const subcontractor =
      raw.team_members &&
      typeof raw.team_members === "object"
        ? normalizeTeamMember(
            raw.team_members as Record<
              string,
              unknown
            >,
          )
        : null;

    const id = String(raw.id ?? "");

    return {
      id,
      projectId: String(
        raw.project_id ?? "",
      ),
      subcontractorId: String(
        raw.subcontractor_id ?? "",
      ),
      preferredLanguage: String(
        raw.preferred_language ?? "en",
      ),
      status: String(
        raw.status ?? "active",
      ),
      lastMessageAt:
        typeof raw.last_message_at ===
        "string"
          ? raw.last_message_at
          : null,
      project,
      subcontractor,
      messages:
        messagesByThread.get(id) ?? [],
    };
  });

  return NextResponse.json({
    success: true,
    projects,
    subcontractors,
    threads,
  });
}

export async function POST(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  let body: CreateMessageBody;

  try {
    body =
      (await request.json()) as CreateMessageBody;
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

  const originalText =
    body.originalText?.trim();

  if (
    !body.projectId ||
    !body.subcontractorId ||
    !originalText
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Project, installer, and message are required.",
      },
      {
        status: 400,
      },
    );
  }

  const preferredLanguage =
    body.preferredLanguage === "es"
      ? "es"
      : "en";

  const supabase =
    createAdminServerClient();

  const { data: accessData } =
    await supabase.rpc(
      "get_effective_user_access",
      {
        requested_auth_user_id:
          authUser.id,
      },
    );

  const appUserId =
    accessData &&
    typeof accessData === "object" &&
    "user_id" in accessData
      ? String(accessData.user_id)
      : null;

  const {
    data: thread,
    error: threadError,
  } = await supabase
    .from("project_message_threads")
    .upsert(
      {
        project_id: body.projectId,
        subcontractor_id:
          body.subcontractorId,
        preferred_language:
          preferredLanguage,
        status: "active",
      },
      {
        onConflict:
          "project_id,subcontractor_id",
      },
    )
    .select("*")
    .single();

  if (threadError) {
    return NextResponse.json(
      {
        success: false,
        error: threadError.message,
      },
      {
        status: 500,
      },
    );
  }

  const translatedText =
    body.translatedText?.trim() || null;

  const needsTranslation =
    preferredLanguage === "es" &&
    translatedText === null;

  const { data, error } =
    await supabase
      .from("project_messages")
      .insert({
        thread_id: thread.id,
        project_id: body.projectId,
        subcontractor_id:
          body.subcontractorId,
        sender_type: "office",
        sender_app_user_id:
          appUserId,
        direction: "outbound",
        original_language: "en",
        recipient_language:
          preferredLanguage,
        original_text: originalText,
        translated_text:
          translatedText,
        translation_status:
          needsTranslation
            ? "pending"
            : translatedText
              ? "completed"
              : "not_requested",
        delivery_channel: "in_app",
        delivery_status:
          needsTranslation
            ? "draft"
            : "sent",
        sent_at:
          needsTranslation
            ? null
            : new Date().toISOString(),
      })
      .select("*")
      .single();

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
    message: normalizeMessage(
      data as Record<string, unknown>,
    ),
    requiresTranslation:
      needsTranslation,
  });
}
