import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thai Family Expense Scanner",
  description: "Personal and household receipt scanning for Thai tax records"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
