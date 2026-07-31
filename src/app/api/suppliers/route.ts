import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type SupplierBody = {
  entityType?: unknown;
  id?: unknown;

  name?: unknown;
  slug?: unknown;
  supplierType?: unknown;
  websiteUrl?: unknown;
  accountNumber?: unknown;
  supportsCsvImport?: unknown;
  supportsQuoteImport?: unknown;
  supportsLiveLookup?: unknown;
  isActive?: unknown;

  supplierId?: unknown;
  storeNumber?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  phone?: unknown;
  email?: unknown;
  contactName?: unknown;
  contactPhone?: unknown;
  contactEmail?: unknown;
  isDefault?: unknown;
};

const supplierTypes = [
  "local_supplier",
  "national_supplier",
  "retailer",
  "manufacturer",
  "other",
] as const;

function requiredText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
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

function optionalBoolean(
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
    const normalized = value
      .trim()
      .toLowerCase();

    if (
      ["true", "yes", "1", "on"].includes(
        normalized,
      )
    ) {
      return true;
    }

    if (
      ["false", "no", "0", "off"].includes(
        normalized,
      )
    ) {
      return false;
    }
  }

  return undefined;
}

function normalizeSlug(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validateEmail(
  value: string | null,
): boolean {
  if (!value) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );
}

