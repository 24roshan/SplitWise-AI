import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Ledger — Split expenses without the math",
  description: "AI-assisted group expense splitting with minimal-transaction settlements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-paper text-ink">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
