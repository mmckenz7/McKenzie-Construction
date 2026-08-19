import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { TrackedPhoneLink } from "@/components/tracked-phone-link";

export const metadata: Metadata = {
  title: "Construction and Deck Services",
  description:
    "Explore custom decks, composite decking, covered outdoor living spaces, screened porches, renovations, siding, roofing, and residential construction services from McKenzie Construction & Management.",
  alternates: {
    canonical: "/services",
  },
  openGraph: {
    title:
      "Construction and Deck Services | McKenzie Construction",
    description:
      "Custom decks, covered outdoor living spaces, screened porches, renovations, siding, roofing, and residential construction throughout Knoxville and East Tennessee.",
    url: "/services",
    type: "website",
    images: [
      {
        url: "/projects/island-ford/05062FD1-CF2E-4F0C-8422-79246C3BAAE8_1_105_c.jpeg",
        width: 1200,
        height: 630,
        alt: "Completed wood deck by McKenzie Construction",
      },
    ],
  },
};

const primaryServices = [
  {
    title: "Custom Deck Construction",
    href: "/knoxville-deck-builder",
    description:
      "Custom pressure-treated wood and composite decks planned around the home, property, budget, and intended use.",
    details: [
      "New deck construction",
      "Wood and composite decking",
      "Deck extensions and redesigns",
      "Integrated stairs and landings",
    ],
  },
  {
    title: "Deck Replacement and Remodeling",
    href: "/deck-replacement-knoxville",
    description:
      "Removal and replacement of aging, damaged, undersized, or poorly configured decks.",
    details: [
      "Existing deck demolition",
      "Framing evaluation and replacement",
      "Deck surface replacement",
      "Layout and access improvements",
    ],
  },
  {
    title: "Covered Outdoor Living",
    href: "/covered-decks-knoxville",
    description:
      "Covered decks and outdoor spaces designed to provide shade, weather protection, and more comfortable everyday use.",
    details: [
      "Covered deck construction",
      "Roof extensions",
      "Outdoor gathering areas",
      "Lighting and fan coordination",
    ],
  },
  {
    title: "Screened Porches",
    href: null,
    description:
      "New screened porches and conversions that create a more usable outdoor space with protection from insects and weather.",
    details: [
      "New screened porch construction",
      "Existing porch conversions",
      "Screen and enclosure systems",
      "Doors, trim, and finish coordination",
    ],
  },
  {
    title: "Deck Stairs and Railings",
    href: null,
    description:
      "Safe, practical stairs, landings, and railing systems for new or existing outdoor spaces.",
    details: [
      "Wood stair construction",
      "Aluminum railing installation",
      "Wood railing installation",
      "Landing and access improvements",
    ],
  },
  {
    title: "Pergolas and Patio Improvements",
    href: null,
    description:
      "Outdoor structures and improvements that help define and enhance patios, grilling areas, and gathering spaces.",
    details: [
      "Pergola construction",
      "Patio enclosures",
      "Grilling-area improvements",
      "Outdoor-living upgrades",
    ],
  },
];

