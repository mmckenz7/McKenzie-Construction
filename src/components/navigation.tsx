import Link from "next/link";

const links = [
  {
    href: "/",
    label: "Home",
  },
  {
    href: "/services",
    label: "Services",
  },
  {
    href: "/projects",
    label: "Projects",
  },
  {
    href: "/#our-process",
    label: "Our Process",
  },
  {
    href: "/about",
    label: "About",
  },
  {
    href: "/learning-center",
    label: "Learning Center",
  },
];

export function Navigation() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-charcoal/10 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="text-lg font-semibold tracking-[0.2em] text-brand-charcoal"
        >
          MCKENZIE
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-6 text-sm font-medium text-brand-charcoal/70 md:flex"
        >
          {links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="transition hover:text-brand-green"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-green px-4 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Start Your Project</span>
          </Link>

          <details className="group md:hidden">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-full border border-brand-charcoal/20 bg-white px-4 text-sm font-semibold text-brand-charcoal transition hover:border-brand-green focus:outline-none focus:ring-4 focus:ring-brand-green/30 [&::-webkit-details-marker]:hidden">
              Menu
            </summary>

            <nav
              aria-label="Mobile navigation"
              className="absolute inset-x-4 top-[calc(100%+0.5rem)] rounded-2xl border border-brand-charcoal/10 bg-white p-3 shadow-xl sm:inset-x-8"
            >
              <div className="grid gap-1">
                {links.map((link) => (
                  <Link
                    key={`mobile-${link.href}-${link.label}`}
                    href={link.href}
                    className="flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-brand-charcoal transition hover:bg-brand-gray hover:text-brand-green focus:outline-none focus:ring-4 focus:ring-brand-green/30"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/contact"
                  className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-brand-green px-4 text-sm font-semibold text-brand-charcoal transition hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-brand-green/30"
                >
                  Request a Consultation
                </Link>
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
