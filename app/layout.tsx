import type { Metadata } from "next";
import { Playfair_Display, Quicksand, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import BoothThemeProvider from "@/components/booth3d/BoothThemeProvider";
import "./globals.css";

// Display / marquee / countdown — serif, italic-capable, the "classic"
// theme's default (docs/goal-ui.md).
const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// UI / instructional / buttons / labels — the "classic" theme's default sans.
const fontSans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Rounded, friendly sans used only by the "kawaii" theme (app/globals.css'
// [data-theme="kawaii"] block) — kept as its own next/font var rather than
// swapping fontDisplay/fontSans's family outright so the classic/neon themes
// never pay for or reference this font at all.
const fontKawaii = Quicksand({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-kawaii",
  display: "swap",
});

export const metadata: Metadata = {
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
        <body
          className={`${fontDisplay.variable} ${fontSans.variable} ${fontKawaii.variable} font-sans antialiased`}
        >
          <BoothThemeProvider>{children}</BoothThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
