import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OffMenu",
  description:
    "Order directly from local restaurants without unnecessary platform fees."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}