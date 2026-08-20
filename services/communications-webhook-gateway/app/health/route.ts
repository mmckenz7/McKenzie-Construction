export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ service: "communications-webhook-gateway", status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
