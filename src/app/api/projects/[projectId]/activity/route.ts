import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { loadContactCommunicationThreads } from "@/lib/communications/contact-threads";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeProject(
  value: Record<string, unknown>,
) {
  return {
    id: String(value.id ?? ""),
    name: String(
      value.name ??
        value.project_name ??
        value.title ??
        "Project",
    ),
    address: String(
      value.address ??
        value.project_address ??
        value.job_address ??
        "",
    ),
  };
}

function normalizeTeamMember(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.display_name ??
        record.full_name ??
        "Installer",
    ),
  };
}

function normalizeAppUser(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),
    name: String(
      record.display_name ??
        record.name ??
        record.email ??
        "Team member",
    ),
    email:
      typeof record.email === "string"
        ? record.email
        : null,
  };
}

export async function GET(
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

  const supabase =
    createAdminServerClient();

  const [
    projectResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single(),

    supabase
      .from("project_activity")
      .select(`
        *,
        team_members (*),
        app_users (*)
      `)
      .eq("project_id", projectId)
      .order("occurred_at", {
        ascending: false,
      })
      .limit(250),
  ]);

  if (
    projectResult.error ||
    !projectResult.data
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectResult.error
            ?.message ??
          "Project not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (activityResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          activityResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const activity = (
    activityResult.data ?? []
  ).map((record) => {
    const raw =
      record as Record<string, unknown>;

    return {
      id: String(raw.id ?? ""),
      activityType: String(
        raw.activity_type ?? "system",
      ),
      title: String(
        raw.title ?? "Project activity",
      ),
      description:
        typeof raw.description ===
        "string"
          ? raw.description
          : null,
      actorType: String(
        raw.actor_type ?? "system",
      ),
      actorAppUserId:
        typeof raw
          .actor_app_user_id ===
        "string"
          ? raw.actor_app_user_id
          : null,
      subcontractorId:
        typeof raw.subcontractor_id ===
        "string"
          ? raw.subcontractor_id
          : null,
      sourceTable:
        typeof raw.source_table ===
        "string"
          ? raw.source_table
          : null,
      sourceId:
        typeof raw.source_id ===
        "string"
          ? raw.source_id
          : null,
      metadata:
        raw.metadata &&
        typeof raw.metadata === "object"
          ? raw.metadata
          : {},
      occurredAt: String(
        raw.occurred_at ??
          raw.created_at ??
          "",
      ),
      createdAt: String(
        raw.created_at ?? "",
      ),
      subcontractor:
        normalizeTeamMember(
          raw.team_members,
        ),
      appUser: normalizeAppUser(
        raw.app_users,
      ),
    };
  });

  const projectCustomerId =
    typeof projectResult.data.customer_id === "string"
      ? projectResult.data.customer_id
      : null;

  let communicationActivity: typeof activity = [];

  if (projectCustomerId) {
    const customerResult = await supabase
      .from("customers")
      .select("id,source_lead_id,email,phone")
      .eq("id", projectCustomerId)
      .maybeSingle();

    if (!customerResult.error && customerResult.data) {
      const threads =
        await loadContactCommunicationThreads(
          supabase,
          {
            customerId: customerResult.data.id,
            leadId:
              customerResult.data.source_lead_id,
            email: customerResult.data.email,
            phone: customerResult.data.phone,
          },
        );

      if (threads.length) {
        const messagesResult = await supabase
          .from("communication_messages")
          .select("id,thread_id,channel,direction,subject,body,status,received_at,sent_at,created_at")
          .in(
            "thread_id",
            threads.map((thread) => thread.id),
          )
          .order("received_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("sent_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("created_at", {
            ascending: false,
          });

        if (!messagesResult.error) {
          const latestByThread = new Map<
            string,
            (typeof messagesResult.data)[number]
          >();

          for (const message of messagesResult.data ?? []) {
            if (
              message.thread_id &&
              !latestByThread.has(message.thread_id)
            ) {
              latestByThread.set(
                message.thread_id,
                message,
              );
            }
          }

          communicationActivity = threads.map(
            (thread) => {
              const latest = latestByThread.get(
                thread.id,
              );
              const occurredAt =
                latest?.received_at ??
                latest?.sent_at ??
                latest?.created_at ??
                thread.last_message_at;

              return {
                id: `communication:${thread.id}`,
                activityType:
                  latest?.direction === "inbound"
                    ? "communication_received"
                    : "communication_sent",
                title:
                  thread.subject ??
                  (thread.provider === "twilio"
                    ? "Text conversation"
                    : "Email conversation"),
                description:
                  latest?.body ?? null,
                actorType:
                  latest?.direction === "inbound"
                    ? "customer"
                    : "office",
                actorAppUserId: null,
                subcontractorId: null,
                sourceTable:
                  "communication_threads",
                sourceId: thread.id,
                metadata: {
                  channel:
                    latest?.channel ??
                    (thread.provider === "twilio"
                      ? "sms"
                      : "email"),
                  status:
                    latest?.status ?? thread.status,
                  relationship:
                    "exact_contact_identity",
                },
                occurredAt,
                createdAt: occurredAt,
                subcontractor: null,
                appUser: null,
              };
            },
          );
        }
      }
    }
  }

  const combinedActivity = [
    ...activity,
    ...communicationActivity,
  ]
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) -
        Date.parse(left.occurredAt),
    )
    .slice(0, 250);

  return NextResponse.json({
    success: true,
    project: normalizeProject(
      projectResult.data as Record<
        string,
        unknown
      >,
    ),
    activity: combinedActivity,
  });
}
