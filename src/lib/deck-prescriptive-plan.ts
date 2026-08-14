export const KNOXVILLE_2024_DECK_PROFILE = Object.freeze({
  id: "city-knoxville-2024-irc-r507-southern-pine-v2",
  label: "City of Knoxville · 2024 IRC R507 · bounded Southern Pine draft v2",
  controllingCodeUrl: "https://permits.knoxvilletn.gov/Codes-Requests/Construction-Codes",
  codeSourceUrl: "https://codes.iccsafe.org/content/IRC2024P2/chapter-5-floors",
  formatReferenceUrl: "https://permits.knoxvilletn.gov/Policies-Fast-Facts/Fast-Fact-Guides",
  industryReferenceUrl: "https://awc.org/wp-content/uploads/2022/02/AWC-DCA62015-DeckGuide-1804.pdf",
  rules: ["IRC2024:R507.3.1", "IRC2024:R507.4", "IRC2024:Table-R507.5(1)", "IRC2024:Table-R507.6"] as const,
} as const);

export type DeckPrescriptiveDraft = Readonly<{
  jurisdiction: "" | "city_knoxville_verified" | "other_or_uncertain";
  attachment: "" | "ledger" | "freestanding";
  attachmentConfirmed: boolean;
  ledgerSubstrate: "" | "verified_band_rim" | "masonry_veneer" | "concrete_or_other" | "unknown";
  joistDirection: "" | "house_to_yard" | "side_to_side";
  joistSpacingInches: "" | "12" | "16" | "24";
  joistSize: "" | "2x6" | "2x8" | "2x10" | "2x12";
  speciesGrade: "" | "southern_pine_no2";
  treatmentService: "" | "pressure_treated_wet_service";
  designLoad: "" | "40_live_10_dead";
  beamLineCount: string;
  beamSize: "" | "2x6" | "2x8" | "2x10" | "2x12";
  beamPlies: "" | "1" | "2" | "3";
  postCount: string;
  postSize: "" | "4x4" | "6x6";
  postHeightFeet: string;
  footingCount: string;
  footingDiameterInches: string;
  footingThicknessInches: string;
  footingDepthInches: string;
  soilBearingPsf: "" | "1500";
  frostBasis: string;
  extraBlockingRows: string;
  hardwareBasis: string;
  stairsIncluded: "" | "yes" | "no";
  railingsIncluded: "" | "yes" | "no";
  stairsConfirmed: boolean;
  stairStringerCount: string;
  stairLandingFootingCount: string;
  unusualGeometry: boolean;
  cantilever: boolean;
  roofOrSpecialLoad: boolean;
  soilOrFootingUncertain: boolean;
}>;

export type FramingBomLine = Readonly<{ key: string; description: string; quantity: number; unit: "ea" | "ln ft" | "cu yd"; sourceId: string }>;
export type FramingHardwareRequirement = Readonly<{
  key: string;
  quantity: number;
  unit: "ea" | "ln ft";
  specification: string;
  sourceId: string;
  selectionStatus: "compatible_product_and_price_required" | "detail_required";
}>;
export type DeckPrescriptivePlan = Readonly<{
  evidenceVersion: "deck-framing-evidence-v2";
  status: "ready_for_human_review" | "exception_review";
  profileId: typeof KNOXVILLE_2024_DECK_PROFILE.id;
  inputs: Readonly<{ lengthFeet: number; widthFeet: number; draft: DeckPrescriptiveDraft }>;
  checks: readonly Readonly<{ sourceId: string; result: "pass" | "exception"; actual: string; limit: string }>[];
  unresolvedPackages: readonly ("stairs" | "connector_schedule" | "guard_schedule")[];
  exceptions: readonly string[];
  quantities: Readonly<{ joists: number; beamLinearFeet: number; posts: number; footings: number; blockingPieces: number; ledgerLinearFeet: number; rimLinearFeet: number; joistHangers: number; postBases: number; postCaps: number; stairStringers: number; stairLandingFootings: number }> | null;
  bom: readonly FramingBomLine[];
  hardwareSchedule: readonly FramingHardwareRequirement[];
  reference: string | null;
}>;

