import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type ProcurementSettingsBody = {
  defaultPricingStrategy?: unknown;
  preferredSupplierId?: unknown;
  preferredSupplierLocationId?: unknown;
  lowesSupplierId?: unknown;
  lowesFallbackLocationId?: unknown;
  allowLowesFallback?: unknown;
  allowWebLookup?: unknown;
  allowNearbyStoreSubstitution?: unknown;
  nearbyStoreRadiusMiles?: unknown;
  maximumPriceAgeDays?: unknown;
  lineDiscrepancyThreshold?: unknown;
  quoteDiscrepancyThreshold?: unknown;
  alwaysFlagShortQuantity?: unknown;
  alwaysFlagProductMismatch?: unknown;
  alwaysFlagMissingItem?: unknown;
};

const pricingStrategies = [
  "preferred_supplier",
  "best_available",
  "lowes_fallback",
  "manual",
] as const;

function normalizeOptionalUuid(
  value: unknown,
): string | null | undefined {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeBoolean(
  value: unknown,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "1", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "no", "0", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function normalizeNonnegativeNumber(
  value: unknown,
): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[$,\s]/g, ""))
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed * 100) / 100;
}

function normalizePositiveInteger(
  value: unknown,
): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return undefined;
  }

  return parsed;
}

async function getOrCreateSettings() {
  const supabase = createAdminServerClient();

  const {
    data: existingSettings,
    error: settingsError,
  } = await supabase
    .from("procurement_settings")
    .select("*")
    .order("created_at", {
      ascending: true,
    })
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  if (existingSettings) {
    return existingSettings;
  }

  const {
    data: lowesSupplier,
    error: lowesError,
  } = await supabase
    .from("suppliers")
    .select("id")
    .eq("slug", "lowes")
    .maybeSingle();

  if (lowesError) {
    throw new Error(lowesError.message);
  }

  const {
    data: createdSettings,
    error: createError,
  } = await supabase
    .from("procurement_settings")
    .insert({
      company_name: "McKenzie Construction",
      default_pricing_strategy: "best_available",
      lowes_supplier_id: lowesSupplier?.id ?? null,
      allow_lowes_fallback: true,
      allow_web_lookup: true,
      allow_nearby_store_substitution: false,
      nearby_store_radius_miles: 25,
      maximum_price_age_days: 30,
      line_discrepancy_threshold: 50,
      quote_discrepancy_threshold: 250,
      always_flag_short_quantity: true,
      always_flag_product_mismatch: true,
      always_flag_missing_item: true,
      metadata: {
        created_from: "procurement_settings_api",
      },
    })
    .select("*")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return createdSettings;
}

