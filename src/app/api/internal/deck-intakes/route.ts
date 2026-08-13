import { NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const FIELDS = new Set([
  "idempotencyKey",
  "customerName",
  "phone",
  "email",
  "propertyAddress",
  "notes",
]);

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const authenticated = await getAuthenticatedAccess();
  if (!authenticated) return createUnauthorizedApiResponse(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !FIELDS.has(key))
    ) {
      return NextResponse.json(
        { success: false, error: "The request contains unsupported fields." },
        { status: 400 },
      );
    }

    const idempotencyKey = optionalText(body.idempotencyKey);
    const customerName = optionalText(body.customerName);
    const phone = optionalText(body.phone);
    const email = optionalText(body.email);
    const propertyAddress = optionalText(body.propertyAddress);
    const notes = optionalText(body.notes);
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      !customerName ||
      !phone
    ) {
      return NextResponse.json(
        { success: false, error: "Customer name and phone are required." },
        { status: 400 },
      );
    }

    const result = await createAdminServerClient().rpc(
      "create_internal_deck_intake",
      {
        requested_auth_user_id: authenticated.user.id,
        requested_idempotency_key: idempotencyKey,
        requested_customer_name: customerName,
        requested_phone: phone,
        requested_email: email,
        requested_property_address: propertyAddress,
        requested_notes: notes,
      },
    );
    if (result.error) {
      console.error("Internal Deck intake failed:", result.error);
      return NextResponse.json(
        {
          success: false,
          error: "The onsite Deck intake could not be created.",
        },
        { status: 500 },
      );
    }

    const row = (result.data as Record<string, unknown>[] | null)?.[0];
    if (!row || row.result_code === "forbidden") {
      return NextResponse.json(
        { success: false, error: "Onsite Deck intake access is required." },
        { status: 403 },
      );
    }
    if (row.result_code === "idempotency_conflict") {
      return NextResponse.json(
        {
          success: false,
          error:
            "This submission key was already used for different intake details. Refresh and try again.",
        },
        { status: 409 },
      );
    }
    if (row.result_code !== "ok" || typeof row.estimate_id !== "string") {
      return NextResponse.json(
        { success: false, error: "Check the customer details and try again." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        leadId: row.lead_id,
        customerId: row.customer_id,
        estimateId: row.estimate_id,
        idempotentReplay: row.idempotent_replay === true,
      },
      { status: row.idempotent_replay === true ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof SyntaxError
            ? "A valid JSON request is required."
            : "The onsite Deck intake could not be created.",
      },
      { status: error instanceof SyntaxError ? 400 : 500 },
    );
  }
}
