"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/updates", label: "Updates" },
  { href: "/pledge", label: "Pledge" },
  { href: "/proposal", label: "Proposal" },
  { href: "/links", label: "Links" },
  { href: "/map", label: "Map" },
];

function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/"; // normalize trailing slash
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

function navLinkClass(active: boolean): string {
  return `whitespace-nowrap rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    active ? "text-primary" : "text-muted hover:text-foreground"
  }`;
}

export function SiteHeader() {
  const pathname = usePathname();
  // The mobile menu stays open only on the route it was opened on, so tapping a
  // link (a route change) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2">
          <span className="font-display text-lg font-semibold tracking-tight text-foreground group-hover:text-primary">
            DevX Initiative
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-1">
          {/* Desktop: inline links. Hidden on small screens in favor of the menu. */}
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClass(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className="ml-1 shrink-0">
            <ThemeToggle />
          </span>
          {/* Mobile: hamburger toggles the dropdown menu below. */}
          <button
            type="button"
            onClick={() => setOpenOn(menuOpen ? null : pathname)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:hidden"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu. */}
      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-border bg-background sm:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-3 font-mono text-sm uppercase tracking-wider transition-colors ${
                    active ? "text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