const JOIST_MAX: Record<string, Record<string, number>> = {
  "2x6": { "12": 11 + 11 / 12, "16": 9, "24": 7 + 7 / 12 },
  "2x8": { "12": 13 + 1 / 12, "16": 11 + 10 / 12, "24": 9 + 8 / 12 },
  "2x10": { "12": 16 + 2 / 12, "16": 14, "24": 11 + 5 / 12 },
  "2x12": { "12": 18, "16": 16 + 6 / 12, "24": 13 + 6 / 12 },
};
// Exact no-cantilever `12 & 0` column from IRC 2024 Table R507.5(1).
const BEAM_MAX_AT_12: Record<string, Record<string, number>> = {
  "2x6": { "1": 4, "2": 5 + 11 / 12, "3": 7 + 5 / 12 },
  "2x8": { "1": 5 + 1 / 12, "2": 7 + 7 / 12, "3": 9 + 6 / 12 },
  "2x10": { "1": 6, "2": 9, "3": 11 + 2 / 12 },
  "2x12": { "1": 7 + 1 / 12, "2": 10 + 7 / 12, "3": 13 + 3 / 12 },
};
const FOOTING_1500 = [{ area: 20, diameter: 14, thickness: 6 }, { area: 40, diameter: 20, thickness: 6 }, { area: 60, diameter: 24, thickness: 8 }, { area: 80, diameter: 28, thickness: 9 }, { area: 100, diameter: 31, thickness: 11 }, { area: 120, diameter: 34, thickness: 12 }, { area: 140, diameter: 37, thickness: 13 }, { area: 160, diameter: 40, thickness: 15 }];
const POST_MAX_4X4 = [{ area: 20, height: 14 }, { area: 40, height: 13 + 8 / 12 }, { area: 60, height: 11 }, { area: 80, height: 9 + 5 / 12 }, { area: 100, height: 8 + 4 / 12 }, { area: 120, height: 7 + 5 / 12 }, { area: 140, height: 6 + 9 / 12 }, { area: 160, height: 6 + 2 / 12 }];

const positive = (value: string) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; };
const whole = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0 ? Number(value) : null;
const lookupCeiling = <T extends { area: number }>(rows: readonly T[], area: number) => rows.find((row) => area <= row.area) ?? null;

export function recommendedPrescriptiveDraft(attachment: "ledger" | "freestanding", stairs: boolean, lengthFeet = 0, widthFeet = 0, railings = true): DeckPrescriptiveDraft {
  const tributaryArea = lengthFeet > 0 && widthFeet > 0 ? widthFeet * (lengthFeet / 2) / 2 : 0;
  const footing = lookupCeiling(FOOTING_1500, tributaryArea);
  const beamSpan = lengthFeet > 0 ? lengthFeet / 2 : 0;
  const beamOptions = Object.entries(BEAM_MAX_AT_12).flatMap(([size, plies]) => Object.entries(plies).map(([ply, limit]) => ({ size: size as DeckPrescriptiveDraft["beamSize"], ply: ply as DeckPrescriptiveDraft["beamPlies"], limit, material: Number(size.slice(2)) * Number(ply) }))).filter((option) => beamSpan > 0 && beamSpan <= option.limit).sort((a, b) => a.material - b.material || Number(a.ply) - Number(b.ply) || Number(a.size.slice(2)) - Number(b.size.slice(2)));
  const beam = beamOptions[0];
  return { jurisdiction: "", attachment, attachmentConfirmed: false, ledgerSubstrate: attachment === "ledger" ? "" : "unknown", joistDirection: "house_to_yard", joistSpacingInches: "16", joistSize: "2x10", speciesGrade: "southern_pine_no2", treatmentService: "pressure_treated_wet_service", designLoad: "40_live_10_dead", beamLineCount: attachment === "ledger" ? "1" : "2", beamSize: beam?.size ?? "", beamPlies: beam?.ply ?? "", postCount: "3", postSize: "6x6", postHeightFeet: "", footingCount: "3", footingDiameterInches: footing ? String(footing.diameter) : "", footingThicknessInches: footing ? String(footing.thickness) : "", footingDepthInches: "", soilBearingPsf: "1500", frostBasis: "", extraBlockingRows: "0", hardwareBasis: "", stairsIncluded: stairs ? "yes" : "no", railingsIncluded: railings ? "yes" : "no", stairsConfirmed: false, stairStringerCount: stairs ? "3" : "0", stairLandingFootingCount: stairs ? "2" : "0", unusualGeometry: false, cantilever: false, roofOrSpecialLoad: false, soilOrFootingUncertain: false };
}

