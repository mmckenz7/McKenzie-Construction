import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Deck Replacement in Knoxville, TN",
  description:
    "Replace an aging or damaged deck with a project scope covering demolition, framing, decking, stairs, and railings in Knoxville and East Tennessee.",
  alternates: { canonical: "/deck-replacement-knoxville" },
  openGraph: {
    title: "Deck Replacement in Knoxville, TN | McKenzie Construction",
    description:
      "Deck demolition and replacement planned around the existing home, site conditions, access, materials, stairs, and railings.",
    url: "/deck-replacement-knoxville",
    type: "website",
  },
};

const faqs = [
  {
    question: "Can you replace the entire deck rather than just the boards?",
    answer:
      "Yes. A replacement scope can include demolition and replacement of framing, supports, decking, stairs, and railings. The final scope depends on the site review and approved plan.",
  },
  {
    question: "Can the replacement deck use a different layout?",
    answer:
      "Yes. The existing footprint can be retained or the replacement can be planned with changes to usable space, access, stairs, or railing layout when the property and project scope support them.",
  },
  {
    question: "Can I switch from wood to composite decking?",
    answer:
      "Yes. Wood and composite finish options can be reviewed as part of the replacement scope. Framing, spacing, trim, and fastening requirements are coordinated with the selected system.",
  },
  {
    question: "How do you know whether the existing framing can stay?",
    answer:
      "Existing framing and connections are reviewed at the property. Concealed or uncertain conditions are not assumed to be reusable before they can be properly evaluated.",
  },
];

export default function DeckReplacementKnoxvillePage() {
  return (
    <ServiceLandingPage
      eyebrow="Deck Replacement · Knoxville, Tennessee"
      headline="Replace an aging deck with a space planned for how you live now."
      summary="McKenzie Construction plans deck replacements around the existing home, current site conditions, access to the yard, material preferences, and the complete scope—not just the surface boards."
      introduction="A deck replacement begins with understanding what is present and what should change. The existing footprint, framing, stairs, railing, elevations, drainage, and access all affect the practical replacement plan."
      path="/deck-replacement-knoxville"
      projectType="Deck Replacement"
      serviceName="Deck replacement in Knoxville, Tennessee"
      planningDetails={[
        {
          title: "Existing Conditions",
          description:
            "Review the deck surface, framing, attachment, supports, stairs, railings, access, and conditions around the house.",
        },
        {
          title: "Replacement Goals",
          description:
            "Confirm whether the footprint stays the same or changes to improve furniture space, circulation, stairs, or yard access.",
        },
        {
          title: "Material Direction",
          description:
            "Compare pressure-treated wood and composite finishes based on appearance, maintenance expectations, and budget.",
        },
        {
          title: "Complete Scope",
          description:
            "Coordinate demolition, framing, decking, trim, stairs, railings, disposal, access, and related project details.",
        },
      ]}
      processDetails={[
        {
          title: "Discuss the Replacement",
          description:
            "Tell us what is wrong with the current deck and what you want the new space to do better.",
        },
        {
          title: "Review the Property",
          description:
            "We evaluate visible conditions, dimensions, elevations, access, and the relationship between the deck, home, and yard.",
        },
        {
          title: "Prepare the Scope",
          description:
            "The proposal identifies the planned replacement work, major selections, allowances, exclusions, and next steps.",
        },
      ]}
      faqs={faqs}
    />
  );
}
