import Image from "next/image";
import Link from "next/link";

import { HomeNavigation } from "@/components/home-navigation";
import { TrackedPhoneLink } from "@/components/tracked-phone-link";

const brandGreen = "#8CC63F";

const services = [
  {
    title: "Custom Decks",
    description:
      "Purpose-built wood and composite decks designed around your home, property, and the way you want to use the space.",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85",
    href: "/knoxville-deck-builder",
    linkLabel: "Explore deck services",
  },
  {
    title: "Covered Outdoor Living",
    description:
      "Comfortable, protected spaces for entertaining, relaxing, and enjoying East Tennessee throughout more of the year.",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85",
    href: "/covered-decks-knoxville",
    linkLabel: "Explore covered decks",
  },
  {
    title: "Screened Porches",
    description:
      "Open-air living without the insects, built to feel like a natural extension of your home.",
    image:
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
    href: "/services",
    linkLabel: "Explore our services",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Tell Us About the Project",
    description:
      "Submit your project details, property information, goals, and preferred consultation times.",
  },
  {
    number: "02",
    title: "Site Visit and Planning",
    description:
      "We meet at the property, evaluate the existing conditions, discuss options, and confirm the intended scope.",
  },
  {
    number: "03",
    title: "Detailed Proposal",
    description:
      "You receive a clear proposal outlining the work, pricing, selections, and expected next steps.",
  },
  {
    number: "04",
    title: "Construction and Closeout",
    description:
      "We coordinate the work, communicate throughout construction, and complete a final walkthrough before closeout.",
  },
];

