'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18nInstance from '@/lib/i18n'; // Your i18next instance

interface Props {
  children: ReactNode;
  locale: string; // Locale passed from server components/layout
}

export default function I18nProvider({ children, locale }: Props) {
  const [instance, setInstance] = useState(i18nInstance);

  useEffect(() => {
    if (instance.language !== locale) {
      instance.changeLanguage(locale);
    }
  }, [locale, instance]);
  
  // This effect ensures that the i18next instance is fully initialized
  // and translations are loaded before rendering children.
  // This helps prevent hydration mismatches with Suspense.
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    const init = async () => {
      // Ensure instance is initialized (it might be already by i18n.ts)
      // If not using suspense in i18n.init, you might need to await i18nInstance.init() here
      // or ensure resources are loaded.
      if (!i18nInstance.isInitialized) {
        // For HttpBackend, resources are loaded asynchronously.
        // We might need to wait for the initial load if not using Suspense for resource loading.
        // However, with react: { useSuspense: true }, this should be handled.
        // Let's add a check for loaded resources for the current language.
        await i18nInstance.loadNamespaces('common'); // Ensure common namespace is loaded
      }
      setIsInitialized(true);
    };
    init();
  }, [locale]); // Re-check initialization if locale changes

  if (!isInitialized) {
    // You can return a global loading spinner here if preferred
    // For now, returning null to let Suspense boundaries handle it.
    return null; 
  }

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
