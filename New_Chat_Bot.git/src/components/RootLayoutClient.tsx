'use client';

import { Inter } from "next/font/google";
import { SettingsProvider } from '@/lib/SettingsContext';
import { ThemeProvider } from "@/lib/ThemeContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inter = Inter({ subsets: ["latin"] });

export function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
  );
} 