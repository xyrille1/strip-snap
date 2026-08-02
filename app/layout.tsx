import type { Metadata } from "next";
import { Playfair_Display, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Display / marquee / countdown — serif, italic-capable, per
// docs/online-photobooth-uiux-design-brief.md §2.
const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// UI / instructional / buttons / labels — clean grotesque sans, per
// docs/online-photobooth-uiux-design-brief.md §2.
const fontSans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
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
          className={`${fontDisplay.variable} ${fontSans.variable} font-sans antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
