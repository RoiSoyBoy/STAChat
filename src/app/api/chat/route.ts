import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper: check if the message is a basic greeting or intro
function isBasicGreeting(text: string) {
  const greetings = [
    'שלום', 'היי', 'מה נשמע', 'מה שלומך', 'הצג את עצמך', 'מי אתה', 'מי את', 'מי זה', 'מי זו', 'הצג מידע', 'הצג פרטים', 'הצג עזרה'
  ];
  return greetings.some(greet => text.trim().includes(greet));
}

// Helper: search for an answer in training data (Q&A pairs)
function findAnswerInTrainingData(message: string, trainingData: any[]): string | null {
  // Simple exact or case-insensitive match
  const found = trainingData.find(pair =>
    pair.question &&
    (pair.question.trim() === message.trim() ||
      pair.question.trim().toLowerCase() === message.trim().toLowerCase())
  );
  return found ? found.answer : null;
}

async function getTrainingDataAdmin() {
  const snapshot = await adminDb.collection('training').orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // 1. Check for basic greeting/intro
    if (isBasicGreeting(message)) {
      // Use OpenAI for basic greetings only
      const completion = await openai.chat.completions.create({
        model: "chatgpt-4o-latest",
        messages: [
          {
            role: "system",
            content: "אתה עוזר וירטואלי. ענה בעברית בלבד ובקצרה."
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.5,
        max_tokens: 100
      });
      const response = completion.choices[0]?.message?.content || 'שלום! איך אפשר לעזור?';
      return NextResponse.json({ response, isKnown: true });
    }

    // 2. Search in training data (using Admin SDK)
    const allTraining = await getTrainingDataAdmin();
    // Each trainingData.content is a string with Q&A pairs, split and parse
    let pairs: { question: string, answer: string }[] = [];
    for (const td of allTraining) {
      if (td.content) {
        const lines = td.content.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          const [question, answer] = line.split('|').map((s: string) => s.trim());
          if (question && answer) {
            pairs.push({ question, answer });
          }
        }
      }
    }
    const answer = findAnswerInTrainingData(message, pairs);
    if (answer) {
      return NextResponse.json({ response: answer, isKnown: true });
    }

    // 3. If not found, return fallback message and flag
    return NextResponse.json({
      response: 'על זה אני עדיין לא יכול לענות :( תשאיר הודעה ונחזיר לך תשובה בהקדם!',
      isKnown: false
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 