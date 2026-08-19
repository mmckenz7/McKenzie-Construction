import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalPageShell,
  LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "SMS Consent Information",
  description:
    "How McKenzie Construction requests and records consent for customer text messages.",
  alternates: { canonical: "/sms-consent" },
};

export default function SmsConsentPage() {
  return (
    <LegalPageShell
      eyebrow="SMS Consent"
      title="How text-message consent works"
      introduction="McKenzie Construction obtains SMS consent directly in conversation, either verbally or by text, before sending ongoing customer messages."
    >
      <LegalSection title="How we request consent">
        <p>Our approved verbal consent script is:</p>
        <blockquote className="border-l-4 border-lime-500 bg-lime-50 px-5 py-4 font-medium text-slate-900">
          “May McKenzie Construction send text messages to this mobile
          number about your inquiry, estimate, appointments, project updates,
          invoices, and customer-service requests? Message frequency varies.
          Message and data rates may apply. Reply STOP to opt out or HELP for
          assistance. Consent is not a condition of purchase.”
        </blockquote>
        <p>
          A customer may also provide consent through a text-message
          conversation after receiving the same required disclosures.
        </p>
      </LegalSection>

      <LegalSection title="Website contact preferences are separate">
        <p>
          Choosing a preferred contact method on our existing website form is
          not SMS opt-in. The website form does not store SMS consent. Our
          staff records consent through the approved operational process after
          the customer gives it verbally or by text.
        </p>
      </LegalSection>

      <LegalSection title="What messages cover">
        <p>
          With consent, messages may concern an inquiry, estimate,
          appointments, project updates, invoices, or customer-service
          requests. Message frequency varies. Message and data rates may
          apply. Reply STOP to opt out or HELP for assistance. Consent is not
          a condition of purchase.
        </p>
      </LegalSection>

      <LegalSection title="Related information">
        <p>
          Read our <Link className="font-semibold text-lime-700 underline underline-offset-4" href="/privacy">Privacy Policy</Link> and <Link className="font-semibold text-lime-700 underline underline-offset-4" href="/sms-terms">SMS Terms</Link>.
        </p>
        <p>
          Questions? Email <a className="font-semibold text-lime-700 underline underline-offset-4" href="mailto:info@mckenzie-builds.com">info@mckenzie-builds.com</a>, or call or text <a className="font-semibold text-lime-700 underline underline-offset-4" href="tel:+18654333325">865-433-3325</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