const trustItems = [
  {
    title: "Client First",
    subtitle: "Built around your goals",
  },
  {
    title: "Built Right",
    subtitle: "Craftsmanship without shortcuts",
  },
  {
    title: "Clear Communication",
    subtitle: "Know where your project stands",
  },
  {
    title: "Local Experience",
    subtitle: "Serving Knoxville and East Tennessee",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <HomeNavigation />

      {/* HERO */}
      <section className="relative flex min-h-[760px] items-end overflow-hidden bg-black pt-20 text-white lg:min-h-screen lg:items-center">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/hero/uncovered-deck-hero.jpg')",
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:pb-0">
          <div className="max-w-3xl">
            <div
              className="mb-7 h-1 w-16"
              style={{
                backgroundColor: brandGreen,
              }}
            />

            <p className="mb-5 text-sm font-bold uppercase tracking-[0.25em] text-zinc-300">
              McKenzie Construction · Knoxville, Tennessee
            </p>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Knoxville Deck Builder &amp; Outdoor Living Contractor
            </h1>

            <h2
              className="mt-7 max-w-2xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl"
              style={{
                color: brandGreen,
              }}
            >
              Crafted around the way you live.
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-200 sm:text-xl">
              Custom decks, covered outdoor living spaces,
              renovations, and residential construction built with
              craftsmanship, clear communication, and lasting value.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex min-h-14 items-center justify-center px-7 text-sm font-black text-black transition hover:brightness-110"
                style={{
                  backgroundColor: brandGreen,
                }}
              >
                REQUEST A CONSULTATION
                <span className="ml-3 text-lg">→</span>
              </Link>

              <a
                href="#projects"
                className="inline-flex min-h-14 items-center justify-center border border-white/55 bg-black/20 px-7 text-sm font-black text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-black"
              >
                VIEW PROJECTS
              </a>
            </div>

            <div className="mt-6">
              <TrackedPhoneLink
                location="homepage_hero"
                className="text-sm font-bold text-zinc-200 transition hover:text-white"
              >
                Call or text 865-433-3325
              </TrackedPhoneLink>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-zinc-200 px-5 sm:px-8 lg:grid-cols-4 lg:divide-y-0">
          {trustItems.map((item) => (
            <div
              key={item.title}
              className="px-5 py-7 text-center"
            >
              <div
                className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-black"
                style={{
                  backgroundColor: `${brandGreen}33`,
                }}
              >
                ✓
              </div>

              <h3 className="text-sm font-black uppercase tracking-wide">
                {item.title}
              </h3>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {item.subtitle}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* INTRO */}
      <section className="bg-zinc-950 py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.25em]"
              style={{
                color: brandGreen,
              }}
            >
              Built for the way you live
            </p>

            <h2 className="mt-5 text-4xl font-black leading-tight tracking-[-0.03em] sm:text-5xl">
              Thoughtful construction.
              <br />
              Practical results.
            </h2>
          </div>

          <div>
            <p className="text-lg leading-8 text-zinc-300 sm:text-xl">
              Your home and outdoor spaces should feel
              intentional—not like a collection of disconnected
              improvements. We plan around how you entertain, relax,
              move through the property, and expect to use the space
              for years to come.
            </p>

            <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
              <a
                href="#services"
                className="inline-flex items-center border-b-2 pb-2 text-sm font-black uppercase tracking-wider"
                style={{
                  borderColor: brandGreen,
                }}
              >
                Explore our services
                <span className="ml-3">→</span>
              </a>

              <Link
                href="/knoxville-deck-builder"
                className="inline-flex items-center text-sm font-black uppercase tracking-wider text-zinc-200 transition hover:text-white"
              >
                Knoxville deck builder
                <span
                  className="ml-3"
                  style={{
                    color: brandGreen,
                  }}
                >
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section
        id="services"
        className="scroll-mt-20 bg-zinc-100 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p
                className="text-sm font-black uppercase tracking-[0.25em]"
                style={{
                  color: brandGreen,
                }}
              >
                What we build
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Spaces designed
                <br />
                as a complete whole.
              </h2>
            </div>

            <p className="max-w-xl text-base leading-7 text-zinc-600">
              From a focused deck replacement to a complete
              residential or outdoor transformation, every project
              begins with how you want the finished space to function.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {services.map((service) => (
              <article
                key={service.title}
                className="group overflow-hidden bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="overflow-hidden">
                  <div
                    className="h-64 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
                    style={{
                      backgroundImage: `url('${service.image}')`,
                    }}
                  />
                </div>

                <div className="p-7">
                  <h3 className="text-2xl font-black">
                    {service.title}
                  </h3>

                  <p className="mt-3 leading-7 text-zinc-600">
                    {service.description}
                  </p>

                  <Link
                    href={service.href}
                    className="mt-6 inline-flex items-center text-sm font-black uppercase tracking-wider"
                  >
                    {service.linkLabel}

                    <span
                      className="ml-3"
                      style={{
                        color: brandGreen,
                      }}
                    >
                      →
                    </span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PROJECT */}
      <section
        id="projects"
        className="scroll-mt-20 bg-white py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p
                className="text-sm font-black uppercase tracking-[0.25em]"
                style={{
                  color: brandGreen,
                }}
              >
                Featured Project
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Real work in East Tennessee.
              </h2>
            </div>

            <Link
              href="/projects"
              className="text-sm font-black uppercase tracking-wider"
            >
              View all projects
              <span
                className="ml-3"
                style={{
                  color: brandGreen,
                }}
              >
                →
              </span>
            </Link>
          </div>

          <Link
            href="/projects/island-ford"
            className="group relative mt-12 block min-h-[520px] overflow-hidden bg-zinc-950 text-white"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
              style={{
                backgroundImage:
                  "url('/projects/island-ford/08F626F4-F8F9-4B55-B3E5-723253E28102_1_105_c.jpeg')",
              }}
            />

            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

            <div className="relative flex min-h-[520px] items-end p-7 sm:p-10">
              <div className="max-w-2xl">
                <p
                  className="text-xs font-black uppercase tracking-[0.2em]"
                  style={{
                    color: brandGreen,
                  }}
                >
                  Lake City, Tennessee
                </p>

                <h3 className="mt-3 text-3xl font-black sm:text-4xl">
                  Island Ford Modular Home &amp; Outdoor Living
                </h3>

                <p className="mt-4 max-w-xl text-base leading-7 text-zinc-200">
                  Complete modular-home installation with exterior
                  finish work, custom entry decks, a large rear wood
                  deck, stairs, landscaping, gravel access, and site
                  improvements.
                </p>

                <p className="mt-6 inline-flex items-center text-sm font-black uppercase tracking-wider">
                  Explore project
                  <span
                    className="ml-3"
                    style={{
                      color: brandGreen,
                    }}
                  >
                    →
                  </span>
                </p>
              </div>
            </div>
          </Link>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black">
                More completed work
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Browse individual photos from decks, exterior
                improvements, residential construction, and smaller
                projects.
              </p>
            </div>

            <Link
              href="/projects/gallery"
              className="inline-flex w-fit items-center text-sm font-black uppercase tracking-wider"
            >
              Project gallery
              <span
                className="ml-3"
                style={{
                  color: brandGreen,
                }}
              >
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* OUR PROCESS */}
      <section
        id="our-process"
        className="scroll-mt-20 bg-zinc-950 py-20 text-white sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p
              className="text-sm font-black uppercase tracking-[0.25em]"
              style={{
                color: brandGreen,
              }}
            >
              Our Process
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
              A clear path from the first conversation to the final
              walkthrough.
            </h2>

            <p className="mt-5 text-lg leading-8 text-zinc-300">
              You should understand what happens next, who is
              responsible, and where your project stands throughout
              the process.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {processSteps.map((step) => (
              <article
                key={step.number}
                className="bg-zinc-950 p-7"
              >
                <div
                  className="text-sm font-black"
                  style={{
                    color: brandGreen,
                  }}
                >
                  {step.number}
                </div>

                <h3 className="mt-8 text-xl font-black">
                  {step.title}
                </h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {step.description}
                </p>
              </article>
            ))}
          </div>

          <Link
            href="/contact"
            className="mt-10 inline-flex min-h-14 items-center justify-center px-7 text-sm font-black text-black transition hover:brightness-110"
            style={{
              backgroundColor: brandGreen,
            }}
          >
            START THE PROCESS
            <span className="ml-3 text-lg">→</span>
          </Link>
        </div>
      </section>

      {/* PROJECT CTA */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.25em]"
              style={{
                color: brandGreen,
              }}
            >
              Start your project
            </p>

            <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.03em] sm:text-5xl">
              Tell us what you would like to build.
            </h2>

            <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">
              Complete one project request with your contact
              information, project details, and preferred consultation
              time. Michael will personally review your request before
              any appointment is confirmed.
            </p>

            <div className="mt-7 flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:gap-8">
              <TrackedPhoneLink location="homepage_project_cta">
                Call or text: 865-433-3325
              </TrackedPhoneLink>

              <a href="mailto:info@mckenzie-builds.com">
                Email: info@mckenzie-builds.com
              </a>
            </div>
          </div>

          <Link
            href="/contact"
            className="inline-flex min-h-14 items-center justify-center px-8 text-sm font-black text-black transition hover:brightness-110"
            style={{
              backgroundColor: brandGreen,
            }}
          >
            REQUEST A CONSULTATION
            <span className="ml-3 text-lg">→</span>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black py-12 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-10 px-5 sm:px-8 lg:flex-row">
          <div>
            <Image
              src="/branding/MCM_rev_black_horiz.jpg"
              alt="McKenzie Construction and Management"
              width={500}
              height={188}
              className="h-auto w-[250px]"
            />

            <p className="mt-3 text-xs text-zinc-400">
              Crafted Around the Way You Live.
            </p>

            <p className="mt-5 max-w-md text-sm leading-6 text-zinc-400">
              Custom decks, outdoor living spaces, renovations, and
              residential construction serving Knoxville and East
              Tennessee.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <p className="font-black uppercase tracking-wider">
                Explore
              </p>

              <div className="mt-4 space-y-3 text-zinc-400">
                <Link
                  className="block hover:text-white"
                  href="/services"
                >
                  Services
                </Link>

                <Link
                  className="block hover:text-white"
                  href="/knoxville-deck-builder"
                >
                  Knoxville Deck Builder
                </Link>

                <Link
                  className="block hover:text-white"
                  href="/projects"
                >
                  Projects
                </Link>

                <a
                  className="block hover:text-white"
                  href="#our-process"
                >
                  Our Process
                </a>

                <Link
                  className="block hover:text-white"
                  href="/about"
                >
                  About
                </Link>

                <Link
                  className="block hover:text-white"
                  href="/learning-center"
                >
                  Learning Center
                </Link>
              </div>
            </div>

            <div>
              <p className="font-black uppercase tracking-wider">
                Contact
              </p>

              <div className="mt-4 space-y-3 text-zinc-400">
                <a
                  className="block hover:text-white"
                  href="tel:+18654333325"
                >
                  865-433-3325
                </a>

                <a
                  className="block hover:text-white"
                  href="mailto:info@mckenzie-builds.com"
                >
                  Email Michael
                </a>

                <Link
                  className="block hover:text-white"
                  href="/contact"
                >
                  Start a Project
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-4 border-t border-white/10 px-5 pt-6 text-xs text-zinc-500 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {new Date().getFullYear()} McKenzie Construction. All
            rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link className="hover:text-white" href="/privacy">Privacy</Link>
            <Link className="hover:text-white" href="/sms-terms">SMS Terms</Link>
            <Link className="hover:text-white" href="/sms-consent">SMS Consent</Link>
          </nav>
        </div>
      </footer>

      {/* MOBILE STICKY CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-2 border-t border-zinc-300 bg-white p-2 shadow-2xl sm:hidden">
        <a
          href="tel:+18654333325"
          className="flex min-h-12 items-center justify-center text-sm font-black"
        >
          CALL NOW
        </a>

        <Link
          href="/contact"
          className="flex min-h-12 items-center justify-center text-sm font-black text-black"
          style={{
            backgroundColor: brandGreen,
          }}
        >
          START PROJECT
        </Link>
      </div>
    </main>
  );
}
