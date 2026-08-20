import type { Metadata } from "next";

import { RenovationProjectPage } from "@/components/renovation-project-page";

export const metadata: Metadata = {
  title: "East Tennessee Ranch Home Renovation",
  description:
    "View completed exterior, kitchen, and sunroom renovation work by McKenzie Construction in East Tennessee.",
  alternates: { canonical: "/projects/east-tennessee-ranch-renovation" },
  openGraph: {
    title: "East Tennessee Ranch Home Renovation",
    description:
      "A photo-backed look at completed exterior, kitchen, and sunroom improvements in East Tennessee.",
    url: "/projects/east-tennessee-ranch-renovation",
    type: "article",
    images: [
      {
        url: "/projects/completed-renovations/renovation-one-exterior.jpg",
        alt: "Completed East Tennessee ranch home exterior",
      },
    ],
  },
};

const images = [
  {
    src: "/projects/completed-renovations/renovation-one-exterior.jpg",
    alt: "Completed single-story home exterior with refreshed landscaping",
    caption: "Completed exterior and landscaping",
  },
  {
    src: "/projects/completed-renovations/renovation-one-kitchen.jpg",
    alt: "Renovated kitchen with light cabinets, stone-look counters, and tile backsplash",
    caption: "Finished kitchen cabinetry, counters, and backsplash",
  },
  {
    src: "/projects/completed-renovations/renovation-one-sunroom.jpg",
    alt: "Finished sunroom with a wall of windows and new carpet",
    caption: "Bright finished sunroom",
  },
];

export default function EastTennesseeRanchRenovationPage() {
  return (
    <RenovationProjectPage
      title="East Tennessee Ranch Home Renovation"
      summary="Completed photos show a refreshed single-story exterior, an updated kitchen, and a bright finished sunroom. Together, they show how coordinated improvements can update both the first impression and everyday living spaces."
      highlights={[
        "Refreshed single-story exterior and landscaping",
        "Light kitchen cabinetry with updated counters and backsplash",
        "Finished sunroom with a broad wall of windows",
        "Coordinated interior finishes across the visible spaces",
      ]}
      images={images}
      canonicalPath="/projects/east-tennessee-ranch-renovation"
    />
  );
}
