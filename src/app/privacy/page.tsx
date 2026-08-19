import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalPageShell,
  LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how McKenzie Construction collects, uses, protects, and retains customer and SMS information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Privacy Policy"
      introduction="This policy explains how McKenzie Construction handles information when you contact us or work with us in Knoxville and East Tennessee."
    >
      <LegalSection title="Information we collect">
        <p>
          We may collect information you submit to us, including your name,
          email address, mailing or project address, telephone or mobile
          number, project details, appointment preferences, and other
          information you choose to provide.
        </p>
        <p>
          If you communicate with us by text message, we may also keep records
          of your SMS consent, messages, delivery status, and requests to opt
          out or receive assistance.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>
          We use information to respond to inquiries, prepare and discuss
          estimates, coordinate appointments and projects, manage invoices,
          provide customer care, and maintain business records.
        </p>
      </LegalSection>

      <LegalSection title="Text messaging and consent">
        <p>
          If you consent to receive text messages from McKenzie Construction,
          message frequency varies. Message and data rates may apply. Reply
          STOP to opt out or HELP for assistance. Consent is not a condition
          of purchase.
        </p>
        <p>
          McKenzie Construction does not sell or rent mobile numbers or SMS
          opt-in or consent data. We do not share mobile numbers or SMS
          opt-in or consent data with third parties or affiliates for their
          marketing or promotional purposes.
        </p>
        <p>
          We may use service providers that help us operate communications
          and business systems, and we may disclose information when required
          by law or necessary to protect legal rights. Those limited uses do
          not permit a service provider to use your mobile number or consent
          for its own marketing.
        </p>
        <p>
          Review our <Link className="font-semibold text-lime-700 underline underline-offset-4" href="/sms-terms">SMS Terms</Link> and <Link className="font-semibold text-lime-700 underline underline-offset-4" href="/sms-consent">SMS Consent Information</Link> for more details.
        </p>
      </LegalSection>

      <LegalSection title="Security and retention">
        <p>
          We use reasonable administrative and technical safeguards designed
          to protect information. No system can guarantee complete security.
          We retain information only as long as reasonably needed for the
          purposes described here, our business records, and applicable legal
          obligations.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You may ask us to update your contact information or stop using a
          particular contact method. For text messages, reply STOP to opt out
          or HELP for assistance.
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          McKenzie Construction serves Knoxville and East Tennessee. Email us
          at <a className="font-semibold text-lime-700 underline underline-offset-4" href="mailto:info@mckenzie-builds.com">info@mckenzie-builds.com</a>, call or text <a className="font-semibold text-lime-700 underline underline-offset-4" href="tel:+18654333325">865-433-3325</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
