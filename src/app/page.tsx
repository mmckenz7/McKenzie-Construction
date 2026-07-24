const brandGreen = "#8CC63F";

const services = [
  {
    title: "Custom Decks",
    description:
      "Purpose-built wood and composite decks designed around your home, property, and the way you want to use the space.",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "Covered Outdoor Living",
    description:
      "Comfortable, protected spaces for entertaining, relaxing, and enjoying East Tennessee throughout more of the year.",
    image:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "Screened Porches",
    description:
      "Open-air living without the insects, built to feel like a natural extension of your home.",
    image:
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
  },
];

const projects = [
  {
    title: "Island Ford Outdoor Retreat",
    location: "Rocky Top, Tennessee",
    description:
      "A large entertaining deck and fire-pit setting designed to take advantage of a private wooded property.",
    image:
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=85",
  },
  {
    title: "Covered Backyard Living",
    location: "East Tennessee",
    description:
      "A comfortable outdoor room combining shade, gathering space, and a seamless connection to the home.",
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=85",
  },
  {
    title: "Modern Entertaining Deck",
    location: "Knoxville, Tennessee",
    description:
      "A clean, modern outdoor space built for dinners, football Saturdays, and time with family.",
    image:
      "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1400&q=85",
  },
];

const differences = [
  {
    title: "We Answer the Phone",
    description:
      "You should not have to chase your contractor just to understand what happens next.",
    icon: "01",
  },
  {
    title: "We Communicate",
    description:
      "Clear expectations, honest updates, and straightforward answers throughout your project.",
    icon: "02",
  },
  {
    title: "We Build It Right",
    description:
      "Thoughtful planning and dependable craftsmanship matter long after the final walkthrough.",
    icon: "03",
  },
  {
    title: "We Stand Behind Our Work",
    description:
      "Our relationship does not disappear when construction is complete.",
    icon: "04",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      {/* HEADER */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/85 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center text-sm font-black text-black"
              style={{ backgroundColor: brandGreen }}
            >
              MCM
            </div>

            <div className="leading-none">
              <div className="text-lg font-black tracking-wide">
                McKENZIE
              </div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.24em] text-zinc-300">
                CONSTRUCTION
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-semibold lg:flex">
            <a className="transition hover:text-lime-400" href="#services">
              Services
            </a>
            <a className="transition hover:text-lime-400" href="#projects">
              Projects
            </a>
            <a className="transition hover:text-lime-400" href="#difference">
              Why McKenzie
            </a>
            <a className="transition hover:text-lime-400" href="/about">
              About
            </a>
            <a className="transition hover:text-lime-400" href="/learning-center">
              Learning Center
            </a>
          </nav>

          <a
            href="#start-project"
            className="hidden rounded-sm px-5 py-3 text-sm font-black text-black transition hover:brightness-110 sm:inline-flex"
            style={{ backgroundColor: brandGreen }}
          >
            START YOUR PROJECT
          </a>

          <a
            href="#start-project"
            aria-label="Start your project"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-black text-black sm:hidden"
            style={{ backgroundColor: brandGreen }}
          >
            +
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative flex min-h-[760px] items-end overflow-hidden bg-black pt-20 text-white lg:min-h-screen lg:items-center">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=2200&q=90')",
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />

        <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:pb-0">
          <div className="max-w-3xl">
            <div
              className="mb-7 h-1 w-16"
              style={{ backgroundColor: brandGreen }}
            />

            <p className="mb-5 text-sm font-bold uppercase tracking-[0.25em] text-zinc-300">
              Knoxville &amp; East Tennessee
            </p>

            <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-8xl">
              McKenzie
              <br />
              Construction
            </h1>

            <h2
              className="mt-7 max-w-2xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl"
              style={{ color: brandGreen }}
            >
              Crafted Around the Way You Live.
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-200 sm:text-xl">
              Custom decks, outdoor living spaces, and residential
              construction built with craftsmanship, clear communication, and
              lasting value.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#start-project"
                className="inline-flex min-h-14 items-center justify-center px-7 text-sm font-black text-black transition hover:brightness-110"
                style={{ backgroundColor: brandGreen }}
              >
                START YOUR PROJECT
                <span className="ml-3 text-lg">→</span>
              </a>

              <a
                href="#projects"
                className="inline-flex min-h-14 items-center justify-center border border-white/55 bg-black/20 px-7 text-sm font-black text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-black"
              >
                VIEW PROJECTS
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-zinc-200 px-5 sm:px-8 lg:grid-cols-4 lg:divide-y-0">
          {[
            ["Client First", "Built around your goals"],
            ["Built Right", "Craftsmanship without shortcuts"],
            ["Clear Communication", "Know where your project stands"],
            ["Backed by Experience", "Residential construction expertise"],
          ].map(([title, subtitle]) => (
            <div key={title} className="px-5 py-7 text-center">
              <div
                className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-black"
                style={{ backgroundColor: `${brandGreen}33` }}
              >
                ✓
              </div>
              <h3 className="text-sm font-black uppercase tracking-wide">
                {title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
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
              style={{ color: brandGreen }}
            >
              Built for the way you live outside
            </p>

            <h2 className="mt-5 text-4xl font-black leading-tight tracking-[-0.03em] sm:text-5xl">
              More than a deck.
              <br />
              A better place to live.
            </h2>
          </div>

          <div>
            <p className="text-lg leading-8 text-zinc-300 sm:text-xl">
              Your outdoor space should feel intentional—not like an
              afterthought attached to the back of the house. We design around
              how you entertain, relax, move through the property, and plan to
              use the space for years to come.
            </p>

            <a
              href="#services"
              className="mt-8 inline-flex items-center border-b-2 pb-2 text-sm font-black uppercase tracking-wider"
              style={{ borderColor: brandGreen }}
            >
              Explore our services
              <span className="ml-3">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="scroll-mt-20 bg-zinc-100 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p
                className="text-sm font-black uppercase tracking-[0.25em]"
                style={{ color: brandGreen }}
              >
                What we build
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Outdoor living,
                <br />
                designed as a whole.
              </h2>
            </div>

            <p className="max-w-xl text-base leading-7 text-zinc-600">
              From a focused deck replacement to a complete outdoor
              transformation, every project begins with how you want the space
              to function.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {services.map((service) => (
              <article
                key={service.title}
                className="group overflow-hidden bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className="h-64 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
                  style={{ backgroundImage: `url('${service.image}')` }}
                />

                <div className="p-7">
                  <h3 className="text-2xl font-black">{service.title}</h3>
                  <p className="mt-3 leading-7 text-zinc-600">
                    {service.description}
                  </p>

                  <a
                    href="#start-project"
                    className="mt-6 inline-flex items-center text-sm font-black uppercase tracking-wider"
                  >
                    Start a conversation
                    <span className="ml-3" style={{ color: brandGreen }}>
                      →
                    </span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PROJECTS */}
      <section
        id="projects"
        className="scroll-mt-20 bg-white py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p
                className="text-sm font-black uppercase tracking-[0.25em]"
                style={{ color: brandGreen }}
              >
                Project Explorer
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Featured projects
              </h2>
            </div>

            <a
              href="/projects"
              className="hidden text-sm font-black uppercase tracking-wider sm:inline-flex"
            >
              View all projects
              <span className="ml-3" style={{ color: brandGreen }}>
                →
              </span>
            </a>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.title}
                className="group relative min-h-[470px] overflow-hidden bg-zinc-950 text-white"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url('${project.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-7">
                  <p
                    className="text-xs font-black uppercase tracking-[0.2em]"
                    style={{ color: brandGreen }}
                  >
                    {project.location}
                  </p>

                  <h3 className="mt-3 text-2xl font-black">{project.title}</h3>

                  <p className="mt-3 max-w-md text-sm leading-6 text-zinc-200">
                    {project.description}
                  </p>

                  <a
                    href="/projects"
                    className="mt-5 inline-flex items-center text-sm font-black uppercase tracking-wider"
                  >
                    Explore project
                    <span className="ml-3" style={{ color: brandGreen }}>
                      →
                    </span>
                  </a>
                </div>
              </article>
            ))}
          </div>

          <a
            href="/projects"
            className="mt-8 inline-flex text-sm font-black uppercase tracking-wider sm:hidden"
          >
            View all projects
            <span className="ml-3" style={{ color: brandGreen }}>
              →
            </span>
          </a>
        </div>
      </section>

      {/* MCKENZIE DIFFERENCE */}
      <section
        id="difference"
        className="scroll-mt-20 bg-zinc-950 py-20 text-white sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p
              className="text-sm font-black uppercase tracking-[0.25em]"
              style={{ color: brandGreen }}
            >
              The McKenzie Difference
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
              The things homeowners should be able to expect.
            </h2>

            <p className="mt-5 text-lg leading-8 text-zinc-300">
              Quality construction matters. So does everything that happens
              before, during, and after the build.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {differences.map((item) => (
              <article key={item.title} className="bg-zinc-950 p-7">
                <div
                  className="text-sm font-black"
                  style={{ color: brandGreen }}
                >
                  {item.icon}
                </div>

                <h3 className="mt-8 text-xl font-black">{item.title}</h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* START PROJECT FORM */}
      <section
        id="start-project"
        className="scroll-mt-20 bg-white py-20 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p
              className="text-sm font-black uppercase tracking-[0.25em]"
              style={{ color: brandGreen }}
            >
              Start your project
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
              Tell us what you are thinking.
            </h2>

            <p className="mt-5 text-lg leading-8 text-zinc-600">
              You do not need drawings, exact dimensions, or every decision
              made. Give us the basics and Michael will personally review your
              request.
            </p>

            <div className="mt-9 space-y-4 text-sm font-semibold">
              <a className="block" href="tel:+18652633811">
                Call: 865-263-3811
              </a>
              <a
                className="block"
                href="mailto:mcmllc.tn@gmail.com"
              >
                Email: mcmllc.tn@gmail.com
              </a>
              <p>Serving Knoxville and East Tennessee</p>
            </div>
          </div>

          <form
            className="grid gap-5 bg-zinc-100 p-6 sm:grid-cols-2 sm:p-9"
            action="/contact"
          >
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Name *
              </span>
              <input
                required
                name="name"
                className="min-h-13 w-full border border-zinc-300 bg-white px-4 outline-none transition focus:border-zinc-950"
                placeholder="Your name"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Phone *
              </span>
              <input
                required
                type="tel"
                name="phone"
                className="min-h-13 w-full border border-zinc-300 bg-white px-4 outline-none transition focus:border-zinc-950"
                placeholder="Your phone number"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Email
              </span>
              <input
                type="email"
                name="email"
                className="min-h-13 w-full border border-zinc-300 bg-white px-4 outline-none transition focus:border-zinc-950"
                placeholder="Your email"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Project Type
              </span>
              <select
                name="projectType"
                className="min-h-13 w-full border border-zinc-300 bg-white px-4 outline-none transition focus:border-zinc-950"
                defaultValue=""
              >
                <option value="" disabled>
                  Select one
                </option>
                <option>New Deck</option>
                <option>Deck Replacement</option>
                <option>Covered Outdoor Living</option>
                <option>Screened Porch</option>
                <option>Outdoor Living Project</option>
                <option>Residential Construction</option>
                <option>Not Sure Yet</option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Property Address
              </span>
              <input
                name="address"
                className="min-h-13 w-full border border-zinc-300 bg-white px-4 outline-none transition focus:border-zinc-950"
                placeholder="Project address"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Tell Us About the Project *
              </span>
              <textarea
                required
                name="message"
                rows={5}
                className="w-full border border-zinc-300 bg-white px-4 py-4 outline-none transition focus:border-zinc-950"
                placeholder="What would you like to build or improve?"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-black uppercase tracking-wider">
                Photos
                <span className="ml-2 font-medium normal-case tracking-normal text-zinc-500">
                  Optional
                </span>
              </span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="w-full border border-dashed border-zinc-400 bg-white px-4 py-5 text-sm"
              />
              <span className="mt-2 block text-xs leading-5 text-zinc-500">
                Photos can help us understand the project, but they are not
                required to submit your request.
              </span>
            </label>

            <button
              type="submit"
              className="min-h-14 px-7 text-sm font-black text-black transition hover:brightness-110 sm:col-span-2"
              style={{ backgroundColor: brandGreen }}
            >
              SUBMIT PROJECT REQUEST →
            </button>
          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black py-12 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-10 px-5 sm:px-8 lg:flex-row">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center text-sm font-black text-black"
                style={{ backgroundColor: brandGreen }}
              >
                MCM
              </div>

              <div>
                <div className="font-black tracking-wide">
                  McKENZIE CONSTRUCTION
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  Crafted Around the Way You Live.
                </div>
              </div>
            </div>

            <p className="mt-5 max-w-md text-sm leading-6 text-zinc-400">
              Custom decks, outdoor living spaces, and residential
              construction serving Knoxville and East Tennessee.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 text-sm">
            <div>
              <p className="font-black uppercase tracking-wider">Explore</p>
              <div className="mt-4 space-y-3 text-zinc-400">
                <a className="block hover:text-white" href="#services">
                  Services
                </a>
                <a className="block hover:text-white" href="#projects">
                  Projects
                </a>
                <a className="block hover:text-white" href="/about">
                  About
                </a>
                <a className="block hover:text-white" href="/learning-center">
                  Learning Center
                </a>
              </div>
            </div>

            <div>
              <p className="font-black uppercase tracking-wider">Contact</p>
              <div className="mt-4 space-y-3 text-zinc-400">
                <a className="block hover:text-white" href="tel:+18652633811">
                  865-263-3811
                </a>
                <a
                  className="block hover:text-white"
                  href="mailto:mcmllc.tn@gmail.com"
                >
                  Email Michael
                </a>
                <a className="block hover:text-white" href="#start-project">
                  Start a Project
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 px-5 pt-6 text-xs text-zinc-500 sm:px-8">
          © {new Date().getFullYear()} McKenzie Construction. All rights
          reserved.
        </div>
      </footer>

      {/* MOBILE STICKY CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-2 border-t border-zinc-300 bg-white p-2 shadow-2xl sm:hidden">
        <a
          href="tel:+18652633811"
          className="flex min-h-12 items-center justify-center text-sm font-black"
        >
          CALL NOW
        </a>
        <a
          href="#start-project"
          className="flex min-h-12 items-center justify-center text-sm font-black text-black"
          style={{ backgroundColor: brandGreen }}
        >
          START PROJECT
        </a>
      </div>
    </main>
  );
}