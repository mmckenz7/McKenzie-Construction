import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Deck Builder in Tellico Village, TN",
  description:
    "Decks, screened porches, covered outdoor spaces, stairs, and railing projects for Tellico Village homes in East Tennessee.",
  alternates: { canonical: "/deck-builder-tellico-village-tn" },
  openGraph: {
    title: "Deck Builder in Tellico Village, TN | McKenzie Construction",
    description:
      "See completed Tellico Village outdoor-living work and plan a deck, replacement, screened porch, stairs, or railing project.",
    url: "/deck-builder-tellico-village-tn",
    type: "website",
  },
};

const faqs = [
  {
    question: "Do you have completed work in Tellico Village?",
    answer:
      "Yes. Our portfolio includes a completed elevated screened porch with an adjoining composite deck, grill area, stairs, and railing in Tellico Village. You can review the full project gallery on this page.",
  },
  {
    question: "Can the project include both screened and open deck space?",
    answer:
      "Yes. The layout can coordinate a protected screened room with an adjoining open deck, grilling area, stairs, railing, doors, roof drainage, and transitions between spaces.",
  },
  {
    question: "Can you replace an existing deck in Tellico Village?",
    answer:
      "Yes. A site visit determines what is being replaced, whether the footprint changes, and which existing conditions require further review. The proposal can then separate demolition, framing, finishes, stairs, railing, and related work.",
  },
  {
    question: "What community or permit requirements are included?",
    answer:
      "Known permitting, review, and property requirements are identified during planning, but final responsibility depends on the project location and scope. Homeowners should also disclose any association review or property-specific restrictions that apply.",
  },
];

export default function TellicoVillageDeckBuilderPage() {
  return (
    <ServiceLandingPage
      areaServed={["Tellico Village, Tennessee"]}
      eyebrow="Deck Builder · Tellico Village, Tennessee"
      headline="Decks, screened porches, and outdoor rooms planned for Tellico Village living."
      summary="McKenzie Construction plans new decks, replacements, screened porches, covered spaces, stairs, and railing projects for Tellico Village homes."
      introduction="Tellico Village outdoor spaces often need to balance views, grade, access, shade, grilling, screened living, stairs, and a clean relationship with the home. We begin with the verified property and approved layout, then coordinate structure, finishes, and the proposal."
      path="/deck-builder-tellico-village-tn"
      projectType="Screened Porch"
      serviceName="Deck and screened porch construction in Tellico Village, Tennessee"
      featuredProject={{
        title: "Tellico Village Screened Porch & Deck",
        location: "Tellico Village, Tennessee",
        description:
          "This completed project combines an elevated screened living room, open composite deck, grill area, stairs, and railing in one coordinated outdoor-living layout.",
        imageSrc: "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
        imageAlt: "Completed screened porch and deck in Tellico Village",
        href: "/projects/tellico-village-screened-porch",
      }}
      planningDetails={[
        { title: "Open and Protected Space", description: "Decide how much of the project should be open deck, screened living, covered space, grilling area, or a connection between those zones." },
        { title: "Views and Grade", description: "Confirm the platform elevation, property views, yard access, stairs, railing runs, and the way the deck meets the home." },
        { title: "Finish Coordination", description: "Coordinate decking, screen details, ceilings, trim, lighting, fans, stairs, fascia, and railing around one approved layout." },
        { title: "Property Requirements", description: "Identify known permit, association, access, drainage, and property-specific considerations before the final construction scope." },
      ]}
      processDetails={[
        { title: "Share Your Priorities", description: "Explain whether you want open deck space, screened living, shade, grilling, better stairs, a replacement, or a combination." },
        { title: "Verify the Property", description: "Document the house, grade, views, access, existing structure, doors, proposed footprint, stairs, and railing conditions." },
        { title: "Coordinate the Proposal", description: "Build the approved layout into a structural, finish, quantity, and cost plan with clear assumptions and exclusions." },
      ]}
      faqs={faqs}
    />
  );
}
