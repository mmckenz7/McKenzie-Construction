import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAccessChangeOrderProject,
  changeOrderBelongsToProject,
  filterChangeOrderFinancialFields,
  hasChangeOrderPermission,
  isCustomerDecisionStatus,
} from "../src/lib/change-order-access-policy.ts";

const collectionRoute = readFileSync(
  "src/app/api/projects/[projectId]/change-orders/route.ts",
  "utf8",
);
const changeOrderRoute = readFileSync(
  "src/app/api/projects/[projectId]/change-orders/[changeOrderId]/route.ts",
  "utf8",
);
const approvalRoute = readFileSync(
  "src/app/api/projects/[projectId]/change-orders/[changeOrderId]/approval-link/route.ts",
  "utf8",
);
const accessHelper = readFileSync(
  "src/lib/change-order-access.ts",
  "utf8",
);
const apiAuth = readFileSync(
  "src/lib/api-auth.ts",
  "utf8",
);

test("target routes use active internal authentication", () => {
  for (const route of [
    collectionRoute,
    changeOrderRoute,
    approvalRoute,
  ]) {
    assert.match(
      route,
      /await getAuthenticatedAccess\(\)/,
    );
    assert.match(
      route,
      /createUnauthorizedApiResponse/,
    );
  }

  assert.match(
    apiAuth,
    /teamMember\.status !== "active"/,
  );
  assert.match(
    accessHelper,
    /get_effective_user_access/,
  );
  assert.match(
    accessHelper,
    /portal_access[\s\S]*?operations/,
  );
});

test("management and assigned project managers retain project access", () => {
  for (const role of [
    "owner",
    "admin",
    "administrator",
  ]) {
    assert.equal(
      canAccessChangeOrderProject(
        {
          teamMemberId:
            "team-member",
          roles: [role],
        },
        {
          project_manager_id:
            "another-member",
        },
      ),
      true,
    );
  }

  assert.equal(
    canAccessChangeOrderProject(
      {
        teamMemberId:
          "team-member",
        roles: ["project_manager"],
      },
      {
        project_manager_id:
          "team-member",
      },
    ),
    true,
  );
  assert.equal(
    canAccessChangeOrderProject(
      {
        teamMemberId:
          "team-member",
        roles: ["project_manager"],
      },
      {
        project_manager_id:
          "another-member",
      },
    ),
    false,
  );
  assert.equal(
    canAccessChangeOrderProject(
      {
        teamMemberId:
          "team-member",
        roles: ["project_manager"],
      },
      null,
    ),
    false,
  );
});

test("change-order membership rejects missing and cross-project records", () => {
  assert.equal(
    changeOrderBelongsToProject(
      {
        id: "change-order",
        project_id:
          "requested-project",
      },
      "requested-project",
    ),
    true,
  );
  assert.equal(
    changeOrderBelongsToProject(
      {
        id: "change-order",
        project_id: "other-project",
      },
      "requested-project",
    ),
    false,
  );
  assert.equal(
    changeOrderBelongsToProject(
      null,
      "requested-project",
    ),
    false,
  );
});

test("permission policy requires an explicit true value", () => {
  assert.equal(
    hasChangeOrderPermission(
      {
        permissions: {
          view_costs: true,
        },
      },
      "view_costs",
    ),
    true,
  );
  assert.equal(
    hasChangeOrderPermission(
      {
        permissions: {
          view_costs: false,
        },
      },
      "view_costs",
    ),
    false,
  );
  assert.equal(
    hasChangeOrderPermission(
      { permissions: {} },
      "view_costs",
    ),
    false,
  );
  assert.equal(
    hasChangeOrderPermission(
      {},
      "view_costs",
    ),
    false,
  );
});

test("only approved and declined are customer-decision statuses", () => {
  assert.equal(
    isCustomerDecisionStatus(
      "approved",
    ),
    true,
  );
  assert.equal(
    isCustomerDecisionStatus(
      "declined",
    ),
    true,
  );

  for (const status of [
    "draft",
    "pending_customer",
    "in_progress",
    "completed",
    "cancelled",
  ]) {
    assert.equal(
      isCustomerDecisionStatus(status),
      false,
      `${status} must remain an ordinary internal status`,
    );
  }
});

