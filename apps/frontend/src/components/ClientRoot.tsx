"use client";

import { ThemeProvider } from "@/lib/ThemeContext";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    __NEXT_HYDRATION_MARK__?: boolean;
  }
}

export function ClientRoot({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Wait for next tick to ensure hydration is complete
    const timer = setTimeout(() => {
      setIsHydrated(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  if (!isHydrated) {
    return (
      <div style={{ visibility: "hidden" }} aria-hidden="true">
        {children}
      </div>
    );
  }

  return (
    <div style={{ visibility: "visible" }}>
      <ThemeProvider>{children}</ThemeProvider>
    </div>
  );
}