export function buildPrescriptiveDeckPlan(args: Readonly<{ lengthFeet: number; widthFeet: number; draft: DeckPrescriptiveDraft }>): DeckPrescriptivePlan {
  const d = args.draft; const exceptions: string[] = []; const checks: { sourceId: string; result: "pass" | "exception"; actual: string; limit: string }[] = [];
  const fail = (message: string) => exceptions.push(message);
  if (!Number.isFinite(args.lengthFeet) || !Number.isFinite(args.widthFeet) || args.lengthFeet <= 0 || args.widthFeet <= 0 || args.lengthFeet > 40 || args.widthFeet > 18) fail("Deck dimensions must be finite, positive, and within this profile's 40 ft × 18 ft rectangular limit.");
  if (d.jurisdiction !== "city_knoxville_verified") fail("City of Knoxville jurisdiction is not explicitly verified.");
  if (!d.attachmentConfirmed || !d.stairsConfirmed) fail("Confirm the blueprint attachment and stair facts before review.");
  if (!d.attachment || !d.stairsIncluded || !d.railingsIncluded) fail("Confirm attachment, stair, and railing applicability from the approved field facts.");
  if (d.attachment === "freestanding") fail("Freestanding support geometry is not supported by this profile yet; use an engineer/AHJ-approved plan.");
  if (d.attachment === "ledger" && d.ledgerSubstrate !== "verified_band_rim") fail("This ledger path supports attachment only to a verified house band/rim joist; concrete, veneer, concealed, and other substrates need an approved detail.");
  if (d.speciesGrade !== "southern_pine_no2" || d.treatmentService !== "pressure_treated_wet_service") fail("This profile supports only No. 2 Southern Pine with the wet-service table factor and verified pressure treatment/service use.");
  if (d.designLoad !== "40_live_10_dead") fail("This profile supports only 40 psf live plus 10 psf dead load; snow or greater loads require another approved profile.");
  if (d.unusualGeometry || d.cantilever || d.roofOrSpecialLoad) fail("Nonrectangular geometry, cantilevers, roofs, hot tubs, and special loads are outside this profile.");
  if (d.soilOrFootingUncertain || d.soilBearingPsf !== "1500" || !d.frostBasis.trim()) fail("Document 1,500 psf soil bearing and the AHJ-verified frost-depth basis; uncertain soil/frost conditions stop the draft.");
  const beamLines = whole(d.beamLineCount), plies = whole(d.beamPlies), posts = whole(d.postCount), footings = whole(d.footingCount), postHeight = positive(d.postHeightFeet), footingDiameter = positive(d.footingDiameterInches), footingThickness = positive(d.footingThicknessInches), footingDepth = positive(d.footingDepthInches);
  if (!beamLines || !plies || !posts || !footings || !postHeight || !footingDiameter || !footingThickness || !footingDepth) fail("Enter positive beam, post, and footing dimensions/counts.");
  if (d.attachment === "ledger" && beamLines !== 1) fail("The supported attached layout has exactly one exterior beam line.");
  if ((posts ?? 0) > 20 || (footings ?? 0) > 24 || (postHeight ?? 0) > 14 || (footingDiameter ?? 0) > 120 || (footingThickness ?? 0) > 48 || (footingDepth ?? 0) > 120) fail("A count or dimension exceeds this profile's bounded input limits.");
  if (!/^\d+$/.test(d.extraBlockingRows) || Number(d.extraBlockingRows) > 10) fail("Extra blocking rows must be a whole number from 0 through 10.");
  if (posts && footings && footings < posts) fail("Provide at least one footing per post.");
  if (d.joistDirection !== "house_to_yard") fail("The initial profile supports joists running house-to-yard only.");
  const joistSpan = args.widthFeet; const joistLimit = d.joistSize && d.joistSpacingInches ? JOIST_MAX[d.joistSize]?.[d.joistSpacingInches] : null;
  if (!joistLimit || joistSpan > joistLimit) fail("Joist size/spacing/span exceeds IRC 2024 Table R507.6 or is unsupported.");
  checks.push({ sourceId: "IRC2024:Table-R507.6", result: joistLimit && joistSpan <= joistLimit ? "pass" : "exception", actual: `${joistSpan} ft`, limit: joistLimit ? `${joistLimit.toFixed(2)} ft max` : "unsupported" });
  const beamSpan = posts ? args.lengthFeet / Math.max(1, posts - 1) : Infinity;
  const beamLimit = joistSpan === 12 && d.beamSize && d.beamPlies ? BEAM_MAX_AT_12[d.beamSize]?.[d.beamPlies] : null;
  if (!beamLimit || beamSpan > beamLimit) fail("Beam check is supported only for an exact 12 ft joist span and the listed Southern Pine sizes/plies; post spacing exceeds the table limit or is unsupported.");
  checks.push({ sourceId: "IRC2024:Table-R507.5(1):12ft-no-cantilever", result: beamLimit && beamSpan <= beamLimit ? "pass" : "exception", actual: `${beamSpan.toFixed(2)} ft`, limit: beamLimit ? `${beamLimit.toFixed(2)} ft max` : "unsupported" });
  const tributaryArea = joistSpan * beamSpan / 2; const postRow = lookupCeiling(POST_MAX_4X4, tributaryArea); const postLimit = d.postSize === "4x4" ? postRow?.height ?? null : d.postSize === "6x6" ? 14 : null;
  if (!postLimit || !postHeight || postHeight > postLimit) fail("Post size/height exceeds IRC 2024 Table R507.4 or is unsupported.");
  checks.push({ sourceId: "IRC2024:Table-R507.4", result: postLimit && postHeight && postHeight <= postLimit ? "pass" : "exception", actual: `${postHeight ?? "?"} ft at ${tributaryArea.toFixed(2)} sq ft tributary`, limit: postLimit ? `${postLimit.toFixed(2)} ft max` : "unsupported" });
  const footingRow = lookupCeiling(FOOTING_1500, tributaryArea);
  if (!footingRow || !footingDiameter || !footingThickness || footingDiameter < footingRow.diameter || footingThickness < footingRow.thickness || !footingDepth) fail("Footing diameter/thickness/depth does not satisfy IRC 2024 Table R507.3.1 plus the documented frost basis.");
  checks.push({ sourceId: "IRC2024:Table-R507.3.1:1500psf", result: footingRow && footingDiameter && footingThickness && footingDiameter >= footingRow.diameter && footingThickness >= footingRow.thickness ? "pass" : "exception", actual: `${footingDiameter ?? "?"} in dia × ${footingThickness ?? "?"} in thick; ${tributaryArea.toFixed(2)} sq ft`, limit: footingRow ? `≥${footingRow.diameter} in dia × ≥${footingRow.thickness} in thick` : "unsupported" });
  const unresolvedPackages = Object.freeze([...(d.stairsIncluded === "yes" ? ["stairs" as const] : []), ...(d.railingsIncluded === "yes" ? ["guard_schedule" as const] : []), "connector_schedule" as const]);
  const inputs = Object.freeze({ lengthFeet: args.lengthFeet, widthFeet: args.widthFeet, draft: d });
  if (exceptions.length) return Object.freeze({ evidenceVersion: "deck-framing-evidence-v2", status: "exception_review", profileId: KNOXVILLE_2024_DECK_PROFILE.id, inputs, checks: Object.freeze(checks), unresolvedPackages, exceptions: Object.freeze(exceptions), quantities: null, bom: Object.freeze([]), hardwareSchedule: Object.freeze([]), reference: null });
  const spacing = Number(d.joistSpacingInches), joists = Math.ceil(args.lengthFeet * 12 / spacing) + 1, blockingRows = Math.max(0, Number(d.extraBlockingRows) || 0), blockingPieces = blockingRows * (joists - 1), beamLF = beamLines! * args.lengthFeet * plies!, ledgerLF = d.attachment === "ledger" ? args.lengthFeet : 0, rimLF = d.attachment === "ledger" ? args.lengthFeet + 2 * args.widthFeet : 2 * (args.lengthFeet + args.widthFeet), concreteCubicYards = Math.PI * Math.pow(footingDiameter! / 24, 2) * (footingThickness! / 12) * footings! / 27;
  const quantities = Object.freeze({ joists, beamLinearFeet: beamLF, posts: posts!, footings: footings!, blockingPieces, ledgerLinearFeet: ledgerLF, rimLinearFeet: rimLF, joistHangers: d.attachment === "ledger" ? joists : 0, postBases: posts!, postCaps: posts!, stairStringers: 0, stairLandingFootings: 0 });
  const bom: FramingBomLine[] = [
    { key: "joists", description: `PT No. 2 Southern Pine ${d.joistSize} × ${args.widthFeet} ft joists`, quantity: joists, unit: "ea", sourceId: "IRC2024:Table-R507.6" },
    { key: "beam_plies", description: `PT No. 2 Southern Pine ${d.beamSize} × ${args.lengthFeet} ft beam plies`, quantity: beamLines! * plies!, unit: "ea", sourceId: "IRC2024:Table-R507.5(1)" },
    { key: "posts", description: `PT No. 2 Southern Pine ${d.postSize} × ${postHeight!} ft posts`, quantity: posts!, unit: "ea", sourceId: "IRC2024:Table-R507.4" },
    { key: "footing_concrete", description: `${footingDiameter} in round × ${footingThickness} in pad-only concrete volume; bottom depth ${footingDepth} in (pier/stem concrete not included)`, quantity: Number(concreteCubicYards.toFixed(3)), unit: "cu yd", sourceId: "IRC2024:Table-R507.3.1" },
    { key: "joist_hanger_locations", description: "Geometric joist-hanger connection locations; connector model and fasteners unresolved", quantity: quantities.joistHangers, unit: "ea", sourceId: "approved-plan-geometry-only" },
    { key: "post_base_locations", description: "Geometric post-base connection locations; connector model and anchors unresolved", quantity: quantities.postBases, unit: "ea", sourceId: "approved-plan-geometry-only" },
    { key: "post_cap_locations", description: "Geometric post-cap connection locations; connector model and fasteners unresolved", quantity: quantities.postCaps, unit: "ea", sourceId: "approved-plan-geometry-only" },
  ];
  if (ledgerLF) bom.push({ key: "ledger", description: `PT No. 2 Southern Pine 2x8 × ${args.lengthFeet} ft ledger member (minimum ledger size)`, quantity: 1, unit: "ea", sourceId: "IRC2024:R507.9" });
  bom.push({ key: "rim_long", description: `PT No. 2 Southern Pine ${d.joistSize} × ${args.lengthFeet} ft outer rim member`, quantity: 1, unit: "ea", sourceId: "approved-plan-geometry" });
  if (blockingPieces) bom.push({ key: "extra_blocking", description: `Reviewed extra blocking: PT No. 2 Southern Pine ${d.joistSize} cut to bay`, quantity: blockingPieces, unit: "ea", sourceId: "human-reviewed-extra" });
  const ledgerFasteners = Math.ceil(args.lengthFeet * 12 / 15) + 1;
  const beamPlyNails = Math.max(0, plies! - 1) * 2 * (Math.ceil(args.lengthFeet * 12 / 16) + 1);
  const hardwareSchedule: FramingHardwareRequirement[] = [
    { key: "ledger_fasteners", quantity: ledgerFasteners, unit: "ea", specification: "1/2-in lag-screw path at 15 in maximum on center for a 12-ft joist span; verify wood structural/sawn sheathing is no more than 1/2 in, band-joist penetration, edge distances, corrosion resistance, and compatible listed product before purchase", sourceId: "IRC2024:Table-R507.9.1.3(1)-(2)", selectionStatus: "compatible_product_and_price_required" },
    { key: "ledger_washers", quantity: ledgerFasteners, unit: "ea", specification: "Washers compatible with the selected 1/2-in ledger-fastener path and treated lumber; verify dimensions/material with the approved fastener schedule", sourceId: "IRC2024:R507.9.1.3:selected-path", selectionStatus: "compatible_product_and_price_required" },
    { key: "ledger_flashing", quantity: args.lengthFeet, unit: "ln ft", specification: "Ledger flashing above the ledger, minimum 2 in vertical and 4 in beyond the ledger face (or code-permitted face/downturn detail); verify wall/opening conditions and compatible flashing material", sourceId: "IRC2024:R507.9.1.5", selectionStatus: "compatible_product_and_price_required" },
    { key: "wrb_counterflashing_integration", quantity: args.lengthFeet, unit: "ln ft", specification: "Reviewed WRB/counterflashing integration compatible with the existing wall: lap over the vertical flashing leg as required, or use an allowed self-adhered counterflashing/spaced-ledger exception; verify actual wall layers and openings", sourceId: "IRC2024:R507.9.1.6-R507.9.1.8", selectionStatus: "detail_required" },
    { key: "joist_hangers", quantity: joists, unit: "ea", specification: `Hanger sized for ${d.joistSize}; minimum 60% of member depth and minimum ${d.joistSize === "2x6" ? 400 : d.joistSize === "2x8" ? 500 : d.joistSize === "2x10" ? 600 : 700} lb vertical capacity; use manufacturer-specified corrosion-compatible fasteners`, sourceId: "AWC-DCA6-2015:Joist-Hangers:Table-3A:reference", selectionStatus: "compatible_product_and_price_required" },
    { key: "hanger_fasteners", quantity: 0, unit: "ea", specification: "Use the selected hanger manufacturer's exact approved nail/screw schedule; quantity cannot be calculated until the hanger model is selected; deck screws are not structural hanger fasteners", sourceId: "AWC-DCA6-2015:Joist-Hangers:manufacturer-schedule-required", selectionStatus: "detail_required" },
    { key: "joist_to_beam", quantity: joists, unit: "ea", specification: "One reviewed joist-to-beam connection at each joist; mechanical connector path requires minimum 100 lb capacity in both uplift and lateral directions", sourceId: "AWC-DCA6-2015:Figure-6:reference", selectionStatus: "compatible_product_and_price_required" },
    { key: "joist_to_beam_fasteners", quantity: 0, unit: "ea", specification: "Use the selected joist-to-beam connector manufacturer's exact corrosion-compatible fastener schedule; quantity remains unresolved until the connector model is selected", sourceId: "AWC-DCA6-2015:Figure-6:manufacturer-schedule-required", selectionStatus: "detail_required" },
    { key: "rim_to_joist_restraint", quantity: joists * 3, unit: "ea", specification: "Selected rim-joist restraint path: three 10d (3 in × 0.128 in) nails or three No. 10 × 3 in wood screws at the end of every joist; select one corrosion-compatible allowed fastener product", sourceId: "IRC2024:R507.6.2", selectionStatus: "compatible_product_and_price_required" },
    { key: "post_bases", quantity: posts!, unit: "ea", specification: `Approved post-to-footing lateral-restraint connector sized for ${d.postSize} post and concrete assembly; verify anchor and corrosion compatibility`, sourceId: "IRC2024:R507.4.1", selectionStatus: "compatible_product_and_price_required" },
    { key: "post_base_anchors", quantity: posts!, unit: "ea", specification: "One anchor location per post base; exact anchor product, diameter, embedment, edge distance, and concrete compatibility require the selected base and manufacturer schedule", sourceId: "IRC2024:R507.4.1:approved-connector-path", selectionStatus: "detail_required" },
    { key: "post_caps", quantity: posts!, unit: "ea", specification: `Manufactured post-to-beam connector sized for ${d.postSize} post and ${plies}-${d.beamSize} beam, capable of resisting lateral displacement; verify bolts/washers and manufacturer schedule`, sourceId: "IRC2024:R507.5.2", selectionStatus: "compatible_product_and_price_required" },
    { key: "post_cap_fasteners", quantity: 0, unit: "ea", specification: "Bolts, washers, nails, or screws must follow the selected post-cap manufacturer's schedule; quantity remains unresolved until model selection", sourceId: "IRC2024:R507.5.2:manufacturer-schedule-required", selectionStatus: "detail_required" },
    { key: "lateral_load_connections", quantity: 2, unit: "ea", specification: "Two hold-down tension-device locations, each minimum 1,500 lb ASD capacity and within 24 in of each deck end; verify house framing/load path and listed compatible device", sourceId: "IRC2024:R507.9.2:Figure-1-path", selectionStatus: "compatible_product_and_price_required" },
    { key: "lateral_load_fasteners", quantity: 0, unit: "ea", specification: "Use the selected hold-down manufacturer's exact fastener/rod/anchor schedule; verify house framing, joist orientation, sheathing/substrate, penetration, and continuous load path before purchase", sourceId: "IRC2024:R507.9.2:Figure-1:manufacturer-schedule-required", selectionStatus: "detail_required" },
    { key: "picture_frame_blocking_connectors", quantity: 0, unit: "ea", specification: "Only when the selected board layout uses a picture-frame/divider joint: reviewed blocking lumber, support layout, connectors, and manufacturer fasteners; quantity remains unresolved until that layout is selected", sourceId: "approved-decking-manufacturer-layout:detail-required", selectionStatus: "detail_required" },
  ];
  if (beamPlyNails > 0) hardwareSchedule.splice(8, 0, { key: "beam_ply_fasteners", quantity: beamPlyNails, unit: "ea", specification: "For this multi-ply beam: two rows of minimum 10d (3 in × 0.128 in) nails at 16 in on center along each edge; purchase quantity must cover the calculated minimum", sourceId: "IRC2024:R507.5", selectionStatus: "compatible_product_and_price_required" });
  if (d.railingsIncluded === "yes") hardwareSchedule.push({ key: "guard_system_connections", quantity: 0, unit: "ea", specification: "Reviewed guard system layout must identify posts, corners, ends, blocking/load path, attachments, and manufacturer fasteners; do not rely on end-grain withdrawal", sourceId: "IRC2024:R507.10-R507.10.1", selectionStatus: "detail_required" });
  if (d.stairsIncluded === "yes") hardwareSchedule.push({ key: "guard_stair_connections", quantity: 0, unit: "ea", specification: "Guard, handrail, stair-stringer, landing, and stair-footing connections require the reviewed stair/guard detail; no product or quantity is inferred", sourceId: "IRC2024:R507.10-and-R311.7:detail-required", selectionStatus: "detail_required" });
  const reference = `${KNOXVILLE_2024_DECK_PROFILE.id}; main deck framing only; ${args.lengthFeet}x${args.widthFeet} ft; ${d.joistSize}@${spacing}in OC; ${d.beamPlies}-${d.beamSize}; ${d.postSize} posts; ${footingDiameter}in footing pads; unresolved ${unresolvedPackages.join(",")}; rules ${KNOXVILLE_2024_DECK_PROFILE.rules.join(",")}`;
  return Object.freeze({ evidenceVersion: "deck-framing-evidence-v2", status: "ready_for_human_review", profileId: KNOXVILLE_2024_DECK_PROFILE.id, inputs, checks: Object.freeze(checks), unresolvedPackages, exceptions: Object.freeze([]), quantities, bom: Object.freeze(bom), hardwareSchedule: Object.freeze(hardwareSchedule), reference });
}

