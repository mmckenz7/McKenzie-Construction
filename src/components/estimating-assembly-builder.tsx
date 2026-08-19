"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Material = Readonly<{
  id: string;
  description: string;
  brand: string | null;
  product_line: string | null;
  unit: string;
  unit_cost: number;
  waste_percent: number;
}>;

type ComponentDraft = Readonly<{
  componentKey: string;
  label: string;
  costType: "material" | "labor" | "subcontractor" | "equipment" | "other";
  materialCatalogId: string | null;
  quantityBasis: "fixed_each" | "per_linear_foot" | "per_square_foot" | "per_count" | "manual_review";
  quantityFactor: string;
  unit: string;
  wastePercent: string;
  required: boolean;
  compatibilityGroup: string;
  sourceNotes: string;
}>;

type Assembly = Readonly<{
  id: string;
  assembly_key: string;
  name: string;
  trade_code: string;
  description: string | null;
  status: "draft" | "active" | "retired";
  row_revision: number;
  estimating_assembly_components: Array<Readonly<{
    component_key: string;
    label: string;
    cost_type: ComponentDraft["costType"];
    material_catalog_id: string | null;
    quantity_basis: ComponentDraft["quantityBasis"];
    quantity_factor: number | null;
    unit: string;
    waste_percent: number;
    required: boolean;
    compatibility_group: string | null;
    source_notes: string | null;
    sort_order: number;
  }>>;
}>;

const emptyComponent = (index: number): ComponentDraft => ({
  componentKey: `component_${index + 1}`,
  label: "",
  costType: "material",
  materialCatalogId: null,
  quantityBasis: "per_square_foot",
  quantityFactor: "1",
  unit: "each",
  wastePercent: "0",
  required: true,
  compatibilityGroup: "",
  sourceNotes: "",
});

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function materialLabel(material: Material) {
  return [material.brand, material.product_line, material.description].filter(Boolean).join(" — ");
}

