import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION = "SnapSake is a private photo library. Upload your photos, share each one with exactly the friends you choose, and create albums with a private link. No group chats, no ads.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} – ${SITE.tagline}`, template: `%s` },
  description: DESCRIPTION,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: `${SITE.name} – ${SITE.tagline}`,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} – ${SITE.tagline}`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

// Structured data: tells search engines what the site is. Only states facts that are on the page.
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE.url}/#website`, url: SITE.url, name: SITE.name, description: DESCRIPTION, inLanguage: "en" },
    { "@type": "WebApplication", "@id": `${SITE.url}/#app`, name: SITE.name, url: SITE.url, description: DESCRIPTION, applicationCategory: "PhotographyApplication", operatingSystem: "Any (web browser)", browserRequirements: "Requires JavaScript" },
  ],
}).replace(/</g, "\\u003c");

// Runs during HTML parsing, before first paint, so the saved theme never flashes. Keep in sync with lib/prefs.tsx.
const themeScript = `(function(){try{var p=JSON.parse(localStorage.getItem("snapsake-prefs")||"{}");var t=p.theme||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