const additionalServices = [
  {
    title: "Residential Renovations",
    description:
      "Interior and exterior renovation projects coordinated around the homeowner’s goals, schedule, and existing conditions.",
  },
  {
    title: "Kitchen and Bathroom Remodeling",
    description:
      "Managed remodeling projects involving demolition, finishes, cabinetry, plumbing, electrical work, and subcontractor coordination.",
  },
  {
    title: "Roofing and Siding",
    description:
      "Roof replacement, siding replacement, exterior repairs, trim work, and related weatherproofing improvements.",
  },
  {
    title: "General Contracting",
    description:
      "Planning, estimating, scheduling, purchasing, subcontractor coordination, inspections, and project oversight.",
  },
  {
    title: "Residential Construction",
    description:
      "New residential construction and larger property-improvement projects managed from planning through completion.",
  },
  {
    title: "Project Management",
    description:
      "Clear scopes, schedules, communication, material coordination, progress tracking, and quality-control oversight.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Initial Conversation",
    description:
      "We discuss the property, project goals, preferred materials, timing, budget expectations, and any known concerns.",
  },
  {
    number: "02",
    title: "Site Review",
    description:
      "We inspect the project area, evaluate access and existing conditions, and identify issues that may affect the scope.",
  },
  {
    number: "03",
    title: "Scope and Proposal",
    description:
      "You receive a proposal explaining the planned work, major materials, allowances, exclusions, and payment schedule.",
  },
  {
    number: "04",
    title: "Scheduling and Construction",
    description:
      "We coordinate materials, subcontractors, inspections, communication, and the sequence of work.",
  },
  {
    number: "05",
    title: "Completion",
    description:
      "We review the completed work, address remaining items, and close out the project.",
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navigation />

      <main>
        <section className="bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
            <div className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime-400">
                Our Services
              </p>

              <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Outdoor living and residential construction managed
                from start to finish.
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
                McKenzie Construction & Management provides custom
                decks, covered outdoor spaces, screened porches,
                renovations, exterior improvements, and general
                contracting throughout Knoxville and East Tennessee.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-lg bg-lime-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
                >
                  Request a Consultation
                </Link>

                <TrackedPhoneLink
                  location="services_hero"
                  className="inline-flex items-center justify-center rounded-lg border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Call or Text 865-433-3325
                </TrackedPhoneLink>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
              Decks and Outdoor Living
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Our primary construction services
            </h2>

            <p className="mt-5 text-base leading-8 text-slate-700">
              These are the services at the center of our current
              marketing and project portfolio.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {primaryServices.map((service) => (
              <article
                key={service.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
              >
                <h3 className="text-xl font-bold text-slate-950">
                  {service.title}
                </h3>

                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {service.description}
                </p>

                <ul className="mt-5 space-y-2">
                  {service.details.map((detail) => (
                    <li
                      key={detail}
                      className="flex gap-3 text-sm text-slate-700"
                    >
                      <span className="font-bold text-lime-700">✓</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>

                {service.href ? (
                  <Link
                    href={service.href}
                    className="mt-6 inline-flex text-sm font-bold text-slate-950 underline decoration-lime-500 decoration-2 underline-offset-4"
                  >
                    Learn more →
                  </Link>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-10">
            <Link
              href="/knoxville-deck-builder"
              className="inline-flex items-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Explore Knoxville Deck Services →
            </Link>
          </div>
        </section>

        <section className="bg-slate-100">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                Additional Construction Services
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Broader residential construction capabilities
              </h2>

              <p className="mt-5 text-base leading-8 text-slate-700">
                We also manage larger renovation, exterior, and
                residential projects through qualified subcontractors
                and trade partners.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {additionalServices.map((service) => (
                <article
                  key={service.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-lg font-bold text-slate-950">
                    {service.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {service.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                How We Work
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                One point of coordination for the entire project
              </h2>

              <p className="mt-5 text-base leading-8 text-slate-700">
                McKenzie Construction & Management coordinates the
                scope, materials, trade partners, schedule,
                communication, and completion of the project.
              </p>

              <p className="mt-4 text-base leading-8 text-slate-700">
                Many projects involve specialized subcontractors. Our
                role is to make sure those parts are properly planned,
                sequenced, communicated, and brought together.
              </p>
            </div>

            <div className="space-y-4">
              {processSteps.map((step) => (
                <article
                  key={step.number}
                  className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-[64px_1fr]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-lime-400">
                    {step.number}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-950">
                      {step.title}
                    </h3>

                    <p className="mt-2 text-sm leading-7 text-slate-700">
                      {step.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950">
          <div className="mx-auto max-w-7xl px-6 py-20 text-center sm:px-8 lg:px-10">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-400">
              Start the Conversation
            </p>

            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tell us what you are planning and where the property is
              located.
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300">
              We will review the project, discuss the next steps, and
              determine whether it is a good fit for our schedule and
              capabilities.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-lg bg-lime-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
              >
                Request a Consultation
              </Link>

              <Link
                href="/projects"
                className="inline-flex items-center justify-center rounded-lg border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Projects
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