export async function GET(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  const supabase = createAdminServerClient();

  try {
    const settings = await getOrCreateSettings();

    const {
      data: suppliers,
      error: suppliersError,
    } = await supabase
      .from("suppliers")
      .select(`
        id,
        name,
        slug,
        supplier_type,
        website_url,
        account_number,
        supports_csv_import,
        supports_quote_import,
        supports_live_lookup,
        is_active,
        metadata,
        created_at,
        updated_at,
        supplier_locations (
          id,
          supplier_id,
          name,
          store_number,
          address_line_1,
          address_line_2,
          city,
          state,
          postal_code,
          phone,
          email,
          contact_name,
          contact_phone,
          contact_email,
          is_default,
          is_active,
          metadata,
          created_at,
          updated_at
        )
      `)
      .eq("is_active", true)
      .order("name", {
        ascending: true,
      });

    if (suppliersError) {
      return NextResponse.json(
        {
          success: false,
          error: suppliersError.message,
        },
        {
          status: 500,
        },
      );
    }

    const normalizedSuppliers = (suppliers ?? []).map(
      (supplier) => ({
        ...supplier,
        supplier_locations: (
          supplier.supplier_locations ?? []
        )
          .filter(
            (location) => location.is_active,
          )
          .sort((first, second) => {
            if (
              first.is_default &&
              !second.is_default
            ) {
              return -1;
            }

            if (
              !first.is_default &&
              second.is_default
            ) {
              return 1;
            }

            return first.name.localeCompare(
              second.name,
            );
          }),
      }),
    );

    return NextResponse.json({
      success: true,
      settings,
      suppliers: normalizedSuppliers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Procurement settings could not be loaded.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(request);
  }

  let body: ProcurementSettingsBody;

  try {
    body =
      (await request.json()) as ProcurementSettingsBody;
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

  const updates: Record<string, unknown> = {};

  if (
    body.defaultPricingStrategy !== undefined
  ) {
    if (
      typeof body.defaultPricingStrategy !== "string" ||
      !pricingStrategies.includes(
        body.defaultPricingStrategy as
          (typeof pricingStrategies)[number],
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Default pricing strategy is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates.default_pricing_strategy =
      body.defaultPricingStrategy;
  }

  const uuidFields = [
    {
      input: body.preferredSupplierId,
      database: "preferred_supplier_id",
      label: "Preferred supplier",
    },
    {
      input: body.preferredSupplierLocationId,
      database: "preferred_supplier_location_id",
      label: "Preferred supplier location",
    },
    {
      input: body.lowesSupplierId,
      database: "lowes_supplier_id",
      label: "Lowe's supplier",
    },
    {
      input: body.lowesFallbackLocationId,
      database: "lowes_fallback_location_id",
      label: "Lowe's fallback location",
    },
  ];

  for (const field of uuidFields) {
    if (field.input === undefined) {
      continue;
    }

    const normalized = normalizeOptionalUuid(
      field.input,
    );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `${field.label} is invalid.`,
        },
        {
          status: 400,
        },
      );
    }

    updates[field.database] = normalized;
  }

  const booleanFields = [
    {
      input: body.allowLowesFallback,
      database: "allow_lowes_fallback",
      label: "Lowe's fallback",
    },
    {
      input: body.allowWebLookup,
      database: "allow_web_lookup",
      label: "Web lookup",
    },
    {
      input: body.allowNearbyStoreSubstitution,
      database: "allow_nearby_store_substitution",
      label: "Nearby-store substitution",
    },
    {
      input: body.alwaysFlagShortQuantity,
      database: "always_flag_short_quantity",
      label: "Short-quantity flag",
    },
    {
      input: body.alwaysFlagProductMismatch,
      database: "always_flag_product_mismatch",
      label: "Product-mismatch flag",
    },
    {
      input: body.alwaysFlagMissingItem,
      database: "always_flag_missing_item",
      label: "Missing-item flag",
    },
  ];

  for (const field of booleanFields) {
    if (field.input === undefined) {
      continue;
    }

    const normalized = normalizeBoolean(
      field.input,
    );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `${field.label} must be true or false.`,
        },
        {
          status: 400,
        },
      );
    }

    updates[field.database] = normalized;
  }

  if (
    body.nearbyStoreRadiusMiles !== undefined
  ) {
    const normalized =
      normalizeNonnegativeNumber(
        body.nearbyStoreRadiusMiles,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nearby-store radius must be a non-negative number.",
        },
        {
          status: 400,
        },
      );
    }

    updates.nearby_store_radius_miles =
      normalized;
  }

  if (
    body.maximumPriceAgeDays !== undefined
  ) {
    const normalized =
      normalizePositiveInteger(
        body.maximumPriceAgeDays,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Maximum price age must be a positive whole number.",
        },
        {
          status: 400,
        },
      );
    }

    updates.maximum_price_age_days =
      normalized;
  }

  if (
    body.lineDiscrepancyThreshold !== undefined
  ) {
    const normalized =
      normalizeNonnegativeNumber(
        body.lineDiscrepancyThreshold,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Line discrepancy threshold must be non-negative.",
        },
        {
          status: 400,
        },
      );
    }

    updates.line_discrepancy_threshold =
      normalized;
  }

  if (
    body.quoteDiscrepancyThreshold !== undefined
  ) {
    const normalized =
      normalizeNonnegativeNumber(
        body.quoteDiscrepancyThreshold,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Quote discrepancy threshold must be non-negative.",
        },
        {
          status: 400,
        },
      );
    }

    updates.quote_discrepancy_threshold =
      normalized;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No procurement settings were provided.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase = createAdminServerClient();

  try {
    const currentSettings =
      await getOrCreateSettings();

    if (
      updates.preferred_supplier_location_id
    ) {
      const {
        data: preferredLocation,
        error: preferredLocationError,
      } = await supabase
        .from("supplier_locations")
        .select("id, supplier_id")
        .eq(
          "id",
          updates.preferred_supplier_location_id,
        )
        .maybeSingle();

      if (preferredLocationError) {
        return NextResponse.json(
          {
            success: false,
            error: preferredLocationError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (!preferredLocation) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Preferred supplier location was not found.",
          },
          {
            status: 400,
          },
        );
      }

      const preferredSupplierId =
        updates.preferred_supplier_id ??
        currentSettings.preferred_supplier_id;

      if (
        preferredSupplierId &&
        preferredLocation.supplier_id !==
          preferredSupplierId
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Preferred location does not belong to the selected supplier.",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (
      updates.lowes_fallback_location_id
    ) {
      const {
        data: lowesLocation,
        error: lowesLocationError,
      } = await supabase
        .from("supplier_locations")
        .select("id, supplier_id")
        .eq(
          "id",
          updates.lowes_fallback_location_id,
        )
        .maybeSingle();

      if (lowesLocationError) {
        return NextResponse.json(
          {
            success: false,
            error: lowesLocationError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (!lowesLocation) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Lowe's fallback location was not found.",
          },
          {
            status: 400,
          },
        );
      }

      const lowesSupplierId =
        updates.lowes_supplier_id ??
        currentSettings.lowes_supplier_id;

      if (
        lowesSupplierId &&
        lowesLocation.supplier_id !==
          lowesSupplierId
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The selected Lowe's location does not belong to the Lowe's supplier record.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const existingMetadata =
      currentSettings.metadata &&
      typeof currentSettings.metadata === "object" &&
      !Array.isArray(currentSettings.metadata)
        ? currentSettings.metadata
        : {};

    const {
      data: updatedSettings,
      error: updateError,
    } = await supabase
      .from("procurement_settings")
      .update({
        ...updates,
        metadata: {
          ...existingMetadata,
          updated_from:
            "procurement_settings_api",
          updated_by_auth_user_id: user.id,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", currentSettings.id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: updateError.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Procurement settings could not be updated.",
      },
      {
        status: 500,
      },
    );
  }
}