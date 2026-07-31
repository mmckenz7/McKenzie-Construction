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
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
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
  company_name: string;
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

type SettingsResponse = {
  success: boolean;
  settings?: ProcurementSettings;
  suppliers?: Supplier[];
  error?: string;
};

type Notice = {
  type: "success" | "error";
  message: string;
} | null;

type LocationForm = {
  supplierId: string;
  name: string;
  storeNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  isDefault: boolean;
};

const emptyLocationForm: LocationForm = {
  supplierId: "",
  name: "",
  storeNumber: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "TN",
  postalCode: "",
  phone: "",
  email: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  isDefault: false,
};

function formatSupplierType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLocation(location: SupplierLocation) {
  const locality = [
    location.city,
    location.state,
  ]
    .filter(Boolean)
    .join(", ");

  const parts = [
    location.name,
    locality,
    location.store_number
      ? `Store ${location.store_number}`
      : null,
  ].filter(Boolean);

  return parts.join(" — ");
}

function parseNumber(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export default function ProcurementSettingsPage() {
  const [settings, setSettings] =
    useState<ProcurementSettings | null>(null);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [savingSettings, setSavingSettings] =
    useState(false);

  const [savingLocation, setSavingLocation] =
    useState(false);

  const [notice, setNotice] =
    useState<Notice>(null);

  const [locationForm, setLocationForm] =
    useState<LocationForm>(emptyLocationForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/procurement-settings",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data =
        (await response.json()) as SettingsResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Procurement settings could not be loaded.",
        );
      }

      setSettings(data.settings ?? null);
      setSuppliers(data.suppliers ?? []);

      if (
        !locationForm.supplierId &&
        data.suppliers?.length
      ) {
        setLocationForm((current) => ({
          ...current,
          supplierId:
            data.suppliers?.[0]?.id ?? "",
        }));
      }
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
  }, [locationForm.supplierId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const preferredSupplier =
    useMemo(
      () =>
        suppliers.find(
          (supplier) =>
            supplier.id ===
            settings?.preferred_supplier_id,
        ) ?? null,
      [
        suppliers,
        settings?.preferred_supplier_id,
      ],
    );

  const lowesSupplier =
    useMemo(
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
        suppliers,
        settings?.lowes_supplier_id,
      ],
    );

  const selectedLocationSupplier =
    useMemo(
      () =>
        suppliers.find(
          (supplier) =>
            supplier.id ===
            locationForm.supplierId,
        ) ?? null,
      [
        suppliers,
        locationForm.supplierId,
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

      const data =
        (await response.json()) as SettingsResponse;

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
        message:
          "Procurement settings saved.",
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

  async function addLocation(
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
            addressLine1:
              locationForm.addressLine1,
            addressLine2:
              locationForm.addressLine2,
            city: locationForm.city,
            state: locationForm.state,
            postalCode:
              locationForm.postalCode,
            phone: locationForm.phone,
            email: locationForm.email,
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

      const data =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Supplier location could not be added.",
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
        message:
          "Supplier location added.",
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Supplier location could not be added.",
      });
    } finally {
      setSavingLocation(false);
    }
  }

  async function deactivateLocation(
    location: SupplierLocation,
  ) {
    const confirmed = window.confirm(
      `Deactivate ${location.name}?`,
    );

    if (!confirmed) {
      return;
    }

    setNotice(null);

    try {
      const response = await fetch(
        `/api/suppliers?entityType=location&id=${encodeURIComponent(
          location.id,
        )}`,
        {
          method: "DELETE",
        },
      );

      const data =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Supplier location could not be deactivated.",
        );
      }

      setNotice({
        type: "success",
        message:
          "Supplier location deactivated.",
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Supplier location could not be deactivated.",
      });
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-slate-600">
          Loading procurement settings…
        </p>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Procurement settings
        </h1>

        <p className="mt-4 text-sm text-red-700">
          Procurement settings are unavailable.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Admin settings
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Materials and procurement
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Control supplier preferences, Lowe&apos;s fallback
            pricing, price freshness, and discrepancy alerts.
          </p>
        </div>

        <a
          href="/admin"
          className="text-sm font-medium text-slate-700 underline underline-offset-4"
        >
          Back to admin
        </a>
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

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <form
          onSubmit={saveSettings}
          className="space-y-8"
        >
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Price-source strategy
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              This controls the default supplier-selection behavior
              for new estimates.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Default pricing strategy
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
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="best_available">
                    Best available
                  </option>

                  <option value="preferred_supplier">
                    Preferred supplier first
                  </option>

                  <option value="lowes_fallback">
                    Lowe&apos;s fallback
                  </option>

                  <option value="manual">
                    Manual selection
                  </option>
                </select>
              </label>

              <label className="block">
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
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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

              <label className="block">
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
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
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
                        {formatLocation(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Maximum saved-price age
                </span>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={
                      settings.maximum_price_age_days
                    }
                    onChange={(event) =>
                      updateSetting(
                        "maximum_price_age_days",
                        Math.max(
                          1,
                          Math.round(
                            parseNumber(
                              event.target.value,
                            ),
                          ),
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />

                  <span className="text-sm text-slate-600">
                    days
                  </span>
                </div>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Lowe&apos;s fallback
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Use this store when a reliable supplier price is not
              available.
            </p>

            <div className="mt-5 space-y-5">
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
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />

                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    Allow Lowe&apos;s fallback pricing
                  </span>

                  <span className="block text-sm text-slate-600">
                    Use Lowe&apos;s when no current supplier or
                    quote price is available.
                  </span>
                </span>
              </label>

              <label className="block">
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
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  <option value="">
                    Select a Lowe&apos;s location
                  </option>

                  {lowesSupplier?.supplier_locations.map(
                    (location) => (
                      <option
                        key={location.id}
                        value={location.id}
                      >
                        {formatLocation(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {lowesSupplier &&
              lowesSupplier.supplier_locations.length ===
                0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Add your preferred Lowe&apos;s location in the
                  supplier-location form on this page.
                </p>
              ) : null}

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
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />

                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    Allow live product lookup
                  </span>

                  <span className="block text-sm text-slate-600">
                    Attempt a current store-level lookup for
                    unmatched materials.
                  </span>
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
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />

                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    Allow nearby-store substitution
                  </span>

                  <span className="block text-sm text-slate-600">
                    Check nearby stores when the selected location
                    does not have a usable match.
                  </span>
                </span>
              </label>

              <label className="block max-w-sm">
                <span className="text-sm font-medium text-slate-800">
                  Nearby-store radius
                </span>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      settings.nearby_store_radius_miles
                    }
                    onChange={(event) =>
                      updateSetting(
                        "nearby_store_radius_miles",
                        Math.max(
                          0,
                          parseNumber(
                            event.target.value,
                          ),
                        ),
                      )
                    }
                    disabled={
                      !settings.allow_nearby_store_substitution
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                  />

                  <span className="text-sm text-slate-600">
                    miles
                  </span>
                </div>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Discrepancy alerts
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Ignore minor price noise while still catching shortages,
              product mismatches, and meaningful quote differences.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Flag individual line differences over
                </span>

                <div className="mt-2 flex items-center rounded-lg border border-slate-300 bg-white">
                  <span className="px-3 text-sm text-slate-500">
                    $
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      settings.line_discrepancy_threshold
                    }
                    onChange={(event) =>
                      updateSetting(
                        "line_discrepancy_threshold",
                        Math.max(
                          0,
                          parseNumber(
                            event.target.value,
                          ),
                        ),
                      )
                    }
                    className="w-full rounded-r-lg border-0 px-0 py-2 pr-3 text-sm text-slate-900 outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Flag total quote differences over
                </span>

                <div className="mt-2 flex items-center rounded-lg border border-slate-300 bg-white">
                  <span className="px-3 text-sm text-slate-500">
                    $
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      settings.quote_discrepancy_threshold
                    }
                    onChange={(event) =>
                      updateSetting(
                        "quote_discrepancy_threshold",
                        Math.max(
                          0,
                          parseNumber(
                            event.target.value,
                          ),
                        ),
                      )
                    }
                    className="w-full rounded-r-lg border-0 px-0 py-2 pr-3 text-sm text-slate-900 outline-none"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 grid gap-3">
              <label className="flex items-center gap-3 text-sm text-slate-800">
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
                  className="h-4 w-4 rounded border-slate-300"
                />

                Always flag quantities that are short
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-800">
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
                  className="h-4 w-4 rounded border-slate-300"
                />

                Always flag product mismatches
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-800">
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
                  className="h-4 w-4 rounded border-slate-300"
                />

                Always flag missing items
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings
                ? "Saving…"
                : "Save procurement settings"}
            </button>
          </div>
        </form>

        <div className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Add supplier location
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Add branches, stores, and supplier-rep contact
              information.
            </p>

            <form
              onSubmit={addLocation}
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
                    setLocationForm(
                      (current) => ({
                        ...current,
                        supplierId:
                          event.target.value,
                      }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Location name
                </span>

                <input
                  type="text"
                  value={locationForm.name}
                  onChange={(event) =>
                    setLocationForm(
                      (current) => ({
                        ...current,
                        name: event.target.value,
                      }),
                    )
                  }
                  placeholder="Halls, Knoxville, West Town"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Store number
                  </span>

                  <input
                    type="text"
                    value={
                      locationForm.storeNumber
                    }
                    onChange={(event) =>
                      setLocationForm(
                        (current) => ({
                          ...current,
                          storeNumber:
                            event.target.value,
                        }),
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    ZIP code
                  </span>

                  <input
                    type="text"
                    value={
                      locationForm.postalCode
                    }
                    onChange={(event) =>
                      setLocationForm(
                        (current) => ({
                          ...current,
                          postalCode:
                            event.target.value,
                        }),
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Street address
                </span>

                <input
                  type="text"
                  value={
                    locationForm.addressLine1
                  }
                  onChange={(event) =>
                    setLocationForm(
                      (current) => ({
                        ...current,
                        addressLine1:
                          event.target.value,
                      }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    City
                  </span>

                  <input
                    type="text"
                    value={
                      locationForm.city
                    }
                    onChange={(event) =>
                      setLocationForm(
                        (current) => ({
                          ...current,
                          city: event.target.value,
                        }),
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    State
                  </span>

                  <input
                    type="text"
                    maxLength={2}
                    value={
                      locationForm.state
                    }
                    onChange={(event) =>
                      setLocationForm(
                        (current) => ({
                          ...current,
                          state:
                            event.target.value.toUpperCase(),
                        }),
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
                    setLocationForm(
                      (current) => ({
                        ...current,
                        phone: event.target.value,
                      }),
                    )
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-slate-900">
                  Sales representative
                </p>

                <div className="mt-3 space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">
                      Contact name
                    </span>

                    <input
                      type="text"
                      value={
                        locationForm.contactName
                      }
                      onChange={(event) =>
                        setLocationForm(
                          (current) => ({
                            ...current,
                            contactName:
                              event.target.value,
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">
                      Contact phone
                    </span>

                    <input
                      type="tel"
                      value={
                        locationForm.contactPhone
                      }
                      onChange={(event) =>
                        setLocationForm(
                          (current) => ({
                            ...current,
                            contactPhone:
                              event.target.value,
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">
                      Contact email
                    </span>

                    <input
                      type="email"
                      value={
                        locationForm.contactEmail
                      }
                      onChange={(event) =>
                        setLocationForm(
                          (current) => ({
                            ...current,
                            contactEmail:
                              event.target.value,
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={
                    locationForm.isDefault
                  }
                  onChange={(event) =>
                    setLocationForm(
                      (current) => ({
                        ...current,
                        isDefault:
                          event.target.checked,
                      }),
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                Make this the default location for{" "}
                {selectedLocationSupplier?.name ??
                  "this supplier"}
              </label>

              <button
                type="submit"
                disabled={savingLocation}
                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingLocation
                  ? "Adding…"
                  : "Add supplier location"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Suppliers
            </h2>

            <div className="mt-5 space-y-5">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {supplier.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {formatSupplierType(
                          supplier.supplier_type,
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-1">
                      {supplier.supports_csv_import ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          CSV
                        </span>
                      ) : null}

                      {supplier.supports_quote_import ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Quote import
                        </span>
                      ) : null}

                      {supplier.supports_live_lookup ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Live lookup
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {supplier.supplier_locations.length >
                    0 ? (
                      supplier.supplier_locations.map(
                        (location) => (
                          <div
                            key={location.id}
                            className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {location.name}

                                {location.is_default ? (
                                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                                    Default
                                  </span>
                                ) : null}
                              </p>

                              <p className="mt-1 text-xs text-slate-600">
                                {[
                                  location.city,
                                  location.state,
                                  location.store_number
                                    ? `Store ${location.store_number}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" • ") ||
                                  "No address details"}
                              </p>

                              {location.contact_name ? (
                                <p className="mt-1 text-xs text-slate-600">
                                  Rep:{" "}
                                  {location.contact_name}
                                </p>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                void deactivateLocation(
                                  location,
                                )
                              }
                              className="text-xs font-medium text-red-700 underline underline-offset-4"
                            >
                              Deactivate
                            </button>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-sm text-slate-500">
                        No locations added.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}