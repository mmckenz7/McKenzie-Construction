import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export const metadata: Metadata = {
  title: "Deck Builder in Knoxville, TN",
  description:
    "McKenzie Construction & Management builds custom wood and composite decks, covered decks, screened porches, stairs, and railings throughout Knoxville and East Tennessee.",
  alternates: {
    canonical: "/knoxville-deck-builder",
  },
  openGraph: {
    title:
      "Deck Builder in Knoxville, TN | McKenzie Construction",
    description:
      "Custom decks, composite decking, covered outdoor living spaces, screened porches, stairs, and railings in Knoxville, Tennessee.",
    url: "/knoxville-deck-builder",
    type: "website",
    images: [
      {
        url: "/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg",
        width: 1200,
        height: 630,
        alt: "Custom wood deck built by McKenzie Construction near Knoxville, Tennessee",
      },
    ],
  },
};

const services = [
  {
    title: "Custom Deck Construction",
    description:
      "Wood and composite decks planned around your home, property, budget, and how you intend to use the space.",
  },
  {
    title: "Composite Decking",
    description:
      "Low-maintenance composite decking with coordinated stairs, trim, framing evaluation, and railing options.",
  },
  {
    title: "Covered Decks",
    description:
      "Covered outdoor living spaces that provide shade, weather protection, and a more comfortable place to gather.",
  },
  {
    title: "Screened Porches",
    description:
      "New screened porches and conversions that make outdoor areas more useful while reducing insects and exposure.",
  },
  {
    title: "Deck Replacement",
    description:
      "Removal and replacement of aging or damaged decks, including framing, decking, stairs, railings, and structural repairs.",
  },
  {
    title: "Deck Stairs and Railings",
    description:
      "New stairs, landings, wood railings, aluminum railings, and practical access improvements for existing or new decks.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Initial Conversation",
    description:
      "We discuss the property, intended use, preferred materials, timing, and overall goals for the project.",
  },
  {
    number: "02",
    title: "Site Review",
    description:
      "We evaluate access, elevations, existing construction, drainage, utilities, and any site conditions that may affect the work.",
  },
  {
    number: "03",
    title: "Scope and Proposal",
    description:
      "You receive a clear proposal outlining the planned work, major materials, allowances, exclusions, and payment schedule.",
  },
  {
    number: "04",
    title: "Construction",
    description:
      "We coordinate materials, subcontractors, scheduling, inspections, communication, and project completion.",
  },
];

const serviceAreas = [
  "Knoxville",
  "Farragut",
  "Powell",
  "Halls",
  "Karns",
  "Oak Ridge",
  "Maryville",
  "Louisville",
  "Alcoa",
  "Anderson County",
];

export default function KnoxvilleDeckBuilderPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navigation />

      <main>
        <section className="relative isolate overflow-hidden bg-slate-950">
          <div className="absolute inset-0">
            <img
              src="/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg"
              alt=""
              className="h-full w-full object-cover opacity-35"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/40" />
          </div>

          <div className="relative mx-auto max-w-7xl px-6 py-24 sm:px-8 sm:py-32 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime-400">
                Knoxville Deck Builder
              </p>

              <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Custom decks built around the way you live.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
                McKenzie Construction & Management builds custom wood
                decks, composite decks, covered outdoor living spaces,
                screened porches, stairs, and railings throughout
                Knoxville and East Tennessee.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-lg bg-lime-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
                >
                  Request a Consultation
                </Link>

                <a
                  href="tel:8652633811"
                  className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/20"
                >
                  Call (865) 263-3811
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 text-center sm:grid-cols-3 sm:px-8 lg:px-10">
            <div>
              <p className="text-sm font-bold text-slate-950">
                Knoxville-Based
              </p>

              <p className="mt-1 text-sm text-slate-600">
                Serving homeowners throughout East Tennessee
              </p>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-950">
                Wood and Composite
              </p>

              <p className="mt-1 text-sm text-slate-600">
                Material options based on budget and maintenance goals
              </p>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-950">
                Managed From Start to Finish
              </p>

              <p className="mt-1 text-sm text-slate-600">
                Planning, subcontractor coordination, and communication
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                Outdoor Living
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                More than a platform attached to the house
              </h2>

              <p className="mt-6 text-base leading-8 text-slate-700">
                A good deck should fit the property, connect naturally
                to the home, and support how the homeowner actually
                plans to use it. That may mean space for grilling,
                entertaining, dining, stairs to the yard, shade, or a
                future covered area.
              </p>

              <p className="mt-4 text-base leading-8 text-slate-700">
                We evaluate the entire project rather than treating
                decking, stairs, railings, drainage, access, and
                surrounding improvements as unrelated pieces.
              </p>

              <Link
                href="/projects/island-ford"
                className="mt-7 inline-flex text-sm font-bold text-slate-950 underline decoration-lime-500 decoration-2 underline-offset-4"
              >
                View the Island Ford project →
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src="/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg"
                alt="Large pressure-treated wood deck near Knoxville"
                className="aspect-[4/3] h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-400">
                Deck and Porch Services
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Outdoor construction for Knoxville homes
              </h2>

              <p className="mt-5 text-base leading-8 text-slate-300">
                Projects can be tailored to the home, site conditions,
                material preferences, intended use, and long-term
                maintenance expectations.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <article
                  key={service.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6"
                >
                  <h3 className="text-lg font-bold text-white">
                    {service.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    {service.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
              Our Process
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Clear planning before construction begins
            </h2>

            <p className="mt-5 text-base leading-8 text-slate-700">
              Every property is different. The process starts with
              understanding the site and the homeowner’s goals before
              finalizing the scope.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {processSteps.map((step) => (
              <article
                key={step.number}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
              >
                <p className="text-sm font-bold text-lime-700">
                  {step.number}
                </p>

                <h3 className="mt-3 text-xl font-bold text-slate-950">
                  {step.title}
                </h3>

                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-slate-100">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:px-8 lg:grid-cols-2 lg:px-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                Service Area
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                Serving Knoxville and surrounding communities
              </h2>

              <p className="mt-5 text-base leading-8 text-slate-700">
                McKenzie Construction & Management works throughout
                the Knoxville area and nearby East Tennessee
                communities. Project availability depends on location,
                scope, and scheduling.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {serviceAreas.map((area) => (
                <div
                  key={area}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-800 shadow-sm"
                >
                  {area}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="rounded-3xl bg-slate-950 px-6 py-12 text-center sm:px-10 sm:py-16">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-400">
              Start Your Project
            </p>

            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Planning a deck, covered outdoor space, or screened porch?
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300">
              Tell us about the property, the type of space you want,
              and where the project is located.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-lg bg-lime-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
              >
                Request a Consultation
              </Link>

              <Link
                href="/projects/gallery"
                className="inline-flex items-center justify-center rounded-lg border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Project Gallery
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}