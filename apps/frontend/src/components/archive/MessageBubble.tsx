import { motion } from "framer-motion";
import { RobotIcon } from "./RobotIcon";

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
  isLoading?: boolean;
}

export function MessageBubble({
  message,
  isUser,
  isLoading,
}: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[80%] items-start gap-2 rounded-lg px-4 py-2 ${
          isUser
            ? "flex-row-reverse bg-blue-500 text-white"
            : "bg-gray-100 text-gray-800"
        }`}
      >
        {!isUser && (
          <RobotIcon
            className={`h-6 w-6 ${isLoading ? "animate-pulse text-blue-500" : "text-gray-600"}`}
          />
        )}
        <p className={`text-sm ${isUser ? "text-right" : "text-left"}`}>
          {message}
        </p>
      </div>
    </motion.div>
  );
}
