# CRM Company Inbox signed-in Preview QA

Status: prepared for bulk execution once Preview sign-in is available.

Scope: `/communications`, `/communications/new`, CRM conversation continuity, and the communications APIs exercised by these screens. This checklist must not be used to test Production or to change cloud configuration, database schema, secrets, shared domain models, Deck Designer, Fence Designer, Estimating, or Material Catalog.

## Safe setup

- Use the Git-backed Preview for the isolated communications branch.
- Confirm the Preview URL and commit SHA before testing.
- Use a non-Production test user with Sales access and a second user without Sales access.
- Keep communication sandbox mode enabled.
- Use only email addresses and phone numbers already present on the configured sandbox allowlist. Do not reveal or expand the allowlist during QA.
- Use existing test CRM records and existing Preview conversations. Do not invent or seed records.
- Use a small PDF and image that contain no sensitive information for attachment checks.
- Record browser, viewport, user role, Preview commit, time, and result for every failure.

## Access and navigation

- [ ] Signed-out `/communications` redirects to sign-in or the approved public boundary and shows no message data.
- [ ] A signed-in user without Sales access cannot open `/communications`, a conversation URL, compose, reply, download attachments, or mutate thread state.
- [ ] A signed-in Sales user sees Company Inbox in the primary navigation.
- [ ] Company Inbox, New email, Integration settings, CRM record links, and back links all resolve within Preview.
- [ ] Direct loading and browser refresh work for the inbox, compose page, and an individual conversation.
- [ ] Desktop and narrow mobile layouts preserve readable subjects, participants, controls, filters, and reply fields without horizontal clipping.

## Folder and view projections

- [ ] Inbox excludes archived conversations and shows the expected newest activity first, with unread conversations prioritized.
- [ ] Sent includes conversations with outbound messages, including standalone company-inbox sends.
- [ ] Needs Attention includes unread conversations, failed/undelivered/canceled delivery activity, and unmatched conversations requiring review.
- [ ] Archived contains only archived conversations.
- [ ] Archive removes a conversation from Inbox and Restore returns it without changing its CRM match.
- [ ] Unread, Closed, Customers, Vendors, Internal, Automated, Review, and department views each return the expected deterministic subset.
- [ ] Switching folders or views preserves active search, channel, and department filters.
- [ ] Clear removes search and filters while retaining the selected folder/view.
- [ ] Empty folders and views show a useful empty state without a server error.

## Search and filters

- [ ] Search matches an existing participant name, CRM name, email address, subject phrase, and message-body phrase.
- [ ] Search is case-insensitive and safely handles spaces, punctuation, and a 120-character query.
- [ ] Email only excludes Twilio text threads; Text only excludes email threads.
- [ ] General, Sales, Estimating, Operations, and Billing filters return only their department.
- [ ] Search plus channel plus department produces the correct intersection.
- [ ] A URL copied with query parameters reproduces the same result after sign-in and refresh.
- [ ] The Inbox clearly states that Preview search covers the 100 most recent conversations and 150 recent message records; no result is represented as a full-mailbox search.

## Classification and unassigned mail

- [ ] An exact active team-member email is labeled Internal and remains unassigned.
- [ ] The shared mailbox address is not mistaken for an internal team member.
- [ ] An exact active supplier-location email is labeled Vendor and remains unassigned.
- [ ] A no-reply notification and an unsubscribe-style newsletter receive the expected automated labels.
- [ ] Unknown unmatched mail is labeled for review and can be read or archived without forced CRM assignment.
- [ ] Internal, vendor, automated, and review conversations do not create fake leads, customers, projects, or assignments.
- [ ] Matching an unmatched conversation to an existing lead or customer works once; a second match is rejected safely.

## Lead → Customer → Project continuity

- [ ] An existing lead conversation appears in Company Inbox and on the lead record.
- [ ] After using an existing converted customer, the same conversation appears on the customer record without duplicating messages.
- [ ] The customer is preferred over the source lead in conversation links and labels.
- [ ] A related project activity view shows the linked communication as a read-only timeline entry.
- [ ] Opening the conversation from lead, customer, and project contexts reaches the same canonical `/communications/{threadId}` URL.
- [ ] Replying from the canonical thread updates the same history visible from the related CRM records.

## Compose, reply, and delivery safety

- [ ] New email accepts a valid To address, subject, and message without requiring lead, customer, or project ownership.
- [ ] Invalid To, Cc, or Bcc values are rejected before delivery.
- [ ] Duplicate addresses across To, Cc, and Bcc are normalized and deduplicated.
- [ ] Bcc recipients are not displayed in shared conversation history or delivery activity.
- [ ] The sandbox blocks every non-allowlisted To, Cc, or Bcc recipient with a clear message.
- [ ] A successful standalone send creates one unassigned conversation and appears in Sent.
- [ ] Reply derives the recipient from the conversation and keeps the subject locked for provider threading.
- [ ] Successful reply clears the composer, refreshes the thread, marks inbound messages read, and shows one outbound audit entry.
- [ ] Provider failure gives a clear retry outcome and does not falsely label the message sent.
- [ ] Repeated submit clicks while Sending do not create duplicate deliveries.

## Attachments

- [ ] Compose and reply accept supported PDF, JPEG, PNG, WebP, HEIC, and HEIF files.
- [ ] Empty, unsupported, oversized, over-count, and over-total-limit selections are rejected before delivery.
- [ ] Removing one selected attachment updates the pending list correctly.
- [ ] A successful send records attachment metadata but does not expose or retain attachment contents for automatic retry.
- [ ] Microsoft 365 inbound attachment metadata loads only on request.
- [ ] Download works for supported file attachments, uses a safe filename, and does not expose provider credentials.
- [ ] Reference/cloud-link and inline attachments are labeled correctly and are not proxied as unsafe raw files.

## Conversation controls and health

- [ ] Mark read clears unread state; Mark unread marks only the latest inbound message and sets the conversation count consistently.
- [ ] A conversation with no inbound message refuses Mark unread with a useful message.
- [ ] Matched conversations can be assigned only to an active team member.
- [ ] Unmatched conversations reject assignment while preserving read and archive controls.
- [ ] Close/Reopen works for matched conversations and does not alter the linked CRM record.
- [ ] Newest first and Oldest first reorder the thread predictably; top/bottom navigation remains usable on long threads.
- [ ] Integration health accurately distinguishes healthy, stale, failed, and not-synchronized mailbox states.
- [ ] Delivery queue counts and failure states agree with the visible delivery activity.
- [ ] No UI or API response reveals scheduler, webhook, Microsoft, Resend, Twilio, or bypass secrets.

## Completion evidence

- [ ] Capture one result table with check identifier, pass/fail, role, route, and concise evidence.
- [ ] Capture screenshots only when they contain no sensitive message content or credentials.
- [ ] Log defects with exact Preview commit, route, reproduction steps, expected result, actual result, and severity.
- [ ] Re-run the focused communications test suite and production build against the exact commit tested in Preview.
- [ ] Send a concise compatibility handoff to the main OS controller. Do not integrate or make architecture decisions from this track.
