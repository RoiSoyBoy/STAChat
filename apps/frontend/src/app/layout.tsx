import { Inter } from "next/font/google";
import { RootLayoutClient } from "@/components/RootLayoutClient";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Smart Hebrew Chatbot",
  description: "An intelligent chatbot with RTL support for Israeli businesses",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = "he"; // Hardcode to Hebrew

  return (
    <html lang={locale} dir="rtl">
      <body
        className={`bg-gray-50 text-gray-900 min-h-screen font-sans antialiased ${inter.className}`}
      >
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
