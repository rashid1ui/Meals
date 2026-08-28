import type { Metadata } from "next";
import { Rubik, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Falls back to a placeholder origin when NEXT_PUBLIC_SITE_URL isn't set
// (e.g. local dev) - Next.js needs *some* metadataBase to resolve relative
// canonical/openGraph URLs (app/page.tsx's alternates.canonical: '/') into
// absolute ones; set NEXT_PUBLIC_SITE_URL to the real production domain
// before relying on these URLs being correct there.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://gymmeals.app"),
  title: "Gym Meals | Pro Diet Tracker",
  description: "Track your diet and meals with Gym Meals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} ${jetBrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved dark-theme choice before first paint, so a
            reload doesn't flash light before ThemeToggle's effect runs. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('gym-meals-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}"
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">{children}</body>
    </html>
  );
}
