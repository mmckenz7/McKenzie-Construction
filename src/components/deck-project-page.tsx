import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export type DeckProjectImage = {
  src: string;
  alt: string;
  caption: string;
};

type DeckProjectPageProps = {
  title: string;
  location: string;
  summary: string;
  projectType: "New%20Deck" | "Deck%20Replacement" | "Screened%20Porch";
  highlights: string[];
  images: DeckProjectImage[];
  canonicalPath: string;
};

export function DeckProjectPage({
  title,
  location,
  summary,
  projectType,
  highlights,
  images,
  canonicalPath,
}: DeckProjectPageProps) {
  const schema = {
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
      name: location,
    },
  };

  return (
    <div className="min-h-screen bg-brand-gray text-brand-charcoal">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Navigation />

      <main>
        <section className="relative min-h-[600px] overflow-hidden bg-brand-charcoal text-white">
          <Image
            src={images[0].src}
            alt={images[0].alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

          <div className="relative mx-auto flex min-h-[600px] max-w-7xl items-end px-6 py-14 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <nav aria-label="Breadcrumb" className="mb-8 text-sm text-white/75">
                <Link href="/projects" className="font-semibold hover:text-brand-green">
                  Projects
                </Link>
                <span className="mx-2" aria-hidden="true">/</span>
                <span aria-current="page">{title}</span>
              </nav>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Completed Project · {location}
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/85">
                {summary}
              </p>
              <Link
                href={`/contact?projectType=${projectType}`}
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-7 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
              >
                Plan a Similar Project
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-green">
                Project Highlights
              </p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                The finished project, from multiple angles.
              </h2>
              <p className="mt-4 leading-7 text-brand-charcoal/70">
                These are McKenzie Construction project photos. The street
                address and homeowner details remain private.
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
          <div className="grid gap-6 md:grid-cols-2">
            {images.slice(1).map((image, index) => (
              <figure
                key={image.src}
                className={`overflow-hidden rounded-[1.75rem] border border-brand-charcoal/10 bg-white shadow-sm ${
                  index === 0 ? "md:col-span-2" : ""
                }`}
              >
                <div className={`relative bg-brand-charcoal/10 ${index === 0 ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes={index === 0 ? "100vw" : "(min-width: 768px) 50vw, 100vw"}
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
                Build Your Outdoor Space
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold">
                Start with your property, priorities, and the way you want to use it.
              </h2>
            </div>
            <Link
              href={`/contact?projectType=${projectType}`}
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand-green px-7 text-sm font-semibold text-brand-charcoal transition hover:opacity-90 lg:mt-0"
            >
              Request a Consultation
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
