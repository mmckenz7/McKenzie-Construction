export const DEFAULT_ALUMINUM_RAILING_SYSTEM = {
  manufacturer: "Deckorators",
  productLine: "Contemporary",
  finish: "Matte black",
  railHeightInches: 36,
  installationReference:
    "https://www.deckorators.com/cdn/shop/files/deckorators-aluminum-contemporary-railing-installation-en.pdf",
} as const;

export type DeckRailingProductRole =
  | "railing_section"
  | "railing_level_kit"
  | "railing_level_post"
  | "railing_stair_kit"
  | "railing_stair_lower_post"
  | "railing_cable_pack"
  | "railing_cable_end_post";

export type DeckRailingPackageProduct = Readonly<{
  kind: string;
  description: string;
  unitCost: number | null;
  sourceUrl: string;
  stockLengthFeet: number | null;
  manufacturer: string | null;
  productLine: string | null;
}>;

export const DEFAULT_ALUMINUM_RAILING_COMPONENTS: readonly DeckRailingPackageProduct[] = [
  {
    kind: "railing_level_kit",
    description:
      "Deckorators Contemporary 8-ft x 36-in matte-black pre-assembled aluminum level rail kit",
    unitCost: null,
    sourceUrl:
      "https://www.lowes.com/pd/Deckorators-Assembled-8-ft-x-3-ft-Contemporary-Matte-Black-Square-Aluminum-Deck-Rail-Kit-with-Balusters/1002829278",
    stockLengthFeet: 8,
    manufacturer: "Deckorators",
    productLine: "Contemporary",
  },
  {
    kind: "railing_level_post",
    description:
      "Deckorators Contemporary 39-in matte-black aluminum post kit with cap and skirt",
    unitCost: null,
    sourceUrl:
      "https://www.lowes.com/pd/deckorators-common-3-in-x-3-in-x-3-1-4-ft-actual-2-5-in-x-2-5-in-x-3-28-ft-matte-black-aluminum-deck-post/1000796326",
    stockLengthFeet: null,
    manufacturer: "Deckorators",
    productLine: "Contemporary",
  },
  {
    kind: "railing_stair_kit",
    description:
      "Deckorators Contemporary 6-ft matte-black pre-assembled aluminum stair rail kit",
    unitCost: null,
    sourceUrl:
      "https://www.lowes.com/pd/deckorators-assembled-5-71-ft-x-2-91-ft-matte-black-aluminum-stair-rail-kit-with-balusters/1000796316",
    stockLengthFeet: 6,
    manufacturer: "Deckorators",
    productLine: "Contemporary",
  },
  {
    kind: "railing_stair_lower_post",
    description:
      "Deckorators Contemporary 48-in matte-black aluminum lower stair post kit with cap and skirt",
    unitCost: null,
    sourceUrl:
      "https://www.lowes.com/pd/deckorators-common-3-in-x-3-in-x-4-ft-actual-2-5-in-x-2-5-in-x-4-03-ft-matte-black-aluminum-deck-post/1000796350",
    stockLengthFeet: null,
    manufacturer: "Deckorators",
    productLine: "Contemporary",
  },
] as const;

export type DeckRailingPackageLine = Readonly<{
  role: Exclude<DeckRailingProductRole, "railing_section">;
  label: string;
  quantity: number;
  product: DeckRailingPackageProduct | null;
  includedComponents: readonly string[];
}>;

