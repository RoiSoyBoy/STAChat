import { Inter } from "next/font/google";
import { RootLayoutClient } from '@/components/RootLayoutClient';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Smart Hebrew Chatbot",
  description: "An intelligent chatbot with RTL support for Israeli businesses",
<<<<<<< HEAD
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
=======
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={`bg-gray-50 text-gray-900 min-h-screen font-sans antialiased ${inter.className}`}>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
