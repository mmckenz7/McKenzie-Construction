import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Island Ford Deck & Outdoor Living Project",
  description:
    "See McKenzie Construction's completed Island Ford project in Lake City, Tennessee, including a rear wood deck, stairs, entry decks, landscaping, and site improvements.",
  alternates: { canonical: "/projects/island-ford" },
  openGraph: {
    title: "Island Ford Deck & Outdoor Living Project",
    description:
      "A completed residential construction, deck, stair, landscaping, and site-improvement project by McKenzie Construction.",
    url: "/projects/island-ford",
    type: "article",
    images: [
      {
        url: "/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg",
        alt: "Rear wood deck and stairs at the Island Ford project",
      },
    ],
  },
};

const galleryImages = [
  {
    src: "/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg",
    alt: "Wide view across the completed rear wood deck",
  },
  {
    src: "/projects/island-ford/B251B85F-BD26-4C55-B8C2-BBA4BB82973B_1_105_c.jpeg",
    alt: "Completed rear deck running alongside the home",
  },
  {
    src: "/projects/island-ford/BA35268A-E2AD-4805-B618-EB6450364146_1_105_c.jpeg",
    alt: "Exterior view of the deck stairs and rear elevation",
  },
  {
    src: "/projects/island-ford/D0544A0E-B16B-4F8F-9679-32B8E166C130_1_105_c.jpeg",
    alt: "View down the deck stairs toward the lower landing",
  },
  {
    src: "/projects/island-ford/432C12B6-148C-48E7-A14C-7F94FD5B350F_1_105_c.jpeg",
    alt: "Side entry stairs and landscaped walkway",
  },
];

export default function IslandFordProjectPage() {
  const projectSchema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: "Island Ford Modular Home & Outdoor Living",
    description:
      "Completed modular-home installation, exterior work, entry decks, rear wood deck, stairs, landscaping, gravel access, and site improvements in Lake City, Tennessee.",
    url: "https://www.mckenzie-builds.com/projects/island-ford",
    image:
      "https://www.mckenzie-builds.com/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg",
    creator: {
      "@type": "HomeAndConstructionBusiness",
      name: "McKenzie Construction",
      url: "https://www.mckenzie-builds.com",
    },
    contentLocation: {
      "@type": "Place",
      name: "Lake City, Tennessee",
    },
  };

  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectSchema) }}
      />
      <Navigation />

      <main>
        <section className="relative min-h-[520px] overflow-hidden bg-brand-charcoal">
          <Image
            src="/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg"
            alt="Rear wood deck and stairs at the Island Ford modular home project"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/15" />

          <div className="relative mx-auto flex min-h-[520px] max-w-7xl items-end px-6 py-14 sm:px-8 lg:px-10">
            <div className="max-w-3xl text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Lake City, Tennessee
              </p>

              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Island Ford Modular Home & Outdoor Living
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">
                A complete residential project including modular-home
                installation, exterior finish work, custom entry decks, a
                large rear wood deck, stairs, landscaping, gravel access, and
                site improvements.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Project Overview
              </p>

              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Complete construction from site preparation through final
                exterior details.
              </h2>

              <div className="mt-6 space-y-5 text-lg leading-8 text-brand-charcoal/70">
                <p>
                  McKenzie Construction coordinated the installation and
                  exterior completion of this modular home in Lake City,
                  Tennessee.
                </p>

                <p>
                  The scope included the home setup, exterior finish work,
                  custom front and side entry decks, a large elevated rear
                  deck, full stair systems, gravel access areas, landscaping,
                  and supporting site improvements.
                </p>

                <p>
                  The finished project provides practical access around the
                  property while adding a large outdoor space overlooking the
                  wooded East Tennessee setting.
                </p>
              </div>
            </div>

            <aside className="rounded-[1.75rem] bg-white p-7 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-green">
                Project Details
              </p>

              <dl className="mt-6 space-y-6">
                <div>
                  <dt className="text-sm font-semibold text-brand-charcoal/50">
                    Location
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    Lake City, Tennessee
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-semibold text-brand-charcoal/50">
                    Project Type
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    Modular Home & Outdoor Living
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-semibold text-brand-charcoal/50">
                    Scope
                  </dt>
                  <dd className="mt-1 text-base leading-7 text-brand-charcoal/70">
                    Home installation, exterior completion, decks, stairs,
                    landscaping, gravel access, and site work
                  </dd>
                </div>
              </dl>

              <Link
                href="/contact"
                className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-brand-green px-6 py-3 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
              >
                Start Your Project
              </Link>
            </aside>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Project Gallery
              </p>

              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Exterior, deck, and site details.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {galleryImages.map((image, index) => (
                <div
                  key={image.src}
                  className={`relative overflow-hidden rounded-[1.75rem] bg-brand-charcoal/10 ${
                    index === 0 ? "md:col-span-2 aspect-[16/9]" : "aspect-[4/3]"
                  }`}
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes={
                      index === 0
                        ? "100vw"
                        : "(min-width: 768px) 50vw, 100vw"
                    }
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
          <div className="rounded-[2rem] bg-brand-charcoal px-7 py-10 text-white sm:px-10 lg:flex lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Planning a Project?
              </p>

              <h2 className="mt-3 max-w-2xl text-3xl font-semibold">
                Let’s talk through the property, scope, and best next step.
              </h2>
            </div>

            <Link
              href="/contact"
              className="mt-8 inline-flex rounded-full bg-brand-green px-7 py-3 text-sm font-semibold text-brand-charcoal transition hover:opacity-90 lg:mt-0"
            >
              Start Your Project
            </Link>
          </div>

          <Link
            href="/projects"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand-charcoal transition hover:text-brand-green"
          >
            <span aria-hidden="true">←</span>
            Back to Projects
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
