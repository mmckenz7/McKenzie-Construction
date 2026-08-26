import type { Metadata } from "next";

import { RenovationProjectPage } from "@/components/renovation-project-page";

export const metadata: Metadata = {
  title: "East Tennessee Cottage Renovation",
  description:
    "View completed cottage exterior, living-room, hardwood-floor, and kitchen renovation work by McKenzie Construction in East Tennessee.",
  alternates: { canonical: "/projects/east-tennessee-cottage-renovation" },
  openGraph: {
    title: "East Tennessee Cottage Renovation",
    description:
      "A photo-backed look at completed cottage exterior, living-room, and kitchen improvements in East Tennessee.",
    url: "/projects/east-tennessee-cottage-renovation",
    type: "article",
    images: [
      {
        url: "/projects/completed-renovations/renovation-two-exterior.jpg",
        alt: "Completed East Tennessee cottage exterior",
      },
    ],
  },
};

const images = [
  {
    src: "/projects/completed-renovations/renovation-two-exterior.jpg",
    alt: "Completed cottage exterior with refreshed entry and landscaping",
    caption: "Completed cottage exterior and entry",
  },
  {
    src: "/projects/completed-renovations/renovation-two-living-room.jpg",
    alt: "Renovated living room with hardwood floors and a fireplace",
    caption: "Living room, hardwood floor, and fireplace finish",
  },
  {
    src: "/projects/completed-renovations/renovation-two-kitchen.jpg",
    alt: "Renovated kitchen with wood cabinetry, tile floor, and updated appliances",
    caption: "Finished kitchen and tile floor",
  },
];

export default function EastTennesseeCottageRenovationPage() {
  return (
    <RenovationProjectPage
      title="East Tennessee Cottage Renovation"
      summary="Completed photos document a refreshed cottage exterior, a finished living room with hardwood floors and fireplace, and an updated kitchen. The result keeps the home’s character while giving the visible spaces a clean, finished feel."
      highlights={[
        "Refreshed cottage exterior, front entry, and landscaping",
        "Finished living room with hardwood flooring",
        "Fireplace retained as a visible room focal point",
        "Updated kitchen cabinetry, appliances, and tile floor",
      ]}
      images={images}
      canonicalPath="/projects/east-tennessee-cottage-renovation"
    />
  );
}
