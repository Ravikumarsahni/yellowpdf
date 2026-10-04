import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YellowPDF — Free Online PDF Editor Without Watermark",
  description:
    "Edit, merge, split, compress, and convert PDFs instantly in your browser. 100% free, no watermark, no sign-up required — your files never leave your device. Built for 100k+ users.",
  keywords: [
    "PDF editor",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "PDF tools",
    "free PDF editor",
    "no watermark",
    "online PDF",
    "AI PDF tools",
  ],
  authors: [{ name: "YellowPDF" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "YellowPDF — Free Online PDF Editor Without Watermark",
    description:
      "Edit, merge, split, compress, and convert PDFs instantly in your browser. 100% free, no watermark, no sign-up required.",
    siteName: "YellowPDF",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YellowPDF — Free Online PDF Editor",
    description: "Edit, merge, split, compress, and convert PDFs instantly. 100% free, no watermark.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
