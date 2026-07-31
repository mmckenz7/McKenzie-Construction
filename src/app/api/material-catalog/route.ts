import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type MaterialBody = {
  id?: unknown;
  sku?: unknown;
  category?: unknown;
  description?: unknown;
  brand?: unknown;
  productLine?: unknown;
  unit?: unknown;
  unitCost?: unknown;
  wastePercent?: unknown;
  isActive?: unknown;

  supplierId?: unknown;
  supplierLocationId?: unknown;
  supplierSku?: unknown;
  manufacturerSku?: unknown;
  priceType?: unknown;
  sourceType?: unknown;
  sourceReference?: unknown;
  effectiveAt?: unknown;
  expiresAt?: unknown;
  confidence?: unknown;
};

type MaterialInsert = {
  sku: string | null;
  category: string;
  description: string;
  brand: string | null;
  product_line: string | null;
  unit: string;
  unit_cost: number;
  waste_percent: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
};

type SupplierPriceInsert = {
  material_catalog_id: string;
  supplier_id: string;
  supplier_location_id: string | null;
  supplier_sku: string | null;
  manufacturer_sku: string | null;
  unit: string;
  unit_cost: number;
  quantity_available: number | null;
  minimum_order_quantity: number | null;
  delivery_cost: number | null;
  delivery_minimum: number | null;
  price_type:
    | "retail"
    | "contract"
    | "quoted"
    | "promotional"
    | "estimated";
  effective_at: string;
  expires_at: string | null;
  last_checked_at: string;
  source_type:
    | "manual"
    | "csv"
    | "supplier_quote"
    | "api"
    | "web_lookup"
    | "estimate_snapshot";
  source_reference: string | null;
  confidence:
    | "verified"
    | "confirmed"
    | "probable"
    | "unverified";
  is_active: boolean;
  metadata: Record<string, unknown>;
};

type CsvRow = Record<string, string>;

const materialSelect = `
  id,
  sku,
  category,
  description,
  brand,
  product_line,
  unit,
  unit_cost,
  waste_percent,
  is_active,
  metadata,
  created_at,
  updated_at
`;

const supplierPriceSelect = `
  id,
  material_catalog_id,
  supplier_id,
  supplier_location_id,
  supplier_sku,
  manufacturer_sku,
  unit,
  unit_cost,
  quantity_available,
  minimum_order_quantity,
  delivery_cost,
  delivery_minimum,
  price_type,
  effective_at,
  expires_at,
  last_checked_at,
  source_type,
  source_reference,
  confidence,
  is_active,
  metadata,
  created_at,
  updated_at,
  suppliers (
    id,
    name,
    slug
  ),
  supplier_locations (
    id,
    name,
    store_number,
    city,
    state
  )
`;

const priceTypes = [
  "retail",
  "contract",
  "quoted",
  "promotional",
  "estimated",
] as const;

const sourceTypes = [
  "manual",
  "csv",
  "supplier_quote",
  "api",
  "web_lookup",
  "estimate_snapshot",
] as const;

const confidenceValues = [
  "verified",
  "confirmed",
  "probable",
  "unverified",
] as const;

function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(
  value: unknown,
): string | null | undefined {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || null;
}

function normalizeBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (
      ["true", "yes", "1", "active", "on"].includes(
        normalized,
      )
    ) {
      return true;
    }

    if (
      ["false", "no", "0", "inactive", "off"].includes(
        normalized,
      )
    ) {
      return false;
    }
  }

  return fallback;
}

function normalizeNumber(
  value: unknown,
  options?: {
    minimum?: number;
    maximum?: number;
    decimals?: number;
  },
): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(
            value
              .replaceAll("$", "")
              .replaceAll(",", "")
              .replaceAll("%", "")
              .trim(),
          )
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (
    options?.minimum !== undefined &&
    parsed < options.minimum
  ) {
    return undefined;
  }

  if (
    options?.maximum !== undefined &&
    parsed > options.maximum
  ) {
    return undefined;
  }

  const decimals = options?.decimals ?? 4;
  const multiplier = 10 ** decimals;

  return Math.round(parsed * multiplier) / multiplier;
}

