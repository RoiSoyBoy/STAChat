'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

// React context for unified access to chatbot and UI settings throughout the frontend.
// Provides settings such as color, logo, greeting, botName, tone, avatar, description, introMessage, etc.
// Used by admin dashboard and chat widget for consistent customization.

interface Settings {
  primaryColor: string;
  greeting: string;
  logoUrl: string;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isLoading: boolean;
}

const defaultSettings: Settings = {
  primaryColor: '#0066cc',
  greeting: 'שלום! איך אני יכול/ה לעזור לך היום?',
  logoUrl: '',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: () => {},
  isLoading: true,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Failed to fetch settings');
        }
        const data = await response.json();
        setSettings({
          primaryColor: data.primaryColor || defaultSettings.primaryColor,
          greeting: data.greeting || defaultSettings.greeting,
          logoUrl: data.logoUrl || defaultSettings.logoUrl,
        });
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();

    // Set up polling for settings updates
    const pollInterval = setInterval(fetchSettings, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      const data = await response.json();
      setSettings(prev => ({
        ...prev,
        ...newSettings,
      }));
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext); 