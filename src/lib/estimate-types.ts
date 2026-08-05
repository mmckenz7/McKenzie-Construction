export type EstimateCalculationPolicyVersion = "structured-estimate-v1";
export type DecimalString = string;

export type EstimateCostComponentsInput = {
  materialUnitCost: DecimalString | null;
  laborUnitCost: DecimalString | null;
  subcontractorUnitCost: DecimalString | null;
  equipmentUnitCost: DecimalString | null;
  otherDirectUnitCost: DecimalString | null;
};

type EstimateItemBaseInput = {
  id: string;
  customerDescription: string;
  quantity: DecimalString;
  unit: string;
  wastePercent: DecimalString;
  taxable: boolean;
  included: boolean;
  costs: EstimateCostComponentsInput;
};

export type StandardEstimateItemInput = EstimateItemBaseInput & {
  kind: "standard";
  itemMarkupPercent: DecimalString;
};

export type AllowanceEstimateItemInput = EstimateItemBaseInput & {
  kind: "allowance";
  fixedCustomerPrice: DecimalString;
};

export type EstimateItemInput = StandardEstimateItemInput | AllowanceEstimateItemInput;

export type EstimateCalculationInput = {
  items: readonly EstimateItemInput[];
  overheadPercent: DecimalString;
  profitMarkupPercent: DecimalString;
  discountAmount: DecimalString;
  taxPercent: DecimalString;
};

/** Internal fixed-point values. Never serialize this type directly. */
export type InternalEstimateComponentCosts = {
  materialCostCents: bigint | null;
  laborCostCents: bigint | null;
  subcontractorCostCents: bigint | null;
  equipmentCostCents: bigint | null;
  otherDirectCostCents: bigint | null;
};

/** Internal fixed-point values. Never serialize this type directly. */
export type InternalEstimateItemCalculation = {
  id: string;
  kind: EstimateItemInput["kind"];
  customerDescription: string;
  unit: string;
  included: boolean;
  taxable: boolean;
  quantityUnits: bigint;
  adjustedMaterialQuantityUnits: bigint;
  componentCosts: InternalEstimateComponentCosts;
  directCostCents: bigint | null;
  itemMarkupCents: bigint | null;
  customerPriceCents: bigint | null;
  costsComplete: boolean;
};

/** Canonical internal result. Convert with projectEstimateCalculation at boundaries. */
export type InternalEstimateCalculation = {
  policyVersion: EstimateCalculationPolicyVersion;
  items: readonly InternalEstimateItemCalculation[];
  costsComplete: boolean;
  pricesComplete: boolean;
  directCostCents: bigint | null;
  itemMarkupTotalCents: bigint | null;
  itemPriceSubtotalCents: bigint | null;
  taxableItemPriceSubtotalCents: bigint | null;
  overheadCents: bigint | null;
  preProfitSubtotalCents: bigint | null;
  profitMarkupCents: bigint | null;
  preDiscountCustomerSubtotalCents: bigint | null;
  discountCents: bigint | null;
  postDiscountSubtotalCents: bigint | null;
  taxableOverheadCents: bigint | null;
  taxableProfitCents: bigint | null;
  taxableDiscountCents: bigint | null;
  taxableSubtotalCents: bigint | null;
  taxCents: bigint | null;
  customerTotalCents: bigint | null;
  grossProfitCents: bigint | null;
  grossMarginMilliPercent: bigint | null;
};

export type EstimateProjectionPermissions = {
  canViewCosts: boolean;
  canViewProfit: boolean;
};

export type SerializedEstimateComponentCosts = {
  readonly materialCostCents: string | null;
  readonly laborCostCents: string | null;
  readonly subcontractorCostCents: string | null;
  readonly equipmentCostCents: string | null;
  readonly otherDirectCostCents: string | null;
};

export type SerializedEstimateItemProjection = {
  readonly id: string;
  readonly kind: EstimateItemInput["kind"];
  readonly customerDescription: string;
  readonly unit: string;
  readonly included: boolean;
  readonly taxable: boolean;
  readonly quantity: string;
  readonly adjustedMaterialQuantity: string;
  readonly customerPriceCents: string | null;
  readonly costsComplete?: boolean;
  readonly componentCosts?: Readonly<SerializedEstimateComponentCosts>;
  readonly directCostCents?: string | null;
  readonly itemMarkupCents?: string | null;
};

/** JSON-safe projection: money is cent strings and fixed-point values are decimals. */
export type SerializedEstimateCalculationProjection = {
  readonly policyVersion: EstimateCalculationPolicyVersion;
  readonly items: readonly Readonly<SerializedEstimateItemProjection>[];
  readonly itemPriceSubtotalCents: string | null;
  readonly preDiscountCustomerSubtotalCents: string | null;
  readonly discountCents: string | null;
  readonly postDiscountSubtotalCents: string | null;
  readonly taxableSubtotalCents: string | null;
  readonly taxCents: string | null;
  readonly customerTotalCents: string | null;
  readonly costsComplete?: boolean;
  readonly pricesComplete?: boolean;
  readonly directCostCents?: string | null;
  readonly taxableItemPriceSubtotalCents?: string | null;
  readonly itemMarkupTotalCents?: string | null;
  readonly overheadCents?: string | null;
  readonly preProfitSubtotalCents?: string | null;
  readonly profitMarkupCents?: string | null;
  readonly taxableOverheadCents?: string | null;
  readonly taxableProfitCents?: string | null;
  readonly taxableDiscountCents?: string | null;
  readonly grossProfitCents?: string | null;
  readonly grossMarginPercent?: string | null;
};
