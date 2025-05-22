import { Inter } from "next/font/google";
import { RootLayoutClient } from '@/components/RootLayoutClient';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Smart Hebrew Chatbot",
  description: "An intelligent chatbot with RTL support for Israeli businesses",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
  params, // Next.js App Router passes params here, which might include locale if configured
}: {
  children: React.ReactNode;
  params?: { locale?: string }; // Optional locale param
}) {
  const locale = params?.locale || 'he'; // Default to 'he' if no locale in params

  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <body className={`bg-gray-50 text-gray-900 min-h-screen font-sans antialiased ${inter.className}`}>
        <RootLayoutClient locale={locale}>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