export function isCanonicalFramingEvidence(value: unknown): value is DeckPrescriptivePlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as DeckPrescriptivePlan;
  const top = new Set(["evidenceVersion", "status", "profileId", "inputs", "checks", "unresolvedPackages", "exceptions", "quantities", "bom", "hardwareSchedule", "reference"]);
  if (Object.keys(plan).length !== top.size || !Object.keys(plan).every((key) => top.has(key))) return false;
  if (plan.evidenceVersion !== "deck-framing-evidence-v2" || plan.status !== "ready_for_human_review" || plan.profileId !== KNOXVILLE_2024_DECK_PROFILE.id) return false;
  if (!plan.inputs || typeof plan.inputs !== "object" || Array.isArray(plan.inputs)) return false;
  const inputKeys = new Set(["lengthFeet", "widthFeet", "draft"]);
  if (Object.keys(plan.inputs).length !== inputKeys.size || !Object.keys(plan.inputs).every((key) => inputKeys.has(key))) return false;
  const draftKeys = new Set(Object.keys(recommendedPrescriptiveDraft("ledger", false)));
  if (!plan.inputs.draft || Object.keys(plan.inputs.draft).length !== draftKeys.size || !Object.keys(plan.inputs.draft).every((key) => draftKeys.has(key))) return false;
  if (!Number.isFinite(plan.inputs.lengthFeet) || !Number.isFinite(plan.inputs.widthFeet)) return false;
  if (Object.values(plan.inputs.draft).some((entry) => typeof entry === "string" && entry.length > 160)) return false;
  const template = recommendedPrescriptiveDraft("ledger", false);
  if (Object.entries(plan.inputs.draft).some(([key, entry]) => typeof entry !== typeof template[key as keyof DeckPrescriptiveDraft])) return false;
  const rebuilt = buildPrescriptiveDeckPlan(plan.inputs);
  return rebuilt.status === "ready_for_human_review" && JSON.stringify(rebuilt) === JSON.stringify(plan);
}

