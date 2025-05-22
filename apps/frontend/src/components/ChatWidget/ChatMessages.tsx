'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { auth } from '@/lib/firebase'; // Assuming Firebase is initialized here
import { postChatMessage } from '@/services/apiClient'; // Use alias path

interface Message {
  role: string;
  content: string;
}

interface ChatMessagesProps {
  greeting: string;
  translations: {
    typeMessage: string;
    send: string;
  };
}

const messageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

export function ChatMessages({ greeting, translations }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add greeting message if no messages exist
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [greeting, messages.length]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messagesEndRef.current) {
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (process.env.NODE_ENV === 'test') {
        // Mock for test environment if not present (though jest.setup.js should handle this)
        console.log('Mocking scrollIntoView for ChatMessages in test');
        (messagesEndRef.current as any).scrollIntoView = () => {}; // Replaced jest.fn() for non-test type safety
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    try {
      setIsLoading(true);
      // Add user message
      const userMessage = { role: 'user', content: inputValue.trim() };
      setMessages(prev => [...prev, userMessage]);
      setInputValue('');
      // Ensure persistent clientId
      let clientId = typeof window !== "undefined" ? localStorage.getItem('clientId') : null;
      if (typeof window !== "undefined" && !clientId) {
        clientId = crypto.randomUUID();
        localStorage.setItem('clientId', clientId);
      }
      // Send to API
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const currentUser = auth.currentUser;

      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
          console.log('ChatMessages: Sending with Authorization header.');
        } catch (error) {
          console.error('ChatMessages: Error getting ID token:', error);
          // Decide how to handle token error:
          // 1. Send without token (will likely be rejected by backend)
          // 2. Prevent sending and show error to user
          // For now, it will proceed without the header if token retrieval fails.
        }
      } else {
        console.warn('ChatMessages: No current user. Sending request without Authorization header.');
      }

      // Use the centralized API client function
      // Note: The getAuthToken logic within apiClient.ts will be used.
      // The Authorization header logic here in ChatMessages.tsx might become redundant
      // or could be removed if fully handled by apiClient.ts's getAuthToken.
      // For now, we'll let apiClient.ts handle token attachment.
      const data = await postChatMessage({
        message: userMessage.content,
        clientId: clientId as string, // Ensure clientId is passed as string
      });
      
      // Add bot response
      // The postChatMessage function already returns the parsed JSON data (ChatResponseBody)
      // and throws an error if the request failed, so data.error check might be less needed here
      // if the API consistently uses HTTP error statuses.
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error: any) {
      console.error('ChatMessages: Error in handleSend:', error.message);
      // The error message from postChatMessage will be more specific.
      setMessages(prev => [...prev, { role: 'assistant', content: `מצטער, אירעה שגיאה: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white" dir="rtl">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-200">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            variants={messageVariants}
            initial="hidden"
            animate="visible"
            className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-xl shadow-sm text-base font-normal break-words whitespace-pre-line transition-all duration-200
                ${message.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}
            >
              {message.content}
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      <div className="border-t p-3 bg-white">
        <div className="flex items-center gap-2 rtl:gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={translations.typeMessage}
            aria-label={translations.typeMessage}
            className="flex-1 border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-right min-h-[40px] max-h-[120px] transition-all duration-200"
            rows={1}
            disabled={isLoading}
            dir="rtl"
          />
          <motion.button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-all font-semibold"
            aria-label={isLoading ? "שולח הודעה" : translations.send}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              translations.send
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
