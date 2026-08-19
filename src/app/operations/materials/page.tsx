"use client";

import {
  ChangeEvent,
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
};

type Supplier = {
  id: string;
  name: string;
  slug: string;
  supplier_locations: SupplierLocation[];
};

type SupplierPrice = {
  id: string;
  supplier_id: string;
  supplier_location_id: string | null;
  supplier_sku: string | null;
  unit: string;
  unit_cost: number;
  last_checked_at: string;
  source_type: string;
  confidence: string;
  suppliers:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | {
        id: string;
        name: string;
        slug: string;
      }[]
    | null;
  supplier_locations:
    | {
        id: string;
        name: string;
        store_number: string | null;
        city: string | null;
        state: string | null;
      }
    | {
        id: string;
        name: string;
        store_number: string | null;
        city: string | null;
        state: string | null;
      }[]
    | null;
};

type Material = {
  id: string;
  sku: string | null;
  category: string;
  description: string;
  brand: string | null;
  product_line: string | null;
  unit: string;
  unit_cost: number;
  waste_percent: number;
  is_active: boolean;
  supplier_prices?: SupplierPrice[];
  selected_price?: SupplierPrice | null;
  effective_unit_cost?: number;
  price_source?: string;
  needs_live_lookup?: boolean;
};

type MaterialForm = {
  sku: string;
  category: string;
  description: string;
  brand: string;
  productLine: string;
  unit: string;
  unitCost: string;
  wastePercent: string;
  supplierId: string;
  supplierLocationId: string;
  supplierSku: string;
};

type Notice =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

const emptyMaterialForm: MaterialForm = {
  sku: "",
  category: "",
  description: "",
  brand: "",
  productLine: "",
  unit: "each",
  unitCost: "",
  wastePercent: "0",
  supplierId: "",
  supplierLocationId: "",
  supplierSku: "",
};

function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function firstRelation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function sourceLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    manual: "Manual",
    csv: "CSV import",
    supplier_quote: "Supplier quote",
    api: "Live integration",
    web_lookup: "Web lookup",
    estimate_snapshot: "Estimate snapshot",
  };

  return labels[value ?? ""] ?? "Catalog fallback";
}

