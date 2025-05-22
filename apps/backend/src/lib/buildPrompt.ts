import OpenAI from 'openai';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function buildPrompt({
  system,
  history,
  context,
  userMessage,
}: {
  system: string;
  history: ChatTurn[];
  context: string;
  userMessage: string;
}): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  if (history && history.length > 0) {
    for (const turn of history) {
      // ChatTurn role is 'user' | 'assistant', which is compatible
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  if (context) {
    messages.push({ role: 'system', content: `הקשר:
${context}

הנחיה: כאשר אתה עונה, השתמש בסימוני מקור בסגנון [1], [2] בסוף כל עובדה, לפי המספור של המקורות בהקשר. אל תשתמש במקורות שלא מופיעים בהקשר. אם אין מקור, אל תנחש.` });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}
