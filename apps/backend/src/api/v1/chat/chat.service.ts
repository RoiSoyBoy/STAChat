import { openai } from '@/config/openai';
import { buildPrompt, ChatTurn } from '@/lib/buildPrompt';
import { generateContextFromPinecone, ContextResult } from '@/lib/generateContextFromPinecone';
import { ChatMessageDTO, ChatResponseBody, SourceDocumentDTO } from 'shared';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX; // Changed from PINECONE_INDEX_NAME
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!PINECONE_API_KEY || !PINECONE_INDEX || !OPENAI_API_KEY) { // Changed from PINECONE_INDEX_NAME
  throw new Error('Missing one or more required environment variables: PINECONE_API_KEY, PINECONE_INDEX, OPENAI_API_KEY'); // Changed error message
}

export class ChatService {
  constructor() {
    // OpenAI client is initialized in config/openai.ts and imported
  }

  private isDissatisfaction(message: string): boolean {
    const dissatisfactionKeywords = [
      "לא נכון", "טעות", "זה לא מה שהתכוונתי", "נסה שוב", "תשובה שגויה", "לא מדויק",
      "wrong", "incorrect", "not what i meant", "try again", "wrong answer",
      "that's not it", "that's not right", "that is not correct", "inaccurate"
    ];
    const lowerMessage = message.toLowerCase().trim();
    // Check for whole word or phrase inclusion to avoid partial matches in longer sentences if necessary,
    // but simple includes is often sufficient for these direct phrases.
    return dissatisfactionKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  // פונקציה חדשה - יוצרת שאילתות חלופיות באופן דינמי
  private async generateAlternativeQueries(originalQuery: string): Promise<string[]> {
    try {
      const prompt = `
שאלה מקורית: "${originalQuery}"

צור 3-4 ביטויים חלופיים לחיפוש מידע דומה:
- מילות מפתח מרכזיות
- ניסוחים שונים של אותה כוונה
- מושגים קשורים וכלליים יותר

החזר רק את הביטויים החלופיים, אחד בכל שורה, ללא מספור או סימנים:
      `;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      });
      
      const alternatives = response.choices[0]?.message?.content
        ?.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/))
        .slice(0, 4) || [];
      
      console.log('Generated alternative queries:', alternatives);
      return alternatives;
    } catch (error) {
      console.error('Error generating alternative queries:', error);
      return [];
    }
  }

  // פונקציה חדשה - חיפוש מתקדם עם אסטרטגיות מרובות
  private async advancedContextSearch(
    userId: string, 
    originalQuery: string
  ): Promise<ContextResult> {
    console.log('Starting advanced context search for:', originalQuery);
    
    // 1. חיפוש רגיל עם סף נמוך יותר
    let contextResult = await generateContextFromPinecone({
      userId: userId,
      question: originalQuery,
      pineconeApiKey: PINECONE_API_KEY!,
      pineconeIndex: PINECONE_INDEX!, // Changed from PINECONE_INDEX_NAME
      openaiApiKey: OPENAI_API_KEY!,
      similarityThreshold: 0.3, // הורדת הסף משמעותית
      topK: 8, // הגדלת מספר התוצאות
    });

    // 2. אם לא נמצא מידע, נסה עם שאילתות חלופיות
    if (!contextResult.context || contextResult.context.trim().length === 0) {
      console.log('No context found with original query, trying alternatives...');
      
      const alternativeQueries = await this.generateAlternativeQueries(originalQuery);
      
      for (const altQuery of alternativeQueries) {
        console.log('Trying alternative query:', altQuery);
        
        const altResult = await generateContextFromPinecone({
          userId: userId,
          question: altQuery,
          pineconeApiKey: PINECONE_API_KEY!,
          pineconeIndex: PINECONE_INDEX!, // Changed from PINECONE_INDEX_NAME
          openaiApiKey: OPENAI_API_KEY!,
          similarityThreshold: 0.3,
          topK: 8,
        });
        
        if (altResult.context && altResult.context.trim().length > 0) {
          console.log('Found context with alternative query:', altQuery);
          contextResult = altResult;
          break;
        }
      }
    }

    // 3. אם עדיין לא נמצא, נסה עם סף עוד יותר נמוך
    if (!contextResult.context || contextResult.context.trim().length === 0) {
      console.log('Still no context, trying with very low threshold...');
      
      contextResult = await generateContextFromPinecone({
        userId: userId,
        question: originalQuery,
        pineconeApiKey: PINECONE_API_KEY!,
        pineconeIndex: PINECONE_INDEX!, // Changed from PINECONE_INDEX_NAME
        openaiApiKey: OPENAI_API_KEY!,
        similarityThreshold: 0.1, // סף מאוד נמוך
        topK: 10,
      });
    }

    return contextResult;
  }

  async processMessage(
    tenantId: string,
    userId: string,
    currentMessageContent: string, // Renamed from 'message' for clarity
    history: ChatMessageDTO[] = []
  ): Promise<ChatResponseBody> {
    console.log(`ChatService: Processing message for tenant ${tenantId}, user ${userId}`);
    console.log(`Current Message: ${currentMessageContent}`);
    // console.log("Full History received:", JSON.stringify(history.map(h => ({ role: h.role, content: h.content.substring(0, 50) + "..." })), null, 2));


    let effectiveMessageContent = currentMessageContent;
    let isRetryAttempt = false;
    let originalQueryToRetry = "";
    let lastUserQueryIndex = -1; // To store the index in `history` of the query being retried

    // Check for dissatisfaction with the *previous* assistant response.
    // The currentMessageContent is the user's feedback (e.g., "that's wrong").
    // We need to ensure there's a history, the last message in history was from the assistant,
    // and there was a user query before that assistant message.
    if (history.length >= 1 && this.isDissatisfaction(currentMessageContent)) {
        if (history[history.length - 1].role === 'assistant') {
            // User is dissatisfied with `history[history.length - 1]` (assistant's last response).
            // We need to find the user query that *preceded* this unsatisfactory assistant response.
            let previousUserQueryFound = false;
            for (let i = history.length - 2; i >= 0; i--) {
                if (history[i].role === 'user') {
                    lastUserQueryIndex = i;
                    originalQueryToRetry = history[i].content;
                    effectiveMessageContent = originalQueryToRetry; // Re-process the original problematic query
                    isRetryAttempt = true;
                    previousUserQueryFound = true;
                    console.log(`Dissatisfaction detected. Retrying original query (index ${i}): "${originalQueryToRetry}" due to user feedback: "${currentMessageContent}"`);
                    break;
                }
            }
            if (!previousUserQueryFound) {
                console.log("Dissatisfaction message received, but no preceding user query found to retry. Proceeding with current message as non-retry.");
            }
        } else {
            console.log("Dissatisfaction message received, but the immediately previous message in history was not from assistant. Proceeding with current message as non-retry.");
        }
    }

    try {
      // Use effectiveMessageContent for context search (either current user message or the one being retried)
      const pineconeContextResult: ContextResult = await this.advancedContextSearch(userId, effectiveMessageContent);

      const contextText = pineconeContextResult.context;
      const sourceDocuments: SourceDocumentDTO[] = pineconeContextResult.sources.map((source) => ({
        name: source.documentName || source.originalFilename || source.url || `Source ${source.id}`,
        contentPreview: `Type: ${source.sourceType}, Score: ${source.score.toFixed(2)}`,
        url: source.url,
        metadata: {
          sourceType: source.sourceType,
          chunkIndex: source.chunkIndex,
          score: source.score,
        }
      }));
      
      console.log("Context from Pinecone for effective message:", contextText ? contextText.substring(0, 100) + "..." : "No context");
      // console.log("Source documents for context:", sourceDocuments.map(s => s.name));

      if (!contextText || contextText.trim().length === 0) {
        console.log("ChatService: No context found even with advanced search for effective message.");
        const noContextMessage = isRetryAttempt ?
        
          `ניסיתי שוב אך עדיין אין לי מידע בנוגע לשאלה המקורית ("${originalQueryToRetry}").` :
          "מצטער, אין לי מידע בנוגע לשאלה זו י.";
        return {
          response: noContextMessage,
          sourceDocuments: [],
        };
      }

      const systemPrompt = `אתה עוזר וירטואלי חכם, מקצועי ובעל ידע רחב, המתמחה במתן תשובות מדויקות, ברורות ואמינות על סמך מסמכים עסקיים, אתרים שהוזנו מראש, וקבצי מידע שהועלו. התשובות שלך מבוססות על הקשרים רלוונטיים מתוך המידע שנמסר לך, בשילוב עם הבנה לשונית עמוקה".

🔍 עקרונות מנחים:
1. נתח כל שאלה על רקע ההיסטוריה של השיחה וההקשר הקיים.
2. תענה תמיד עם מידע מתוך ההקשר שהוזן (קטעי ידע/מסמכים/תוכן) אם הוא רלוונטי לשאלה.
3. אם המידע קיים - התבסס עליו בתשובתך, גם אם השאלה אינה שואלת עליו ישירות.
4. אם אין מידע רלוונטי - ציין זאת במפורש, ואל תמציא עובדות.
5. במידה שהמשתמש מתקן אותך, עדכן את ההבנה שלך בהתאם, והצע תשובה חדשה, מדויקת ומתוקנת.
6. תמיד השב בעברית, בשפה תקנית, ברורה ומכבדת.
7. אם אין לך מידע רלוונטי - אמור זאת בפשטות ובגוף ראשון, באופן אנושי ובטוח, מבלי לציין את המילה "הקשר" או  להבהיר שאתה מסתמך על מקורות חיצוניים

 סגנון כתיבה:
- השתמש בשפה ידידותית אך מקצועית.
- תענה בתשובות ממוקדות וקצרות כ3-4 שורות אלא אם יש צורך ביותר.
- במידת הצורך, תוכל להציע המשך בירור, אך אל תסטה מהשאלה המרכזית.
- אל תכלול את מספרי המקור (לדוגמה, \`[1]\`, \`[2]\`) בתשובתך. הצג את התשובה באופן רציף.

 דוגמאות:
- שאלה: "מהן שעות הפעילות שלכם?" + קטע מידע עם שעות → תשובה: "שעות הפעילות הן: ראשון עד חמישי 9:00–18:00..."
- שאלה: "מה ההבדל בין מסלול A ל-B?" + מידע השוואתי → תשובה: "לפי המידע שקיים, מסלול A כולל... בעוד מסלול B מציע..."

 הנחיות לטיפול במידע מובנה (כגון רשומות מגיליונות או מסדי נתונים):
- מידע זה עשוי להיות מוצג כצמדי "שדה: ערך" (לדוגמה, "שם_מוצר: מחשב נייד, מחיר: 3500, יצרן: חברה כלשהי").
- כאשר אתה נשאל על מאפיין מסוים של ישות כלשהי (למשל, "מה המחיר של מחשב נייד?"), זהה את השדה המתאים (למשל, "מחיר") עבור הישות ("מחשב נייד") וספק את הערך המשויך.
- אם ערך עבור שדה מסוים מצוין כלא זמין, חסר, או ריק, ציין זאת בתשובתך רק אם השאלה מתייחסת ישירות לאותו שדה.

 שים לב:
 - המידע שסופק לך עשוי להגיע ממסמכים, אתרים, שאלות קודמות, או תיקונים של המשתמש.
 - ייתכן ששם העסק, השירותים או התנאים משתנים בין שיחות — היצמד תמיד למידע שהוזן לך בשיחה הנוכחית.
${isRetryAttempt && originalQueryToRetry ? `

הערה מיוחדת לניסיון חוזר זה: המשתמש לא היה מרוצה מהתשובה הקודמת שניתנה לשאלה זו ("${originalQueryToRetry}"). המשוב של המשתמש היה: "${currentMessageContent}".
אנא נסה לענות על השאלה המקורית ("${originalQueryToRetry}") שוב. שים לב במיוחד לכל היסטוריית השיחה, לתיקון הספציפי של המשתמש (אם רלוונטי מעבר למשוב זה), ולהנחיה מספר 5 בעקרונות המנחים לעיל (טיפול בתיקונים). נסה גישה שונה, התמקד בהיבטים אחרים של השאלה, או נסה לפרש את כוונת המשתמש המקורית בצורה אחרת כדי לספק תשובה טובה, מקיפה ומדויקת יותר הפעם.
` : ''}
הקשר זמין (קטעי מידע רלוונטיים): {context}`;
      
      let historyForPromptBuildLogic = [...history]; 
      if (isRetryAttempt && lastUserQueryIndex !== -1) {
          // For a retry of the query at `history[lastUserQueryIndex]`, 
          // the history for the prompt should be everything *before* that specific user query.
          historyForPromptBuildLogic = history.slice(0, lastUserQueryIndex);
          // console.log("Adjusted history for retry prompt build (up to query being retried):", JSON.stringify(historyForPromptBuildLogic.map(m => ({role: m.role, content: m.content.substring(0,50) + "..."})), null, 2));
      }
      // If not a retry, or if it's a retry but we couldn't identify the specific prior query (lastUserQueryIndex === -1),
      // we use the full history as passed (minus the current dissatisfaction message if we were to filter it, but buildPrompt handles current user message separately).
      // The current `currentMessageContent` (dissatisfaction phrase) is NOT part of `historyForPromptBuildLogic` or `effectiveMessageContent` if it's a retry.
      // It's handled by the system prompt.

      const chatHistoryForPrompt: ChatTurn[] = historyForPromptBuildLogic
        .filter(h => h.role === 'user' || h.role === 'assistant') // Ensure only valid roles
        .map((h: ChatMessageDTO) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content
      }));

      // `effectiveMessageContent` is the actual query to process (original if retry, current otherwise)
      // `chatHistoryForPrompt` is the history *leading up to* `effectiveMessageContent`
      const promptMessages = buildPrompt({
        system: systemPrompt,
        history: chatHistoryForPrompt, 
        context: contextText,
        userMessage: effectiveMessageContent, 
      });

      // console.log("Prompt being sent to OpenAI (effective message: '" + effectiveMessageContent.substring(0,50) + "...'):", JSON.stringify(promptMessages.map(p => ({role: p.role, content: typeof p.content === 'string' ? p.content.substring(0,100) + "..." : p.content})), null, 2));

      const openAIResponse = await openai.chat.completions.create({
        model: 'gpt-4.1-nano-2025-04-14', // Consider gpt-4-turbo for complex retries if budget allows
        messages: promptMessages,
        temperature: isRetryAttempt ? 0.55 : 0.4, // Slightly higher temperature for retry
        max_tokens: isRetryAttempt ? 700 : 500,    // Allow more tokens for a more detailed retry
      });

      let reply = openAIResponse.choices[0]?.message?.content?.trim() || "מצטער, לא הצלחתי לעבד את בקשתך כרגע.";
      console.log("Reply from OpenAI (before cleaning):", reply.substring(0,100) + "...");

      // Remove bracketed source numbers like [1], [2], etc.
      reply = reply.replace(/ \[\d+\]/g, '').trim();
      console.log("Reply from OpenAI (after cleaning):", reply.substring(0,100) + "...");

      return {
        response: reply,
        sourceDocuments: sourceDocuments,
      };

    } catch (error) {
      console.error("Error processing message in ChatService:", error);
      let errorMessageText = "אירעה שגיאה בעיבוד הבקשה שלך. אנא נסה שוב מאוחר יותר.";
      if (error instanceof Error) {
          console.error("Error details:", error.message, error.stack);
      }
      return {
        response: errorMessageText,
        sourceDocuments: [],
      };
    }
  }
}
