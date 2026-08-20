import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import {
  ProjectCard,
  SectionTitle,
} from "@/components/ui";

const projects = [
  {
    title: "Knoxville Trex Deck Replacement",
    location: "Knoxville, Tennessee",
    blurb:
      "A two-level deck transformed into one connected Trex deck with aluminum railing and new stairs.",
    imageSrc:
      "/projects/knoxville-trex-deck/finished-deck-wide.jpg",
    imageAlt:
      "Completed Knoxville Trex deck with black aluminum railing",
    href: "/projects/knoxville-trex-deck-replacement",
  },
  {
    title: "Tellico Village Screened Porch & Deck",
    location: "Tellico Village, Tennessee",
    blurb:
      "An elevated screened outdoor room with an adjoining open deck and grill area.",
    imageSrc:
      "/projects/tellico-village-screened-porch/full-rear-elevation.jpg",
    imageAlt:
      "Completed elevated screened porch and deck in Tellico Village",
    href: "/projects/tellico-village-screened-porch",
  },
  {
    title:
      "Island Ford Modular Home & Outdoor Living",
    location: "Lake City, Tennessee",
    blurb:
      "Complete modular-home installation with exterior finish work, custom entry decks, a large rear wood deck, stairs, landscaping, gravel access, and site improvements.",
    imageSrc:
      "/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg",
    imageAlt:
      "Rear wood deck and stairs at the Island Ford modular home project",
    href: "/projects/island-ford",
  },
  {
    title: "East Tennessee Ranch Home Renovation",
    location: "East Tennessee",
    blurb:
      "A photo-backed look at a refreshed exterior, updated kitchen, and bright finished sunroom.",
    imageSrc:
      "/projects/completed-renovations/renovation-one-exterior.jpg",
    imageAlt:
      "Completed single-story East Tennessee home exterior",
    href: "/projects/east-tennessee-ranch-renovation",
  },
  {
    title: "East Tennessee Cottage Renovation",
    location: "East Tennessee",
    blurb:
      "Completed cottage exterior, living-room, hardwood-floor, fireplace, and kitchen finishes.",
    imageSrc:
      "/projects/completed-renovations/renovation-two-exterior.jpg",
    imageAlt:
      "Completed East Tennessee cottage exterior and entry",
    href: "/projects/east-tennessee-cottage-renovation",
  },
];

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <Navigation />

      <main className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
        <SectionTitle
          eyebrow="Featured Projects"
          title="Real work completed across East Tennessee."
          description="Explore selected construction, deck, outdoor-living, and residential projects with complete project details and photo galleries."
        />

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.title}
              title={project.title}
              blurb={project.blurb}
              imageSrc={project.imageSrc}
              imageAlt={project.imageAlt}
              location={project.location}
              href={project.href}
            />
          ))}
        </div>

        <section className="mt-12 rounded-[2rem] border border-brand-charcoal/10 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
            More Completed Work
          </p>

          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-brand-charcoal">
                Browse the project gallery.
              </h2>

              <p className="mt-4 text-lg leading-8 text-brand-charcoal/70">
                View additional decks, exterior work, renovations, construction
                details, and smaller projects that do not require a full case
                study.
              </p>
            </div>

            <Link
              href="/projects/gallery"
              className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-brand-green px-7 py-3 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
            >
              View Project Gallery
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
