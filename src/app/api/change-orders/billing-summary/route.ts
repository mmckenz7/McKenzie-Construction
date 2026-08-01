import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  createBillingSummaryResponse,
  getChangeOrderReportingErrorResponse,
} from "@/lib/change-order-reporting-api";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

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

  const { data, error } =
    await supabase.rpc(
      "get_company_change_order_billing_summary",
      {
        requested_auth_user_id:
          authUser.id,
      },
    );

  if (error) {
    const errorResponse =
      getChangeOrderReportingErrorResponse(
        error,
      );

    return NextResponse.json(
      errorResponse.body,
      {
        status: errorResponse.status,
      },
    );
  }

  return NextResponse.json(
    createBillingSummaryResponse(
      data,
    ),
  );
}
