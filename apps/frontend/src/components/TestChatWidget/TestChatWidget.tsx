"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image"; // Import next/image
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  MinusIcon,
  TrashIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
}

interface TestChatWidgetProps {
  primaryColor: string;
  greeting: string;
  logoUrl?: string;
}

export function TestChatWidget({
  primaryColor,
  greeting,
  logoUrl,
}: TestChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>(
    greeting ? [{ id: "greeting", text: greeting, isUser: false }] : []
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create dynamic styles based on the primary color
  const dynamicStyles = {
    header: {
      backgroundColor: primaryColor,
      color: "white",
      transition: "background-color 0.2s ease",
    },
    sendButton: {
      backgroundColor:
        !input.trim() || isLoading
          ? "#D1D5DB"
          : isHovered
            ? adjustColor(primaryColor, -10)
            : primaryColor,
      transition: "background-color 0.2s ease",
    },
    userMessage: {
      backgroundColor: primaryColor,
      color: "white",
      transition: "background-color 0.2s ease",
    },
    launcherButton: {
      backgroundColor: primaryColor,
      transition: "all 0.2s ease",
    },
  };

  // Helper function to adjust color brightness
  function adjustColor(color: string, amount: number): string {
    const hex = color.replace("#", "");
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input.trim(),
      isUser: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Make real API call to /api/chat
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.text,
          clientId: "test-client",
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to get response");
      }
      const data = await response.json();
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        isUser: false,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: "לצערי על זה אני לא יכול לענות, פנה לנציג אנושי",
          isUser: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  // Helper to detect if the bot doesn't know the answer
  function isBotUnsure(text: string) {
    const unsurePhrases = [
      "I don't know",
      "I am not sure",
      "לא יודע",
      "לא ידוע",
      "אין לי מידע",
      "I do not know",
      "Sorry, I do not know",
      "מצטער",
      "I am unable to answer",
      "I cannot answer",
      "אין לי תשובה",
      "אין לי אפשרות",
      "אין לי מספיק מידע",
    ];
    return unsurePhrases.some((phrase) =>
      text.toLowerCase().includes(phrase.toLowerCase())
    );
  }

  return (
    <>
      {/* Launcher Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0, y: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: [0, -8, 0],
            transition: {
              y: {
                repeat: Infinity,
                duration: 2,
                ease: "easeInOut",
              },
            },
          }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{
            scale: 1.05,
            backgroundColor: adjustColor(primaryColor, -10),
            y: 0, // Stop floating animation on hover
          }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 flex h-[60px] w-[60px] items-center justify-center rounded-full text-white shadow-lg transition-all hover:shadow-xl"
          style={dynamicStyles.launcherButton}
          aria-label="פתח צ'אט בדיקה"
        >
          <CommandLineIcon className="h-7 w-7" aria-hidden="true" />
        </motion.button>
      )}

      {/* Chat Widget */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 right-4 flex w-96 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          dir="rtl"
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={dynamicStyles.header}
          >
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={32}
                  height={32}
                  className="rounded bg-white object-contain"
                />
              ) : (
                <ChatBubbleLeftRightIcon
                  className="h-6 w-6 text-white"
                  aria-hidden="true"
                />
              )}
              <h2 className="font-semibold text-white">Test Chatbot</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="נקה צ'אט"
              >
                <TrashIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="סגור צ'אט בדיקה"
              >
                <MinusIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className="flex flex-col gap-4 overflow-y-auto p-4"
            style={{ height: "400px" }}
          >
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex ${message.isUser ? "justify-start" : "justify-end"}`}
                  dir="rtl"
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      message.isUser ? "" : "bg-gray-100 text-gray-900"
                    }`}
                    style={
                      message.isUser ? dynamicStyles.userMessage : undefined
                    }
                    dir="rtl"
                  >
                    {message.text}
                    {!message.isUser && isBotUnsure(message.text) && (
                      <div className="mt-2 flex justify-end">
                        <button
                          className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                          disabled
                          onClick={() =>
                            alert("A human will contact you soon!")
                          }
                        >
                          פנה לנציג אנושי
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-end"
                >
                  <div className="flex gap-1 rounded-2xl bg-gray-100 px-4 py-2">
                    <span className="animate-bounce">•</span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    >
                      •
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    >
                      •
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-gray-100 bg-white p-4"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="הקלד הודעה..."
                aria-label="הקלד הודעה"
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-right focus:border-blue-500 focus:outline-none"
                dir="rtl"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="rounded-lg px-4 py-2 text-white transition-colors disabled:cursor-not-allowed"
                style={dynamicStyles.sendButton}
                aria-label="שלח הודעה"
              >
                <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </>
  );
}
