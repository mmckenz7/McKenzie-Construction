import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Composite Deck Builder in Knoxville, TN",
  description:
    "Plan a low-maintenance composite deck with coordinated board layout, trim, stairs, fastening, and railing selections in Knoxville and East Tennessee.",
  alternates: { canonical: "/composite-decks-knoxville" },
  openGraph: {
    title: "Composite Deck Builder in Knoxville, TN | McKenzie Construction",
    description:
      "Composite deck construction and replacement with coordinated finish selections, stairs, trim, fastening, and railing options.",
    url: "/composite-decks-knoxville",
    type: "website",
  },
};

const faqs = [
  {
    question: "Is composite decking maintenance-free?",
    answer:
      "Composite decking is designed for lower routine maintenance than traditional wood, but it still needs normal cleaning and care. Requirements vary by the selected product manufacturer.",
  },
  {
    question: "Can composite decking be used on a replacement deck?",
    answer:
      "Yes. The framing and layout are reviewed for the selected board system, spacing, fastening, trim, stairs, and other manufacturer requirements.",
  },
  {
    question: "Can I compare colors and railing options?",
    answer:
      "Yes. Finish selections can include deck-board color families, border or picture-frame details, fascia, stairs, and compatible wood or aluminum railing options.",
  },
  {
    question: "Do composite boards require special fasteners?",
    answer:
      "Many composite systems use manufacturer-specific hidden or color-matched fasteners and installation details. The selected products are coordinated as part of the material plan.",
  },
];

export default function CompositeDecksKnoxvillePage() {
  return (
    <ServiceLandingPage
      eyebrow="Composite Decks · Knoxville, Tennessee"
      headline="A lower-maintenance deck with finishes planned as one complete system."
      summary="McKenzie Construction builds composite decks and replacement decks with coordinated board layout, borders, fascia, stairs, fastening, and railing selections."
      introduction="Composite decking is not just a color choice. Board dimensions, framing spacing, board direction, stair details, trim, fastening, and railing transitions need to be considered together before final material quantities are prepared."
      path="/composite-decks-knoxville"
      serviceName="Composite deck construction in Knoxville, Tennessee"
      planningDetails={[
        {
          title: "Color and Appearance",
          description:
            "Compare practical color families, grain appearance, borders, fascia, and how the deck will relate to the home.",
        },
        {
          title: "Board Layout",
          description:
            "Plan board direction, available lengths, picture-frame details, transitions, stairs, and any required divider boards.",
        },
        {
          title: "Compatible Components",
          description:
            "Coordinate boards, fasteners, plugs or clips, trim, fascia, and installation details for the selected product system.",
        },
        {
          title: "Railing Options",
          description:
            "Review wood or aluminum railing approaches based on the approved layout, appearance goals, and selected product system.",
        },
      ]}
      processDetails={[
        {
          title: "Define the Layout",
          description:
            "Confirm the deck shape, elevations, stairs, railing runs, and intended use before finish quantities are finalized.",
        },
        {
          title: "Choose the Finish Direction",
          description:
            "Select a composite color family and railing approach, then coordinate compatible products and installation details.",
        },
        {
          title: "Prepare the Proposal",
          description:
            "The proposal records the planned scope, major materials, working quantities, allowances, exclusions, and next steps.",
        },
      ]}
      faqs={faqs}
    />
  );
}
