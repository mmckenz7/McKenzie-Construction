import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import type { ProjectRequestType } from "@/components/project-request-form";
import { TrackedPhoneLink } from "@/components/tracked-phone-link";

type ServiceDetail = {
  description: string;
  title: string;
};

type ServiceFaq = {
  answer: string;
  question: string;
};

type ServiceLandingPageProps = {
  eyebrow: string;
  faqs: ServiceFaq[];
  headline: string;
  introduction: string;
  path: string;
  projectType: ProjectRequestType;
  planningDetails: ServiceDetail[];
  processDetails: ServiceDetail[];
  serviceName: string;
  summary: string;
  featuredProject?: {
    description: string;
    href: string;
    imageAlt: string;
    imageSrc: string;
    location: string;
    title: string;
  };
};

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
];

export function ServiceLandingPage({
  eyebrow,
  faqs,
  headline,
  introduction,
  path,
  projectType,
  planningDetails,
  processDetails,
  serviceName,
  summary,
  featuredProject,
}: ServiceLandingPageProps) {
  const consultationHref = `/contact?projectType=${encodeURIComponent(projectType)}`;
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: serviceName,
    serviceType: serviceName,
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
    url: `https://www.mckenzie-builds.com${path}`,
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.mckenzie-builds.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Services",
        item: "https://www.mckenzie-builds.com/services",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: serviceName,
        item: `https://www.mckenzie-builds.com${path}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <Navigation />

      <main>
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 sm:py-28 lg:px-10">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-300">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/" className="transition hover:text-lime-300">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href="/services"
                    className="transition hover:text-lime-300"
                  >
                    Services
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-white">
                  {serviceName}
                </li>
              </ol>
            </nav>

            <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime-400">
              {eyebrow}
            </p>

            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              {headline}
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200">
              {summary}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={consultationHref}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-lime-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
              >
                Request a Consultation
              </Link>

              <TrackedPhoneLink
                location={`${path.slice(1)}_hero`}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Call or Text (865) 433-3325
              </TrackedPhoneLink>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                Plan the Right Scope
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Start with the property and the way you want to use the space
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-700">
                {introduction}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {planningDetails.map((detail) => (
                <article
                  key={detail.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <h3 className="text-lg font-bold">{detail.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {detail.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {featuredProject ? (
          <section className="bg-slate-950 text-white">
            <div className="mx-auto grid max-w-7xl gap-0 px-6 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
              <div className="relative min-h-[360px] overflow-hidden rounded-t-3xl bg-slate-800 lg:rounded-l-3xl lg:rounded-tr-none">
                <Image
                  src={featuredProject.imageSrc}
                  alt={featuredProject.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col justify-center rounded-b-3xl bg-white p-7 text-slate-950 sm:p-10 lg:rounded-r-3xl lg:rounded-bl-none">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-700">
                  Completed Project · {featuredProject.location}
                </p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  {featuredProject.title}
                </h2>
                <p className="mt-5 leading-8 text-slate-700">
                  {featuredProject.description}
                </p>
                <Link
                  href={featuredProject.href}
                  className="mt-7 inline-flex min-h-12 w-fit items-center justify-center rounded-lg bg-lime-400 px-6 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
                >
                  See the Completed Project
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-slate-100">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 sm:py-20 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
                What to Expect
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                A clear path from the first conversation to a project scope
              </h2>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {processDetails.map((detail, index) => (
                <article
                  key={detail.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <p className="text-sm font-bold text-lime-700">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 text-xl font-bold">{detail.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {detail.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 sm:px-8 sm:py-20 lg:px-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime-700">
            Frequently Asked Questions
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Helpful answers before you request a consultation
          </h2>

          <div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq) => (
              <details key={faq.question} className="py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-lg font-bold">
                  {faq.question}
                  <span aria-hidden="true" className="text-lime-700">
                    +
                  </span>
                </summary>
                <p className="max-w-3xl pb-2 pr-10 leading-8 text-slate-700">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-5xl px-6 py-16 text-center sm:px-8 sm:py-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Tell us about your property and project goals.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl leading-8 text-slate-300">
              McKenzie Construction will review the details and confirm the
              appropriate next step for the project.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={consultationHref}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-lime-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
              >
                Request a Consultation
              </Link>
              <Link
                href="/projects/gallery"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Completed Work
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
