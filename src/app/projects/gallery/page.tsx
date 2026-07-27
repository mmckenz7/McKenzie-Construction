import Image from "next/image";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { SectionTitle } from "@/components/ui";

const galleryImages = [
  {
    src: "/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg",
    alt: "Wide completed rear deck overlooking the wooded property",
    caption: "Rear wood deck — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/B251B85F-BD26-4C55-B8C2-BBA4BB82973B_1_105_c.jpeg",
    alt: "Finished deck running alongside the modular home",
    caption: "Deck and exterior completion — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/BA35268A-E2AD-4805-B618-EB6450364146_1_105_c.jpeg",
    alt: "Exterior stairs connecting the elevated rear deck to the yard",
    caption: "Custom deck stairs — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/D0544A0E-B16B-4F8F-9679-32B8E166C130_1_105_c.jpeg",
    alt: "Lower landing and stair system viewed from the deck",
    caption: "Landing and stair detail — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/432C12B6-148C-48E7-A14C-7F94FD5B350F_1_105_c.jpeg",
    alt: "Side entry steps and finished walkway beside the home",
    caption: "Entry steps and site finish — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/9A27566E-1D13-446F-9846-66366E957DF9_1_105_c.jpeg",
    alt: "Finished exterior of the Island Ford modular home",
    caption: "Modular home exterior — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/71752E31-41DF-4906-9A61-CDA95EBB3A8C_1_105_c.jpeg",
    alt: "Front porch and completed exterior elevation",
    caption: "Front entry and exterior finish — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/9A535F40-1AA8-48E2-BC0F-DB17AEC2B07C_1_105_c.jpeg",
    alt: "Side exterior view showing completed site and home access",
    caption: "Exterior and site work — Lake City, Tennessee",
  },
  {
    src: "/projects/island-ford/1D22BCAB-16C5-4167-8076-73E5900433C6_1_105_c.jpeg",
    alt: "Finished interior room in the Island Ford modular home",
    caption: "Interior finish — Lake City, Tennessee",
  },
];

export default function ProjectGalleryPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />

      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle
          eyebrow="Project Gallery"
          title="A broader look at our completed work."
          description="Browse individual photos from decks, exterior improvements, residential construction, renovations, and smaller projects across East Tennessee."
        />

        <div className="mt-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {galleryImages.map((image) => (
            <figure
              key={image.src}
              className="mb-6 break-inside-avoid overflow-hidden rounded-[1.5rem] border border-brand-charcoal/10 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-brand-charcoal/10">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-500 hover:scale-[1.03]"
                />
              </div>

              <figcaption className="px-5 py-4 text-sm font-semibold leading-6 text-brand-charcoal/70">
                {image.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}