async function clearOtherDefaultLocations(
  supplierId: string,
  exceptLocationId?: string,
) {
  const supabase = createAdminServerClient();

  let query = supabase
    .from("supplier_locations")
    .update({
      is_default: false,
    })
    .eq("supplier_id", supplierId)
    .eq("is_default", true);

  if (exceptLocationId) {
    query = query.neq(
      "id",
      exceptLocationId,
    );
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const includeInactive =
    request.nextUrl.searchParams.get(
      "includeInactive",
    ) === "true";

  const supplierId =
    request.nextUrl.searchParams
      .get("supplierId")
      ?.trim() ?? "";

  const supabase =
    createAdminServerClient();

  let query = supabase
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
    .order("name", {
      ascending: true,
    });

  if (!includeInactive) {
    query = query.eq(
      "is_active",
      true,
    );
  }

  if (supplierId) {
    if (!isUuid(supplierId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supplier ID is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    query = query.eq(
      "id",
      supplierId,
    );
  }

  const {
    data,
    error,
  } = await query;

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

  const suppliers = (data ?? []).map(
    (supplier) => ({
      ...supplier,
      supplier_locations: (
        supplier.supplier_locations ?? []
      )
        .filter(
          (location) =>
            includeInactive ||
            location.is_active,
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
    suppliers,
  });
}

export async function POST(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  let body: SupplierBody;

  try {
    body =
      (await request.json()) as SupplierBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const entityType =
    requiredText(
      body.entityType,
    );

  if (entityType === "supplier") {
    return createSupplier(
      body,
      user.id,
    );
  }

  if (entityType === "location") {
    return createLocation(
      body,
      user.id,
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Entity type must be supplier or location.",
    },
    {
      status: 400,
    },
  );
}

export async function PATCH(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  let body: SupplierBody;

  try {
    body =
      (await request.json()) as SupplierBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const entityType =
    requiredText(
      body.entityType,
    );

  const id =
    requiredText(
      body.id,
    );

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid record ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (entityType === "supplier") {
    return updateSupplier(
      id,
      body,
      user.id,
    );
  }

  if (entityType === "location") {
    return updateLocation(
      id,
      body,
      user.id,
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Entity type must be supplier or location.",
    },
    {
      status: 400,
    },
  );
}

export async function DELETE(
  request: NextRequest,
) {
  const user = await getAuthenticatedApiUser();

  if (!user) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const entityType =
    request.nextUrl.searchParams
      .get("entityType")
      ?.trim() ?? "";

  const id =
    request.nextUrl.searchParams
      .get("id")
      ?.trim() ?? "";

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid record ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  if (entityType === "supplier") {
    const {
      data,
      error,
    } = await supabase
      .from("suppliers")
      .update({
        is_active: false,
        metadata: {
          deactivated_from:
            "suppliers_api",
          deactivated_by_auth_user_id:
            user.id,
          deactivated_at:
            new Date().toISOString(),
        },
      })
      .eq("id", id)
      .select("*")
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
          error:
            "Supplier not found.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,
      supplier: data,
    });
  }

  if (entityType === "location") {
    const {
      data,
      error,
    } = await supabase
      .from("supplier_locations")
      .update({
        is_active: false,
        is_default: false,
        metadata: {
          deactivated_from:
            "suppliers_api",
          deactivated_by_auth_user_id:
            user.id,
          deactivated_at:
            new Date().toISOString(),
        },
      })
      .eq("id", id)
      .select("*")
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
          error:
            "Supplier location not found.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,
      location: data,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Entity type must be supplier or location.",
    },
    {
      status: 400,
    },
  );
}

async function createSupplier(
  body: SupplierBody,
  userId: string,
) {
  const name =
    requiredText(
      body.name,
    );

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supplierType =
    requiredText(
      body.supplierType,
    ) || "local_supplier";

  if (
    !supplierTypes.includes(
      supplierType as
        (typeof supplierTypes)[number],
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier type is invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const requestedSlug =
    requiredText(
      body.slug,
    );

  const slug =
    normalizeSlug(
      requestedSlug || name,
    );

  if (!slug) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier slug is invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const websiteUrl =
    optionalText(
      body.websiteUrl,
    );

  const accountNumber =
    optionalText(
      body.accountNumber,
    );

  if (
    websiteUrl === undefined ||
    accountNumber === undefined
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "One or more supplier fields are invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data,
    error,
  } = await supabase
    .from("suppliers")
    .insert({
      name,
      slug,
      supplier_type:
        supplierType,
      website_url:
        websiteUrl,
      account_number:
        accountNumber,
      supports_csv_import:
        optionalBoolean(
          body.supportsCsvImport,
        ) ?? true,
      supports_quote_import:
        optionalBoolean(
          body.supportsQuoteImport,
        ) ?? true,
      supports_live_lookup:
        optionalBoolean(
          body.supportsLiveLookup,
        ) ?? false,
      is_active:
        optionalBoolean(
          body.isActive,
        ) ?? true,
      metadata: {
        created_from:
          "suppliers_api",
        created_by_auth_user_id:
          userId,
      },
    })
    .select("*")
    .single();

  if (error) {
    const duplicate =
      error.code === "23505";

    return NextResponse.json(
      {
        success: false,
        error: duplicate
          ? "A supplier with that slug already exists."
          : error.message,
      },
      {
        status: duplicate
          ? 409
          : 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      supplier: data,
    },
    {
      status: 201,
    },
  );
}

async function createLocation(
  body: SupplierBody,
  userId: string,
) {
  const supplierId =
    requiredText(
      body.supplierId,
    );

  if (!isUuid(supplierId)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid supplier is required.",
      },
      {
        status: 400,
      },
    );
  }

  const name =
    requiredText(
      body.name,
    );

  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Location name is required.",
      },
      {
        status: 400,
      },
    );
  }

  const values =
    parseLocationFields(body);

  if (!values.success) {
    return NextResponse.json(
      {
        success: false,
        error: values.error,
      },
      {
        status: 400,
      },
    );
  }

  const isDefault =
    optionalBoolean(
      body.isDefault,
    ) ?? false;

  const supabase =
    createAdminServerClient();

  const {
    data: supplier,
    error: supplierError,
  } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("is_active", true)
    .maybeSingle();

  if (supplierError) {
    return NextResponse.json(
      {
        success: false,
        error:
          supplierError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!supplier) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier was not found.",
      },
      {
        status: 404,
      },
    );
  }

  try {
    if (isDefault) {
      await clearOtherDefaultLocations(
        supplierId,
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Default location could not be updated.",
      },
      {
        status: 500,
      },
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("supplier_locations")
    .insert({
      supplier_id:
        supplierId,
      name,
      ...values.value,
      is_default:
        isDefault,
      is_active:
        optionalBoolean(
          body.isActive,
        ) ?? true,
      metadata: {
        created_from:
          "suppliers_api",
        created_by_auth_user_id:
          userId,
      },
    })
    .select("*")
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

  return NextResponse.json(
    {
      success: true,
      location: data,
    },
    {
      status: 201,
    },
  );
}

async function updateSupplier(
  id: string,
  body: SupplierBody,
  userId: string,
) {
  const updates: Record<
    string,
    unknown
  > = {};

  if (body.name !== undefined) {
    const name =
      requiredText(
        body.name,
      );

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supplier name cannot be empty.",
        },
        {
          status: 400,
        },
      );
    }

    updates.name = name;
  }

  if (body.slug !== undefined) {
    const slug =
      normalizeSlug(
        requiredText(
          body.slug,
        ),
      );

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supplier slug is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates.slug = slug;
  }

  if (
    body.supplierType !== undefined
  ) {
    const supplierType =
      requiredText(
        body.supplierType,
      );

    if (
      !supplierTypes.includes(
        supplierType as
          (typeof supplierTypes)[number],
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supplier type is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates.supplier_type =
      supplierType;
  }

  const textFields = [
    {
      input: body.websiteUrl,
      database: "website_url",
    },
    {
      input: body.accountNumber,
      database: "account_number",
    },
  ];

  for (const field of textFields) {
    if (field.input === undefined) {
      continue;
    }

    const normalized =
      optionalText(
        field.input,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more supplier fields are invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates[field.database] =
      normalized;
  }

  const booleanFields = [
    {
      input:
        body.supportsCsvImport,
      database:
        "supports_csv_import",
    },
    {
      input:
        body.supportsQuoteImport,
      database:
        "supports_quote_import",
    },
    {
      input:
        body.supportsLiveLookup,
      database:
        "supports_live_lookup",
    },
    {
      input: body.isActive,
      database: "is_active",
    },
  ];

  for (const field of booleanFields) {
    if (field.input === undefined) {
      continue;
    }

    const normalized =
      optionalBoolean(
        field.input,
      );

    if (normalized === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more supplier settings are invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates[field.database] =
      normalized;
  }

  if (
    Object.keys(updates).length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No supplier changes were provided.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("suppliers")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existing) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier not found.",
      },
      {
        status: 404,
      },
    );
  }

  const existingMetadata =
    existing.metadata &&
    typeof existing.metadata ===
      "object" &&
    !Array.isArray(
      existing.metadata,
    )
      ? existing.metadata
      : {};

  const {
    data,
    error,
  } = await supabase
    .from("suppliers")
    .update({
      ...updates,
      metadata: {
        ...existingMetadata,
        updated_from:
          "suppliers_api",
        updated_by_auth_user_id:
          userId,
        updated_at:
          new Date().toISOString(),
      },
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const duplicate =
      error.code === "23505";

    return NextResponse.json(
      {
        success: false,
        error: duplicate
          ? "A supplier with that slug already exists."
          : error.message,
      },
      {
        status: duplicate
          ? 409
          : 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    supplier: data,
  });
}

async function updateLocation(
  id: string,
  body: SupplierBody,
  userId: string,
) {
  const supabase =
    createAdminServerClient();

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("supplier_locations")
    .select(
      "id, supplier_id, metadata",
    )
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingError.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!existing) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Supplier location not found.",
      },
      {
        status: 404,
      },
    );
  }

  const updates: Record<
    string,
    unknown
  > = {};

  if (body.name !== undefined) {
    const name =
      requiredText(
        body.name,
      );

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Location name cannot be empty.",
        },
        {
          status: 400,
        },
      );
    }

    updates.name = name;
  }

  const parsedFields =
    parseLocationFields(
      body,
      true,
    );

  if (!parsedFields.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          parsedFields.error,
      },
      {
        status: 400,
      },
    );
  }

  Object.assign(
    updates,
    parsedFields.value,
  );

  if (body.isActive !== undefined) {
    const isActive =
      optionalBoolean(
        body.isActive,
      );

    if (isActive === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Location status is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates.is_active =
      isActive;

    if (!isActive) {
      updates.is_default =
        false;
    }
  }

  if (body.isDefault !== undefined) {
    const isDefault =
      optionalBoolean(
        body.isDefault,
      );

    if (isDefault === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Default-location setting is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    updates.is_default =
      isDefault;

    if (isDefault) {
      try {
        await clearOtherDefaultLocations(
          existing.supplier_id,
          id,
        );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Default location could not be updated.",
          },
          {
            status: 500,
          },
        );
      }
    }
  }

  if (
    Object.keys(updates).length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No location changes were provided.",
      },
      {
        status: 400,
      },
    );
  }

  const existingMetadata =
    existing.metadata &&
    typeof existing.metadata ===
      "object" &&
    !Array.isArray(
      existing.metadata,
    )
      ? existing.metadata
      : {};

  const {
    data,
    error,
  } = await supabase
    .from("supplier_locations")
    .update({
      ...updates,
      metadata: {
        ...existingMetadata,
        updated_from:
          "suppliers_api",
        updated_by_auth_user_id:
          userId,
        updated_at:
          new Date().toISOString(),
      },
    })
    .eq("id", id)
    .select("*")
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
    location: data,
  });
}

