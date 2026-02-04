import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Learning Companion | Level Up Your Knowledge",
  description: "AI-powered gamified learning platform. Create personalized learning journeys, earn XP, and master any subject.",
  icons: {
    icon: '/logo-v2.png',
    shortcut: '/logo-v2.png',
    apple: '/logo-v2.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
