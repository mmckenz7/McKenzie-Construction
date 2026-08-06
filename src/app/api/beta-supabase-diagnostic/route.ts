import { NextResponse } from "next/server";

import {
  betaDiagnosticIsAvailable,
  runBetaSupabaseDiagnostic,
} from "@/lib/beta-supabase-diagnostic";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!betaDiagnosticIsAvailable()) {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const diagnostic =
    await runBetaSupabaseDiagnostic();

  return NextResponse.json(diagnostic, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
