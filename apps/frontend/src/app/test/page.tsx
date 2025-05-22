"use client";

import React from "react";
import dynamic from "next/dynamic";

const DynamicFloatingChat = dynamic(
  () => import("@/components/ChatWidget").then((mod) => mod.FloatingChat),
  {
    ssr: false, // Floating chat often relies on client-side state/window
    // Basic fallback, can be styled or made more specific
    loading: () => (
      <div className="fixed bottom-4 right-4 w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
    ),
  }
);

export default function TestPage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-gray-50 font-sans relative"
    >
      {/* Navigation Bar */}
      <nav className="w-full bg-white shadow-sm py-4 px-6 flex justify-between items-center">
        <div className="text-2xl font-bold text-blue-700 tracking-tight">
          צ׳אט בוט חכם
        </div>
        <div className="flex gap-6 text-lg font-medium">
          <a href="#" className="hover:text-blue-600 transition">
            בית
          </a>
          <a href="#" className="hover:text-blue-600 transition">
            אודות
          </a>
          <a href="#contact" className="hover:text-blue-600 transition">
            צור קשר
          </a>
        </div>
      </nav>

      {/* Main Section: perfectly centered and symmetric */}
      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-6xl mx-auto px-4 py-8">
        <div className="w-full flex flex-col md:flex-row gap-8 items-stretch justify-center">
          {/* Main Content */}
          <main className="flex-1 flex flex-col justify-center items-center bg-white rounded-2xl shadow p-8 min-h-[320px]">
            <h1 className="text-4xl font-bold text-gray-900 mb-6 text-center">
              דף הבית
            </h1>
            <p className="text-lg text-gray-700 mb-8 text-center">
              לחץ כאן לקבלת מידע נוסף על השירותים שלנו ושעות הפעילות שלנו
            </p>
            <a
              href="#contact"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg shadow hover:bg-blue-700 hover:shadow-lg transition text-lg font-semibold"
            >
              מידע נוסף
            </a>
          </main>
          {/* Sidebar */}
          <aside className="w-full md:w-1/3 flex flex-col justify-center items-center bg-gray-100 rounded-2xl shadow p-8 min-h-[320px] md:max-w-xs mx-auto md:mx-0">
            <h2 className="text-xl font-semibold text-blue-700 mb-2">אודות</h2>
            <p className="text-gray-600 text-center">
              זהו דף בדיקה לצ׳אט בוט. כאן תוכל לבדוק את תפקוד הצ׳אט, להתרשם
              מהעיצוב ולפנות אלינו בכל שאלה.
            </p>
          </aside>
        </div>
      </div>

      {/* Contact Form: centered with equal spacing */}
      <section
        id="contact"
        className="w-full bg-white py-12 px-4 flex flex-col items-center"
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-4">צור קשר</h2>
        <form className="w-full max-w-md space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-right text-gray-700 mb-1"
            >
              שם
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full rounded-md border-gray-300 p-3 focus:ring-blue-500 focus:border-blue-500"
              placeholder="הכנס/י את שמך"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-right text-gray-700 mb-1"
            >
              דוא"ל
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full rounded-md border-gray-300 p-3 focus:ring-blue-500 focus:border-blue-500"
              placeholder={'הכנס/י את כתובת הדוא"ל'}
            />
          </div>
          <div>
            <label
              htmlFor="message"
              className="block text-right text-gray-700 mb-1"
            >
              הודעה
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              className="w-full rounded-md border-gray-300 p-3 focus:ring-blue-500 focus:border-blue-500"
              placeholder="כתוב/י את הודעתך כאן"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow"
          >
            שלח
          </button>
        </form>
      </section>

      {/* Footer */}
      <footer className="w-full bg-gray-100 py-4 mt-auto flex flex-col items-center text-gray-500 text-sm">
        <div className="flex gap-4 mb-1">
          <a href="#" className="hover:text-blue-600 transition">
            בית
          </a>
          <a href="#" className="hover:text-blue-600 transition">
            אודות
          </a>
          <a href="#contact" className="hover:text-blue-600 transition">
            צור קשר
          </a>
        </div>
        <div>© 2025 כל הזכויות שמורות</div>
      </footer>

      {/* Floating Chat: floating at bottom right with margin */}
      <DynamicFloatingChat />
    </div>
  );
}