export function buildDefaultAluminumRailingPackage(args: Readonly<{
  products: readonly DeckRailingPackageProduct[];
  railingLengthFeet: number | null;
  stairsPresent: boolean | null;
  stairProjectionFeet?: number | null;
  stairRailSides?: 1 | 2;
}>) {
  const find = (role: DeckRailingPackageLine["role"]) =>
    args.products.find(
      (product) =>
        product.kind === role &&
        product.manufacturer?.trim().toLowerCase() === "deckorators" &&
        product.productLine?.trim().toLowerCase() === "contemporary",
    ) ??
    DEFAULT_ALUMINUM_RAILING_COMPONENTS.find(
      (product) => product.kind === role,
    ) ??
    null;
  const levelRail = find("railing_level_kit");
  const levelRailLength = levelRail?.stockLengthFeet ?? 8;
  const levelRailCount =
    args.railingLengthFeet !== null && args.railingLengthFeet > 0
      ? Math.ceil(args.railingLengthFeet / levelRailLength)
      : 0;
  const levelPostCount = levelRailCount > 0 ? levelRailCount + 1 : 0;
  const stairRail = find("railing_stair_kit");
  const stairRailLength = stairRail?.stockLengthFeet ?? 6;
  const stairRailSides = args.stairRailSides ?? 2;
  const stairRailCount = args.stairsPresent
    ? Math.max(1, Math.ceil((args.stairProjectionFeet ?? stairRailLength) / stairRailLength)) * stairRailSides
    : 0;
  const candidateLines: DeckRailingPackageLine[] = [
    {
      role: "railing_level_kit",
      label: "Pre-assembled level rail kit",
      quantity: levelRailCount,
      product: levelRail,
      includedComponents: [
        "top and bottom rails",
        "balusters",
        "mounting brackets and bracket hardware",
        "rail supports",
      ],
    },
    {
      role: "railing_level_post",
      label: "39-in post kit",
      quantity: levelPostCount + (args.stairsPresent ? stairRailSides : 0),
      product: find("railing_level_post"),
      includedComponents: ["aluminum post", "post cap", "post skirt/base trim"],
    },
    ...(args.stairsPresent
      ? [
          {
            role: "railing_stair_kit" as const,
            label: "Pre-assembled stair rail kit",
            quantity: stairRailCount,
            product: stairRail,
            includedComponents: [
              "stair rails and balusters",
              "stair brackets and bracket hardware",
              "rail support",
            ],
          },
          {
            role: "railing_stair_lower_post" as const,
            label: "48-in lower stair post kit",
            quantity: stairRailSides,
            product: find("railing_stair_lower_post"),
            includedComponents: ["aluminum post", "post cap", "post skirt/base trim"],
          },
        ]
      : []),
  ];
  const lines = candidateLines.filter((line) => line.quantity > 0);
  const unresolved = lines.filter((line) => !line.product || !line.product.unitCost);
  const totalCost = unresolved.length
    ? null
    : lines.reduce(
        (sum, line) => sum + line.quantity * (line.product?.unitCost ?? 0),
        0,
      );
  return {
    ...DEFAULT_ALUMINUM_RAILING_SYSTEM,
    lines,
    unresolved,
    totalCost,
    sourceReference: lines
      .map((line) => line.product?.sourceUrl)
      .filter((value): value is string => Boolean(value))
      .join(" | "),
  } as const;
}

export const DEFAULT_CABLE_RAILING_SYSTEM = {
  manufacturer: "Deckorators",
  productLine: "Contemporary Cable",
  finish: "Textured black",
  railHeightInches: 36,
  installationReference:
    "https://pdf.lowes.com/installationguides/090489673734_install.pdf",
} as const;

