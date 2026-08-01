import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANGE_ORDER_REPORTING_FORBIDDEN_MESSAGE,
  createBillingSummaryResponse,
  createReceivablesResponse,
  getChangeOrderReportingErrorResponse,
} from "../src/lib/change-order-reporting-api.ts";

test("authorized billing summary preserves the caller response shape", () => {
  const summary = {
    approved_amount: 100,
    invoiced_amount: 90,
    collected_amount: 40,
    balance_due: 50,
    not_billed_amount: 10,
    overdue_amount: 20,
    invoice_count: 3,
    unpaid_invoice_count: 2,
    paid_invoice_count: 1,
    overdue_invoice_count: 1,
    not_billed_count: 1,
    collection_percent: 44.4,
  };

  assert.deepEqual(
    createBillingSummaryResponse(
      summary,
    ),
    {
      success: true,
      summary,
    },
  );
});

test("authorized receivables map every field expected by the caller", () => {
  const response =
    createReceivablesResponse(
      [
        {
          change_order_id: "change-order-id",
          project_id: "project-id",
          change_order_number: "7",
          title: "Approved work",
          status: "approved",
          billing_status: "invoiced",
          invoice_number: "INV-7",
          invoiced_at: "2026-08-01T00:00:00Z",
          invoice_due_date: "2026-08-16",
          amount: "1250.50",
          amount_paid: "250.50",
          balance_due: "1000",
          is_overdue: false,
          days_overdue: null,
        },
      ],
      new Map([
        ["project-id", "Project Name"],
      ]),
    );

  assert.deepEqual(
    Object.keys(response.receivables[0]),
    [
      "changeOrderId",
      "projectId",
      "projectName",
      "changeOrderNumber",
      "title",
      "status",
      "billingStatus",
      "invoiceNumber",
      "invoicedAt",
      "invoiceDueDate",
      "amount",
      "amountPaid",
      "balanceDue",
      "isOverdue",
      "daysOverdue",
    ],
  );
  assert.equal(
    response.receivables[0].amount,
    1250.5,
  );
  assert.equal(
    response.receivables[0].daysOverdue,
    0,
  );
});

test("PostgreSQL 42501 maps to a safe HTTP 403 response", () => {
  const financialData = {
    balance_due: 1000000,
  };
  const response =
    getChangeOrderReportingErrorResponse(
      {
        code: "42501",
        message:
          `Denied: ${JSON.stringify(financialData)}`,
      },
    );

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    success: false,
    error:
      CHANGE_ORDER_REPORTING_FORBIDDEN_MESSAGE,
  });
  assert.equal(
    JSON.stringify(response.body).includes(
      "balance_due",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(response.body).includes(
      "1000000",
    ),
    false,
  );
});

test("unexpected RPC failures remain HTTP 500", () => {
  const response =
    getChangeOrderReportingErrorResponse(
      {
        code: "XX000",
        message: "Unexpected database failure",
      },
    );

  assert.deepEqual(response, {
    status: 500,
    body: {
      success: false,
      error: "Unexpected database failure",
    },
  });
});
