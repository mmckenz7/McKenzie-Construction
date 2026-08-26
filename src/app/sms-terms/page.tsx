import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalPageShell,
  LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "SMS Terms",
  description:
    "Terms for conversational and transactional text messages from McKenzie Construction.",
  alternates: { canonical: "/sms-terms" },
};

export default function SmsTermsPage() {
  return (
    <LegalPageShell
      eyebrow="Text Messaging"
      title="SMS Terms"
      introduction="These terms apply when you agree to receive text messages from McKenzie Construction about your inquiry or customer relationship."
    >
      <LegalSection title="Program description">
        <p>
          McKenzie Construction sends conversational and transactional text
          messages about inquiries, appointments, estimates, projects,
          invoices, and customer-service requests. Messages are not sent for
          unrelated third-party marketing.
        </p>
      </LegalSection>

      <LegalSection title="Frequency and charges">
        <p>
          Message frequency varies based on your inquiry or project. Message
          and data rates may apply according to your wireless plan.
        </p>
      </LegalSection>

      <LegalSection title="Opting out and getting help">
        <p>
          Reply STOP to opt out. After you opt out, you may receive one final
          message confirming your request. Reply HELP for assistance, email
          <a className="ml-1 font-semibold text-lime-700 underline underline-offset-4" href="mailto:info@mckenzie-builds.com">info@mckenzie-builds.com</a>, or call or text <a className="font-semibold text-lime-700 underline underline-offset-4" href="tel:+18654333325">865-433-3325</a>.
        </p>
      </LegalSection>

      <LegalSection title="Consent and eligibility">
        <p>
          Consent to receive text messages is not a condition of purchase.
          You must be at least 18 years old, or otherwise authorized to give
          consent, and you are responsible for providing an accurate mobile
          number that you are authorized to use.
        </p>
      </LegalSection>

      <LegalSection title="Delivery">
        <p>
          Mobile carriers are not liable for delayed or undelivered messages.
          Message delivery may be affected by your device, wireless service,
          or network availability.
        </p>
      </LegalSection>

      <LegalSection title="Privacy">
        <p>
          Our <Link className="font-semibold text-lime-700 underline underline-offset-4" href="/privacy">Privacy Policy</Link> explains how we handle mobile numbers, SMS consent records, and other information.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms as our messaging practices or legal
          obligations change. The effective and last-updated date at the top
          of this page shows the current version.
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          McKenzie Construction serves Knoxville and East Tennessee. Email
          <a className="ml-1 font-semibold text-lime-700 underline underline-offset-4" href="mailto:info@mckenzie-builds.com">info@mckenzie-builds.com</a>, or call or text <a className="font-semibold text-lime-700 underline underline-offset-4" href="tel:+18654333325">865-433-3325</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
