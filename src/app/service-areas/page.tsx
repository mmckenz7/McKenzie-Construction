import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Deck Builder Service Areas in East Tennessee",
  description:
    "Explore McKenzie Construction deck-building service pages for Farragut, Maryville, Tellico Village, Knoxville, and nearby East Tennessee communities.",
  alternates: { canonical: "/service-areas" },
  openGraph: {
    title: "East Tennessee Deck Builder Service Areas | McKenzie Construction",
    description:
      "Custom decks, replacements, covered outdoor living spaces, screened porches, stairs, and railings across Knoxville and nearby East Tennessee communities.",
    url: "/service-areas",
    type: "website",
  },
};

const areas = [
  {
    name: "Farragut",
    href: "/deck-builder-farragut-tn",
    description:
      "Custom wood and composite decks, replacements, covered outdoor living, stairs, and railings for Farragut-area homes.",
  },
  {
    name: "Maryville",
    href: "/deck-builder-maryville-tn",
    description:
      "Deck construction and replacement planned around Maryville properties, access, grade, materials, and outdoor-living goals.",
  },
  {
    name: "Tellico Village",
    href: "/deck-builder-tellico-village-tn",
    description:
      "Decks, screened porches, covered spaces, stairs, and railing projects for Tellico Village homes and lake-area properties.",
  },
];

export default function ServiceAreasPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navigation />
      <main>
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime-400">
              East Tennessee Service Areas
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Local deck planning backed by completed outdoor-living work.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              McKenzie Construction serves Knoxville and nearby East Tennessee
              communities. These local guides explain the deck, replacement,
              screened-porch, and covered-living work we can review for each
              area without making claims about a property before a site visit.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-3">
            {areas.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                className="group rounded-2xl border border-slate-200 bg-slate-50 p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-600"
              >
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-700">
                  Deck Builder · Tennessee
                </p>
                <h2 className="mt-3 text-2xl font-bold">{area.name}</h2>
                <p className="mt-4 leading-7 text-slate-700">
                  {area.description}
                </p>
                <p className="mt-6 text-sm font-bold">
                  Explore {area.name} deck services <span aria-hidden="true">→</span>
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-slate-100">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
            <div className="relative min-h-80 overflow-hidden rounded-3xl bg-slate-200">
              <Image
                src="/projects/east-tennessee-elevated-covered-deck/full-rear-elevation.jpg"
                alt="Completed elevated covered deck in East Tennessee"
                fill
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                Real Project Proof
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Review completed decks before planning your own.
              </h2>
              <p className="mt-5 leading-8 text-slate-700">
                Our project gallery includes composite deck replacement, a
                screened porch with adjoining deck, an elevated covered deck,
                and larger outdoor-living work. Use those projects to identify
                the layout, materials, stairs, railing, and shelter features
                that fit your goals.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/projects/gallery"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg bg-slate-950 px-6 text-sm font-bold text-white"
                >
                  View Completed Projects
                </Link>
                <Link
                  href="/contact?projectType=New%20Deck"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-sm font-bold"
                >
                  Request a Consultation
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
