import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionGuard from "@/components/SessionGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "FileDrop",
  description: "Secure file drop service for external parties",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SessionGuard />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
