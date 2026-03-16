import type { Metadata } from "next";
import "./globals.css";

// 1. Import the provider you just created. 
// Since layout.tsx is inside 'app', we use '../' to go up one level to find the 'context' folder.
import { AppKitProvider } from "../context/AppKitProvider";
import NextAuthSessionProvider from "../context/SessionProvider"; // Import the new provider

export const metadata: Metadata = {
  title: "ZK Voting DAO",
  description: "Gasless Zero-Knowledge Voting System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* Wrap SessionProvider outside of AppKitProvider */}
        <NextAuthSessionProvider>
          <AppKitProvider>
            {children}
          </AppKitProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}