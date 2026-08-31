# Fence Installation Profile foundation

## Current boundary

`src/installation-profile.ts` moves the assumptions already embedded in the two prototype takeoff calculators into closed, typed draft bundles:

- **Black Aluminum — embedded assumptions**
- **Treated Pine Privacy — embedded assumptions**

Both bundles are explicitly `draft_unvalidated`. They are not McKenzie commercial standards, manufacturer instructions, supplier catalogs, engineering rules, or approved tenant templates. This slice adds no profile editor, tenant storage, activation workflow, pricing, labor production, supplier choice, SKU mapping, or database record.

`src/takeoff.ts` evaluates either supported construction kind through one generic profile entry point. The existing public Black Aluminum and Treated Pine functions remain compatible wrappers. Exact legacy takeoff outputs are protected by parity tests.

## Identity and reproducibility

A profile is validated against a closed union. Unknown fields, unsupported construction behavior, invalid component order, and invalid integer quantities fail closed. Canonical JSON recursively sorts object keys, and a synchronous SHA-256 content hash identifies the complete validated profile content. `profileId`, `profileVersion`, status, and every rule therefore participate in the identity used for deterministic replay.

The prototype has no persistence binding yet. A future estimate must retain an immutable copy or durable reference to the exact validated profile content hash and version used for its calculation; silently replacing a historical profile with a newer tenant default is prohibited.

## Controlled job overrides

The initial override contract is deliberately narrow:

- a verified maximum bay width for either supported construction kind; and
- reviewed lumber-waste basis points for stick-built privacy only.

An override set is bound to the exact base-profile content hash, uses fixed reason codes, rejects duplicate rules and extra fields, and produces a new frozen effective profile without mutating the base. It provides no arbitrary formulas, scripts, prose-driven behavior, or hidden rule precedence. It is only a deterministic contract proof; it is not yet persisted or exposed in the UI.

## Template-led onboarding gate

Future tenant onboarding should start from a reviewed profile template, create a new tenant-owned draft version, and collect the tenant's actual installation rules in explicit supported fields. The draft must be validated against representative sample jobs before activation. A changed rule creates a new version; it does not rewrite the version used by earlier estimates.

The first real fence system should validate the shared engine and profile representation. A materially different second system must then pass without changing the generic evaluator architecture. Only after both systems succeed should further systems normally be treated as configuration/data additions. Any rule that cannot be represented by the closed union is an architecture review—not a reason to insert a one-off formula.

## Next real-data gate

Before either embedded draft can become an activated installation profile, the owner must supply and review real sample-job evidence for the applicable system, including post roles and spacing, manufactured-panel versus stick-built behavior, gates and hardware, concrete, fasteners, slope/grade treatment, waste, labor production, preferred products, and supplier relationships. Missing facts remain missing; this prototype must not invent them.
