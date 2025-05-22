import { openai } from '@/config/openai';
import { buildPrompt, ChatTurn } from '@/lib/buildPrompt';
import { generateContextFromPinecone, ContextResult } from '@/lib/generateContextFromPinecone';
import { ChatMessageDTO, ChatResponseBody, SourceDocumentDTO } from 'shared';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Already used by openai client, but good for explicit checks

if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
  throw new Error('Missing one or more required environment variables: PINECONE_API_KEY, PINECONE_INDEX_NAME, OPENAI_API_KEY');
}

export class ChatService {
  constructor() {
    // OpenAI client is initialized in config/openai.ts and imported
  }

  async processMessage(
    tenantId: string, // tenantId will be used as the Pinecone namespace prefix or part of it
    userId: string, // userId might be used for Pinecone namespacing or filtering if needed
    message: string,
    history: ChatMessageDTO[] = []
  ): Promise<ChatResponseBody> {
    console.log(`ChatService: Processing message for tenant ${tenantId}, user ${userId}`);
    console.log(`Message: ${message}`);
    console.log(`History:`, history);

    try {
      // 1. Retrieve relevant context from Pinecone.
      //    The `generateContextFromPinecone` function expects a `userId` for namespacing.
      //    We can use the `tenantId` for this purpose, or a combination if your Pinecone setup requires it.
      //    For now, let's assume tenantId is the primary key for namespacing data in Pinecone.
      //    The function also needs the OpenAI API key for embeddings.
      const pineconeContextResult: ContextResult = await generateContextFromPinecone({
        userId: tenantId, // Using tenantId as the identifier for Pinecone namespace
        question: message,
        pineconeApiKey: PINECONE_API_KEY!,
        pineconeIndex: PINECONE_INDEX_NAME!,
        openaiApiKey: OPENAI_API_KEY!, // For generating embeddings of the question
        similarityThreshold: 0.7, // Adjust as needed
        topK: 5, // Adjust as needed
      });

      const contextText = pineconeContextResult.context;
      const sourceDocuments: SourceDocumentDTO[] = pineconeContextResult.sources.map((source: typeof pineconeContextResult.sources[0]) => ({
        name: source.documentName || source.originalFilename || source.url || `Source ${source.id}`,
        contentPreview: `Type: ${source.sourceType}, Score: ${source.score.toFixed(2)}`, // Basic preview
        url: source.url,
        metadata: { // Add any relevant metadata you want to expose
          sourceType: source.sourceType,
          chunkIndex: source.chunkIndex,
          score: source.score,
        }
      }));
      
      console.log("Context from Pinecone:", contextText);
      console.log("Source documents for context:", sourceDocuments.map(s => s.name));

      // Validate context before proceeding to OpenAI
      if (!contextText || contextText.trim().length === 0) {
        console.log("ChatService: No context found from Pinecone. Returning standard 'no information' message.");
        return {
          response: "מצטער, אין לי מידע בנוגע לשאלה זו במאגר הנתונים הזמין לי.",
          sourceDocuments: [], // Return empty sources as no context was used
        };
      }

      // 2. Build a prompt using the message, history, and retrieved context.
      // Updated system prompt for stricter context adherence
      const systemPrompt = `אתה עוזר וירטואלי מקצועי. עליך לענות רקיק על בסיס ההקשר שסופק לך. 

חוקים קפדניים:
1. אם המידע לא נמצא בהקשר שסופק - ענה: "מצטער, אין לי מידע בנוגע לשאלה זו במאגר הנתונים הזמין לי."
2. אל תשתמש בידע כללי או מידע שלא נמצא בהקשר
3. אל תנחש או תמציא מידע
4. ענה בעברית בלבד
5. אם יש הקשר - ענה על בסיסו בלבד

הקשר זמין: {context}`; // The {context} placeholder will be filled by buildPrompt
      
      const chatHistoryForPrompt: ChatTurn[] = history
        .filter(h => h.role === 'user' || h.role === 'assistant') // Ensure only user/assistant roles
        .map((h: ChatMessageDTO) => ({ // Explicitly type h as ChatMessageDTO
          role: h.role as 'user' | 'assistant', // Assert role after filtering
          content: h.content
      }));

      const promptMessages = buildPrompt({
        system: systemPrompt,
        history: chatHistoryForPrompt,
        context: contextText,
        userMessage: message,
      });

      console.log("Prompt being sent to OpenAI:", JSON.stringify(promptMessages, null, 2));

      // 3. Send the prompt to OpenAI for completion.
      const openAIResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Or your preferred model
        messages: promptMessages,
        temperature: 0.7, // Adjust as needed
      });

      const reply = openAIResponse.choices[0]?.message?.content?.trim() || "מצטער, לא הצלחתי לעבד את בקשתך כרגע.";
      console.log("Reply from OpenAI:", reply);

      // 4. (Optional) Store the user message and AI reply in Firestore (associated with tenantId and userId).
      //    This step is commented out in the original placeholder and can be implemented if needed.
      //    Example: await firestore.collection(`tenants/${tenantId}/users/${userId}/messages`).add({ ... });

      return {
        response: reply,
        sourceDocuments: sourceDocuments, // Return the actual source documents used for context
      };

    } catch (error) {
      console.error("Error processing message in ChatService:", error);
      // Consider if the error is from OpenAI, Pinecone, or elsewhere to provide a more specific user message.
      let errorMessage = "אירעה שגיאה בעיבוד הבקשה שלך. אנא נסה שוב מאוחר יותר.";
      if (error instanceof Error) {
        // Potentially log error.message to a more secure logging system if it might contain sensitive info.
        // For user-facing errors, keep them generic.
      }
      return {
        response: errorMessage,
        sourceDocuments: [],
      };
    }
  }
}
