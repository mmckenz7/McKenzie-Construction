import { NextResponse } from "next/server.js";

export const PUBLIC_LINK_UNAVAILABLE_MESSAGE =
  "This link is invalid or no longer available.";

export const PUBLIC_REQUEST_FAILED_MESSAGE =
  "The request could not be completed.";

export const PUBLIC_TOKEN_MAX_BODY_BYTES = 32_768;

export function publicTokenJson(
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export function isPublicTokenBodyTooLarge(
  contentLength: string | null,
) {
  if (!contentLength) {
    return false;
  }

  const bytes = Number(contentLength);

  return (
    !Number.isFinite(bytes) ||
    bytes < 0 ||
    bytes > PUBLIC_TOKEN_MAX_BODY_BYTES
  );
}

export function createPublicTokenFailure(
  kind: "unavailable" | "unexpected",
) {
  return {
    status: kind === "unavailable" ? 404 : 500,
    headers: {
      "Cache-Control": "no-store",
    },
    body: {
      success: false,
      error:
        kind === "unavailable"
          ? PUBLIC_LINK_UNAVAILABLE_MESSAGE
          : PUBLIC_REQUEST_FAILED_MESSAGE,
    },
  };
}

type PublicTokenSupabaseFailure = {
  operation: string;
  routeCategory: string;
  method: "GET" | "POST";
  error: unknown;
  status: number;
};

export function logPublicTokenSupabaseFailure({
  operation,
  routeCategory,
  method,
  error,
  status,
}: PublicTokenSupabaseFailure) {
  const errorRecord = record(error);
  const code =
    typeof errorRecord.code === "string"
      ? errorRecord.code
      : null;

  console.error("public_token_supabase_failure", {
    operation,
    routeCategory,
    method,
    supabaseErrorCode: code,
    statusCategory: `${Math.floor(status / 100)}xx`,
  });
}

function record(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function minimizeChangeOrderPayload(
  value: unknown,
) {
  const source = record(value);
  const project = record(source.project);
  const lineItems = Array.isArray(source.line_items)
    ? source.line_items.map((item) => {
        const line = record(item);

        return {
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          sales_total: line.sales_total,
        };
      })
    : [];

  return {
    change_order_number: source.change_order_number,
    title: source.title,
    description: source.description,
    reason: source.reason,
    status: source.status,
    amount: source.amount,
    schedule_impact_days: source.schedule_impact_days,
    customer_notes: source.customer_notes,
    approved_by_name: source.approved_by_name,
    approved_at: source.approved_at,
    declined_at: source.declined_at,
    customer_response_notes: source.customer_response_notes,
    customer_acknowledged_terms:
      source.customer_acknowledged_terms,
    customer_agreement_text: source.customer_agreement_text,
    approval_expires_at: source.approval_expires_at,
    line_items: lineItems,
    project: {
      name: project.name,
      address: project.address,
    },
  };
}

export function minimizeVendorRequestPayload(
  value: unknown,
) {
  const source = record(value);
  const changeOrder = record(source.change_order);
  const project = record(source.project);

  return {
    request_status: source.request_status,
    recipient_type: source.recipient_type,
    recipient_name: source.recipient_name,
    recipient_company: source.recipient_company,
    requested_scope: source.requested_scope,
    requested_cost: source.requested_cost,
    requested_schedule: source.requested_schedule,
    requested_lead_time: source.requested_lead_time,
    requested_expiration_date:
      source.requested_expiration_date,
    requested_notes: source.requested_notes,
    due_at: source.due_at,
    expires_at: source.expires_at,
    change_order: {
      change_order_number: changeOrder.change_order_number,
      title: changeOrder.title,
      description: changeOrder.description,
      schedule_impact_days:
        changeOrder.schedule_impact_days,
    },
    project: {
      name: project.name,
      address: project.address,
    },
  };
}

export function minimizeMaterialReviewPayload(
  value: unknown,
) {
  const source = record(value);
  const project = record(source.project);
  const subcontractor = record(source.subcontractor);
  const items = Array.isArray(source.items)
    ? source.items.map((item) => {
        const material = record(item);

        return {
          id: material.id,
          item_name: material.item_name,
          description: material.description,
          quantity: material.quantity,
          unit: material.unit,
          display_order: material.display_order,
        };
      })
    : [];

  return {
    status: source.status,
    language: source.language,
    review_result: source.review_result,
    submitted_at: source.submitted_at,
    project: {
      name: project.name,
      address: project.address,
    },
    subcontractor: {
      name: subcontractor.name,
    },
    items,
  };
}

export function minimizeScheduleRequestPayload(
  value: unknown,
) {
  const source = record(value);
  const project = record(source.project);
  const subcontractor = record(source.subcontractor);

  return {
    status: source.status,
    language: source.language,
    earliest_demo_start: source.earliest_demo_start,
    earliest_construction_start:
      source.earliest_construction_start,
    demo_duration_days: source.demo_duration_days,
    total_duration_days: source.total_duration_days,
    notes_original: source.notes_original,
    submitted_at: source.submitted_at,
    project: {
      name: project.name,
      address: project.address,
    },
    subcontractor: {
      name: subcontractor.name,
    },
  };
}

export function minimizeEstimateProposalPayload(value: unknown) {
  const source = record(value);
  const snapshot = record(source.snapshot);
  const document = record(snapshot.document);
  const presentation = record(document.presentation);
  const company = record(snapshot.company);
  const rows = Array.isArray(presentation.rows)
    ? presentation.rows.map((value) => {
        const row = record(value);
        return {
          id: row.id,
          kind: row.kind,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
          totalCents: row.totalCents,
        };
      })
    : [];

  return {
    status: source.status,
    expiresAt: source.expires_at,
    openedAt: source.opened_at,
    respondedAt: source.responded_at,
    response: source.response,
    responseName: source.response_name,
    responseNotes: source.response_notes,
    acknowledgedNonbinding: source.acknowledged_nonbinding,
    customerName: snapshot.customerName,
    document: {
      title: document.title,
      description: document.description,
      propertyAddress: document.propertyAddress,
      validUntil: document.validUntil,
      scopeNotes: document.scopeNotes,
      exclusions: document.exclusions,
      customerNotes: document.customerNotes,
      presentation: {
        detailLevel: presentation.detailLevel,
        totalCents: presentation.totalCents,
        rows,
      },
    },
    company: {
      publicName: company.publicName,
      legalName: company.legalName,
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor,
      accentColor: company.accentColor,
      phone: company.phone,
      email: company.email,
      websiteUrl: company.websiteUrl,
    },
  };
}
