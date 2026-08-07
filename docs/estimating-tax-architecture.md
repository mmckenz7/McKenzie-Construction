# Estimating Tax Architecture

## Decision

Construction estimates use material/use tax as an internal direct cost. They do
not add a customer-facing sales-tax percentage to construction labor, overhead,
or markup.

The existing `structured-estimate-v1` calculation policy remains immutable.
Cost-side tax is introduced as `structured-estimate-v2-material-tax` so an
existing estimate cannot change totals merely because application code was
updated.

## Municipality rate contract

Municipality rates must not be hardcoded in application source. A later schema
group will store effective-dated rates with municipality, county, state, source
URL, effective dates, and verification date. Each estimate will snapshot the
selected jurisdiction and rate so later rate changes do not alter an existing
estimate.

The pure resolver in `src/lib/municipality-tax-rates.ts` requires exactly one
active match for the estimate date. Missing, overlapping, malformed, or
ambiguous rate records fail closed rather than silently choosing a percentage.

The calculation applies the snapshotted rate only to extended material cost,
including material waste. The resulting material tax is part of direct cost
before item markup, overhead, profit, and margin calculations. Unknown material
cost produces unknown material tax and keeps the estimate cost-incomplete.

## Authority

- [Tennessee Department of Revenue contractor overview](https://revenue.support.tn.gov/hc/en-us/articles/360058171112-SUT-21-Sales-and-Use-Tax-for-Contractors-Overview)
- [Tennessee Department of Revenue sales and use tax manual](https://www.tn.gov/content/dam/tn/revenue/documents/tax_manuals/June-2024/Sales-Use-Tax-Manual.pdf)

These sources describe contractors as users and consumers of materials used to
improve realty. Rate records still require periodic verification because state
and local rules can change.
