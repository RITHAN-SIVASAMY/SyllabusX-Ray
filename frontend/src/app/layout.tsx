import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SyllabusX-Ray — AI-Powered Exam Prep",
  description:
    "Upload your syllabus & past year papers. Get the 20% of topics that account for 80% of exam marks. Powered by Hybrid RAG with deterministic analytics.",
  keywords: [
    "exam preparation",
    "study planner",
    "syllabus analysis",
    "past year papers",
    "AI study tool",
    "80/20 rule",
    "Pareto principle",
  ],
  authors: [{ name: "SyllabusX-Ray" }],
  openGraph: {
    title: "SyllabusX-Ray — AI-Powered Exam Prep",
    description:
      "Find the 20% of topics that historically account for 80% of your exam marks.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
