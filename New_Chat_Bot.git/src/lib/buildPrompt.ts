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
}): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  if (history && history.length > 0) {
    for (const turn of history) {
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