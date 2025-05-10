'use client';

import React from 'react';
import { ThemeProvider } from '@/lib/ThemeContext';

export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
} 