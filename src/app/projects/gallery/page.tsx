import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Deck & Residential Project Gallery",
  description:
    "Browse completed deck, stair, exterior, site-improvement, and residential construction work by McKenzie Construction in East Tennessee.",
  alternates: { canonical: "/projects/gallery" },
  openGraph: {
    title: "Deck & Residential Project Gallery | McKenzie Construction",
    description:
      "Completed decks, stairs, exterior improvements, and residential construction work in East Tennessee.",
    url: "/projects/gallery",
    type: "website",
    images: [
      {
        url: "/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg",
        alt: "Completed rear wood deck in Lake City, Tennessee",
      },
    ],
  },
};

const galleryImages: Array<{
  src: string;
  alt: string;
  caption: string;
  href?: string;
}> = [
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
  {
    src: "/projects/completed-renovations/renovation-one-exterior.jpg",
    alt: "Completed single-story home exterior with fresh landscaping",
    caption: "Completed exterior renovation — East Tennessee",
    href: "/projects/east-tennessee-ranch-renovation",
  },
  {
    src: "/projects/completed-renovations/renovation-one-kitchen.jpg",
    alt: "Renovated kitchen with light cabinets, stone-look counters, and tile backsplash",
    caption: "Kitchen renovation — East Tennessee",
    href: "/projects/east-tennessee-ranch-renovation",
  },
  {
    src: "/projects/completed-renovations/renovation-one-sunroom.jpg",
    alt: "Finished sunroom with a wall of windows and new carpet",
    caption: "Sunroom interior finish — East Tennessee",
    href: "/projects/east-tennessee-ranch-renovation",
  },
  {
    src: "/projects/completed-renovations/renovation-two-exterior.jpg",
    alt: "Completed cottage exterior with restored entry and landscaping",
    caption: "Cottage exterior renovation — East Tennessee",
    href: "/projects/east-tennessee-cottage-renovation",
  },
  {
    src: "/projects/completed-renovations/renovation-two-living-room.jpg",
    alt: "Renovated living room with refinished hardwood floors and fireplace",
    caption: "Living room and hardwood restoration — East Tennessee",
    href: "/projects/east-tennessee-cottage-renovation",
  },
  {
    src: "/projects/completed-renovations/renovation-two-kitchen.jpg",
    alt: "Renovated kitchen with wood cabinetry, tile floor, and updated appliances",
    caption: "Kitchen and interior renovation — East Tennessee",
    href: "/projects/east-tennessee-cottage-renovation",
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
          {galleryImages.map((image) => {
            const figure = (
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
            );

            return image.href ? (
              <Link key={image.src} href={image.href} className="group block">
                {figure}
              </Link>
            ) : (
              figure
            );
          })}
        </div>

        <section className="mt-12 rounded-[2rem] border border-brand-charcoal/10 bg-white p-7 shadow-sm sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-green">
                Project Stories
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                See the finished work grouped by project.
              </h2>
              <p className="mt-4 max-w-3xl leading-7 text-brand-charcoal/70">
                Explore the Island Ford deck and site work or open either
                renovation story for a clearer view of the related finished
                spaces.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/projects/island-ford"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-charcoal px-6 text-sm font-semibold text-white transition hover:bg-brand-charcoal/85"
              >
                Browse Project Stories
              </Link>
              <Link
                href="/contact?projectType=New%20Deck"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-6 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
              >
                Request a Deck Consultation
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
