import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

const siteUrl = "https://www.mckenzie-builds.com";
const googleAnalyticsId = "G-Q0TTHS0QCH";

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "McKenzie Construction",
  url: siteUrl,
  telephone: "+1-865-263-3811",
  email: "info@mckenzie-builds.com",
  description:
    "McKenzie Construction provides custom decks, covered outdoor living spaces, screened porches, renovations, and residential construction in Knoxville and East Tennessee.",
  areaServed: [
    {
      "@type": "City",
      name: "Knoxville",
    },
    {
      "@type": "AdministrativeArea",
      name: "East Tennessee",
    },
  ],
  serviceType: [
    "Custom deck construction",
    "Composite deck construction",
    "Covered outdoor living spaces",
    "Screened porches",
    "Residential renovations",
    "Residential construction",
  ],
  sameAs: [],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default:
      "McKenzie Construction | Deck Builder & Residential Contractor in Knoxville",
    template: "%s | McKenzie Construction",
  },

  description:
    "McKenzie Construction builds custom decks, covered outdoor living spaces, screened porches, renovations, and residential projects throughout Knoxville and East Tennessee.",

  keywords: [
    "deck builder Knoxville TN",
    "custom decks Knoxville",
    "composite decking Knoxville",
    "covered outdoor living Knoxville",
    "screened porches Knoxville",
    "residential contractor Knoxville TN",
    "home renovation Knoxville",
    "outdoor living East Tennessee",
    "McKenzie Construction",
  ],

  applicationName: "McKenzie Construction",

  icons: {
    apple: [{
      url: "/branding/mckenzie-apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    }],
  },

  authors: [
    {
      name: "McKenzie Construction",
      url: siteUrl,
    },
  ],

  creator: "McKenzie Construction",
  publisher: "McKenzie Construction",

  alternates: {
    canonical: "/",
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "McKenzie Construction",
    title:
      "McKenzie Construction | Deck Builder & Residential Contractor in Knoxville",
    description:
      "Custom decks, covered outdoor living spaces, screened porches, renovations, and residential construction serving Knoxville and East Tennessee.",
    images: [
      {
        url: "/hero/uncovered-deck-hero.jpg",
        width: 1536,
        height: 1024,
        alt: "Uncovered residential deck by McKenzie Construction",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title:
      "McKenzie Construction | Deck Builder & Residential Contractor in Knoxville",
    description:
      "Custom decks, outdoor living spaces, renovations, and residential construction serving Knoxville and East Tennessee.",
    images: ["/hero/uncovered-deck-hero.jpg"],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  category: "construction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessSchema),
          }}
        />

        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];

            function gtag() {
              dataLayer.push(arguments);
            }

            gtag('js', new Date());
            gtag('config', '${googleAnalyticsId}');
          `}
        </Script>
      </body>
    </html>
  );
}