function supplierLocationLabel(
  location: SupplierLocation,
) {
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

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingMaterial, setSavingMaterial] =
    useState(false);
  const [uploadingCsv, setUploadingCsv] =
    useState(false);

  const [notice, setNotice] = useState<Notice>(null);

  const [materialForm, setMaterialForm] =
    useState<MaterialForm>(emptyMaterialForm);

  const [csvFile, setCsvFile] =
    useState<File | null>(null);
  const [csvSupplierId, setCsvSupplierId] =
    useState("");
  const [csvLocationId, setCsvLocationId] =
    useState("");

  const loadSuppliers = useCallback(async () => {
    const response = await fetch(
      "/api/procurement-settings",
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      suppliers?: Supplier[];
      error?: string;
    };

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ?? "Suppliers could not be loaded.",
      );
    }

    const nextSuppliers = data.suppliers ?? [];

    setSuppliers(nextSuppliers);

    if (nextSuppliers.length > 0) {
      setMaterialForm((current) => ({
        ...current,
        supplierId:
          current.supplierId ||
          nextSuppliers[0]?.id ||
          "",
      }));

      setCsvSupplierId((current) =>
        current || nextSuppliers[0]?.id || "",
      );
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    const params = new URLSearchParams();

    if (search.trim()) {
      params.set("q", search.trim());
    }

    if (category) {
      params.set("category", category);
    }

    params.set("active", "true");
    params.set("includePrices", "true");

    const response = await fetch(
      `/api/material-catalog?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      materials?: Material[];
      error?: string;
    };

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ?? "Materials could not be loaded.",
      );
    }

    setMaterials(data.materials ?? []);
  }, [category, search]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      await Promise.all([
        loadSuppliers(),
        loadMaterials(),
      ]);
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Materials could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, [loadMaterials, loadSuppliers]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          materials
            .map((material) => material.category)
            .filter(Boolean),
        ),
      ).sort((first, second) =>
        first.localeCompare(second),
      ),
    [materials],
  );

  const materialSupplier = useMemo(
    () =>
      suppliers.find(
        (supplier) =>
          supplier.id === materialForm.supplierId,
      ) ?? null,
    [materialForm.supplierId, suppliers],
  );

  const csvSupplier = useMemo(
    () =>
      suppliers.find(
        (supplier) => supplier.id === csvSupplierId,
      ) ?? null,
    [csvSupplierId, suppliers],
  );

  async function submitMaterial(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !materialForm.category.trim() ||
      !materialForm.description.trim() ||
      !materialForm.unit.trim() ||
      !materialForm.unitCost.trim()
    ) {
      setNotice({
        type: "error",
        message:
          "Category, description, unit, and unit cost are required.",
      });

      return;
    }

    setSavingMaterial(true);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/material-catalog",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sku: materialForm.sku,
            category: materialForm.category,
            description: materialForm.description,
            brand: materialForm.brand,
            productLine: materialForm.productLine,
            unit: materialForm.unit,
            unitCost: materialForm.unitCost,
            wastePercent: materialForm.wastePercent,
            supplierId:
              materialForm.supplierId || null,
            supplierLocationId:
              materialForm.supplierLocationId || null,
            supplierSku: materialForm.supplierSku,
            priceType: "contract",
            sourceType: "manual",
            confidence: "confirmed",
          }),
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ?? "Material could not be saved.",
        );
      }

      setMaterialForm({
        ...emptyMaterialForm,
        supplierId:
          materialForm.supplierId ||
          suppliers[0]?.id ||
          "",
      });

      setNotice({
        type: "success",
        message: "Material added.",
      });

      await loadMaterials();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Material could not be saved.",
      });
    } finally {
      setSavingMaterial(false);
    }
  }

  async function uploadCsv(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!csvFile || !csvSupplierId) {
      setNotice({
        type: "error",
        message:
          "Choose a supplier and a CSV file.",
      });

      return;
    }

    setUploadingCsv(true);
    setNotice(null);

    try {
      const formData = new FormData();

      formData.append("file", csvFile);
      formData.append(
        "supplierId",
        csvSupplierId,
      );

      if (csvLocationId) {
        formData.append(
          "supplierLocationId",
          csvLocationId,
        );
      }

      const response = await fetch(
        "/api/material-catalog",
        {
          method: "POST",
          body: formData,
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        importedRows?: number;
        skippedRows?: number;
        reviewRows?: number;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "The material CSV could not be imported.",
        );
      }

      setCsvFile(null);

      const fileInput =
        document.getElementById(
          "material-csv-file",
        ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      setNotice({
        type: "success",
        message: `${data.importedRows ?? 0} rows imported. ${
          data.skippedRows ?? 0
        } skipped. ${
          data.reviewRows ?? 0
        } need later review.`,
      });

      await loadMaterials();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The material CSV could not be imported.",
      });
    } finally {
      setUploadingCsv(false);
    }
  }

  async function deactivateMaterial(
    material: Material,
  ) {
    const confirmed = window.confirm(
      `Deactivate ${material.description}?`,
    );

    if (!confirmed) {
      return;
    }

    setNotice(null);

    try {
      const response = await fetch(
        `/api/material-catalog?id=${encodeURIComponent(
          material.id,
        )}`,
        {
          method: "DELETE",
        },
      );

      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "Material could not be deactivated.",
        );
      }

      setNotice({
        type: "success",
        message: "Material deactivated.",
      });

      await loadMaterials();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Material could not be deactivated.",
      });
    }
  }

  function handleCsvFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setCsvFile(event.target.files?.[0] ?? null);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-slate-600">
          Loading materials…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Estimating
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Material catalog
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Add materials manually, import supplier pricing,
            and review the price source the estimating system
            will use.
          </p>
        </div>

        <div className="flex gap-4 text-sm font-medium">
          <a
            href="/operations/materials/assemblies"
            className="text-slate-700 underline underline-offset-4"
          >
            Cost book assemblies
          </a>

          <a
            href="/admin/settings/procurement"
            className="text-slate-700 underline underline-offset-4"
          >
            Procurement settings
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

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
        <section className="min-w-0">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row">
              <label className="block flex-1">
                <span className="text-sm font-medium text-slate-800">
                  Search
                </span>

                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Description, SKU, brand, or product line"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="block md:w-64">
                <span className="text-sm font-medium text-slate-800">
                  Category
                </span>

                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">
                    All categories
                  </option>

                  {categories.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => void loadMaterials()}
                className="self-end rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Search
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {materials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="font-medium text-slate-900">
                  No materials found
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Add a material manually or import a supplier CSV.
                </p>
              </div>
            ) : (
              materials.map((material) => {
                const selectedPrice =
                  material.selected_price ?? null;

                const selectedSupplier = firstRelation(
                  selectedPrice?.suppliers,
                );

                const selectedLocation = firstRelation(
                  selectedPrice?.supplier_locations,
                );

                return (
                  <article
                    key={material.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {material.category}
                          </span>

                          {material.brand ? (
                            <span className="text-xs text-slate-500">
                              {material.brand}
                            </span>
                          ) : null}

                          {material.sku ? (
                            <span className="text-xs text-slate-500">
                              SKU {material.sku}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-3 text-lg font-semibold text-slate-950">
                          {material.description}
                        </h2>

                        {material.product_line ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {material.product_line}
                          </p>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-left md:text-right">
                        <p className="text-2xl font-semibold text-slate-950">
                          {currency(
                            material.effective_unit_cost ??
                              material.unit_cost,
                          )}
                        </p>

                        <p className="text-xs text-slate-500">
                          per {material.unit}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-slate-50 px-3 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Price source
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {selectedSupplier?.name ??
                            "Catalog fallback"}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {sourceLabel(
                            selectedPrice?.source_type,
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 px-3 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Location
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {selectedLocation?.name ??
                            "Not specified"}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {[
                            selectedLocation?.city,
                            selectedLocation?.state,
                          ]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 px-3 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Last checked
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {formatDate(
                            selectedPrice?.last_checked_at,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {selectedPrice?.confidence ??
                            "Fallback"}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 px-3 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Waste factor
                        </p>

                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {Number(
                            material.waste_percent,
                          ).toFixed(1)}
                          %
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {material.supplier_prices?.length ?? 0}{" "}
                          supplier price
                          {(material.supplier_prices?.length ??
                            0) === 1
                            ? ""
                            : "s"}
                        </p>
                      </div>
                    </div>

                    {material.needs_live_lookup ? (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        No current supplier price is available.
                        The estimating system may use the catalog
                        fallback until live Lowe&apos;s lookup is
                        connected.
                      </div>
                    ) : null}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void deactivateMaterial(material)
                        }
                        className="text-sm font-medium text-red-700 underline underline-offset-4"
                      >
                        Deactivate
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Import supplier CSV
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Upload a supplier price list or exported quote.
            </p>

            <form
              onSubmit={uploadCsv}
              className="mt-5 space-y-4"
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier
                </span>

                <select
                  value={csvSupplierId}
                  onChange={(event) => {
                    setCsvSupplierId(event.target.value);
                    setCsvLocationId("");
                  }}
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
                  Location
                </span>

                <select
                  value={csvLocationId}
                  onChange={(event) =>
                    setCsvLocationId(event.target.value)
                  }
                  disabled={!csvSupplier}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  <option value="">
                    Any location
                  </option>

                  {csvSupplier?.supplier_locations.map(
                    (location) => (
                      <option
                        key={location.id}
                        value={location.id}
                      >
                        {supplierLocationLabel(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  CSV file
                </span>

                <input
                  id="material-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFile}
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800"
                />
              </label>

              <button
                type="submit"
                disabled={uploadingCsv}
                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadingCsv
                  ? "Importing…"
                  : "Import CSV"}
              </button>
            </form>

            <div className="mt-5 rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">
                Expected columns
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600">
                description, category, unit, unit_cost,
                supplier_sku, sku, brand, product_line,
                waste_percent
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4">
              <p className="text-sm font-semibold text-slate-900">
                AI supplier quote import
              </p>

              <p className="mt-1 text-sm text-slate-600">
                PDF, spreadsheet, image, and email quote
                extraction will be added after live estimating is
                working.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Add material
            </h2>

            <form
              onSubmit={submitMaterial}
              className="mt-5 space-y-4"
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Description
                </span>

                <input
                  type="text"
                  value={materialForm.description}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="2x10x16 pressure-treated lumber"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Category
                  </span>

                  <input
                    type="text"
                    value={materialForm.category}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    placeholder="Framing"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    SKU
                  </span>

                  <input
                    type="text"
                    value={materialForm.sku}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        sku: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Brand
                  </span>

                  <input
                    type="text"
                    value={materialForm.brand}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Product line
                  </span>

                  <input
                    type="text"
                    value={materialForm.productLine}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        productLine: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Unit
                  </span>

                  <input
                    type="text"
                    value={materialForm.unit}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Unit cost
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={materialForm.unitCost}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        unitCost: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Waste %
                  </span>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={materialForm.wastePercent}
                    onChange={(event) =>
                      setMaterialForm((current) => ({
                        ...current,
                        wastePercent: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier
                </span>

                <select
                  value={materialForm.supplierId}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      supplierId: event.target.value,
                      supplierLocationId: "",
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">
                    Catalog price only
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
                  Supplier location
                </span>

                <select
                  value={
                    materialForm.supplierLocationId
                  }
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      supplierLocationId:
                        event.target.value,
                    }))
                  }
                  disabled={!materialSupplier}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  <option value="">
                    Any location
                  </option>

                  {materialSupplier?.supplier_locations.map(
                    (location) => (
                      <option
                        key={location.id}
                        value={location.id}
                      >
                        {supplierLocationLabel(location)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Supplier SKU
                </span>

                <input
                  type="text"
                  value={materialForm.supplierSku}
                  onChange={(event) =>
                    setMaterialForm((current) => ({
                      ...current,
                      supplierSku: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <button
                type="submit"
                disabled={savingMaterial}
                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingMaterial
                  ? "Saving…"
                  : "Add material"}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