function parseLocationFields(
  body: SupplierBody,
  partial = false,
):
  | {
      success: true;
      value: Record<
        string,
        string | null
      >;
    }
  | {
      success: false;
      error: string;
    } {
  const definitions = [
    {
      input: body.storeNumber,
      database: "store_number",
    },
    {
      input: body.addressLine1,
      database: "address_line_1",
    },
    {
      input: body.addressLine2,
      database: "address_line_2",
    },
    {
      input: body.city,
      database: "city",
    },
    {
      input: body.state,
      database: "state",
    },
    {
      input: body.postalCode,
      database: "postal_code",
    },
    {
      input: body.phone,
      database: "phone",
    },
    {
      input: body.email,
      database: "email",
    },
    {
      input: body.contactName,
      database: "contact_name",
    },
    {
      input: body.contactPhone,
      database: "contact_phone",
    },
    {
      input: body.contactEmail,
      database: "contact_email",
    },
  ];

  const value: Record<
    string,
    string | null
  > = {};

  for (const field of definitions) {
    if (
      partial &&
      field.input === undefined
    ) {
      continue;
    }

    const normalized =
      optionalText(
        field.input,
      );

    if (normalized === undefined) {
      return {
        success: false,
        error:
          "One or more location fields are invalid.",
      };
    }

    value[field.database] =
      normalized;
  }

  if (
    !validateEmail(
      value.email ?? null,
    )
  ) {
    return {
      success: false,
      error:
        "Location email address is invalid.",
    };
  }

  if (
    !validateEmail(
      value.contact_email ?? null,
    )
  ) {
    return {
      success: false,
      error:
        "Contact email address is invalid.",
    };
  }

  return {
    success: true,
    value,
  };
}