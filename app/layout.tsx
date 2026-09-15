import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seepla",
  description: "จัดการค่าใช้จ่ายและใบเสร็จในบ้าน"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { document.documentElement.classList.toggle('dark', localStorage.getItem('seepla-theme') === 'dark'); } catch {}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
