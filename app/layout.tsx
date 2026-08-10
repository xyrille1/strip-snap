import type { Metadata } from "next";
import { Architects_Daughter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Display / marquee / countdown — the hand-drawn face that carries the
// "Classic Sketch" look (docs/goal-ui.md): headlines, the wordmark, the
// countdown numerals, and the small eyebrow labels above each screen title.
// Ships a single upright 400 weight and NO italic face, so display text must
// never carry an `italic` class — the browser would synthesize a skewed
// oblique, which on a handwriting face reads as a rendering bug. Bold is
// likewise synthesized, so weight is carried by size/color instead.
const fontDisplay = Architects_Daughter({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

// UI / instructional / buttons / labels.
const fontSans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative URLs in per-route `generateMetadata` (e.g.
  // app/strip/[id]/page.tsx's og:image) into absolute ones. Falls back to
  // Next's own localhost default when unset, which is fine for local dev —
  // NEXT_PUBLIC_SITE_URL must be set in Vercel for Preview/Production so
  // shared links unfurl with the real domain instead of localhost.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: "Strip Snap",
  description:
    "Strip Snap is an online retro photobooth — capture a synced photo strip with friends or a partner from anywhere, no app or hardware required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${fontDisplay.variable} ${fontSans.variable} font-sans antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
