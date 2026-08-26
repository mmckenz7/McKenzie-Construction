# Customer communication hub

The Company Inbox presents matched customer communication as one chronological history while retaining the original provider threads underneath.

- Email and SMS threads group only through an exact existing customer or lead identity.
- Unmatched conversations remain separate until a user verifies the record match.
- Quarantined security mail is excluded by the existing `security_disposition = normal` boundary.
- The timeline can show all messages, email only, or text only.
- Email replies continue through the selected email provider thread. Text replies continue through the selected Twilio thread and retain the existing opt-out checks.
- Provider thread IDs, message IDs, delivery status, attachment behavior, and audit facts are not rewritten or merged.
- Multi-thread hubs do not expose a misleading single-thread archive, assignment, or status control.

The installed app opens the unified Company Inbox. A push notification still opens the text-filtered inbox so a newly received text is easy to find.

This slice adds no schema or migration. It is a presentation and query projection over existing verified CRM identity links.
