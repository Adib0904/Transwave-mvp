import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import { AuthProvider } from "./auth";
import { PortalRoot } from "./portal-root";

export const metadata: Metadata = {
  title: "TransWave Operations",
  description: "Logistics job and invoice management"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PortalRoot />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
