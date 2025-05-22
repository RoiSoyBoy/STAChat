"use client";

import { Inter } from "next/font/google";
import { SettingsProvider } from "@/lib/SettingsContext";
import { ThemeProvider } from "@/lib/ThemeContext";
// import I18nProvider from "./providers/I18nProvider"; // Import I18nProvider - REMOVED
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"] });

export function RootLayoutClient({
  children,
  // locale, // Add locale prop - REMOVED
}: {
  children: React.ReactNode;
  // locale: string; // Define locale prop type - REMOVED
}) {
  return (
    // <I18nProvider locale={locale}> {/* Wrap with I18nProvider */} - REMOVED
    <SettingsProvider>
      <ThemeProvider>
        {children}
        <ToastContainer
          position="bottom-left"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </ThemeProvider>
    </SettingsProvider>
    // </I18nProvider> - REMOVED
  );
}