test("financial filtering is shallow, immutable, explicit, and preserves amount", () => {
  const nested = {
    costAmount: 25,
    profit: 75,
  };
  const record = {
    id: "change-order",
    amount: 1200,
    costAmount: 500,
    cost_amount: 500,
    profit: 700,
    profitAmount: 700,
    profit_amount: 700,
    nested,
    title: "Customer change",
  };

  const filtered =
    filterChangeOrderFinancialFields(
      record,
      false,
    );

  assert.notEqual(filtered, record);
  assert.equal(filtered.amount, 1200);
  assert.equal(filtered.title, record.title);
  assert.equal("costAmount" in filtered, false);
  assert.equal("cost_amount" in filtered, false);
  assert.equal("profit" in filtered, false);
  assert.equal("profitAmount" in filtered, false);
  assert.equal("profit_amount" in filtered, false);
  assert.equal(filtered.nested, nested);
  assert.deepEqual(filtered.nested, {
    costAmount: 25,
    profit: 75,
  });
  assert.equal(record.costAmount, 500);

  const visible =
    filterChangeOrderFinancialFields(
      record,
      true,
    );

  assert.equal(visible, record);
  assert.equal(visible.costAmount, 500);
  assert.equal(visible.cost_amount, 500);
  assert.equal(visible.profit, 700);
  assert.equal(visible.profitAmount, 700);
  assert.equal(visible.profit_amount, 700);
});

test("project and feature denial wiring remains safe and fixed-scope", () => {
  assert.match(
    accessHelper,
    /CHANGE_ORDER_PROJECT_FORBIDDEN_BODY =\s*INSPECTION_PROJECT_FORBIDDEN_BODY/,
  );
  assert.match(
    accessHelper,
    /!canAccessChangeOrderProject\([\s\S]*?CHANGE_ORDER_PROJECT_FORBIDDEN_BODY[\s\S]*?status: 403/,
  );
  assert.match(
    accessHelper,
    /changeOrderBelongsToProject\([\s\S]*?CHANGE_ORDER_NOT_FOUND_BODY[\s\S]*?status: 404/,
  );
  assert.match(
    accessHelper,
    /scopeType: "global"[\s\S]*?scopeId: "default"/,
  );
  assert.match(
    accessHelper,
    /if \(!features\.change_orders\)/,
  );
  assert.doesNotMatch(
    accessHelper,
    /getFeatureScopeFromRequest|checkApiFeature/,
  );
});

test("approval-link wiring retains specialized feature and permission guards", () => {
  assert.match(
    approvalRoute,
    /change_order_customer_approval/,
  );
  assert.match(
    approvalRoute,
    /canApproveChangeOrders[\s\S]*?CHANGE_ORDER_APPROVAL_FORBIDDEN_BODY[\s\S]*?status: 403/,
  );
  assert.ok(
    approvalRoute.indexOf(
      "canApproveChangeOrders",
    ) <
      approvalRoute.indexOf(
        ".update({",
      ),
  );
});

test("cost and approval guards occur before route mutations", () => {
  assert.match(
    collectionRoute,
    /costAmount !== null[\s\S]*?canViewCosts/,
  );
  assert.match(
    changeOrderRoute,
    /"costAmount" in body[\s\S]*?canViewCosts/,
  );
  assert.match(
    collectionRoute,
    /pending_customer[\s\S]*?canApproveChangeOrders/,
  );
  assert.match(
    changeOrderRoute,
    /approvalRelatedEdit[\s\S]*?canApproveChangeOrders/,
  );
  assert.match(
    changeOrderRoute,
    /isCustomerDecisionStatus\([\s\S]*?body\.status/,
  );
  assert.ok(
    collectionRoute.indexOf(
      "costAmount !== null",
    ) < collectionRoute.indexOf(".insert({"),
  );
  assert.ok(
    changeOrderRoute.indexOf(
      '"costAmount" in body',
    ) < changeOrderRoute.indexOf(".update(update)"),
  );
});

test("every target handler invokes the shared authorization boundary", () => {
  assert.equal(
    collectionRoute.match(
      /await authorizeChangeOrderProjectRequest\(/g,
    )?.length,
    2,
  );
  assert.equal(
    changeOrderRoute.match(
      /await authorizeChangeOrderProjectRequest\(/g,
    )?.length,
    1,
  );
  assert.equal(
    approvalRoute.match(
      /await authorizeChangeOrderProjectRequest\(/g,
    )?.length,
    1,
  );
});
