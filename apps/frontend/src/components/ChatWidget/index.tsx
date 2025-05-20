'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/ThemeContext';
import { ChatMessages } from './ChatMessages';
import { RobotIcon } from './RobotIcon';
import { useSettings } from '@/lib/SettingsContext';

interface FloatingChatProps {
  greeting?: string;
  logoUrl?: string;
  primaryColor?: string;
}

const translations = {
  openChat: 'פתח צ\'אט',
  closeChat: 'סגור צ\'אט',
  startNewChat: 'התחל צ\'אט חדש',
  poweredBy: 'מופעל על ידי',
  typeMessage: 'הקלד/י הודעה...',
  send: 'שלח',
};

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const { settings } = useSettings();
  const chatColor = settings.primaryColor;
  const logoUrl = settings.logoUrl;
  const greeting = settings.greeting;

  const chatVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2, ease: 'easeInOut' } },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } }
  };

  const buttonVariants = {
    initial: { scale: 1, opacity: 1 },
    hidden: { opacity: 0 },
    hover: { scale: 1.05, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', transition: { duration: 0.2 } },
    tap: { scale: 0.95 }
  };

  return (
    <div dir="rtl" className="fixed bottom-0 right-4 z-50 flex flex-col items-end w-full max-w-xs sm:max-w-md">
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="chat-window"
            variants={chatVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="w-full h-[70vh] bg-white rounded-t-2xl shadow-lg overflow-hidden flex flex-col border border-gray-200"
            style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}
            aria-label="חלון צ'אט" // Added aria-label
          >
            {/* Header with logo and title */}
            <div className="p-4 flex items-center justify-between border-b bg-gradient-to-l from-blue-600 to-blue-400" style={{ backgroundColor: chatColor }}>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white flex items-center justify-center shadow-sm">
                    <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain" />
                  </div>
                )}
                <h3 className="text-white font-semibold text-lg tracking-tight">התחל צ׳אט חדש</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/90 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all duration-200"
                aria-label="סגור צ׳אט"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Chat Content */}
            <ChatMessages greeting={greeting} translations={translations} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Floating Button - hidden when chat is open */}
      <motion.button
        onClick={() => setIsOpen(true)}
        variants={buttonVariants}
        initial="initial"
        animate={isOpen ? 'hidden' : 'initial'}
        whileHover="hover"
        whileTap="tap"
        className={`rounded-full p-4 text-white shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center bg-gradient-to-l from-blue-600 to-blue-400 mb-4${isOpen ? ' pointer-events-none' : ''}`}
        style={{ backgroundColor: chatColor }}
        aria-label="פתח צ׳אט"
      >
        <RobotIcon className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
