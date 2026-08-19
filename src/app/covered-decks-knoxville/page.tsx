import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Covered Deck Builder in Knoxville, TN",
  description:
    "Plan a covered deck or outdoor living area with coordinated roof, drainage, deck, stairs, railing, lighting, and fan considerations in Knoxville, Tennessee.",
  alternates: { canonical: "/covered-decks-knoxville" },
  openGraph: {
    title: "Covered Deck Builder in Knoxville, TN | McKenzie Construction",
    description:
      "Covered deck and outdoor living projects planned around the home, property, weather protection, access, and intended use.",
    url: "/covered-decks-knoxville",
    type: "website",
  },
};

const faqs = [
  {
    question: "Can you add a roof over an existing deck?",
    answer:
      "Sometimes. The existing deck, supports, attachment conditions, elevations, and proposed roof loads must be reviewed before the appropriate scope can be determined.",
  },
  {
    question: "Can a covered deck include lighting or a ceiling fan?",
    answer:
      "Lighting, fan, switch, and receptacle needs can be coordinated in the project scope. Final electrical work is planned with the appropriate trade requirements.",
  },
  {
    question: "Do you also build screened porches?",
    answer:
      "Yes. Depending on the project goals and property, the scope can be planned as a covered deck, a screened porch, or another protected outdoor living space.",
  },
  {
    question: "How is rainwater handled on a covered deck?",
    answer:
      "Roof drainage, gutters, downspouts, grade, and discharge locations are considered during planning so water management is part of the complete scope.",
  },
];

export default function CoveredDecksKnoxvillePage() {
  return (
    <ServiceLandingPage
      eyebrow="Covered Decks · Knoxville, Tennessee"
      headline="Create an outdoor space that stays useful through more of the year."
      summary="McKenzie Construction plans covered decks and protected outdoor living areas around the home, the property, weather exposure, access, drainage, and the way the space will be used."
      introduction="A covered deck connects deck construction with roof planning, water management, house conditions, stairs, railings, lighting, and everyday circulation. Those parts need to be considered as one project rather than separate add-ons."
      path="/covered-decks-knoxville"
      serviceName="Covered deck construction in Knoxville, Tennessee"
      planningDetails={[
        {
          title: "Home and Roof Relationship",
          description:
            "Review rooflines, wall conditions, openings, clearances, drainage, and how the covered area connects to the home.",
        },
        {
          title: "Everyday Use",
          description:
            "Plan room for seating, dining, grilling, circulation, stairs, and the way people will move between the house and yard.",
        },
        {
          title: "Weather Protection",
          description:
            "Consider shade, rainfall, gutters, downspouts, wind exposure, and practical water discharge around the project area.",
        },
        {
          title: "Comfort Options",
          description:
            "Coordinate ceiling finishes, lighting, fans, receptacles, screening options, and railing selections when included in the scope.",
        },
      ]}
      processDetails={[
        {
          title: "Discuss the Space",
          description:
            "Tell us how you want to use the area, what weather problems you want to solve, and how it should connect to the home.",
        },
        {
          title: "Review Site Conditions",
          description:
            "We evaluate visible house, roof, deck, drainage, elevation, opening, access, and utility conditions that affect planning.",
        },
        {
          title: "Build the Project Scope",
          description:
            "The proposal identifies the planned deck and cover work, major selections, coordination items, allowances, exclusions, and next steps.",
        },
      ]}
      faqs={faqs}
    />
  );
}
