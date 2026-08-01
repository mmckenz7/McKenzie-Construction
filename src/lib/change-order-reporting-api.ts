export const CHANGE_ORDER_REPORTING_FORBIDDEN_MESSAGE =
  "You do not have permission to view change-order financial reporting.";

type RpcError = {
  code?: string;
  message: string;
};

export function getChangeOrderReportingErrorResponse(
  error: RpcError,
) {
  if (error.code === "42501") {
    return {
      status: 403,
      body: {
        success: false as const,
        error:
          CHANGE_ORDER_REPORTING_FORBIDDEN_MESSAGE,
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false as const,
      error: error.message,
    },
  };
}

export function createBillingSummaryResponse(
  data: unknown,
) {
  return {
    success: true as const,
    summary: data ?? {},
  };
}

export type ChangeOrderReceivableRow = {
  change_order_id: string;
  project_id: string;
  change_order_number:
    | number
    | string
    | null;
  title: string;
  status: string;
  billing_status: string;
  invoice_number: string | null;
  invoiced_at: string | null;
  invoice_due_date: string | null;
  amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  is_overdue: boolean;
  days_overdue: number | string | null;
};

function numberValue(
  value: unknown,
) {
  const converted =
    Number(value ?? 0);

  return Number.isFinite(converted)
    ? converted
    : 0;
}

export function createReceivablesResponse(
  records: ChangeOrderReceivableRow[],
  projectNames: Map<string, string>,
) {
  return {
    success: true as const,

    receivables: records.map(
      (record) => ({
        changeOrderId:
          record.change_order_id,

        projectId:
          record.project_id,

        projectName:
          projectNames.get(
            record.project_id,
          ) ?? "Project",

        changeOrderNumber:
          numberValue(
            record.change_order_number,
          ),

        title:
          record.title,

        status:
          record.status,

        billingStatus:
          record.billing_status,

        invoiceNumber:
          record.invoice_number,

        invoicedAt:
          record.invoiced_at,

        invoiceDueDate:
          record.invoice_due_date,

        amount:
          numberValue(
            record.amount,
          ),

        amountPaid:
          numberValue(
            record.amount_paid,
          ),

        balanceDue:
          numberValue(
            record.balance_due,
          ),

        isOverdue:
          Boolean(
            record.is_overdue,
          ),

        daysOverdue:
          numberValue(
            record.days_overdue,
          ),
      }),
    ),
  };
}
