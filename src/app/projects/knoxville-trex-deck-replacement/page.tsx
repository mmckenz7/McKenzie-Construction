import type { Metadata } from "next";

import { DeckProjectPage } from "@/components/deck-project-page";

export const metadata: Metadata = {
  title: "Knoxville Trex Deck Replacement Project",
  description:
    "See a completed Knoxville deck transformation with Trex decking, aluminum railing, a single-level layout, and new stairs.",
  alternates: { canonical: "/projects/knoxville-trex-deck-replacement" },
  openGraph: {
    title: "Knoxville Trex Deck Replacement | McKenzie Construction",
    description:
      "A completed two-level-to-one deck transformation with Trex decking and aluminum railing.",
    url: "/projects/knoxville-trex-deck-replacement",
    type: "article",
    images: [
      {
        url: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
        alt: "Completed Knoxville Trex deck with black aluminum railing",
      },
    ],
  },
};

const images = [
  {
    src: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
    alt: "Completed single-level Trex deck with black aluminum railing in Knoxville",
    caption: "Completed single-level deck transformation",
  },
  {
    src: "/projects/knoxville-trex-deck/deck-surface-railing.jpg",
    alt: "Trex deck surface with coordinated black aluminum railing",
    caption: "Trex decking and aluminum railing system",
  },
  {
    src: "/projects/knoxville-trex-deck/deck-stairs.jpg",
    alt: "New deck stairs with black aluminum handrails",
    caption: "New stairs and coordinated handrails",
  },
  {
    src: "/projects/knoxville-trex-deck/deck-layout.jpg",
    alt: "Single-level deck layout viewed from the house",
    caption: "Open single-level layout",
  },
];

export default function KnoxvilleTrexDeckReplacementPage() {
  return (
    <DeckProjectPage
      title="Knoxville Trex Deck Replacement"
      location="Knoxville, Tennessee"
      summary="This project replaced a weathered two-level deck with one more usable single-level outdoor space, finished with Trex decking, black aluminum railing, and a new stair run."
      projectType="Deck%20Replacement"
      highlights={[
        "Two-level layout replaced with one connected deck surface",
        "Trex composite deck boards",
        "Coordinated black aluminum guard and stair railing",
        "New stair run connecting the deck to the yard",
      ]}
      images={images}
      canonicalPath="/projects/knoxville-trex-deck-replacement"
    />
  );
}
