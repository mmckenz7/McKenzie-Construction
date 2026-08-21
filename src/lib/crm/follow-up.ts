export type FollowUpOutcome =
  | "spoke"
  | "no_answer"
  | "left_voicemail"
  | "callback_requested";

export function callbackApplies(outcome: FollowUpOutcome) {
  return outcome === "spoke" || outcome === "callback_requested";
}

export function followUpDraft(outcome: FollowUpOutcome, name: string | null, projectType: string | null) {
  const greeting = `Hi ${name ?? "there"},`;
  const project = projectType ?? "project";
  const closing = `Please reply to this email or call our office if we can help with the next step.\n\nThank you,\n\nMcKenzie Construction\n865-433-3325`;
  const templates = {
    spoke: {
      templateKey: "estimate_follow_up_spoke",
      subject: "Next steps for your McKenzie Construction estimate",
      body: `${greeting}\n\nThank you for speaking with us about your ${project}. This note summarizes that we connected and keeps the next steps easy to find.\n\n${closing}`,
    },
    no_answer: {
      templateKey: "estimate_follow_up_no_answer",
      subject: "Following up on your McKenzie Construction estimate",
      body: `${greeting}\n\nWe tried to reach you by phone but were unable to connect regarding the estimate for your ${project}.\n\n${closing}`,
    },
    left_voicemail: {
      templateKey: "estimate_follow_up_voicemail",
      subject: "Following up on your McKenzie Construction estimate",
      body: `${greeting}\n\nWe tried to reach you by phone and left a voicemail regarding the estimate for your ${project}.\n\n${closing}`,
    },
    callback_requested: {
      templateKey: "estimate_follow_up_callback",
      subject: "Your requested callback from McKenzie Construction",
      body: `${greeting}\n\nWe recorded your request for a callback about your ${project}. A member of our team will follow up at the requested time.\n\n${closing}`,
    },
  } satisfies Record<FollowUpOutcome, { templateKey: string; subject: string; body: string }>;
  return templates[outcome];
}
