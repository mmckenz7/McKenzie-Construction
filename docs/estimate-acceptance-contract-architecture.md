# Estimate Acceptance and Contract Boundary

## Approved lifecycle

The beta workflow separates customer interest from legal authorization:

1. A structured estimate is finalized into a customer-safe presentation.
2. The customer accepts the estimate as a **nonbinding intent to proceed**.
3. Mission Control creates a separate contract-preparation package from the
   frozen customer-safe estimate snapshot.
4. Company-approved legal terms are attached and reviewed.
5. A configured electronic-signature provider sends the contract.
6. A verified signed-contract event authorizes the later preconstruction
   release workflow.

Estimate acceptance alone must never create a project, populate a project
contract value, mark an estimate converted, schedule work, or authorize work.

## Local contract-preparation foundation

`estimate_contract_preparations` stores one provider-neutral package per
accepted estimate. Its `customer_document` is produced only through
`buildEstimateCustomerDocument`, so raw cost, supplier detail, internal notes,
markup percentages, profit, and margin stay outside the contract package.

New packages begin in `draft` with `legal_terms_status = not_configured`.
Neither the API nor the interface currently provides a send or sign action.
That deliberate lock remains until an owner-approved contract template and
signature provider are configured.

The package records `work_authorized: false` and
`project_creation_authorized: false` in its creation metadata. These fields are
defense-in-depth documentation, not substitutes for the application boundary:
the creation route has no project mutation and does not change estimate status.

## Local public-estimate foundation

`estimate_proposals` stores one frozen customer-safe snapshot behind a
revocable UUID token. Link issuance, first-open tracking, customer response,
and revocation are transactional database functions available only to the
service role. Public routes apply the shared hashed rate limiter, generic
unavailable responses, request-size limits, and explicit payload minimization.

Accepting the public estimate changes only the estimate and proposal lifecycle
to `accepted`. It records the fixed nonbinding acknowledgement and returns
`work_authorized: false`; it has no project mutation. Declining records the
response without requiring the acceptance acknowledgement.

Mission Control creates and copies the link manually. An active link can create
one idempotent `estimate_proposal_link` email draft connected to the customer
lead. The draft includes the nonbinding boundary and enters the existing human
review and approval workflow; neither link issuance nor draft creation sends
anything automatically. Provider-confirmed delivery creates the ordinary
proposal follow-up task. Revoking an unanswered link rotates it out of use and
returns the estimate to draft for revision.

Accepted and declined responses add an inbound estimate activity to the
connected lead in the same transaction as the response. That activity records
the proposal and estimate IDs, but never stores the public token or authorizes
work.

## Remaining activation work

- Obtain an attorney-reviewed construction contract template; do not generate
  legal terms from estimate notes.
- Select and configure an electronic-signature provider.
- Validate provider webhook signatures and make signed-event handling
  idempotent before enabling preconstruction release.
- Apply the two additive migrations to the intended environment only after
  explicit approval, then run issue, view, accept, contract preparation,
  decline, expiry, and revocation paths end to end.
