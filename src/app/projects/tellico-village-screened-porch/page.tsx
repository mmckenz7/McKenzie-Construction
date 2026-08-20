import type { Metadata } from "next";

import { DeckProjectPage } from "@/components/deck-project-page";

export const metadata: Metadata = {
  title: "Tellico Village Screened Porch & Deck Project",
  description:
    "See a completed Tellico Village screened porch and deck project with protected living space, composite decking, railing, and a grill area.",
  alternates: { canonical: "/projects/tellico-village-screened-porch" },
  openGraph: {
    title: "Tellico Village Screened Porch & Deck | McKenzie Construction",
    description:
      "A completed elevated screened outdoor room with adjoining deck space in Tellico Village.",
    url: "/projects/tellico-village-screened-porch",
    type: "article",
    images: [
      {
        url: "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
        alt: "Completed elevated screened porch and deck in Tellico Village",
      },
    ],
  },
};

const images = [
  {
    src: "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
    alt: "Full rear elevation of an elevated screened porch and adjoining deck",
    caption: "Completed elevated screened porch and deck",
  },
  {
    src: "/projects/tellico-village-screened-porch/screened-living-space.jpg",
    alt: "Furnished screened outdoor living room with wooded view",
    caption: "Protected outdoor living space",
  },
  {
    src: "/projects/tellico-village-screened-porch/screened-room.jpg",
    alt: "Long screened porch with composite floor and ceiling fans",
    caption: "Screened room with composite deck surface and ceiling fans",
  },
  {
    src: "/projects/tellico-village-screened-porch/deck-grill-area.jpg",
    alt: "Open deck grill area adjoining the screened porch",
    caption: "Adjoining open deck and grill area",
  },
];

export default function TellicoVillageScreenedPorchPage() {
  return (
    <DeckProjectPage
      title="Tellico Village Screened Porch & Deck"
      location="Tellico Village, Tennessee"
      summary="This elevated outdoor-living project combines a long screened room with an adjoining open deck, creating separate places to relax, dine, and grill while maintaining the wooded view."
      projectType="Screened%20Porch"
      highlights={[
        "Elevated screened outdoor living room",
        "Adjoining open deck and dedicated grill area",
        "Composite deck surface and coordinated railing",
        "Ceiling fans and protected seating space",
      ]}
      images={images}
      canonicalPath="/projects/tellico-village-screened-porch"
    />
  );
}
