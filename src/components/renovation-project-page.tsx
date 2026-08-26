import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export type RenovationProjectImage = {
  src: string;
  alt: string;
  caption: string;
};

type RenovationProjectPageProps = {
  title: string;
  summary: string;
  highlights: string[];
  images: RenovationProjectImage[];
  canonicalPath: string;
};

export function RenovationProjectPage({
  title,
  summary,
  highlights,
  images,
  canonicalPath,
}: RenovationProjectPageProps) {
  const projectSchema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    description: summary,
    url: `https://www.mckenzie-builds.com${canonicalPath}`,
    image: `https://www.mckenzie-builds.com${images[0].src}`,
    creator: {
      "@type": "HomeAndConstructionBusiness",
      name: "McKenzie Construction",
      url: "https://www.mckenzie-builds.com",
      telephone: "+1-865-433-3325",
    },
    contentLocation: {
      "@type": "Place",
      name: "East Tennessee",
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
        <section className="mx-auto max-w-7xl px-6 pb-12 pt-8 sm:px-8 lg:px-10 lg:pb-16">
          <nav aria-label="Breadcrumb" className="text-sm text-brand-charcoal/65">
            <Link href="/projects" className="font-semibold hover:text-brand-green">
              Projects
            </Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <span aria-current="page">{title}</span>
          </nav>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-brand-charcoal/10 shadow-sm">
              <Image
                src={images[0].src}
                alt={images[0].alt}
                fill
                priority
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Completed Work · East Tennessee
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
                {title}
              </h1>
              <p className="mt-6 text-lg leading-8 text-brand-charcoal/75">
                {summary}
              </p>
              <Link
                href="/contact?projectType=Exterior%20Residential%20Project"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-7 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
              >
                Request a Renovation Consultation
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-brand-charcoal/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                What the Photos Show
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                Finished spaces, documented honestly.
              </h2>
              <p className="mt-4 leading-7 text-brand-charcoal/70">
                This story describes only the completed work visible in the
                archived project photos. Exact addresses and homeowner details
                remain private.
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="rounded-2xl border border-brand-charcoal/10 bg-brand-gray p-5 leading-7"
                >
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
              Completed Project Gallery
            </p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              A closer look at the finished work.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {images.map((image) => (
              <figure
                key={image.src}
                className="overflow-hidden rounded-[1.5rem] border border-brand-charcoal/10 bg-white shadow-sm"
              >
                <div className="relative aspect-[4/3] bg-brand-charcoal/10">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="px-5 py-4 text-sm font-semibold leading-6 text-brand-charcoal/70">
                  {image.caption}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-14 rounded-[2rem] bg-brand-charcoal px-7 py-10 text-white sm:px-10 lg:flex lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Planning a Renovation?
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold">
                Show us the property and the changes you have in mind.
              </h2>
            </div>
            <Link
              href="/contact?projectType=Exterior%20Residential%20Project"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-7 text-sm font-semibold text-brand-charcoal transition hover:opacity-90 lg:mt-0"
            >
              Start a Conversation
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
