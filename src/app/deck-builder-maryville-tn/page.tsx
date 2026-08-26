import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Deck Builder in Maryville, TN",
  description:
    "Custom deck construction and replacement in Maryville, Tennessee, including wood and composite decking, covered spaces, stairs, and railing systems.",
  alternates: { canonical: "/deck-builder-maryville-tn" },
  openGraph: {
    title: "Deck Builder in Maryville, TN | McKenzie Construction",
    description:
      "Plan a custom deck, replacement, covered outdoor-living area, stairs, or railing project for a Maryville-area home.",
    url: "/deck-builder-maryville-tn",
    type: "website",
  },
};

const faqs = [
  {
    question: "What deck projects do you review in Maryville?",
    answer:
      "We review new wood and composite decks, complete deck replacements, covered outdoor-living spaces, screened areas, stairs, landings, and railing improvements. Availability depends on location, scope, and schedule.",
  },
  {
    question: "How do you plan for a sloped Maryville property?",
    answer:
      "The site review records the house elevation, grade, access, stair location, support conditions, drainage, and the relationship between the deck and yard. Those verified conditions guide the proposed layout and scope.",
  },
  {
    question: "Can I compare a wood deck with a composite option?",
    answer:
      "Yes. The estimate can compare finish directions while keeping the approved geometry consistent. Composite options also need compatible decking, trim, fastening, and railing components coordinated as a system.",
  },
  {
    question: "Do you provide a proposal before construction?",
    answer:
      "Yes. After the layout and scope are reviewed, the proposal identifies the planned work, major materials, working quantities, allowances, exclusions, and next steps. Permit or engineering requirements remain separate when applicable.",
  },
];

export default function MaryvilleDeckBuilderPage() {
  return (
    <ServiceLandingPage
      areaServed={["Maryville, Tennessee"]}
      eyebrow="Deck Builder · Maryville, Tennessee"
      headline="Custom decks and replacements designed for the way your Maryville property works."
      summary="McKenzie Construction plans wood and composite decks, covered outdoor spaces, stairs, and railing projects for Maryville and nearby Blount County properties."
      introduction="A useful deck begins with the relationship between the house, yard, grade, doors, views, and everyday traffic. We document those conditions, confirm the shape and access, then build the structural and finish scope around the approved layout."
      path="/deck-builder-maryville-tn"
      projectType="New Deck"
      serviceName="Deck construction in Maryville, Tennessee"
      featuredProject={{
        title: "East Tennessee Elevated Covered Deck",
        location: "East Tennessee",
        description:
          "A completed elevated wood deck showing a full stair run, open railing, a finished roofed living area, lighting and fan coordination, and a strong connection between the home and yard.",
        imageSrc: "/projects/east-tennessee-elevated-covered-deck/full-rear-elevation.jpg",
        imageAlt: "Completed elevated covered deck in East Tennessee",
        href: "/projects/east-tennessee-elevated-covered-deck",
      }}
      planningDetails={[
        { title: "Grade and Access", description: "Measure deck elevation, yard grade, doors, stair run, equipment access, and material-delivery constraints before finalizing the layout." },
        { title: "Layout and Views", description: "Set the footprint, corners, stairs, railing openings, and covered areas around the house and the way the property will be used." },
        { title: "Material Options", description: "Compare pressure-treated wood or composite decking with coordinated trim, fastening, fascia, stairs, and railing directions." },
        { title: "Complete Scope", description: "Keep demolition, framing, footings, connections, finishes, stairs, railing, delivery, cleanup, and permit responsibilities visible in the proposal." },
      ]}
      processDetails={[
        { title: "Describe the Goal", description: "Share the property, project type, photos, approximate size, material interests, budget direction, and features that matter most." },
        { title: "Confirm the Layout", description: "Review the site and approve the deck shape, house relationship, grade, stairs, railing, and intended outdoor-living use." },
        { title: "Prepare the Plan", description: "Coordinate structural review, finish selections, quantities, working costs, and a clear proposal for the approved project." },
      ]}
      faqs={faqs}
    />
  );
}
