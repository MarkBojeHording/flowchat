import type { Metadata } from "next";
import localFont from "next/font/local";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { AuthSessionRedirect } from "@/components/AuthSessionRedirect";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Flowchat",
  description: "Automate anything. Just say it.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth bg-background">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${instrumentSerif.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <AuthSessionRedirect />
        {children}
      </body>
    </html>
  );
}
