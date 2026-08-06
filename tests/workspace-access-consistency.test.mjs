import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceAccessSource = await readFile(
  new URL(
    "../src/lib/workspace-access.ts",
    import.meta.url,
  ),
  "utf8",
);

const portalAccessSource = await readFile(
  new URL(
    "../src/app/api/me/access/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("layouts and portal resolve workspace access through the same trusted boundary", () => {
  assert.match(
    workspaceAccessSource,
    /getAuthenticatedApiUser/,
  );
  assert.match(
    workspaceAccessSource,
    /createAdminServerClient/,
  );
  assert.doesNotMatch(
    workspaceAccessSource,
    /createAuthenticatedServerClient/,
  );

  assert.match(
    portalAccessSource,
    /createAuthenticatedServerClient/,
  );
  assert.match(
    portalAccessSource,
    /createAdminServerClient/,
  );
  assert.match(
    workspaceAccessSource,
    /get_effective_user_access/,
  );
  assert.match(
    portalAccessSource,
    /get_effective_user_access/,
  );
});

test("portal access distinguishes a missing employee role from a missing login", async () => {
  const accessRouteSource = await readFile(
    new URL(
      "../src/app/api/me/access/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    accessRouteSource,
    /authenticatedSupabase\.auth\.getUser/,
  );
  assert.match(
    accessRouteSource,
    /not linked to an active employee role/,
  );
  assert.match(
    accessRouteSource,
    /status: 403/,
  );
  assert.match(
    accessRouteSource,
    /needsProfile: true/,
  );
});
