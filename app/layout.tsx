import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getConfig } from "@/lib/content";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const config = getConfig();

export const metadata: Metadata = {
  // Canonical public URL (incl. the Pages subpath) — the base against which the
  // generated og:image / twitter:image URLs are resolved to absolute so social
  // crawlers can fetch them. Sourced from config so it moves with a domain change.
  metadataBase: new URL(config.site.url),
  title: {
    default: config.site.title,
    template: `%s · ${config.site.title}`,
  },
  description: config.site.description,
  // og:image / twitter:image are supplied by app/opengraph-image.tsx and
  // app/twitter-image.tsx (the file conventions), so they're omitted here.
  openGraph: {
    type: "website",
    siteName: config.site.title,
    title: config.site.title,
    description: config.site.description,
    url: config.site.url,
  },
  twitter: {
    card: "summary_large_image",
    title: config.site.title,
    description: config.site.description,
  },
};

// Applies the saved (or OS) theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      // The pre-paint theme script sets data-theme before hydration, on purpose.
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SiteHeader />
        {/* Flex column so a page can fill the space between header and footer
            (the map does this via `.map-view { flex: 1 }`); ordinary pages just
            flow their content and leave the footer at the bottom. */}
        <main className="flex flex-1 flex-col min-h-0">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
