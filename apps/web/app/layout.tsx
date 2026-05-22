import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X-Cup OS — autonomous betting on the World Cup",
  description:
    "Write a betting strategy in plain English. Deploy an AI agent that watches matches and places bets for you on X Layer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
