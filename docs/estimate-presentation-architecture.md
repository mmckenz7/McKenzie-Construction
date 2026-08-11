# Estimate Presentation Architecture

## Decision

The internal estimate remains the authoritative cost and pricing model. Customer
presentation is a separate, versioned snapshot that controls how that total is
shown without deleting or flattening internal line items.

The first presentation version supports three company-managed template styles:

- `lump_sum`: one editable public description and one authoritative total. It
  never renders a quantity, unit, multiplication expression, or unit price.
- `section_summary`: public section descriptions and section subtotals.
- `itemized`: public line descriptions, quantities, units, and line totals.
  Unit-price display is intentionally deferred until it can be snapshotted as
  an explicit company/template choice rather than inferred at print time.

Deck estimates can use a lump-sum template while retaining detailed material,
labor, subcontractor, equipment, waste, material-tax, and profitability data
internally. Other work can use section-summary or itemized templates.

## Snapshot rule

An estimate snapshots its selected template version and settings. Later edits
to a company template cannot change an estimate already prepared or sent. A
job may override the lump-sum public label and OH&P presentation without
changing the underlying calculated total.

## Reconciliation rule

Every public presentation must reconcile exactly to the server-calculated
customer total. Distributed OH&P requires deterministic cent allocation across
visible rows. Separate-line OH&P requires an explicit public adjustment row.
Rendering and allocation are implemented in `src/lib/estimate-presentation.ts`
and covered by exact fixed-point tests. Distributed rows use deterministic
largest-remainder cent allocation with stable ID tie-breaking. Separate OH&P,
profit, discount, and tax adjustments remain explicit and must reconcile to the
authoritative customer total before a document can be returned.

## Customer document boundary

`src/lib/estimate-customer-document.ts` is the customer-safe projection
boundary. It accepts the canonical server calculation and the saved
presentation snapshot, then returns only public estimate fields and reconciled
presentation rows. Raw costs, supplier detail, item markup, OH&P percentages,
gross profit, margin, and internal notes are not part of this type.

The authenticated printable preview at
`/sales/estimates/[estimateId]/preview` uses that projection. It is an internal
review and print/save-PDF workflow; it is not yet a public proposal link and it
does not send email. A future public proposal workflow must snapshot the final
document, issue a revocable public token, and preserve the same no-cost-leak
boundary.

The preview API repeats the Sales-workspace authorization check and returns a
`no-store` response. The printable route is not a security boundary by itself;
the API projection and authorization are.

## Known presentation follow-up

The current structured line item has one public heading
(`customer_description`) and one private note (`internal_description`). A
separate customer-facing long description will require an additive database and
mutation-contract migration before itemized proposals can show both a heading
and a longer public description. Until then, the document intentionally omits
the private note.