export function EstimatingAssemblyBuilder() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [assemblyKey, setAssemblyKey] = useState("");
  const [tradeCode, setTradeCode] = useState("deck");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Assembly["status"]>("draft");
  const [revision, setRevision] = useState<number | null>(null);
  const [components, setComponents] = useState<ComponentDraft[]>([emptyComponent(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assemblyResponse, materialResponse] = await Promise.all([
        fetch("/api/estimating-assemblies", { cache: "no-store" }),
        fetch("/api/material-catalog?active=true&includePrices=true", { cache: "no-store" }),
      ]);
      const assemblyData = await assemblyResponse.json() as { success: boolean; assemblies?: Assembly[]; error?: string };
      const materialData = await materialResponse.json() as { success: boolean; materials?: Material[]; error?: string };
      if (!assemblyResponse.ok || !assemblyData.success) throw new Error(assemblyData.error ?? "Assemblies could not be loaded.");
      if (!materialResponse.ok || !materialData.success) throw new Error(materialData.error ?? "Products could not be loaded.");
      setAssemblies(assemblyData.assemblies ?? []);
      setMaterials(materialData.materials ?? []);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "The cost book could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => assemblies.find((assembly) => assembly.id === selectedId) ?? null, [assemblies, selectedId]);

  function clearEditor() {
    setSelectedId(null);
    setName("");
    setAssemblyKey("");
    setTradeCode("deck");
    setDescription("");
    setStatus("draft");
    setRevision(null);
    setComponents([emptyComponent(0)]);
    setNotice(null);
  }

  function editAssembly(assembly: Assembly) {
    setSelectedId(assembly.id);
    setName(assembly.name);
    setAssemblyKey(assembly.assembly_key);
    setTradeCode(assembly.trade_code);
    setDescription(assembly.description ?? "");
    setStatus(assembly.status);
    setRevision(assembly.row_revision);
    setComponents([...assembly.estimating_assembly_components]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((component) => ({
        componentKey: component.component_key,
        label: component.label,
        costType: component.cost_type,
        materialCatalogId: component.material_catalog_id,
        quantityBasis: component.quantity_basis,
        quantityFactor: component.quantity_factor === null ? "" : String(component.quantity_factor),
        unit: component.unit,
        wastePercent: String(component.waste_percent),
        required: component.required,
        compatibilityGroup: component.compatibility_group ?? "",
        sourceNotes: component.source_notes ?? "",
      })));
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateComponent(index: number, changes: Partial<ComponentDraft>) {
    setComponents((current) => current.map((component, itemIndex) => itemIndex === index ? { ...component, ...changes } : component));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/estimating-assemblies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          expectedRevision: revision,
          assemblyKey,
          name,
          tradeCode,
          description,
          status,
          components: components.map((component) => ({
            ...component,
            quantityFactor: component.quantityBasis === "manual_review" ? null : component.quantityFactor,
          })),
        }),
      });
      const data = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? "Assembly could not be saved.");
      setNotice({ type: "success", message: "Assembly saved to the estimating cost book." });
      await load();
      clearEditor();
      setNotice({ type: "success", message: "Assembly saved to the estimating cost book." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Assembly could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-700">Loading the estimating cost book…</p>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">Estimating</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Cost book assemblies</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Save a complete work package once. A future reviewed takeoff supplies the square feet, linear feet, or count; this assembly supplies the products, labor, equipment, waste, and compatibility rules.
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/operations/materials" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">Product catalog</a>
          <button type="button" onClick={clearEditor} className="min-h-11 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">New assembly</button>
        </div>
      </header>

      {notice ? <div role="status" className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${notice.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>{notice.message}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">{selected ? `Edit ${selected.name}` : "Build an assembly"}</h2>
          <p className="mt-1 text-sm text-slate-600">Keep the name plain: “Composite decking — grooved field boards” or “Aluminum railing — complete compatible system.”</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">Assembly name
              <input value={name} onChange={(event) => { setName(event.target.value); if (!selectedId) setAssemblyKey(slug(event.target.value)); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-950" placeholder="Composite decking package" />
            </label>
            <label className="text-sm font-semibold text-slate-800">Assembly key
              <input value={assemblyKey} onChange={(event) => setAssemblyKey(slug(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-950" placeholder="composite_decking" />
            </label>
            <label className="text-sm font-semibold text-slate-800">Trade
              <input value={tradeCode} onChange={(event) => setTradeCode(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-950" />
            </label>
            <label className="text-sm font-semibold text-slate-800">Status
              <select value={status} onChange={(event) => setStatus(event.target.value as Assembly["status"])} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950">
                <option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-800">What this package covers
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-slate-950" placeholder="Products and work included in this reusable package." />
          </label>

          <div className="mt-7 flex items-center justify-between">
            <div><h3 className="font-bold text-slate-950">Components</h3><p className="text-sm text-slate-600">Every row explains how quantity is calculated.</p></div>
            <button type="button" onClick={() => setComponents((current) => [...current, emptyComponent(current.length)])} className="min-h-11 rounded-lg border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-900">Add component</button>
          </div>

          <div className="mt-4 space-y-4">
            {components.map((component, index) => (
              <article key={`${component.componentKey}-${index}`} className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3"><h4 className="font-bold text-slate-950">Component {index + 1}</h4><button type="button" disabled={components.length === 1} onClick={() => setComponents((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-sm font-semibold text-red-700 disabled:text-slate-400">Remove</button></div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-800">Component label<input value={component.label} onChange={(event) => updateComponent(index, { label: event.target.value, componentKey: slug(event.target.value) || component.componentKey })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" placeholder="Grooved field deck boards" /></label>
                  <label className="text-sm font-semibold text-slate-800">Cost type<select value={component.costType} onChange={(event) => updateComponent(index, { costType: event.target.value as ComponentDraft["costType"], materialCatalogId: event.target.value === "material" ? component.materialCatalogId : null })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"><option value="material">Material</option><option value="labor">Labor</option><option value="subcontractor">Subcontractor</option><option value="equipment">Equipment</option><option value="other">Other</option></select></label>
                  {component.costType === "material" ? <label className="text-sm font-semibold text-slate-800 md:col-span-2">Catalog product<select value={component.materialCatalogId ?? ""} onChange={(event) => { const material = materials.find((item) => item.id === event.target.value); updateComponent(index, { materialCatalogId: event.target.value || null, unit: material?.unit ?? component.unit, wastePercent: String(material?.waste_percent ?? component.wastePercent) }); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"><option value="">Choose an approved product</option>{materials.map((material) => <option key={material.id} value={material.id}>{materialLabel(material)} (${Number(material.unit_cost).toFixed(2)}/{material.unit})</option>)}</select></label> : null}
                  <label className="text-sm font-semibold text-slate-800">Quantity rule<select value={component.quantityBasis} onChange={(event) => updateComponent(index, { quantityBasis: event.target.value as ComponentDraft["quantityBasis"], quantityFactor: event.target.value === "manual_review" ? "" : component.quantityFactor || "1" })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"><option value="per_square_foot">Per square foot</option><option value="per_linear_foot">Per linear foot</option><option value="per_count">Per counted item</option><option value="fixed_each">Fixed amount</option><option value="manual_review">Manual review</option></select></label>
                  {component.quantityBasis !== "manual_review" ? <label className="text-sm font-semibold text-slate-800">Amount per unit<input type="number" min="0.000001" step="any" value={component.quantityFactor} onChange={(event) => updateComponent(index, { quantityFactor: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label> : null}
                  <label className="text-sm font-semibold text-slate-800">Output unit<input value={component.unit} onChange={(event) => updateComponent(index, { unit: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label>
                  <label className="text-sm font-semibold text-slate-800">Waste %<input type="number" min="0" max="100" step="0.1" value={component.wastePercent} onChange={(event) => updateComponent(index, { wastePercent: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label>
                  <label className="text-sm font-semibold text-slate-800">Compatibility group<input value={component.compatibilityGroup} onChange={(event) => updateComponent(index, { compatibilityGroup: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" placeholder="trex_transcend_lineage" /></label>
                  <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold text-slate-800"><input type="checkbox" checked={component.required} onChange={(event) => updateComponent(index, { required: event.target.checked })} className="h-5 w-5" />Required in this package</label>
                </div>
              </article>
            ))}
          </div>

          <button type="button" disabled={saving} onClick={() => void save()} className="mt-6 min-h-12 w-full rounded-lg bg-blue-700 px-5 text-base font-bold text-white hover:bg-blue-800 disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{saving ? "Saving…" : status === "active" ? "Save active assembly" : "Save draft assembly"}</button>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:self-start">
          <h2 className="font-bold text-slate-950">Saved assemblies</h2>
          <p className="mt-1 text-sm text-slate-600">{assemblies.length} reusable package{assemblies.length === 1 ? "" : "s"}</p>
          <div className="mt-4 space-y-3">
            {assemblies.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No assemblies yet. Start with one finish package or one labor package.</p> : assemblies.map((assembly) => <button key={assembly.id} type="button" onClick={() => editAssembly(assembly)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white p-3 text-left hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span className="block font-bold text-slate-950">{assembly.name}</span><span className="mt-1 block text-xs font-medium uppercase tracking-wide text-slate-600">{assembly.trade_code} · {assembly.status} · {assembly.estimating_assembly_components.length} components</span></button>)}
          </div>
        </aside>
      </div>
    </main>
  );
}
