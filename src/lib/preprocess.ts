import OpenAI from "openai";
import { chunkText } from '@/lib/chunkText'; // Import chunkText
<<<<<<< HEAD
import { cleanString } from '@/lib/textUtils'; // Import cleanString
=======
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e

export interface QA {
  question: string;
  answer: string;
}

export function extractQAFromText(text: string): QA[] {
  const qas: QA[] = [];
  let match;

  // סניפים (branches)
  const branchLineRegex = /^( -  \S+|[\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w\s\d\-,]+)/gm;
  const branches: string[] = [];
  let brandName = '';
  let branchMatch;
  while ((branchMatch = branchLineRegex.exec(text)) !== null) {
    if (!brandName) brandName = branchMatch[1].trim();
    branches.push(`${branchMatch[2].trim()}: ${branchMatch[3].trim()}`);
  }
  if (branches.length > 0 && brandName) {
    const brandVariants = [brandName];
    if (!brandName.includes('שווארמה')) brandVariants.push('שווארמה ' + brandName);
    for (const variant of brandVariants) {
      qas.push({
        question: `מה הם הסניפים של ${variant}?`,
        answer: branches.join('; '),
      });
    }
  }

  // כתובת
  const addressRegex = /כתובת[:\s]+([^\n]+)/gi;
  while ((match = addressRegex.exec(text)) !== null) {
    qas.push({ question: 'מה הכתובת?', answer: match[1].trim() });
  }

  // טלפון
  const phoneRegex = /טל[׳']?[:\s]+([0-9\-]+)/gi;
  while ((match = phoneRegex.exec(text)) !== null) {
    qas.push({ question: 'מה הטלפון?', answer: match[1].trim() });
  }

  // פקס
  const faxRegex = /פקס[:\s]+([0-9\-]+)/gi;
  while ((match = faxRegex.exec(text)) !== null) {
    qas.push({ question: 'מה מספר הפקס?', answer: match[1].trim() });
  }

  // וואטסאפ
  const whatsappRegex = /וואטסאפ[:\s]+([0-9\-]+)/gi;
  while ((match = whatsappRegex.exec(text)) !== null) {
    qas.push({ question: 'מה מספר הוואטסאפ?', answer: match[1].trim() });
  }

  // מייל
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  while ((match = emailRegex.exec(text)) !== null) {
    qas.push({ question: 'מה כתובת המייל?', answer: match[1].trim() });
  }

  // אתר אינטרנט
  const websiteRegex = /(https?:\/\/[\w\.-]+\.[a-z]{2,}(?:\/[\w\-\/?=&#%]*)?)/gi;
  while ((match = websiteRegex.exec(text)) !== null) {
    qas.push({ question: 'מה האתר של העסק?', answer: match[1].trim() });
  }

  // שעות פתיחה
  const hoursRegex = /שעות פתיחה[:\s]+([^\n]+)/gi;
  while ((match = hoursRegex.exec(text)) !== null) {
    qas.push({ question: 'מהן שעות הפתיחה?', answer: match[1].trim() });
  }

  // מנהל/בעלים
  const managerRegex = /(?:מנהל|בעלים|בעל העסק)[:\s]+([^\n]+)/gi;
  while ((match = managerRegex.exec(text)) !== null) {
    qas.push({ question: 'מי המנהל?', answer: match[1].trim() });
    qas.push({ question: 'מי הבעלים?', answer: match[1].trim() });
  }

  // מספר עסק/רישיון
  const bizNumRegex = /(?:מספר עסק|מספר רישיון|רישיון עסק)[:\s]+([\w\d]+)/gi;
  while ((match = bizNumRegex.exec(text)) !== null) {
    qas.push({ question: 'מה מספר העסק?', answer: match[1].trim() });
    qas.push({ question: 'מה מספר הרישיון?', answer: match[1].trim() });
  }

  // אזורי משלוח
  const deliveryAreasRegex = /אזור(?:י)? משלוח[:\s]+([^\n]+)/gi;
  while ((match = deliveryAreasRegex.exec(text)) !== null) {
    qas.push({ question: 'לאן ניתן להזמין משלוח?', answer: match[1].trim() });
  }

  // אמצעי תשלום
  const paymentRegex = /(?:אמצעי|אפשרויות) תשלום[:\s]+([^\n]+)/gi;
  while ((match = paymentRegex.exec(text)) !== null) {
    qas.push({ question: 'באילו אמצעי תשלום ניתן לשלם?', answer: match[1].trim() });
  }

  // כשרות
  const kosherRegex = /כשרות[:\s]+([^\n]+)/gi;
  while ((match = kosherRegex.exec(text)) !== null) {
    qas.push({ question: 'האם המקום כשר?', answer: match[1].trim() });
  }

  // טבעוני/צמחוני
  const veganRegex = /(?:טבעוני|צמחוני)[:\s]+([^\n]+)/gi;
  while ((match = veganRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש מנות טבעוניות/צמחוניות?', answer: match[1].trim() });
  }

  // חניה
  const parkingRegex = /חניה[:\s]+([^\n]+)/gi;
  while ((match = parkingRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש חניה?', answer: match[1].trim() });
  }

  // נגישות
  const accessibilityRegex = /נגישות[:\s]+([^\n]+)/gi;
  while ((match = accessibilityRegex.exec(text)) !== null) {
    qas.push({ question: 'האם המקום נגיש?', answer: match[1].trim() });
  }

  // WiFi
  const wifiRegex = /WiFi[:\s]+([^\n]+)/gi;
  while ((match = wifiRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש WiFi?', answer: match[1].trim() });
  }

  // הזמנות מראש
  const reservationRegex = /(?:הזמנה מראש|הזמנות מראש)[:\s]+([^\n]+)/gi;
  while ((match = reservationRegex.exec(text)) !== null) {
    qas.push({ question: 'האם צריך להזמין מקום מראש?', answer: match[1].trim() });
  }

  // תפריט
  const menuRegex = /תפריט(?:ים)?[:\s]*([^\n]+)/gi;
  while ((match = menuRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש תפריט?', answer: match[1].trim() });
  }

  // ביקורות
  const reviewsRegex = /ביקורות[:\s]+([^\n]+)/gi;
  while ((match = reviewsRegex.exec(text)) !== null) {
    qas.push({ question: 'מה חושבים על המקום?', answer: match[1].trim() });
  }

  // תאריך פתיחה/סגירה
  const openDateRegex = /(?:נוסד|נפתח|הוקם)[:\s]+([^\n]+)/gi;
  while ((match = openDateRegex.exec(text)) !== null) {
    qas.push({ question: 'מתי נפתח העסק?', answer: match[1].trim() });
  }
  const closeDateRegex = /(?:נסגר|סגור)[:\s]+([^\n]+)/gi;
  while ((match = closeDateRegex.exec(text)) !== null) {
    qas.push({ question: 'מתי נסגר העסק?', answer: match[1].trim() });
  }

  // שנת ייסוד
  const foundedRegex = /(?:שנת ייסוד|נוסד בשנת|הוקם בשנת)[:\s]*([\d]{4})/gi;
  while ((match = foundedRegex.exec(text)) !== null) {
    qas.push({ question: 'מתי נוסד העסק?', answer: match[1].trim() });
  }

  // מספר סניפים
  const branchCountRegex = /(?:מספר סניפים|כמות סניפים)[:\s]+([\d]+)/gi;
  while ((match = branchCountRegex.exec(text)) !== null) {
    qas.push({ question: 'כמה סניפים יש לעסק?', answer: match[1].trim() });
  }

  // מועדון לקוחות
  const clubRegex = /(?:מועדון לקוחות|מועדון חברים)[:\s]+([^\n]+)/gi;
  while ((match = clubRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש מועדון לקוחות?', answer: match[1].trim() });
  }

  // אפליקציה
  const appRegex = /אפליקציה[:\s]+([^\n]+)/gi;
  while ((match = appRegex.exec(text)) !== null) {
    qas.push({ question: 'האם יש אפליקציה?', answer: match[1].trim() });
  }

  // אזור שירות
  const serviceAreaRegex = /אזור(?:י)? שירות[:\s]+([^\n]+)/gi;
  while ((match = serviceAreaRegex.exec(text)) !== null) {
    qas.push({ question: 'מהו אזור השירות?', answer: match[1].trim() });
  }

  // שפות
  const languagesRegex = /שפות[:\s]+([^\n]+)/gi;
  while ((match = languagesRegex.exec(text)) !== null) {
    qas.push({ question: 'באילו שפות ניתן לקבל שירות?', answer: match[1].trim() });
  }

  // כללי: משפטים שמתחילים ב"אודות", "על העסק", "מי אנחנו"
  const aboutRegex = /(?:אודות|על העסק|מי אנחנו)[:\s]+([^\n]+)/gi;
  while ((match = aboutRegex.exec(text)) !== null) {
    qas.push({ question: 'ספר לי על העסק.', answer: match[1].trim() });
  }

  return qas;
}

// Test comment to check file access
export async function extractQAFromTextWithLLM(text: string): Promise<QA[]> {
  const regexQAs = extractQAFromText(text);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("[extractQAFromTextWithLLM] OPENAI_API_KEY not found. Skipping LLM Q&A extraction and returning only regex-based QAs.");
    return regexQAs;
  }
  const openai = new OpenAI({ apiKey });

  const textChunks = chunkText(text, 8000); // Approx 8000 chars per chunk
  console.log(`[extractQAFromTextWithLLM] Text split into ${textChunks.length} chunks for LLM processing.`);

  let allLlmQAs: QA[] = [];

  for (let i = 0; i < textChunks.length; i++) {
<<<<<<< HEAD
    const originalChunk = textChunks[i];
    // Clean the chunk to remove URLs before sending to LLM
    const cleanedChunk = cleanString(originalChunk);

    const prompt = `הטקסט הבא הוא קטע (${i + 1}/${textChunks.length}) מתוך מידע רחב יותר. הפק שאלות ותשובות שימושיות ללקוח פוטנציאלי מהקטע הזה בלבד, בפורמט JSON של מערך אובייקטים. לדוגמה: [{"question": "שאלה כלשהי", "answer": "תשובה רלוונטית"}, {"question": "שאלה עם \\"מירכאות\\" פנימיות", "answer": "תשובה עם עוד \\"טקסט\\" פנימי"}]. הקפד על פורמט JSON תקין, ובפרט על שימוש ב-\\" (백슬래시 ואחריו מירכאות כפולות) עבור כל מירכאות כפולות שמופיעות בתוך ערכי טקסט (string values). התוכן של שדות ה-question וה-answer חייב להיות טקסט פשוט בלבד, ללא עיצוב Markdown כלשהו (כגון ** או _). התמקד במידע המוסבר ישירות בקטע זה. הימנע מיצירת שאלות ותשובות העוסקות בעיקר בקישורים חיצוניים או בדפים אחרים המוזכרים, אלא אם הקישור עצמו הוא חלק מרכזי מהמידע הנדון בקטע. אל תמציא מידע, אל תענה על שאלות שאין להן תשובה בקטע הטקסט. ענה בעברית בלבד.\n\n---\nקטע טקסט:\n${cleanedChunk}\n---`;
    
    console.log(`[extractQAFromTextWithLLM] Processing chunk ${i + 1}/${textChunks.length} with LLM (original length: ${originalChunk.length}, cleaned length: ${cleanedChunk.length})...`);
=======
    const chunk = textChunks[i];
    const prompt = `הטקסט הבא הוא קטע (${i + 1}/${textChunks.length}) מתוך מידע רחב יותר. הפק שאלות ותשובות שימושיות ללקוח פוטנציאלי מהקטע הזה בלבד, בפורמט JSON של מערך אובייקטים (לדוגמה: [{"question": "שאלה כלשהי", "answer": "תשובה רלוונטית"}, ...]). אל תמציא מידע, אל תענה על שאלות שאין להן תשובה בקטע הטקסט. ענה בעברית בלבד.\n\n---\nקטע טקסט:\n${chunk}\n---`;
    
    console.log(`[extractQAFromTextWithLLM] Processing chunk ${i + 1}/${textChunks.length} with LLM...`);
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
<<<<<<< HEAD
          { role: 'system', content: 'אתה עוזר שמחלץ שאלות ותשובות רלוונטיות מקטע טקסט נתון, בפורמט JSON. הקפד על הפורמט ועל תוכן טקסט פשוט ללא Markdown בערכים.' },
=======
          { role: 'system', content: 'אתה עוזר שמחלץ שאלות ותשובות רלוונטיות מקטע טקסט נתון, בפורמט JSON. הקפד על הפורמט.' },
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e
          { role: 'user', content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 1024, 
      });
      const rawResponse = completion.choices[0]?.message?.content || '';
      console.log(`[extractQAFromTextWithLLM] Raw response from LLM for chunk ${i + 1}: ${rawResponse.substring(0,100)}...`);
      
      const jsonMatch = rawResponse.match(/(\[[\s\S]*\])/);
      if (jsonMatch && jsonMatch[0]) {
<<<<<<< HEAD
        let jsonStrToParse = jsonMatch[0];
        // Attempt to remove backslashes before markdown characters like *, _, ~, `
        // as they can cause "Bad escaped character" if LLM tries to escape markdown.
        jsonStrToParse = jsonStrToParse.replace(/\\([*_~`])/g, '$1');

        try {
          const chunkQAs: QA[] = JSON.parse(jsonStrToParse);
=======
        try {
          const chunkQAs: QA[] = JSON.parse(jsonMatch[0]);
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e
          if (Array.isArray(chunkQAs)) {
            allLlmQAs.push(...chunkQAs);
            console.log(`[extractQAFromTextWithLLM] Successfully parsed ${chunkQAs.length} QAs from chunk ${i + 1}.`);
          } else {
            console.warn(`[extractQAFromTextWithLLM] Parsed JSON from chunk ${i + 1} is not an array.`);
          }
        } catch (parseError: any) {
<<<<<<< HEAD
          console.error(`[extractQAFromTextWithLLM] JSON parsing failed for chunk ${i + 1}: ${parseError.message}. Attempted to parse: ${jsonStrToParse}`);
=======
          console.error(`[extractQAFromTextWithLLM] JSON parsing failed for chunk ${i + 1}: ${parseError.message}. Raw response: ${rawResponse}`);
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e
        }
      } else {
        console.warn(`[extractQAFromTextWithLLM] No JSON array found in LLM response for chunk ${i + 1}. Raw response: ${rawResponse}`);
      }
    } catch (err: any) {
      console.error(`[extractQAFromTextWithLLM] LLM API call failed for chunk ${i + 1}:`, err.message);
      if (err.status === 429) {
          console.log(`[extractQAFromTextWithLLM] Rate limit hit on chunk ${i + 1}. Adding a 1 second delay.`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
    // Add a small delay between all chunk processing to be kind to the API and help with TPM
    if (i < textChunks.length - 1) { // Don't delay after the last chunk
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between chunks
    }
  }

  const finalQAs = [...regexQAs];
  if (allLlmQAs.length > 0) {
    console.log(`[extractQAFromTextWithLLM] Total LLM QAs extracted: ${allLlmQAs.length}`);
    for (const qa of allLlmQAs) {
      if (qa && typeof qa.question === 'string' && typeof qa.answer === 'string') {
        if (!finalQAs.some(existing => existing.question === qa.question && existing.answer === qa.answer)) {
          finalQAs.push(qa);
        }
      } else {
        console.warn('[extractQAFromTextWithLLM] Invalid QA object found in LLM results:', qa);
      }
    }
  }
  console.log(`[extractQAFromTextWithLLM] Total QAs after merging regex and LLM: ${finalQAs.length}`);
  return finalQAs;
}
