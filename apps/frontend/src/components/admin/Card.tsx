"use client";

import { motion } from "framer-motion";

interface CardProps {
  title: string;
  children: React.ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}
