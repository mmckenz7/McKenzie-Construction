"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type SupplierLocation = {
  id: string;
  supplier_id: string;
  name: string;
  store_number: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_default: boolean;
  is_active: boolean;
};

type Supplier = {
  id: string;
  name: string;
  slug: string;
  supplier_type: string;
  website_url: string | null;
  account_number: string | null;
  supports_csv_import: boolean;
  supports_quote_import: boolean;
  supports_live_lookup: boolean;
  is_active: boolean;
  supplier_locations: SupplierLocation[];
};

type ProcurementSettings = {
  id: string;
  default_pricing_strategy:
    | "preferred_supplier"
    | "best_available"
    | "lowes_fallback"
    | "manual";
  preferred_supplier_id: string | null;
  preferred_supplier_location_id: string | null;
  lowes_supplier_id: string | null;
  lowes_fallback_location_id: string | null;
  allow_lowes_fallback: boolean;
  allow_web_lookup: boolean;
  allow_nearby_store_substitution: boolean;
  nearby_store_radius_miles: number;
  maximum_price_age_days: number;
  line_discrepancy_threshold: number;
  quote_discrepancy_threshold: number;
  always_flag_short_quantity: boolean;
  always_flag_product_mismatch: boolean;
  always_flag_missing_item: boolean;
};

type SupplierForm = {
  name: string;
  supplierType: string;
  websiteUrl: string;
  accountNumber: string;
  supportsCsvImport: boolean;
  supportsQuoteImport: boolean;
  supportsLiveLookup: boolean;
};

type LocationForm = {
  supplierId: string;
  name: string;
  storeNumber: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  isDefault: boolean;
};

type Notice =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

const emptySupplierForm: SupplierForm = {
  name: "",
  supplierType: "local_supplier",
  websiteUrl: "",
  accountNumber: "",
  supportsCsvImport: true,
  supportsQuoteImport: true,
  supportsLiveLookup: false,
};

