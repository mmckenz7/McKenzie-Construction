export type FeatureKey =
  | "estimates"
  | "ai_estimator"
  | "change_orders"
  | "change_order_line_items"
  | "change_order_customer_approval"
  | "change_order_revisions"
  | "change_order_vendor_requests"
  | "change_order_billing"
  | "change_order_financial_details"
  | "change_order_activity_tracking"
  | "inspections"
  | "inspection_municipality_research"
  | "inspection_schedule_dependencies"
  | "inspection_document_extraction"
  | "inspection_partial_pass"
  | "inspection_corrections";

export type FeatureMap =
  Record<
    FeatureKey,
    boolean
  >;

export const DEFAULT_FEATURE_MAP: FeatureMap = {
  estimates: true,
  ai_estimator: false,
  change_orders: true,
  change_order_line_items: true,
  change_order_customer_approval: true,
  change_order_revisions: true,
  change_order_vendor_requests: true,
  change_order_billing: true,
  change_order_financial_details: true,
  change_order_activity_tracking: true,
  inspections: true,
  inspection_municipality_research: true,
  inspection_schedule_dependencies: true,
  inspection_document_extraction: true,
  inspection_partial_pass: true,
  inspection_corrections: true,
};
