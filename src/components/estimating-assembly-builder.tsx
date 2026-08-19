"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Material = Readonly<{
  id: string;
  description: string;
  brand: string | null;
  product_line: string | null;
  unit: string;
  unit_cost: number;
  effective_unit_cost?: number;
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

type StarterTemplate = Readonly<{
  key: string;
  name: string;
  summary: string;
  description: string;
  components: readonly ComponentDraft[];
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

const starterComponent = (
  componentKey: string,
  label: string,
  changes: Partial<ComponentDraft> = {},
): ComponentDraft => ({
  ...emptyComponent(0),
  componentKey,
  label,
  unit: "square foot",
  wastePercent: "0",
  sourceNotes: "Choose the exact approved product or verified cost source before activating this assembly.",
  ...changes,
});

const ALUMINUM_RAILING_TEMPLATE: StarterTemplate = {
  key: "aluminum_railing_system",
  name: "Aluminum railing — complete compatible system",
  summary: "Level kits, posts, caps, brackets, stair kits, and stair posts from one line.",
  description: "Complete aluminum railing system. Every component must use the same manufacturer and compatible product line; one stair kit covers one stair side only.",
  components: [
    starterComponent("aluminum_level_kits", "Compatible level rail kits", { quantityBasis: "per_linear_foot", unit: "linear foot", compatibilityGroup: "aluminum_railing_product_line", sourceNotes: "Convert reviewed run lengths to whole kits only after the selected kit length is known." }),
    starterComponent("aluminum_posts", "Compatible level and corner posts", { quantityBasis: "per_count", unit: "post", compatibilityGroup: "aluminum_railing_product_line" }),
    starterComponent("aluminum_post_caps", "Compatible post caps", { quantityBasis: "per_count", unit: "cap", compatibilityGroup: "aluminum_railing_product_line" }),
    starterComponent("aluminum_brackets", "Compatible brackets and manufacturer fasteners", { quantityBasis: "manual_review", quantityFactor: "", unit: "package", compatibilityGroup: "aluminum_railing_product_line" }),
    starterComponent("aluminum_stair_kits", "Compatible stair rail kits — one kit per side", { quantityBasis: "per_count", unit: "kit", compatibilityGroup: "aluminum_railing_product_line", sourceNotes: "Compare the measured sloped stair-rail length with the selected kit length and confirm one side or both sides." }),
    starterComponent("aluminum_stair_posts", "Compatible stair posts", { quantityBasis: "per_count", unit: "post", compatibilityGroup: "aluminum_railing_product_line" }),
    starterComponent("aluminum_railing_labor", "Aluminum railing installation labor", { costType: "labor", materialCatalogId: null, quantityBasis: "per_linear_foot", unit: "linear foot" }),
  ],
};

const VINYL_RAILING_TEMPLATE: StarterTemplate = {
  key: "vinyl_railing_system",
  name: "Vinyl railing — complete compatible system",
  summary: "Rails, posts, caps, brackets, stair kits, and stair posts from one manufacturer line.",
  description: "Complete vinyl railing system. Every component must use the same manufacturer and compatible product line; one stair kit covers one stair side only.",
  components: [
    starterComponent("vinyl_level_kits", "Compatible level rail kits", { quantityBasis: "per_linear_foot", unit: "linear foot", compatibilityGroup: "vinyl_railing_product_line", sourceNotes: "Convert reviewed run lengths to whole kits only after the selected kit length is known." }),
    starterComponent("vinyl_posts", "Compatible level and corner posts", { quantityBasis: "per_count", unit: "post", compatibilityGroup: "vinyl_railing_product_line" }),
    starterComponent("vinyl_post_caps", "Compatible post caps", { quantityBasis: "per_count", unit: "cap", compatibilityGroup: "vinyl_railing_product_line" }),
    starterComponent("vinyl_brackets", "Compatible brackets and manufacturer fasteners", { quantityBasis: "manual_review", quantityFactor: "", unit: "package", compatibilityGroup: "vinyl_railing_product_line" }),
    starterComponent("vinyl_stair_kits", "Compatible stair rail kits — one kit per side", { quantityBasis: "per_count", unit: "kit", compatibilityGroup: "vinyl_railing_product_line", sourceNotes: "Compare the measured sloped stair-rail length with the selected kit length and confirm one side or both sides." }),
    starterComponent("vinyl_stair_posts", "Compatible stair posts", { quantityBasis: "per_count", unit: "post", compatibilityGroup: "vinyl_railing_product_line" }),
    starterComponent("vinyl_railing_labor", "Vinyl railing installation labor", { costType: "labor", materialCatalogId: null, quantityBasis: "per_linear_foot", unit: "linear foot" }),
  ],
};

const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  ALUMINUM_RAILING_TEMPLATE,
  VINYL_RAILING_TEMPLATE,
];

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function materialLabel(material: Material) {
  const price = Number(material.effective_unit_cost ?? material.unit_cost);
  const priceLabel = Number.isFinite(price) && price > 0
    ? `$${price.toFixed(2)}/${material.unit}`
    : "Price not set";
  return `${[material.brand, material.product_line, material.description].filter(Boolean).join(" — ")} (${priceLabel})`;
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
  const missingProductCount = useMemo(
    () => components.filter((component) => component.costType === "material" && !component.materialCatalogId).length,
    [components],
  );
  const basicFieldsReady = Boolean(name.trim() && assemblyKey.trim() && tradeCode.trim());

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

  function loadStarterTemplate(template: StarterTemplate) {
    setSelectedId(null);
    setName(template.name);
    setAssemblyKey(template.key);
    setTradeCode("deck");
    setDescription(template.description);
    setStatus("draft");
    setRevision(null);
    setComponents(template.components.map((component) => ({ ...component })));
    setNotice({
      type: "success",
      message: `${template.name} loaded for review. Choose exact catalog products and verify the rules before saving.`,
    });
    window.requestAnimationFrame(() => document.getElementById("assembly-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Compatible railing systems</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Use an assembly only when one manufacturer&apos;s components must work together. Decking, framing, wood railing, cable railing, labor, and equipment are calculated or selected elsewhere.
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/operations/materials" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900">Product catalog</a>
          <button type="button" onClick={clearEditor} className="min-h-11 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">New system assembly</button>
        </div>
      </header>

      {notice ? <div role="status" className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${notice.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>{notice.message}</div> : null}

      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-6" aria-labelledby="starter-library-title">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Start here</p>
          <h2 id="starter-library-title" className="mt-1 text-xl font-bold text-slate-950">Manufacturer-system starters</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Start only with aluminum or vinyl railing, where compatible kits, posts, brackets, caps, and stair parts must stay in one product line. Ordinary deck materials do not need an assembly.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STARTER_TEMPLATES.map((template) => (
            <article key={template.key} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-bold text-slate-950">{template.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-5 text-slate-600">{template.summary}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{template.components.length} components · products still need review</p>
              <button type="button" onClick={() => loadStarterTemplate(template)} className="mt-4 min-h-11 w-full rounded-lg border border-blue-300 bg-blue-50 px-4 text-sm font-bold text-blue-950 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                Review template
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="assembly-editor" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">{selected ? `Edit ${selected.name}` : "Build an assembly"}</h2>
          <p className="mt-1 text-sm text-slate-600">Keep the name plain: “Deckorators Contemporary aluminum railing” or “Freedom vinyl railing.”</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">Assembly name
              <input value={name} onChange={(event) => { setName(event.target.value); if (!selectedId) setAssemblyKey(slug(event.target.value)); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-950" placeholder="Compatible railing system" />
            </label>
            <label className="text-sm font-semibold text-slate-800">Assembly key
              <input value={assemblyKey} onChange={(event) => setAssemblyKey(slug(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-950" placeholder="manufacturer_railing_system" />
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
                  {component.costType === "material" ? <label className="text-sm font-semibold text-slate-800 md:col-span-2">Catalog product<select value={component.materialCatalogId ?? ""} onChange={(event) => { const material = materials.find((item) => item.id === event.target.value); updateComponent(index, { materialCatalogId: event.target.value || null, unit: material?.unit ?? component.unit, wastePercent: String(material?.waste_percent ?? component.wastePercent) }); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"><option value="">Choose an approved product</option>{materials.map((material) => <option key={material.id} value={material.id}>{materialLabel(material)}</option>)}</select></label> : null}
                  <label className="text-sm font-semibold text-slate-800">Quantity rule<select value={component.quantityBasis} onChange={(event) => updateComponent(index, { quantityBasis: event.target.value as ComponentDraft["quantityBasis"], quantityFactor: event.target.value === "manual_review" ? "" : component.quantityFactor || "1" })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"><option value="per_square_foot">Per square foot</option><option value="per_linear_foot">Per linear foot</option><option value="per_count">Per counted item</option><option value="fixed_each">Fixed amount</option><option value="manual_review">Manual review</option></select></label>
                  {component.quantityBasis !== "manual_review" ? <label className="text-sm font-semibold text-slate-800">Amount per unit<input type="number" min="0.000001" step="any" value={component.quantityFactor} onChange={(event) => updateComponent(index, { quantityFactor: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label> : null}
                  <label className="text-sm font-semibold text-slate-800">Output unit<input value={component.unit} onChange={(event) => updateComponent(index, { unit: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label>
                  <label className="text-sm font-semibold text-slate-800">Waste %<input type="number" min="0" max="100" step="0.1" value={component.wastePercent} onChange={(event) => updateComponent(index, { wastePercent: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" /></label>
                  <label className="text-sm font-semibold text-slate-800">Compatibility group<input value={component.compatibilityGroup} onChange={(event) => updateComponent(index, { compatibilityGroup: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950" placeholder="trex_transcend_lineage" /></label>
                  <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold text-slate-800"><input type="checkbox" checked={component.required} onChange={(event) => updateComponent(index, { required: event.target.checked })} className="h-5 w-5" />Required in this package</label>
                  <label className="text-sm font-semibold text-slate-800 md:col-span-2">Review notes<textarea value={component.sourceNotes} onChange={(event) => updateComponent(index, { sourceNotes: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal text-slate-950" placeholder="What must be verified before this component is used?" /></label>
                </div>
              </article>
            ))}
          </div>

          {missingProductCount > 0 ? <p role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">Choose {missingProductCount} approved catalog product{missingProductCount === 1 ? "" : "s"} before saving. The template remains an unsaved review draft until then.</p> : null}
          <button type="button" disabled={saving || missingProductCount > 0 || !basicFieldsReady} onClick={() => void save()} className="mt-4 min-h-12 w-full rounded-lg bg-blue-700 px-5 text-base font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{saving ? "Saving…" : status === "active" ? "Save active assembly" : "Save draft assembly"}</button>
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