const emptyLocationForm: LocationForm = {
  supplierId: "",
  name: "",
  storeNumber: "",
  city: "",
  state: "TN",
  postalCode: "",
  phone: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  isDefault: false,
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function supplierTypeLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function locationLabel(location: SupplierLocation) {
  const details = [
    location.city,
    location.state,
    location.store_number
      ? `Store ${location.store_number}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return details
    ? `${location.name} — ${details}`
    : location.name;
}

export default function ProcurementSettingsPage() {
  const [settings, setSettings] =
    useState<ProcurementSettings | null>(null);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [supplierForm, setSupplierForm] =
    useState<SupplierForm>(emptySupplierForm);

  const [locationForm, setLocationForm] =
    useState<LocationForm>(emptyLocationForm);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] =
    useState(false);
  const [savingSupplier, setSavingSupplier] =
    useState(false);
  const [savingLocation, setSavingLocation] =
    useState(false);

  const [notice, setNotice] =
    useState<Notice>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        "/api/procurement-settings",
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        settings?: ProcurementSettings;
        suppliers?: Supplier[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Procurement settings could not be loaded.",
        );
      }

      const nextSuppliers = data.suppliers ?? [];

      setSettings(data.settings ?? null);
      setSuppliers(nextSuppliers);

      setLocationForm((current) => ({
        ...current,
        supplierId:
          current.supplierId ||
          nextSuppliers[0]?.id ||
          "",
      }));
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Procurement settings could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const preferredSupplier = useMemo(
    () =>
      suppliers.find(
        (supplier) =>
          supplier.id ===
          settings?.preferred_supplier_id,
      ) ?? null,
    [
      settings?.preferred_supplier_id,
      suppliers,
    ],
  );

  const lowesSupplier = useMemo(
    () =>
      suppliers.find(
        (supplier) =>
          supplier.id ===
          settings?.lowes_supplier_id,
      ) ??
      suppliers.find(
        (supplier) =>
          supplier.slug === "lowes",
      ) ??
      null,
    [
      settings?.lowes_supplier_id,
      suppliers,
    ],
  );

  function updateSetting<
    Key extends keyof ProcurementSettings,
  >(
    key: Key,
    value: ProcurementSettings[Key],
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  async function saveSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!settings) {
      return;
    }

    setSavingSettings(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/procurement-settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            defaultPricingStrategy:
              settings.default_pricing_strategy,
            preferredSupplierId:
              settings.preferred_supplier_id,
            preferredSupplierLocationId:
              settings.preferred_supplier_location_id,
            lowesSupplierId:
              lowesSupplier?.id ?? null,
            lowesFallbackLocationId:
              settings.lowes_fallback_location_id,
            allowLowesFallback:
              settings.allow_lowes_fallback,
            allowWebLookup:
              settings.allow_web_lookup,
            allowNearbyStoreSubstitution:
              settings.allow_nearby_store_substitution,
            nearbyStoreRadiusMiles:
              settings.nearby_store_radius_miles,
            maximumPriceAgeDays:
              settings.maximum_price_age_days,
            lineDiscrepancyThreshold:
              settings.line_discrepancy_threshold,
            quoteDiscrepancyThreshold:
              settings.quote_discrepancy_threshold,
            alwaysFlagShortQuantity:
              settings.always_flag_short_quantity,
            alwaysFlagProductMismatch:
              settings.always_flag_product_mismatch,
            alwaysFlagMissingItem:
              settings.always_flag_missing_item,
          }),
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        settings?: ProcurementSettings;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Procurement settings could not be saved.",
        );
      }

      if (data.settings) {
        setSettings(data.settings);
      }

      setNotice({
        type: "success",
        message: "Procurement settings saved.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Procurement settings could not be saved.",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function createSupplier(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!supplierForm.name.trim()) {
      setNotice({
        type: "error",
        message: "Supplier name is required.",
      });

      return;
    }

    setSavingSupplier(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/suppliers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entityType: "supplier",
            name: supplierForm.name,
            supplierType:
              supplierForm.supplierType,
            websiteUrl:
              supplierForm.websiteUrl,
            accountNumber:
              supplierForm.accountNumber,
            supportsCsvImport:
              supplierForm.supportsCsvImport,
            supportsQuoteImport:
              supplierForm.supportsQuoteImport,
            supportsLiveLookup:
              supplierForm.supportsLiveLookup,
          }),
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        supplier?: Supplier;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Supplier could not be created.",
        );
      }

      setSupplierForm(emptySupplierForm);

      setNotice({
        type: "success",
        message: `${data.supplier?.name ?? "Supplier"} created.`,
      });

      await loadData();

      if (data.supplier?.id) {
        setLocationForm((current) => ({
          ...current,
          supplierId: data.supplier?.id ?? "",
        }));
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Supplier could not be created.",
      });
    } finally {
      setSavingSupplier(false);
    }
  }

  async function createLocation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !locationForm.supplierId ||
      !locationForm.name.trim()
    ) {
      setNotice({
        type: "error",
        message:
          "Choose a supplier and enter a location name.",
      });

      return;
    }

    setSavingLocation(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/suppliers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entityType: "location",
            supplierId:
              locationForm.supplierId,
            name: locationForm.name,
            storeNumber:
              locationForm.storeNumber,
            city: locationForm.city,
            state: locationForm.state,
            postalCode:
              locationForm.postalCode,
            phone: locationForm.phone,
            contactName:
              locationForm.contactName,
            contactPhone:
              locationForm.contactPhone,
            contactEmail:
              locationForm.contactEmail,
            isDefault:
              locationForm.isDefault,
          }),
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Supplier location could not be created.",
        );
      }

      const supplierId =
        locationForm.supplierId;

      setLocationForm({
        ...emptyLocationForm,
        supplierId,
      });

      setNotice({
        type: "success",
        message: "Supplier location created.",
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Supplier location could not be created.",
      });
    } finally {
      setSavingLocation(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-600">
          Loading procurement settings…
        </p>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-red-700">
          Procurement settings are unavailable.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Admin settings
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Materials and procurement
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Manage suppliers, branches, pricing preferences,
            fallback sources, and quote discrepancy rules.
          </p>
        </div>

        <div className="flex gap-4 text-sm font-medium">
          <a
            href="/admin/materials"
            className="text-slate-700 underline underline-offset-4"
          >
            Material catalog
          </a>

          <a
            href="/admin"
            className="text-slate-700 underline underline-offset-4"
          >
            Back to admin
          </a>
        </div>
      </div>

      {notice ? (
        <div
          className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <form
          onSubmit={saveSettings}
          className="space-y-8"
        >
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Price-source strategy
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-slate-800">
                  Default strategy
                </span>

                <select
                  value={
                    settings.default_pricing_strategy
                  }
                  onChange={(event) =>
                    updateSetting(
                      "default_pricing_strategy",
                      event.target
                        .value as ProcurementSettings["default_pricing_strategy"],
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="best_available">
                    Best available
                  </option>

                  <option value="preferred_supplier">
                    Preferred supplier first
                  </option>

                  <option value="lowes_fallback">
                    Lowe&apos;s first
                  </option>

                  <option value="manual">
                    Manual selection
                  </option>
                </select>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Maximum saved-price age
                </span>

                <input
                  type="number"
                  min="1"
                  value={
                    settings.maximum_price_age_days
                  }
                  onChange={(event) =>
                    updateSetting(
                      "maximum_price_age_days",
                      Math.max(
                        1,
                        Number(event.target.value) ||
                          1,
                      ),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Preferred supplier
                </span>

                <select
                  value={
                    settings.preferred_supplier_id ??
                    ""
                  }
                  onChange={(event) => {
                    updateSetting(
                      "preferred_supplier_id",
                      event.target.value || null,
                    );

                    updateSetting(
                      "preferred_supplier_location_id",
                      null,
                    );
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">
                    No preferred supplier
                  </option>

                  {suppliers.map((supplier) => (
                    <option
                      key={supplier.id}
                      value={supplier.id}
                    >
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Preferred location
                </span>

                <select
                  value={
                    settings.preferred_supplier_location_id ??
                    ""
                  }
                  onChange={(event) =>
                    updateSetting(
                      "preferred_supplier_location_id",
                      event.target.value || null,
                    )
                  }
                  disabled={!preferredSupplier}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">
                    Any location
                  </option>

                  {preferredSupplier?.supplier_locations.map(
                    (location) => (
                      <option
                        key={location.id}
                        value={location.id}
                      >
                        {locationLabel(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Lowe&apos;s fallback
            </h2>

            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={
                    settings.allow_lowes_fallback
                  }
                  onChange={(event) =>
                    updateSetting(
                      "allow_lowes_fallback",
                      event.target.checked,
                    )
                  }
                  className="mt-1 h-4 w-4"
                />

                <span className="text-sm text-slate-800">
                  Allow Lowe&apos;s fallback when no
                  current supplier price exists.
                </span>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Default Lowe&apos;s store
                </span>

                <select
                  value={
                    settings.lowes_fallback_location_id ??
                    ""
                  }
                  onChange={(event) =>
                    updateSetting(
                      "lowes_fallback_location_id",
                      event.target.value || null,
                    )
                  }
                  disabled={
                    !settings.allow_lowes_fallback
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">
                    Select a Lowe&apos;s store
                  </option>

                  {lowesSupplier?.supplier_locations.map(
                    (location) => (
                      <option
                        key={location.id}
                        value={location.id}
                      >
                        {locationLabel(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={
                    settings.allow_web_lookup
                  }
                  onChange={(event) =>
                    updateSetting(
                      "allow_web_lookup",
                      event.target.checked,
                    )
                  }
                  className="mt-1 h-4 w-4"
                />

                <span className="text-sm text-slate-800">
                  Allow live product lookup for missing
                  prices.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={
                    settings.allow_nearby_store_substitution
                  }
                  onChange={(event) =>
                    updateSetting(
                      "allow_nearby_store_substitution",
                      event.target.checked,
                    )
                  }
                  className="mt-1 h-4 w-4"
                />

                <span className="text-sm text-slate-800">
                  Allow nearby-store substitution.
                </span>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Nearby-store radius
                </span>

                <input
                  type="number"
                  min="0"
                  value={
                    settings.nearby_store_radius_miles
                  }
                  onChange={(event) =>
                    updateSetting(
                      "nearby_store_radius_miles",
                      Math.max(
                        0,
                        Number(event.target.value) ||
                          0,
                      ),
                    )
                  }
                  disabled={
                    !settings.allow_nearby_store_substitution
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Discrepancy rules
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-slate-800">
                  Line threshold
                </span>

                <input
                  type="number"
                  min="0"
                  value={
                    settings.line_discrepancy_threshold
                  }
                  onChange={(event) =>
                    updateSetting(
                      "line_discrepancy_threshold",
                      Math.max(
                        0,
                        Number(event.target.value) ||
                          0,
                      ),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  Currently{" "}
                  {money(
                    settings.line_discrepancy_threshold,
                  )}
                </span>
              </label>

              <label>
                <span className="text-sm font-medium text-slate-800">
                  Whole-quote threshold
                </span>

                <input
                  type="number"
                  min="0"
                  value={
                    settings.quote_discrepancy_threshold
                  }
                  onChange={(event) =>
                    updateSetting(
                      "quote_discrepancy_threshold",
                      Math.max(
                        0,
                        Number(event.target.value) ||
                          0,
                      ),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  Currently{" "}
                  {money(
                    settings.quote_discrepancy_threshold,
                  )}
                </span>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    settings.always_flag_short_quantity
                  }
                  onChange={(event) =>
                    updateSetting(
                      "always_flag_short_quantity",
                      event.target.checked,
                    )
                  }
                />

                Always flag short quantities
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    settings.always_flag_product_mismatch
                  }
                  onChange={(event) =>
                    updateSetting(
                      "always_flag_product_mismatch",
                      event.target.checked,
                    )
                  }
                />

                Always flag product mismatches
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    settings.always_flag_missing_item
                  }
                  onChange={(event) =>
                    updateSetting(
                      "always_flag_missing_item",
                      event.target.checked,
                    )
                  }
                />

                Always flag missing items
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={savingSettings}
            className="w-full rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingSettings
              ? "Saving…"
              : "Save procurement settings"}
          </button>
        </form>

        <div className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Add new supplier
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Suppliers can be used for any trade,
              including lumber, electrical, plumbing,
              roofing, HVAC, flooring, and landscaping.
            </p>

            <form
              onSubmit={createSupplier}
              className="mt-5 space-y-4"
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier name
                </span>

                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ferguson, ABC Supply, local vendor"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier type
                </span>

                <select
                  value={
                    supplierForm.supplierType
                  }
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      supplierType:
                        event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="local_supplier">
                    Local supplier
                  </option>

                  <option value="national_supplier">
                    National supplier
                  </option>

                  <option value="retailer">
                    Retailer
                  </option>

                  <option value="manufacturer">
                    Manufacturer
                  </option>

                  <option value="other">
                    Other
                  </option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Website
                </span>

                <input
                  type="url"
                  value={
                    supplierForm.websiteUrl
                  }
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      websiteUrl:
                        event.target.value,
                    }))
                  }
                  placeholder="https://"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Account number
                </span>

                <input
                  type="text"
                  value={
                    supplierForm.accountNumber
                  }
                  onChange={(event) =>
                    setSupplierForm((current) => ({
                      ...current,
                      accountNumber:
                        event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      supplierForm.supportsCsvImport
                    }
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        supportsCsvImport:
                          event.target.checked,
                      }))
                    }
                  />

                  Allow CSV price imports
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      supplierForm.supportsQuoteImport
                    }
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        supportsQuoteImport:
                          event.target.checked,
                      }))
                    }
                  />

                  Allow AI quote imports
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      supplierForm.supportsLiveLookup
                    }
                    onChange={(event) =>
                      setSupplierForm((current) => ({
                        ...current,
                        supportsLiveLookup:
                          event.target.checked,
                      }))
                    }
                  />

                  Supplier supports live lookup
                </label>
              </div>

              <button
                type="submit"
                disabled={savingSupplier}
                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingSupplier
                  ? "Creating…"
                  : "Create supplier"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Add supplier location
            </h2>

            <form
              onSubmit={createLocation}
              className="mt-5 space-y-4"
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier
                </span>

                <select
                  value={
                    locationForm.supplierId
                  }
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      supplierId:
                        event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">
                    Select supplier
                  </option>

                  {suppliers.map((supplier) => (
                    <option
                      key={supplier.id}
                      value={supplier.id}
                    >
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-slate-800">
                    Location name
                  </span>

                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Knoxville, Halls, West"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-800">
                    Store number
                  </span>

                  <input
                    type="text"
                    value={
                      locationForm.storeNumber
                    }
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        storeNumber:
                          event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_80px_120px]">
                <label>
                  <span className="text-sm font-medium text-slate-800">
                    City
                  </span>

                  <input
                    type="text"
                    value={locationForm.city}
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-800">
                    State
                  </span>

                  <input
                    type="text"
                    maxLength={2}
                    value={locationForm.state}
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        state:
                          event.target.value.toUpperCase(),
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-slate-800">
                    ZIP
                  </span>

                  <input
                    type="text"
                    value={
                      locationForm.postalCode
                    }
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        postalCode:
                          event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Main phone
                </span>

                <input
                  type="tel"
                  value={locationForm.phone}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-slate-900">
                  Sales representative
                </p>

                <div className="mt-3 space-y-4">
                  <input
                    type="text"
                    value={
                      locationForm.contactName
                    }
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        contactName:
                          event.target.value,
                      }))
                    }
                    placeholder="Representative name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />

                  <input
                    type="tel"
                    value={
                      locationForm.contactPhone
                    }
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        contactPhone:
                          event.target.value,
                      }))
                    }
                    placeholder="Representative phone"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />

                  <input
                    type="email"
                    value={
                      locationForm.contactEmail
                    }
                    onChange={(event) =>
                      setLocationForm((current) => ({
                        ...current,
                        contactEmail:
                          event.target.value,
                      }))
                    }
                    placeholder="Representative email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    locationForm.isDefault
                  }
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      isDefault:
                        event.target.checked,
                    }))
                  }
                />

                Make this the default location
              </label>

              <button
                type="submit"
                disabled={savingLocation}
                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingLocation
                  ? "Creating…"
                  : "Create location"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Current suppliers
            </h2>

            <div className="mt-5 space-y-4">
              {suppliers.map((supplier) => (
                <article
                  key={supplier.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {supplier.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {supplierTypeLabel(
                          supplier.supplier_type,
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-1">
                      {supplier.supports_csv_import ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          CSV
                        </span>
                      ) : null}

                      {supplier.supports_quote_import ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          AI quotes
                        </span>
                      ) : null}

                      {supplier.supports_live_lookup ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          Live
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {supplier.supplier_locations.length ? (
                      supplier.supplier_locations.map(
                        (location) => (
                          <div
                            key={location.id}
                            className="rounded-md bg-slate-50 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-slate-900">
                              {location.name}

                              {location.is_default ? (
                                <span className="ml-2 text-xs text-emerald-700">
                                  Default
                                </span>
                              ) : null}
                            </p>

                            <p className="mt-1 text-xs text-slate-600">
                              {[
                                location.city,
                                location.state,
                                location.contact_name
                                  ? `Rep: ${location.contact_name}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" • ") ||
                                "No additional details"}
                            </p>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-sm text-slate-500">
                        No locations added.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}