export function assertPartialFramingEvidenceBinding(plan: Readonly<{
  buildPlanReference: string;
  buildPlanConfirmed: boolean;
  framingPlanEvidence?: DeckPrescriptivePlan | null;
  additionalLines: readonly Readonly<{ key: string; description: string; quantity: string; unit: string }>[];
  hardwareSelections?: readonly Readonly<{ key: string; description: string; quantity: string; unit: string; verificationReference?: string }>[];
}>) {
  const evidence = plan.framingPlanEvidence;
  if (!evidence) return;
  if (!isCanonicalFramingEvidence(evidence) || evidence.reference !== plan.buildPlanReference) {
    throw new TypeError("The framing plan evidence binding is invalid.");
  }
  if (!evidence.unresolvedPackages.length || plan.buildPlanConfirmed) {
    throw new TypeError("Partial framing evidence cannot confirm a complete build plan.");
  }
  const groups: Record<string, readonly string[]> = {
    ledger_attachment: ["ledger"], joists: ["joists"], beams: ["beam_plies"], posts: ["posts"],
    footings: ["footing_concrete"], blocking: ["rim_long", "extra_blocking"],
  };
  for (const [lineKey, bomKeys] of Object.entries(groups)) {
    const members = evidence.bom.filter((item) => bomKeys.includes(item.key));
    const line = plan.additionalLines.find((item) => item.key === lineKey);
    const expectedDescription = members.map((item) => item.description).join("; ");
    const expectedQuantity = String(members.reduce((sum, item) => sum + item.quantity, 0));
    const expectedUnit = members[0]?.unit ?? "";
    if (!line || line.description !== expectedDescription || line.quantity !== expectedQuantity || line.unit !== expectedUnit) {
      throw new TypeError("A generated structural line does not match the canonical framing evidence.");
    }
  }
  const selections = plan.hardwareSelections ?? [];
  if (selections.length !== evidence.hardwareSchedule.length || new Set(selections.map((item) => item.key)).size !== selections.length) {
    throw new TypeError("The hardware selection schedule does not match the canonical framing evidence.");
  }
  for (const requirement of evidence.hardwareSchedule) {
    const selection = selections.find((item) => item.key === requirement.key);
    if (!selection || selection.description !== requirement.specification || selection.unit !== requirement.unit) {
      throw new TypeError("A hardware selection does not match the canonical framing requirement.");
    }
  }
}
