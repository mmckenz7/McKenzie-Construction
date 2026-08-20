import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Deck & Residential Project Gallery",
  description:
    "Browse completed deck, screened-porch, outdoor-living, and residential projects by McKenzie Construction in East Tennessee.",
  alternates: { canonical: "/projects/gallery" },
  openGraph: {
    title: "Deck & Residential Project Gallery | McKenzie Construction",
    description:
      "Open complete photo galleries for finished decks, screened porches, outdoor spaces, and residential projects in East Tennessee.",
    url: "/projects/gallery",
    type: "website",
    images: [
      {
        url: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
        alt: "Completed Knoxville Trex deck with black aluminum railing",
      },
    ],
  },
};

const projects = [
  {
    title: "Knoxville Trex Deck Replacement",
    location: "Knoxville, Tennessee",
    category: "Deck Replacement",
    imageSrc: "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
    imageAlt: "Completed Knoxville Trex deck with black aluminum railing",
    href: "/projects/knoxville-trex-deck-replacement",
    photoCount: 4,
  },
  {
    title: "Tellico Village Screened Porch & Deck",
    location: "Tellico Village, Tennessee",
    category: "Screened Porch & Deck",
    imageSrc:
      "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
    imageAlt: "Completed elevated screened porch and adjoining deck",
    href: "/projects/tellico-village-screened-porch",
    photoCount: 4,
  },
  {
    title: "Island Ford Modular Home & Outdoor Living",
    location: "Lake City, Tennessee",
    category: "Deck, Stairs & Residential Construction",
    imageSrc:
      "/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg",
    imageAlt: "Rear wood deck and stairs at the Island Ford project",
    href: "/projects/island-ford",
    photoCount: 9,
  },
  {
    title: "East Tennessee Ranch Home Renovation",
    location: "East Tennessee",
    category: "Residential Renovation",
    imageSrc:
      "/projects/completed-renovations/renovation-one-exterior.jpg",
    imageAlt: "Completed single-story East Tennessee home exterior",
    href: "/projects/east-tennessee-ranch-renovation",
    photoCount: 6,
  },
  {
    title: "East Tennessee Cottage Renovation",
    location: "East Tennessee",
    category: "Residential Renovation",
    imageSrc:
      "/projects/completed-renovations/renovation-two-exterior.jpg",
    imageAlt: "Completed East Tennessee cottage exterior and entry",
    href: "/projects/east-tennessee-cottage-renovation",
    photoCount: 6,
  },
];

export default function ProjectGalleryPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />

      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle
          eyebrow="Project Gallery"
          title="Choose a project to see the complete photo story."
          description="Every thumbnail below represents one completed project. Open a project to see its deck, stairs, railings, outdoor spaces, and construction details together."
        />

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, index) => (
            <Link
              key={project.href}
              href={project.href}
              className={`group overflow-hidden rounded-[1.75rem] border border-brand-charcoal/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-green ${
                index === 0 ? "md:col-span-2 xl:col-span-2" : ""
              }`}
            >
              <article>
                <div
                  className={`relative overflow-hidden bg-brand-charcoal/10 ${
                    index === 0 ? "aspect-[16/9]" : "aspect-[4/3]"
                  }`}
                >
                  <Image
                    src={project.imageSrc}
                    alt={project.imageAlt}
                    fill
                    priority={index === 0}
                    sizes={
                      index === 0
                        ? "(min-width: 1280px) 66vw, (min-width: 768px) 100vw, 100vw"
                        : "(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    }
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-5 pt-16 text-white">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-green">
                      {project.category}
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-sm font-semibold text-brand-charcoal/55">
                    {project.location}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold leading-tight">
                    {project.title}
                  </h2>
                  <div className="mt-5 flex items-center justify-between border-t border-brand-charcoal/10 pt-4 text-sm font-semibold">
                    <span className="text-brand-charcoal/60">
                      {project.photoCount} project photos
                    </span>
                    <span className="text-brand-charcoal transition group-hover:text-brand-green">
                      Open project <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <section className="mt-12 rounded-[2rem] bg-brand-charcoal p-7 text-white shadow-sm sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-green">
                Have a Similar Project?
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                Show us your property and the outdoor space you want to build.
              </h2>
              <p className="mt-4 max-w-3xl leading-7 text-white/70">
                Start with a consultation. We can discuss replacement decks,
                new decks, screened porches, stairs, railings, and related
                outdoor-living work.
              </p>
            </div>
            <Link
              href="/contact?projectType=New%20Deck"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-7 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
            >
              Request a Deck Consultation
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
