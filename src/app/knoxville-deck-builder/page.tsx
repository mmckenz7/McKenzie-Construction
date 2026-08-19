import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { TrackedPhoneLink } from "@/components/tracked-phone-link";

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
        url: "/projects/island-ford/B251B85F-BD26-4C55-B8C2-BBA4BB82973B_1_105_c.jpeg",
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

const frequentlyAskedQuestions = [
  {
    question: "Do you build both wood and composite decks?",
    answer:
      "Yes. McKenzie Construction builds pressure-treated wood and composite decks. Material recommendations depend on the project goals, maintenance preferences, and budget.",
  },
  {
    question: "Can you replace an existing deck?",
    answer:
      "Yes. Deck-replacement projects can include demolition, framing replacement or repair, new decking, stairs, and railings. The existing conditions are reviewed at the property before the final scope is prepared.",
  },
  {
    question: "Do you build deck stairs and railings?",
    answer:
      "Yes. New-deck and replacement projects can include stairs, landings, wood railings, and aluminum railing options based on the approved project scope.",
  },
  {
    question: "Where do you build decks?",
    answer:
      "McKenzie Construction serves Knoxville and nearby East Tennessee communities. Availability depends on the project location, scope, and schedule.",
  },
  {
    question: "How do I start a deck project?",
    answer:
      "Submit a project request or call McKenzie Construction. We review the project goals and property information, then confirm the appropriate next step and consultation timing.",
  },
];

const deckServiceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Custom deck construction in Knoxville, Tennessee",
  serviceType: "Custom deck construction and deck replacement",
  provider: {
    "@type": "HomeAndConstructionBusiness",
    name: "McKenzie Construction",
    url: "https://www.mckenzie-builds.com",
    telephone: "+1-865-433-3325",
  },
  areaServed: serviceAreas.map((name) => ({
    "@type": "Place",
    name,
  })),
  url: "https://www.mckenzie-builds.com/knoxville-deck-builder",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: frequentlyAskedQuestions.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function KnoxvilleDeckBuilderPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(deckServiceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Navigation />

      <main>
        <section className="relative isolate overflow-hidden bg-slate-950">
          <div className="absolute inset-0">
            <img
              src="/projects/island-ford/B251B85F-BD26-4C55-B8C2-BBA4BB82973B_1_105_c.jpeg"
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

                <TrackedPhoneLink
                  location="knoxville_deck_builder_hero"
                  className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/20"
                >
                  Call or Text (865) 433-3325
                </TrackedPhoneLink>
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
                src="/projects/island-ford/B251B85F-BD26-4C55-B8C2-BBA4BB82973B_1_105_c.jpeg"
                alt="Large pressure-treated wood deck near Knoxville"
                className="aspect-[4/3] h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-6 py-14 sm:px-8 lg:px-10">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Explore the right deck project for your home
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  href: "/deck-replacement-knoxville",
                  title: "Deck Replacement",
                  description: "Replace an aging deck or revise the existing layout.",
                },
                {
                  href: "/composite-decks-knoxville",
                  title: "Composite Decks",
                  description: "Compare lower-maintenance finishes and coordinated details.",
                },
                {
                  href: "/covered-decks-knoxville",
                  title: "Covered Decks",
                  description: "Plan shade and weather protection as part of the complete space.",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-lime-600"
                >
                  <span className="font-bold text-slate-950">{item.title}</span>
                  <span className="mt-2 block text-sm leading-6 text-slate-600">
                    {item.description}
                  </span>
                </Link>
              ))}
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

        <section className="mx-auto max-w-5xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
              Deck Project Questions
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Common questions from Knoxville homeowners
            </h2>
          </div>

          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {frequentlyAskedQuestions.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-lg font-bold text-slate-950">
                  {item.question}
                  <span aria-hidden="true" className="text-lime-700">
                    +
                  </span>
                </summary>
                <p className="max-w-3xl pb-2 pr-10 text-base leading-8 text-slate-700">
                  {item.answer}
                </p>
              </details>
            ))}
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
