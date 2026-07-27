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
    <header className="border-b border-brand-charcoal/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8 lg:px-10">
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

        <Link
          href="/contact"
          className="rounded-full bg-brand-green px-4 py-2 text-sm font-semibold text-brand-charcoal transition hover:opacity-90"
        >
          Start Your Project
        </Link>
      </div>
    </header>
  );
}