export const DEFAULT_CABLE_RAILING_COMPONENTS: readonly DeckRailingPackageProduct[] = [
  {
    kind: "railing_level_kit",
    description: "Deckorators Contemporary Cable 8-ft x 36-in textured-black top rail kit",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Contemporary-cable-8-ft-x-36-in-Textured-Black-Aluminum-Deck-Cable-Rail-Kit/5001785235",
    stockLengthFeet: 8,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
  {
    kind: "railing_level_post",
    description: "Deckorators Contemporary Cable 39-in textured-black line post kit",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Cable-Line-Post-39-in-Textured-Black/5001747843",
    stockLengthFeet: null,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
  {
    kind: "railing_cable_end_post",
    description: "Deckorators Contemporary Cable 39-in textured-black end post kit",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Cable-End-Post-39-in-Textured-Black/5001740061",
    stockLengthFeet: null,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
  {
    kind: "railing_cable_pack",
    description: "Deckorators Contemporary Cable 10-ft stainless cable and hardware pack",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Cable-10-ft-with-Hardware-Kit/5001749061",
    stockLengthFeet: 10,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
  {
    kind: "railing_stair_kit",
    description: "Deckorators Contemporary Cable 8-ft textured-black stair top rail kit",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Contemporary-Cable-8-ft-x-2-in-Textured-Black-Aluminum-Deck-Stair-Cable-Rail-Kit/5001746387",
    stockLengthFeet: 8,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
  {
    kind: "railing_stair_lower_post",
    description: "Deckorators Contemporary Cable 54-in textured-black lower stair post kit",
    unitCost: null,
    sourceUrl: "https://www.lowes.com/pd/Deckorators-Contemporary-Cable-2-5-in-x-2-5-in-x-4-1-2-ft-Textured-Black-Aluminum-Deck-Bottom-Stair-Post/5001746019",
    stockLengthFeet: null,
    manufacturer: "Deckorators",
    productLine: "Contemporary Cable",
  },
] as const;

export function buildDefaultCableRailingPackage(args: Readonly<{
  products: readonly DeckRailingPackageProduct[];
  railingLengthFeet: number | null;
  stairsPresent: boolean | null;
  stairProjectionFeet?: number | null;
  stairRailSides?: 1 | 2;
}>) {
  const find = (role: DeckRailingPackageLine["role"]) =>
    args.products.find((product) =>
      product.kind === role &&
      product.manufacturer?.trim().toLowerCase() === "deckorators" &&
      product.productLine?.trim().toLowerCase() === "contemporary cable") ??
    DEFAULT_CABLE_RAILING_COMPONENTS.find((product) => product.kind === role) ?? null;
  const levelLength = find("railing_level_kit")?.stockLengthFeet ?? 8;
  const levelSections = args.railingLengthFeet && args.railingLengthFeet > 0
    ? Math.ceil(args.railingLengthFeet / levelLength) : 0;
  const sides = args.stairRailSides ?? 2;
  const stairLength = find("railing_stair_kit")?.stockLengthFeet ?? 8;
  const stairSections = args.stairsPresent
    ? Math.max(1, Math.ceil((args.stairProjectionFeet ?? stairLength) / stairLength)) * sides : 0;
  const cableRows = 10;
  const candidateLines: DeckRailingPackageLine[] = [
    { role: "railing_level_kit", label: "8-ft level top rail kit", quantity: levelSections, product: find("railing_level_kit"), includedComponents: ["top rail", "cable spacers", "rail brackets"] },
    { role: "railing_cable_end_post", label: "39-in cable end post kit", quantity: levelSections ? 2 : 0, product: find("railing_cable_end_post"), includedComponents: ["pre-drilled end post", "post cap", "base trim"] },
    { role: "railing_level_post", label: "39-in cable line post kit", quantity: Math.max(0, levelSections - 1) + (args.stairsPresent ? sides : 0), product: find("railing_level_post"), includedComponents: ["pre-drilled line post", "post cap", "base trim"] },
    { role: "railing_cable_pack", label: "10-ft cable and hardware pack", quantity: (levelSections + stairSections) * cableRows, product: find("railing_cable_pack"), includedComponents: ["stainless cable", "threaded stud", "pull-lock fitting", "caps", "washers", "locknut"] },
    { role: "railing_stair_kit", label: "8-ft stair top rail kit", quantity: stairSections, product: find("railing_stair_kit"), includedComponents: ["stair top rail", "cable spacer", "stair brackets"] },
    { role: "railing_stair_lower_post", label: "54-in lower stair post kit", quantity: args.stairsPresent ? sides : 0, product: find("railing_stair_lower_post"), includedComponents: ["pre-drilled lower stair post", "post cap", "base trim"] },
  ];
  const lines = candidateLines.filter((line) => line.quantity > 0);
  const unresolved = lines.filter((line) => !line.product?.unitCost);
  const totalCost = unresolved.length ? null : lines.reduce((sum, line) => sum + line.quantity * (line.product?.unitCost ?? 0), 0);
  return {
    ...DEFAULT_CABLE_RAILING_SYSTEM,
    lines,
    unresolved,
    totalCost,
    sourceReference: lines.map((line) => line.product?.sourceUrl).filter((value): value is string => Boolean(value)).join(" | "),
  } as const;
}
