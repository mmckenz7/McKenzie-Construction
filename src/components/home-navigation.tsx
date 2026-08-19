"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const brandGreen = "#8CC63F";

const navigationLinks = [
  {
    href: "/#services",
    label: "Services",
  },
  {
    href: "/#projects",
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

export function HomeNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/90 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          aria-label="McKenzie Construction home"
          className="block shrink-0"
          onClick={closeMenu}
        >
          <Image
            src="/branding/MCM_rev_black_horiz.jpg"
            alt="McKenzie Construction and Management"
            width={500}
            height={188}
            priority
            className="h-auto w-[190px] sm:w-[230px]"
          />
        </Link>

        <nav
          aria-label="Desktop navigation"
          className="hidden items-center gap-7 text-sm font-semibold lg:flex"
        >
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-lime-400"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/contact"
            className="hidden rounded-sm px-5 py-3 text-sm font-black text-black transition hover:brightness-110 sm:inline-flex"
            style={{
              backgroundColor: brandGreen,
            }}
          >
            START YOUR PROJECT
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-11 w-11 items-center justify-center border border-white/25 bg-white/5 transition hover:border-white/50 hover:bg-white/10 lg:hidden"
          >
            <span className="sr-only">
              {menuOpen ? "Close menu" : "Open menu"}
            </span>

            <span className="relative block h-5 w-6">
              <span
                className={`absolute left-0 top-0 block h-0.5 w-6 bg-white transition duration-200 ${
                  menuOpen ? "translate-y-[9px] rotate-45" : ""
                }`}
              />

              <span
                className={`absolute left-0 top-[9px] block h-0.5 w-6 bg-white transition duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              />

              <span
                className={`absolute left-0 top-[18px] block h-0.5 w-6 bg-white transition duration-200 ${
                  menuOpen ? "-translate-y-[9px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`border-t border-white/10 bg-black transition-all duration-300 lg:hidden ${
          menuOpen
            ? "max-h-[520px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <nav
          aria-label="Mobile navigation"
          className="mx-auto flex max-w-7xl flex-col px-5 py-5 sm:px-8"
        >
          {navigationLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className="border-b border-white/10 py-4 text-base font-semibold text-white transition hover:text-lime-400"
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/contact"
            onClick={closeMenu}
            className="mt-5 inline-flex min-h-12 items-center justify-center px-5 text-sm font-black text-black transition hover:brightness-110 sm:hidden"
            style={{
              backgroundColor: brandGreen,
            }}
          >
            START YOUR PROJECT
          </Link>

          <a
            href="tel:+18654333325"
            onClick={closeMenu}
            className="mt-4 inline-flex min-h-12 items-center justify-center border border-white/30 px-5 text-sm font-black text-white transition hover:border-white hover:bg-white hover:text-black"
          >
            CALL 865-433-3325
          </a>
        </nav>
      </div>
    </header>
  );
}
