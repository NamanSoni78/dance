import type { Metadata, Viewport } from "next";
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

const SITE_URL = "https://dance.namansoni.in";
const SITE_TITLE =
  "Dance Cat 3D — Audio-Reactive Dancing Cat Music Visualizer";
const SITE_DESCRIPTION =
  "Drop any MP3 and watch a fully procedural 3D cat dance in perfect beat sync. Real-time Web Audio FFT, offline BPM detection and spectral-flux kick analysis run 100% in your browser — no AI, no uploads, no server.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Dance Cat 3D",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Dance Cat 3D",
  keywords: [
    "dancing cat",
    "3d dancing cat",
    "cat dance",
    "music visualizer",
    "mp3 visualizer",
    "audio reactive",
    "audio visualizer online",
    "web audio api",
    "three.js music visualizer",
    "bpm detection",
    "dance cat",
    "cat dancing to music",
    "upload mp3 visualizer",
    "3d cat",
    "neon cat dance",
  ],
  authors: [{ name: "Naman Soni" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Dance Cat 3D",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Neon cyber-cat mid-dance in a 3D club with a reactive equalizer ring — Dance Cat 3D music visualizer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#06060a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#06060a] text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
