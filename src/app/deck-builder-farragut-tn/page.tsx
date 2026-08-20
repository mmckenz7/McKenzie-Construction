import type { Metadata } from "next";

import { ServiceLandingPage } from "@/components/service-landing-page";

export const metadata: Metadata = {
  title: "Deck Builder in Farragut, TN",
  description:
    "Plan a custom wood or composite deck, deck replacement, covered outdoor-living space, stairs, or railing project in Farragut, Tennessee.",
  alternates: { canonical: "/deck-builder-farragut-tn" },
  openGraph: {
    title: "Deck Builder in Farragut, TN | McKenzie Construction",
    description:
      "Deck construction and replacement planning for Farragut homes, including composite decking, covered spaces, stairs, and railings.",
    url: "/deck-builder-farragut-tn",
    type: "website",
  },
};

const faqs = [
  {
    question: "Do you build both wood and composite decks in Farragut?",
    answer:
      "Yes. The project can be planned around pressure-treated wood or a compatible composite decking system. Layout, board direction, trim, fastening, stairs, and railing are coordinated with the selected finish.",
  },
  {
    question: "Can an existing Farragut deck be completely replaced?",
    answer:
      "Yes. A replacement consultation can cover demolition, the proposed footprint, framing and attachment conditions, decking, stairs, railing, access, and disposal. Existing conditions must be reviewed on site before the final scope is prepared.",
  },
  {
    question: "Can you add a roof or covered area to the deck?",
    answer:
      "Covered outdoor-living projects can be reviewed as part of the deck plan. Roof relationship, drainage, lighting, fan locations, posts, stairs, and the connection to the home are considered together.",
  },
  {
    question: "What should I send before a consultation?",
    answer:
      "Share the Farragut property address, photos of the house and project area, approximate size, whether this is new construction or replacement, material preferences, and the way you want to use the space.",
  },
];

export default function FarragutDeckBuilderPage() {
  return (
    <ServiceLandingPage
      areaServed={["Farragut, Tennessee"]}
      eyebrow="Deck Builder · Farragut, Tennessee"
      headline="A deck planned around your Farragut home, property, and everyday use."
      summary="McKenzie Construction plans and builds custom decks, replacements, covered outdoor-living spaces, stairs, and railings for Farragut-area homeowners."
      introduction="Farragut deck projects can range from a straightforward replacement to a larger outdoor-living addition. The starting point is the real property: the house connection, grade, access, desired footprint, stairs, railing, shade, and finish preferences."
      path="/deck-builder-farragut-tn"
      projectType="New Deck"
      serviceName="Deck construction in Farragut, Tennessee"
      featuredProject={{
        title: "Knoxville Trex Deck Replacement",
        location: "Knoxville, Tennessee",
        description:
          "A completed nearby replacement project showing composite decking, picture-frame edges, black aluminum railing, stairs, and a clean single-level layout.",
        imageSrc: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
        imageAlt: "Completed Trex deck with aluminum railing near Farragut",
        href: "/projects/knoxville-trex-deck-replacement",
      }}
      planningDetails={[
        { title: "Property Fit", description: "Confirm the usable footprint, house relationship, grade, drainage, access, and how the new deck should connect indoor and outdoor spaces." },
        { title: "Replacement or New", description: "Separate direct replacement from a changed footprint so demolition, field conditions, layout decisions, and new work are scoped clearly." },
        { title: "Finish Direction", description: "Compare wood and composite decking, board colors, picture-frame details, fascia, stairs, and railing appearance before final selections." },
        { title: "Covered Space", description: "If shade or weather protection matters, coordinate the deck with the proposed roof, posts, drainage, lighting, fan, and house connection." },
      ]}
      processDetails={[
        { title: "Share the Property", description: "Send the address, photos, approximate dimensions, project type, material direction, and the features you want included." },
        { title: "Review the Site", description: "Verify access, grade, existing conditions, house connection, layout, stairs, railing, and any covered-living considerations." },
        { title: "Build the Scope", description: "Prepare a proposal with the approved layout, major materials, allowances, exclusions, and next steps." },
      ]}
      faqs={faqs}
    />
  );
}
