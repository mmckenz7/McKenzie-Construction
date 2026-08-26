import type { Metadata } from "next";

import { DeckProjectPage } from "@/components/deck-project-page";

export const metadata: Metadata = {
  title: "East Tennessee Elevated Covered Deck Project",
  description:
    "See a completed East Tennessee elevated covered deck with a finished ceiling, ceiling fan, wood railing, full stair run, and furnished outdoor-living space.",
  alternates: { canonical: "/projects/east-tennessee-elevated-covered-deck" },
  openGraph: {
    title: "East Tennessee Elevated Covered Deck | McKenzie Construction",
    description:
      "A completed elevated covered wood deck designed for shaded outdoor living in East Tennessee.",
    url: "/projects/east-tennessee-elevated-covered-deck",
    type: "article",
    images: [
      {
        url: "/projects/east-tennessee-elevated-covered-deck/full-rear-elevation.jpg",
        alt: "Completed elevated covered wood deck in East Tennessee",
      },
    ],
  },
};

const images = [
  {
    src: "/projects/east-tennessee-elevated-covered-deck/full-rear-elevation.jpg",
    alt: "Full rear elevation of a completed elevated covered wood deck",
    caption: "Completed elevated covered deck and stair system",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/furnished-lounge.jpg",
    alt: "Furnished covered deck lounge with a ceiling fan and wood railing",
    caption: "Furnished outdoor lounge under the finished roof",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/covered-deck-view.jpg",
    alt: "Covered deck overlooking a green East Tennessee backyard",
    caption: "Shaded outdoor-living area with an open backyard view",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/view-from-house.jpg",
    alt: "Covered deck and railing viewed from the house doorway",
    caption: "Covered deck connection from the house",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/house-side-lounge.jpg",
    alt: "Covered deck seating and grill area beside the house",
    caption: "Flexible seating and grill space",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/full-stair-run.jpg",
    alt: "Full wood stair run leading to the elevated covered deck",
    caption: "Full stair run with coordinated wood railing",
  },
  {
    src: "/projects/east-tennessee-elevated-covered-deck/covered-deck-structure.jpg",
    alt: "Exterior view of the covered deck framing, railing, and finished ceiling",
    caption: "Covered deck structure and finished soffit ceiling",
  },
];

export default function EastTennesseeElevatedCoveredDeckPage() {
  return (
    <DeckProjectPage
      title="East Tennessee Elevated Covered Deck"
      location="East Tennessee"
      summary="This elevated wood deck adds a roofed outdoor-living area with a finished soffit ceiling, ceiling fan, open wood railing, and a full stair run to the backyard. The furnished space provides shade while keeping an open view across the property."
      projectType="Covered%20Outdoor%20Living"
      highlights={[
        "Elevated covered outdoor-living area",
        "Finished soffit ceiling with ceiling fan",
        "Coordinated wood deck and railing",
        "Full stair run connecting the deck to the backyard",
      ]}
      images={images}
      canonicalPath="/projects/east-tennessee-elevated-covered-deck"
      relatedProjects={[
        {
          title: "Tellico Village Screened Porch & Deck",
          location: "Tellico Village, Tennessee",
          imageSrc:
            "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
          imageAlt: "Completed screened porch and adjoining deck",
          href: "/projects/tellico-village-screened-porch",
        },
        {
          title: "Knoxville Trex Deck Replacement",
          location: "Knoxville, Tennessee",
          imageSrc: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
          imageAlt: "Completed Knoxville Trex deck",
          href: "/projects/knoxville-trex-deck-replacement",
        },
      ]}
    />
  );
}