function normalizeOptionalNumber(
  value: unknown,
  options?: {
    minimum?: number;
    maximum?: number;
    decimals?: number;
  },
): number | null | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return normalizeNumber(value, options);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeDateTime(
  value: unknown,
  fallback?: string,
): string | null | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback ?? null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (character === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if (
      (character === "\n" || character === "\r") &&
      !quoted
    ) {
      if (
        character === "\r" &&
        nextCharacter === "\n"
      ) {
        index += 1;
      }

      row.push(value);

      if (row.some((entry) => entry.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  row.push(value);

  if (row.some((entry) => entry.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        row[index]?.trim() ?? "",
      ]),
    ),
  );
}

function firstValue(
  row: CsvRow,
  names: string[],
): string {
  for (const name of names) {
    const value = row[name];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function validateMaterial(
  body: MaterialBody,
):
  | {
      success: true;
      value: MaterialInsert;
    }
  | {
      success: false;
      error: string;
    } {
  const category = requiredText(body.category);
  const description = requiredText(body.description);
  const unit = requiredText(body.unit);

  const unitCost = normalizeNumber(body.unitCost ?? 0, {
    minimum: 0,
    decimals: 4,
  });

  const wastePercent = normalizeNumber(
    body.wastePercent ?? 0,
    {
      minimum: 0,
      maximum: 100,
      decimals: 3,
    },
  );

  if (!category) {
    return {
      success: false,
      error: "Material category is required.",
    };
  }

  if (!description) {
    return {
      success: false,
      error: "Material description is required.",
    };
  }

  if (!unit) {
    return {
      success: false,
      error: "Material unit is required.",
    };
  }

  if (unitCost === undefined) {
    return {
      success: false,
      error: "Unit cost must be zero or greater.",
    };
  }

  if (wastePercent === undefined) {
    return {
      success: false,
      error: "Waste percent must be between 0 and 100.",
    };
  }

  const sku = optionalText(body.sku);
  const brand = optionalText(body.brand);
  const productLine = optionalText(body.productLine);

  if (
    sku === undefined ||
    brand === undefined ||
    productLine === undefined
  ) {
    return {
      success: false,
      error: "One or more material text fields are invalid.",
    };
  }

  return {
    success: true,
    value: {
      sku,
      category,
      description,
      brand,
      product_line: productLine,
      unit,
      unit_cost: unitCost,
      waste_percent: wastePercent,
      is_active: normalizeBoolean(body.isActive, true),
      metadata: {},
    },
  };
}

function validateSupplierPrice(
  body: MaterialBody,
  materialId: string,
):
  | {
      success: true;
      value: SupplierPriceInsert;
    }
  | {
      success: false;
      error: string;
    } {
  const supplierId = requiredText(body.supplierId);

  if (!isUuid(supplierId)) {
    return {
      success: false,
      error: "A valid supplier is required.",
    };
  }

  const supplierLocationId = optionalText(
    body.supplierLocationId,
  );

  if (
    supplierLocationId !== null &&
    supplierLocationId !== undefined &&
    !isUuid(supplierLocationId)
  ) {
    return {
      success: false,
      error: "Supplier location is invalid.",
    };
  }

  const unit = requiredText(body.unit);
  const unitCost = normalizeNumber(body.unitCost, {
    minimum: 0,
    decimals: 4,
  });

  if (!unit) {
    return {
      success: false,
      error: "Supplier-price unit is required.",
    };
  }

  if (unitCost === undefined) {
    return {
      success: false,
      error: "Supplier unit cost must be zero or greater.",
    };
  }

  const priceType = requiredText(body.priceType) || "retail";
  const sourceType = requiredText(body.sourceType) || "manual";
  const confidence =
    requiredText(body.confidence) || "confirmed";

  if (
    !priceTypes.includes(
      priceType as (typeof priceTypes)[number],
    )
  ) {
    return {
      success: false,
      error: "Price type is invalid.",
    };
  }

  if (
    !sourceTypes.includes(
      sourceType as (typeof sourceTypes)[number],
    )
  ) {
    return {
      success: false,
      error: "Price source type is invalid.",
    };
  }

  if (
    !confidenceValues.includes(
      confidence as (typeof confidenceValues)[number],
    )
  ) {
    return {
      success: false,
      error: "Price confidence is invalid.",
    };
  }

  const effectiveAt = normalizeDateTime(
    body.effectiveAt,
    new Date().toISOString(),
  );

  const expiresAt = normalizeDateTime(body.expiresAt);

  if (
    effectiveAt === undefined ||
    expiresAt === undefined
  ) {
    return {
      success: false,
      error: "Price date is invalid.",
    };
  }

  const supplierSku = optionalText(body.supplierSku);
  const manufacturerSku = optionalText(
    body.manufacturerSku,
  );
  const sourceReference = optionalText(
    body.sourceReference,
  );

  if (
    supplierSku === undefined ||
    manufacturerSku === undefined ||
    sourceReference === undefined
  ) {
    return {
      success: false,
      error: "One or more supplier-price fields are invalid.",
    };
  }

  return {
    success: true,
    value: {
      material_catalog_id: materialId,
      supplier_id: supplierId,
      supplier_location_id: supplierLocationId ?? null,
      supplier_sku: supplierSku,
      manufacturer_sku: manufacturerSku,
      unit,
      unit_cost: unitCost,
      quantity_available: null,
      minimum_order_quantity: null,
      delivery_cost: null,
      delivery_minimum: null,
      price_type:
        priceType as SupplierPriceInsert["price_type"],
      effective_at: effectiveAt ?? new Date().toISOString(),
      expires_at: expiresAt ?? null,
      last_checked_at: new Date().toISOString(),
      source_type:
        sourceType as SupplierPriceInsert["source_type"],
      source_reference: sourceReference,
      confidence:
        confidence as SupplierPriceInsert["confidence"],
      is_active: true,
      metadata: {},
    },
  };
}

async function getProcurementSettings() {
  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("procurement_settings")
    .select("*")
    .order("created_at", {
      ascending: true,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function choosePrice(
  prices: Record<string, unknown>[],
  settings: Record<string, unknown> | null,
) {
  const now = Date.now();
  const maximumPriceAgeDays =
    Number(settings?.maximum_price_age_days ?? 30) || 30;

  const maximumAge =
    maximumPriceAgeDays * 24 * 60 * 60 * 1000;

  const usable = prices.filter((price) => {
    if (!price.is_active) {
      return false;
    }

    const expiresAt =
      typeof price.expires_at === "string"
        ? new Date(price.expires_at).getTime()
        : null;

    if (expiresAt && expiresAt < now) {
      return false;
    }

    const checkedAt =
      typeof price.last_checked_at === "string"
        ? new Date(price.last_checked_at).getTime()
        : 0;

    return now - checkedAt <= maximumAge;
  });

  if (usable.length === 0) {
    return null;
  }

  const strategy = String(
    settings?.default_pricing_strategy ??
      "best_available",
  );

  const preferredSupplierId =
    typeof settings?.preferred_supplier_id === "string"
      ? settings.preferred_supplier_id
      : null;

  const preferredLocationId =
    typeof settings?.preferred_supplier_location_id ===
    "string"
      ? settings.preferred_supplier_location_id
      : null;

  const lowesSupplierId =
    typeof settings?.lowes_supplier_id === "string"
      ? settings.lowes_supplier_id
      : null;

  const lowesLocationId =
    typeof settings?.lowes_fallback_location_id ===
    "string"
      ? settings.lowes_fallback_location_id
      : null;

  const byLowestCost = (
    first: Record<string, unknown>,
    second: Record<string, unknown>,
  ) =>
    Number(first.unit_cost ?? 0) -
    Number(second.unit_cost ?? 0);

  if (
    strategy === "preferred_supplier" &&
    preferredSupplierId
  ) {
    const preferred = usable
      .filter(
        (price) =>
          price.supplier_id === preferredSupplierId &&
          (!preferredLocationId ||
            price.supplier_location_id ===
              preferredLocationId),
      )
      .sort(byLowestCost);

    if (preferred.length > 0) {
      return preferred[0];
    }
  }

  if (
    strategy === "lowes_fallback" &&
    lowesSupplierId
  ) {
    const lowes = usable
      .filter(
        (price) =>
          price.supplier_id === lowesSupplierId &&
          (!lowesLocationId ||
            price.supplier_location_id ===
              lowesLocationId),
      )
      .sort(byLowestCost);

    if (lowes.length > 0) {
      return lowes[0];
    }
  }

  return [...usable].sort(byLowestCost)[0];
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  const searchParams = request.nextUrl.searchParams;

  const query = searchParams.get("q")?.trim() ?? "";
  const category =
    searchParams.get("category")?.trim() ?? "";
  const active = searchParams.get("active");
  const includePrices =
    searchParams.get("includePrices") !== "false";

  const supabase = createAdminServerClient();

  let materialQuery = supabase
    .from("material_catalog")
    .select(materialSelect)
    .order("category", {
      ascending: true,
    })
    .order("description", {
      ascending: true,
    });

  if (category) {
    materialQuery = materialQuery.eq(
      "category",
      category,
    );
  }

  if (active === "true") {
    materialQuery = materialQuery.eq("is_active", true);
  }

  if (active === "false") {
    materialQuery = materialQuery.eq("is_active", false);
  }

  if (query) {
    const safeQuery = query.replaceAll(",", " ");

    materialQuery = materialQuery.or(
      [
        `description.ilike.%${safeQuery}%`,
        `sku.ilike.%${safeQuery}%`,
        `brand.ilike.%${safeQuery}%`,
        `product_line.ilike.%${safeQuery}%`,
      ].join(","),
    );
  }

  const { data: materials, error } =
    await materialQuery;

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!includePrices || !materials?.length) {
    return NextResponse.json({
      success: true,
      materials: materials ?? [],
    });
  }

  const materialIds = materials.map(
    (material) => material.id,
  );

  const { data: prices, error: priceError } =
    await supabase
      .from("material_supplier_prices")
      .select(supplierPriceSelect)
      .in("material_catalog_id", materialIds)
      .eq("is_active", true);

  if (priceError) {
    return NextResponse.json(
      {
        success: false,
        error: priceError.message,
      },
      {
        status: 500,
      },
    );
  }

  let settings = null;

  try {
    settings = await getProcurementSettings();
  } catch {
    settings = null;
  }

  const pricesByMaterial = new Map<
    string,
    Record<string, unknown>[]
  >();

  for (const price of prices ?? []) {
    const existing =
      pricesByMaterial.get(price.material_catalog_id) ??
      [];

    existing.push(price);
    pricesByMaterial.set(
      price.material_catalog_id,
      existing,
    );
  }

  const enrichedMaterials = materials.map((material) => {
    const materialPrices =
      pricesByMaterial.get(material.id) ?? [];

    const selectedPrice = choosePrice(
      materialPrices,
      settings,
    );

    return {
      ...material,
      supplier_prices: materialPrices,
      selected_price: selectedPrice,
      effective_unit_cost: selectedPrice
        ? Number(selectedPrice.unit_cost)
        : Number(material.unit_cost),
      price_source: selectedPrice
        ? "supplier_price"
        : "catalog_fallback",
      needs_live_lookup:
        !selectedPrice &&
        Boolean(settings?.allow_web_lookup),
    };
  });

  return NextResponse.json({
    success: true,
    materials: enrichedMaterials,
    procurementSettings: settings,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  const contentType =
    request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return importCsv(request, user.id);
  }

  let body: MaterialBody;

  try {
    body = (await request.json()) as MaterialBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const validated = validateMaterial(body);

  if (!validated.success) {
    return NextResponse.json(
      {
        success: false,
        error: validated.error,
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const { data: material, error } = await supabase
    .from("material_catalog")
    .insert({
      ...validated.value,
      metadata: {
        created_from: "material_catalog_api",
        created_by_auth_user_id: user.id,
      },
    })
    .select(materialSelect)
    .single();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  let supplierPrice = null;

  if (body.supplierId) {
    const priceValidation = validateSupplierPrice(
      body,
      material.id,
    );

    if (!priceValidation.success) {
      await supabase
        .from("material_catalog")
        .delete()
        .eq("id", material.id);

      return NextResponse.json(
        {
          success: false,
          error: priceValidation.error,
        },
        {
          status: 400,
        },
      );
    }

    const { data: createdPrice, error: priceError } =
      await supabase
        .from("material_supplier_prices")
        .insert({
          ...priceValidation.value,
          metadata: {
            created_from: "material_catalog_api",
            created_by_auth_user_id: user.id,
          },
        })
        .select(supplierPriceSelect)
        .single();

    if (priceError) {
      await supabase
        .from("material_catalog")
        .delete()
        .eq("id", material.id);

      return NextResponse.json(
        {
          success: false,
          error: priceError.message,
        },
        {
          status: 500,
        },
      );
    }

    supplierPrice = createdPrice;
  }

  return NextResponse.json(
    {
      success: true,
      material,
      supplierPrice,
    },
    {
      status: 201,
    },
  );
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  let body: MaterialBody;

  try {
    body = (await request.json()) as MaterialBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const id = requiredText(body.id);

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid material ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const validated = validateMaterial(body);

  if (!validated.success) {
    return NextResponse.json(
      {
        success: false,
        error: validated.error,
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const {
    data: existingMaterial,
    error: existingError,
  } = await supabase
    .from("material_catalog")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      {
        success: false,
        error: existingError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existingMaterial) {
    return NextResponse.json(
      {
        success: false,
        error: "Material not found.",
      },
      {
        status: 404,
      },
    );
  }

  const existingMetadata =
    existingMaterial.metadata &&
    typeof existingMaterial.metadata === "object" &&
    !Array.isArray(existingMaterial.metadata)
      ? existingMaterial.metadata
      : {};

  const { data, error } = await supabase
    .from("material_catalog")
    .update({
      ...validated.value,
      metadata: {
        ...existingMetadata,
        updated_from: "material_catalog_api",
        updated_by_auth_user_id: user.id,
        updated_at: new Date().toISOString(),
      },
    })
    .eq("id", id)
    .select(materialSelect)
    .single();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    material: data,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  const id =
    request.nextUrl.searchParams.get("id")?.trim() ?? "";

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid material ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("material_catalog")
    .update({
      is_active: false,
      metadata: {
        deactivated_from: "material_catalog_api",
        deactivated_by_auth_user_id: user.id,
        deactivated_at: new Date().toISOString(),
      },
    })
    .eq("id", id)
    .select(materialSelect)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error: "Material not found.",
      },
      {
        status: 404,
      },
    );
  }

  await supabase
    .from("material_supplier_prices")
    .update({
      is_active: false,
    })
    .eq("material_catalog_id", id);

  return NextResponse.json({
    success: true,
    material: data,
  });
}

async function importCsv(
  request: NextRequest,
  userId: string,
) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "The uploaded CSV could not be read.",
      },
      {
        status: 400,
      },
    );
  }

  const file = formData.get("file");
  const supplierId = String(
    formData.get("supplierId") ?? "",
  ).trim();
  const supplierLocationId =
    String(
      formData.get("supplierLocationId") ?? "",
    ).trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        success: false,
        error: "Choose a CSV file to import.",
      },
      {
        status: 400,
      },
    );
  }

  if (!isUuid(supplierId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Choose a valid supplier.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    supplierLocationId &&
    !isUuid(supplierLocationId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Supplier location is invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const csvText = await file.text();
  const rows = rowsToObjects(parseCsv(csvText));

  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The CSV must contain a header row and at least one material row.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  const {
    data: importRecord,
    error: importError,
  } = await supabase
    .from("material_price_imports")
    .insert({
      supplier_id: supplierId,
      supplier_location_id: supplierLocationId,
      import_type: "csv",
      original_filename: file.name,
      status: "processing",
      total_rows: rows.length,
      created_by_auth_user_id: userId,
      extraction_data: {
        headers: Object.keys(rows[0] ?? {}),
      },
    })
    .select("*")
    .single();

  if (importError) {
    return NextResponse.json(
      {
        success: false,
        error: importError.message,
      },
      {
        status: 500,
      },
    );
  }

  const rowErrors: {
    row: number;
    error: string;
  }[] = [];

  let importedRows = 0;
  let reviewRows = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    const description = firstValue(row, [
      "description",
      "item_description",
      "product",
      "item",
      "name",
    ]);

    const category =
      firstValue(row, [
        "category",
        "department",
        "material_category",
      ]) || "Uncategorized";

    const unit =
      firstValue(row, [
        "unit",
        "uom",
        "price_unit",
      ]) || "each";

    const unitCost = normalizeNumber(
      firstValue(row, [
        "unit_cost",
        "unit_price",
        "cost",
        "price",
      ]),
      {
        minimum: 0,
        decimals: 4,
      },
    );

    if (!description || unitCost === undefined) {
      rowErrors.push({
        row: index + 2,
        error:
          "Description and valid unit cost are required.",
      });

      continue;
    }

    const sku =
      firstValue(row, [
        "sku",
        "manufacturer_sku",
        "manufacturer_item_number",
      ]) || null;

    const supplierSku =
      firstValue(row, [
        "supplier_sku",
        "supplier_item_number",
        "item_number",
        "stock_number",
      ]) || null;

    const brand =
      firstValue(row, [
        "brand",
        "manufacturer",
      ]) || null;

    const productLine =
      firstValue(row, [
        "product_line",
        "series",
        "collection",
      ]) || null;

    const wastePercent =
      normalizeNumber(
        firstValue(row, [
          "waste_percent",
          "waste",
        ]) || "0",
        {
          minimum: 0,
          maximum: 100,
          decimals: 3,
        },
      ) ?? 0;

    let materialId: string | null = null;

    if (sku) {
      const {
        data: existingBySku,
        error: skuError,
      } = await supabase
        .from("material_catalog")
        .select("id")
        .eq("sku", sku)
        .maybeSingle();

      if (skuError) {
        rowErrors.push({
          row: index + 2,
          error: skuError.message,
        });

        continue;
      }

      materialId = existingBySku?.id ?? null;
    }

    if (!materialId && supplierSku) {
      const {
        data: existingPrice,
        error: supplierSkuError,
      } = await supabase
        .from("material_supplier_prices")
        .select("material_catalog_id")
        .eq("supplier_id", supplierId)
        .eq("supplier_sku", supplierSku)
        .limit(1)
        .maybeSingle();

      if (supplierSkuError) {
        rowErrors.push({
          row: index + 2,
          error: supplierSkuError.message,
        });

        continue;
      }

      materialId =
        existingPrice?.material_catalog_id ?? null;
    }

    if (!materialId) {
      const {
        data: createdMaterial,
        error: materialError,
      } = await supabase
        .from("material_catalog")
        .insert({
          sku,
          category,
          description,
          brand,
          product_line: productLine,
          unit,
          unit_cost: unitCost,
          waste_percent: wastePercent,
          is_active: true,
          metadata: {
            created_from: "supplier_csv_import",
            import_id: importRecord.id,
            source_row: index + 2,
            created_by_auth_user_id: userId,
          },
        })
        .select("id")
        .single();

      if (materialError) {
        rowErrors.push({
          row: index + 2,
          error: materialError.message,
        });

        continue;
      }

      materialId = createdMaterial.id;

      if (!sku && !supplierSku) {
        reviewRows += 1;
      }
    }

    const expiresAt =
      normalizeDateTime(
        firstValue(row, [
          "expires_at",
          "expiration_date",
          "quote_expiration",
        ]),
      ) ?? null;

    const {
      data: existingSupplierPrice,
      error: existingPriceError,
    } = await supabase
      .from("material_supplier_prices")
      .select("id")
      .eq("material_catalog_id", materialId)
      .eq("supplier_id", supplierId)
      .eq(
        "supplier_location_id",
        supplierLocationId,
      )
      .eq("unit", unit)
      .limit(1)
      .maybeSingle();

    if (existingPriceError) {
      rowErrors.push({
        row: index + 2,
        error: existingPriceError.message,
      });

      continue;
    }

    const pricePayload = {
      material_catalog_id: materialId,
      supplier_id: supplierId,
      supplier_location_id: supplierLocationId,
      supplier_sku: supplierSku,
      manufacturer_sku: sku,
      unit,
      unit_cost: unitCost,
      quantity_available:
        normalizeOptionalNumber(
          firstValue(row, [
            "quantity_available",
            "available",
            "inventory",
          ]),
          {
            minimum: 0,
            decimals: 4,
          },
        ) ?? null,
      minimum_order_quantity:
        normalizeOptionalNumber(
          firstValue(row, [
            "minimum_order_quantity",
            "minimum_quantity",
            "moq",
          ]),
          {
            minimum: 0,
            decimals: 4,
          },
        ) ?? null,
      delivery_cost:
        normalizeOptionalNumber(
          firstValue(row, [
            "delivery_cost",
            "delivery",
          ]),
          {
            minimum: 0,
            decimals: 2,
          },
        ) ?? null,
      delivery_minimum:
        normalizeOptionalNumber(
          firstValue(row, [
            "delivery_minimum",
            "minimum_delivery_order",
          ]),
          {
            minimum: 0,
            decimals: 2,
          },
        ) ?? null,
      price_type:
        (firstValue(row, ["price_type"]) ||
          "contract") as SupplierPriceInsert["price_type"],
      effective_at:
        normalizeDateTime(
          firstValue(row, [
            "effective_at",
            "effective_date",
            "quote_date",
          ]),
          new Date().toISOString(),
        ) ?? new Date().toISOString(),
      expires_at: expiresAt,
      last_checked_at: new Date().toISOString(),
      source_type: "csv" as const,
      source_reference: file.name,
      confidence:
        sku || supplierSku
          ? ("confirmed" as const)
          : ("probable" as const),
      is_active: true,
      metadata: {
        import_id: importRecord.id,
        source_row: index + 2,
        imported_by_auth_user_id: userId,
      },
    };

    if (
      !priceTypes.includes(
        pricePayload.price_type as
          (typeof priceTypes)[number],
      )
    ) {
      pricePayload.price_type = "contract";
    }

    if (existingSupplierPrice) {
      const { error: updatePriceError } = await supabase
        .from("material_supplier_prices")
        .update(pricePayload)
        .eq("id", existingSupplierPrice.id);

      if (updatePriceError) {
        rowErrors.push({
          row: index + 2,
          error: updatePriceError.message,
        });

        continue;
      }
    } else {
      const { error: insertPriceError } = await supabase
        .from("material_supplier_prices")
        .insert(pricePayload);

      if (insertPriceError) {
        rowErrors.push({
          row: index + 2,
          error: insertPriceError.message,
        });

        continue;
      }
    }

    importedRows += 1;
  }

  const skippedRows = rowErrors.length;

  const finalStatus =
    importedRows === 0
      ? "failed"
      : skippedRows > 0 || reviewRows > 0
        ? "completed_with_errors"
        : "completed";

  await supabase
    .from("material_price_imports")
    .update({
      status: finalStatus,
      imported_rows: importedRows,
      skipped_rows: skippedRows,
      review_rows: reviewRows,
      errors: rowErrors,
    })
    .eq("id", importRecord.id);

  return NextResponse.json(
    {
      success: importedRows > 0,
      importId: importRecord.id,
      importedRows,
      skippedRows,
      reviewRows,
      rowErrors,
    },
    {
      status: importedRows > 0 ? 201 : 400,
    },
  );
}