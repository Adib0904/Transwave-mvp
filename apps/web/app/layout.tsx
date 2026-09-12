import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import { AuthProvider } from "./auth";

export const metadata: Metadata = {
  title: "TransWave Operations",
  description: "Logistics job and invoice management"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
