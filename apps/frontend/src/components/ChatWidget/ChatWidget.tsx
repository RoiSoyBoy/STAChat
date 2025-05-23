"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image"; // Import next/image
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/ThemeContext";
import { postChatMessage } from "@/services/apiClient"; // Use alias path

const chatWindowVariants = {
  hidden: (origin: { x: number; y: number }) => ({
    opacity: 0,
    scale: 0.5,
    x: origin.x,
    y: origin.y,
  }),
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
  },
  exit: (origin: { x: number; y: number }) => ({
    opacity: 0,
    scale: 0.5,
    x: origin.x,
    y: origin.y,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  }),
};

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

interface Message {
  role: string;
  content: string;
}

interface ChatWidgetProps {
  greeting: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  translations: {
    typeMessage: string;
    send: string;
  };
}

export function ChatWidget({
  greeting,
  messages = [],
  setMessages,
  translations,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [displayedAssistantMessage, setDisplayedAssistantMessage] =
    useState("");
  const [fullAssistantMessage, setFullAssistantMessage] = useState("");
  const [showFull, setShowFull] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(30); // words per minute
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });
  const { primaryColor } = useTheme();
  const [lastSources, setLastSources] = useState<any[]>([]); // Consider typing with SourceDocumentDTO from shared-types
  const [lastCitationMap, setLastCitationMap] = useState<any>({}); // This might need to be re-evaluated based on new API response
  const [botName, setBotName] = useState("הבוט");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [introMessage, setIntroMessage] = useState(
    "שלום! איך אני יכול/ה לעזור לך היום?"
  );

  // Ensure persistent clientId
  let clientId =
    typeof window !== "undefined" ? localStorage.getItem("clientId") : null;
  if (typeof window !== "undefined" && !clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("clientId", clientId);
  }

  // Fetch bot settings on mount
  useEffect(() => {
    async function fetchBotSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setBotName(data.botName || "הבוט");
          setAvatarUrl(data.avatarUrl || "");
          setIntroMessage(
            data.introMessage || "שלום! איך אני יכול/ה לעזור לך היום?"
          );
        }
      } catch (error) {
        console.error("Failed to fetch bot settings:", error);
      }
    }
    fetchBotSettings();
  }, []);

  useEffect(() => {
    // Add greeting message if no messages exist
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: introMessage }]);
    }
  }, [introMessage, messages.length, setMessages]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive or typing progresses
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayedAssistantMessage, isTyping]);

  // Typing animation effect
  useEffect(() => {
    if (!isTyping || !fullAssistantMessage) return;
    const words = fullAssistantMessage.split(" ");
    let idx = 0;
    // let interval: NodeJS.Timeout; // Removed declaration
    const msPerWord = 60000 / typingSpeed;
    let intervalRef: NodeJS.Timeout | null = null; // Use a ref or ensure it's in scope for clearInterval

    function showNext() {
      idx++;
      setDisplayedAssistantMessage(words.slice(0, idx).join(" "));
      if (idx >= words.length) {
        setIsTyping(false);
        setShowFull(false);
        if (intervalRef) clearInterval(intervalRef);
      }
    }
    setDisplayedAssistantMessage("");
    const newInterval = setInterval(showNext, msPerWord);
    intervalRef = newInterval; // Store in ref
    return () => clearInterval(newInterval);
  }, [isTyping, fullAssistantMessage, typingSpeed]);

  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonPosition({
        x: window.innerWidth - rect.right,
        y: window.innerHeight - rect.bottom,
      });
    }
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 350);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    try {
      setIsLoading(true);
      // Add user message
      const userMessage = { role: "user", content: inputValue.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
      setIsTyping(true);
      setDisplayedAssistantMessage("");
      setFullAssistantMessage("");
      setShowFull(false);

      // Import at the top of the file:
      // import { postChatMessage } from '../../services/apiClient'; // Adjust path if needed
      // import { ChatMessageDTO, SourceDocumentDTO } from 'shared-types';

      // Ensure 'messages' state (used for history) conforms to ChatMessageDTO[]
      // For now, assuming 'messages' is compatible or can be mapped.
      // The 'clientId' is not part of the new ChatRequestBody by default.
      // If needed, ChatRequestBody and backend should be updated.
      const historyForAPI = messages.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system", // Cast if necessary
        content: msg.content,
      }));

      // Call the new API client
      const result = await postChatMessage({
        message: userMessage.content,
        history: historyForAPI.slice(0, -1), // Send history excluding the current user message
        clientId: clientId as string, // Added clientId
      });

      // Animate bot response
      setFullAssistantMessage(result.response); // Changed from result.reply
      setIsTyping(true);
      // Adjust based on the new SourceDocumentDTO structure if needed for rendering
      setLastSources(result.sourceDocuments || []);
      // citationMap is not directly provided by the new API response.
      // This will need to be handled: either remove citationMap logic,
      // adapt rendering to use only sourceDocuments, or modify backend to return it.
      setLastCitationMap({}); // Resetting for now
    } catch (error) {
      console.error("Error in handleSend:", error);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "מצטער, אירעה שגיאה בעיבוד ההודעה. אנא נסה שוב.",
        },
      ]);
      setLastSources([]);
      setLastCitationMap({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleShowFull = () => {
    setDisplayedAssistantMessage(fullAssistantMessage);
    setIsTyping(false);
    setShowFull(false);
  };

  // Helper to render citations as clickable
  function renderCitations(text: string, citationMap: any) {
    const parts = [];
    let lastIdx = 0;
    const regex = /\[(\d+)\]/g;
    let match;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      const n = Number(match[1]);
      parts.push(text.slice(lastIdx, match.index));
      const src = citationMap[n];
      if (src) {
        parts.push(
          <a
            key={`cite-${key++}`}
            href={src.url || "#"}
            target={src.url ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="text-blue-600 underline cursor-pointer hover:text-blue-800 mx-0.5"
            title={src.fileName || src.url || "Source"}
          >
            [{n}]
          </a>
        );
      } else {
        parts.push(`[${n}]`);
      }
      lastIdx = match.index + match[0].length;
    }
    parts.push(text.slice(lastIdx));
    return parts;
  }

  // Helper to render sources footer
  function renderSourcesFooter(sources: any[], citationMap: any) {
    if (!sources || Object.keys(citationMap).length === 0) return null;
    const items = Object.entries(citationMap).map(([n, src]: [string, any]) => {
      const label = src.fileName || src.url || "מקור לא ידוע";
      const href = src.url || undefined;
      return (
        <span key={n} className="mr-2">
          <a
            href={href || "#"}
            target={href ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            [{n}] {label}
          </a>
        </span>
      );
    });
    return (
      <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-2 rtl:justify-end">
        <span className="font-bold">מקורות:</span> {items}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Bot header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-white">
        <Image
          src={avatarUrl || "/bot-avatar-default.png"}
          alt="Bot Avatar"
          width={40} // h-10 w-10 => 2.5rem * 16px/rem = 40px
          height={40}
          className="rounded-full border object-cover"
          onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
            // Type the event parameter
            const target = e.target as HTMLImageElement;
            target.src = "/bot-avatar-default.png";
          }}
        />
        <span className="font-bold text-lg text-gray-800">{botName}</span>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";
          const isLastAssistant = isAssistant && index === messages.length - 1;
          return (
            <motion.div
              key={index}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-500 text-white rounded-tr-none"
                    : "bg-gray-100 text-gray-800 rounded-tl-none"
                }`}
              >
                {isAssistant &&
                isLastAssistant &&
                lastCitationMap &&
                Object.keys(lastCitationMap).length > 0 ? (
                  <>
                    {renderCitations(message.content, lastCitationMap)}
                    {renderSourcesFooter(lastSources, lastCitationMap)}
                  </>
                ) : (
                  message.content
                )}
              </div>
            </motion.div>
          );
        })}
        {/* Typing animation for assistant */}
        {isTyping && (
          <motion.div
            key="typing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-end"
          >
            <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 text-gray-800 rounded-tl-none flex flex-col gap-2">
              <span>
                {renderCitations(displayedAssistantMessage, lastCitationMap)}
                <span className="inline-block w-4 animate-pulse">…</span>
              </span>
              {showFull === false &&
                fullAssistantMessage &&
                displayedAssistantMessage !== fullAssistantMessage && (
                  <button
                    className="ml-2 px-2 py-1 text-xs bg-blue-200 rounded hover:bg-blue-300 transition"
                    onClick={handleShowFull}
                  >
                    הצג תשובה מלאה
                  </button>
                )}
              {renderSourcesFooter(lastSources, lastCitationMap)}
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      <div className="border-t p-4 bg-white">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={translations.typeMessage}
            className="flex-1 border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            disabled={isLoading || isTyping}
            dir="rtl"
          />
          <motion.button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim() || isTyping}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-opacity"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
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
