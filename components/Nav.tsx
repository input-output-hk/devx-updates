"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The map lives under /map/* (served at /devx-updates/map/*; Next prepends
// basePath automatically, so links stay basePath-relative here). The content
// "Review" editor is a local-only tool that isn't part of the deployed static
// site, so it isn't linked here. The dependency-coverage index (/map/readiness)
// is a maintenance view and isn't linked either; its per-tool pages carry each
// tool's Dijkstra detail, so they count as part of the Dijkstra view.
const LINKS: { href: string; label: string }[] = [
  { href: "/map/graph", label: "Graph" },
  { href: "/map/table", label: "Table" },
  { href: "/map/analysis", label: "Analysis" },
  { href: "/map/dijkstra", label: "Dijkstra" },
];

// Normalize the trailing slash that `trailingSlash: true` (static export) adds,
// so the active state matches whether or not the slash is present.
function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === href || (href === "/map/dijkstra" && path.startsWith("/map/readiness/"));
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Views">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="nav-link"
          aria-current={isActive(pathname, l.href) ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
