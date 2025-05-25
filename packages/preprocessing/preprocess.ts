import OpenAI from "openai";
import { QA, ExtractionConfig, ExtractionResult } from './types';
import { extractWithRegex } from './regexExtractor';
// import { extractWithLLM } from './llmExtractor'; // This will be removed
import { deduplicateQAs, delay, cleanMarkdown } from './utils';
import { chunkText } from '../shared/src/chunkText'; // Import chunkText

const DEFAULT_CONFIG: ExtractionConfig = {
  useRegex: true,
  useLLM: true,
  maxChunkSize: 8000,
  chunkDelayMs: 200,
  rateLimitDelayMs: 1000,
  maxRetries: 3,
  temperature: 0.0,
  maxTokens: 2048
};

const DEFAULT_LLM_PROCESSING_CONFIG = { // Renamed from DEFAULT_LLM_CONFIG to avoid conflict
  maxChunkSize: 8000,
  chunkDelayMs: 200,
  rateLimitDelayMs: 1000,
  maxRetries: 3,
  temperature: 0.0,
  maxTokens: 2048
};


export class QAExtractor {
  protected config: ExtractionConfig; // Changed to protected
  protected openai?: OpenAI; // Changed to protected
  protected stats = { // Changed to protected
    totalQAs: 0,
    regexQAs: 0,
    llmQAs: 0,
    chunksProcessed: 0,
    errors: 0
  };

  constructor(config: Partial<ExtractionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.useLLM) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("[QAExtractor] OPENAI_API_KEY not found. LLM extraction will be disabled.");
        this.config.useLLM = false;
      } else {
        this.openai = new OpenAI({ apiKey });
      }
    }
  }

  /**
   * Build optimized prompt for LLM (default version)
   */
  protected buildPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
    return `נתח את הטקסט הבא והפק שאלות ותשובות שימושיות ללקוח פוטנציאלי.

דרישות:
- החזר JSON תקין: [{"question": "שאלה", "answer": "תשובה"}]
- השתמש רק במידע שמופיע בטקסט
- ענה בעברית בלבד
- התמקד בשאלות פרקטיות (כתובת, טלפון, שעות, שירותים)
- אל תכלול שאלות ללא תשובה ברורה

קטע ${chunkIndex}/${totalChunks}:
---
${chunk}
---

JSON:`;
  }

  /**
   * Parse LLM response with improved error handling
   */
  protected parseResponse(rawResponse: string, chunkIndex: number): QA[] {
    try {
      const firstBracket = rawResponse.indexOf('[');
      const lastBracket = rawResponse.lastIndexOf(']');

      if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
        console.warn(`[QAExtractor] No valid JSON array found in chunk ${chunkIndex} response`);
        return [];
      }

      let jsonStr = rawResponse.substring(firstBracket, lastBracket + 1);
      
      if (jsonStr.startsWith('\\[') && jsonStr.endsWith('\\]')) {
        jsonStr = jsonStr.slice(2, -2);
      } else if (jsonStr.startsWith('\\[')) {
        jsonStr = jsonStr.slice(2);
      }

      const parsed = JSON.parse(jsonStr);
      
      if (!Array.isArray(parsed)) {
        console.warn(`[QAExtractor] Parsed JSON is not an array for chunk ${chunkIndex}`);
        return [];
      }

      const qas: QA[] = parsed
        .filter(item => item && typeof item.question === 'string' && typeof item.answer === 'string')
        .map(item => ({
          question: cleanMarkdown(item.question.trim()),
          answer: cleanMarkdown(item.answer.trim()),
          source: 'llm' as const,
          confidence: 0.7
        }))
        .filter(qa => qa.question.length > 0 && qa.answer.length > 0);

      console.log(`[QAExtractor] Successfully extracted ${qas.length} QAs from chunk ${chunkIndex}`);
      return qas;

    } catch (error: any) {
      console.error(`[QAExtractor] JSON parsing failed for chunk ${chunkIndex}:`, error.message);
      console.error(`[QAExtractor] Raw response preview:`, rawResponse.substring(0, 200));
      return [];
    }
  }

  /**
   * Process a single chunk with the LLM
   */
  protected async processChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<QA[]> {
    if (!this.openai) return []; // Ensure openai is defined
    const prompt = this.buildPrompt(chunk, chunkIndex, totalChunks); // Uses this.buildPrompt
    
    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'אתה עוזר מומחה שמחלץ שאלות ותשובות רלוונטיות מטקסט עסקי בעברית. החזר תמיד JSON תקין בפורמט מערך של אובייקטים. אל תמציא מידע ואל תכלול שאלות ללא תשובה ברורה בטקסט.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    return this.parseResponse(rawResponse, chunkIndex); // Uses this.parseResponse
  }

  /**
   * Process a single chunk with retry logic
   */
  protected async processChunkWithRetry(chunk: string, chunkIndex: number, totalChunks: number): Promise<QA[]> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.processChunk(chunk, chunkIndex, totalChunks); // Uses this.processChunk
      } catch (error: any) {
        console.error(`[QAExtractor] Attempt ${attempt}/${this.config.maxRetries} failed for chunk ${chunkIndex}:`, error.message);
        
        if ((error as any).status === 429) {
          console.log(`[QAExtractor] Rate limit hit. Waiting ${this.config.rateLimitDelayMs}ms...`);
          await delay(this.config.rateLimitDelayMs);
        }

        if (attempt === this.config.maxRetries) {
          this.stats.errors++;
          console.error(`[QAExtractor] All retry attempts failed for chunk ${chunkIndex}`);
          return [];
        }
        await delay(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
      }
    }
    return [];
  }

  /**
   * Extract Q&A pairs using LLM
   */
  protected async extractWithLLMInternal(text: string): Promise<QA[]> {
    if (!this.openai || !this.config.useLLM) {
      return [];
    }
    // Use config from this.config and DEFAULT_LLM_PROCESSING_CONFIG for defaults
    const llmProcessingConfig = {
        maxChunkSize: this.config.maxChunkSize || DEFAULT_LLM_PROCESSING_CONFIG.maxChunkSize,
        chunkDelayMs: this.config.chunkDelayMs || DEFAULT_LLM_PROCESSING_CONFIG.chunkDelayMs,
        // rateLimitDelayMs, maxRetries, temperature, maxTokens are already on this.config
    };

    const chunks = chunkText(text, llmProcessingConfig.maxChunkSize);
    console.log(`[QAExtractor] Processing ${chunks.length} chunks with LLM`);

    const allQAs: QA[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkQAs = await this.processChunkWithRetry(chunk, i + 1, chunks.length);
      allQAs.push(...chunkQAs);

      if (i < chunks.length - 1) {
        await delay(llmProcessingConfig.chunkDelayMs);
      }
    }
    
    // Update stats directly here as this method is part of the class
    this.stats.llmQAs += allQAs.length; // Accumulate LLM QAs
    this.stats.chunksProcessed += chunks.length; // Accumulate chunks processed
    return allQAs;
  }


  /**
   * Main extraction method
   */
  async extract(text: string): Promise<ExtractionResult> {
    this.stats = { totalQAs: 0, regexQAs: 0, llmQAs: 0, chunksProcessed: 0, errors: 0 }; // Reset stats

    const startTime = Date.now();
    console.log(`[QAExtractor] Starting extraction (regex: ${this.config.useRegex}, LLM: ${this.config.useLLM})`);

    const allQAs: QA[] = [];

    if (this.config.useRegex) {
      const regexQAs = extractWithRegex(text);
      allQAs.push(...regexQAs);
      this.stats.regexQAs = regexQAs.length;
      console.log(`[QAExtractor] Extracted ${regexQAs.length} QAs using regex`);
    }

    if (this.config.useLLM && this.openai) {
      const llmQAs = await this.extractWithLLMInternal(text); // Call internal LLM extraction
      allQAs.push(...llmQAs);
      // Stats for LLM are updated within extractWithLLMInternal
      console.log(`[QAExtractor] Extracted ${this.stats.llmQAs} QAs using LLM (cumulative)`);
    }

    const finalQAs = deduplicateQAs(allQAs) as QA[];
    this.stats.totalQAs = finalQAs.length;

    const duration = Date.now() - startTime;
    console.log(`[QAExtractor] Extraction completed in ${duration}ms. Total QAs: ${finalQAs.length}`);

    return {
      qas: finalQAs,
      stats: { ...this.stats }
    };
  }
}

// User-provided ImprovedQAExtractor
export class ImprovedQAExtractor extends QAExtractor {
  
  /**
   * זיהוי סוג התוכן לפי מילות מפתח
   */
  private detectContentType(text: string): 'business' | 'educational' | 'informational' | 'mixed' {
    const businessKeywords = [
      'עסק', 'חברה', 'משרד', 'שירות', 'לקוחות', 'מחיר', 'תשלום', 'הזמנה',
      'פתיחה', 'סגירה', 'טלפון', 'כתובת', 'סניף', 'משלוח', 'מנהל', 'בעלים'
    ];
    
    const educationalKeywords = [
      'מחקר', 'עובדות', 'מידע', 'הסבר', 'תופעה', 'מאפיינים', 'מושג', 'הגדרה',
      'תהליך', 'מבנה', 'פונקציה', 'סיבה', 'השפעה', 'דוגמא', 'למשל', 'כלומר'
    ];
    
    const businessScore = businessKeywords.filter(keyword => 
      text.includes(keyword)
    ).length;
    
    const educationalScore = educationalKeywords.filter(keyword => 
      text.includes(keyword)
    ).length;
    
    if (businessScore > educationalScore * 1.5) return 'business';
    if (educationalScore > businessScore * 1.5) return 'educational';
    if (businessScore > 2 && educationalScore > 2) return 'mixed';
    return 'informational';
  }

  /**
   * בניית prompt מותאם לסוג התוכן
   */
  // Overriding buildPrompt from QAExtractor
  protected buildAdaptivePrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
    const contentType = this.detectContentType(chunk);
    
    let baseInstructions = '';
    let questionExamples = '';
    
    switch (contentType) {
      case 'business':
        baseInstructions = 'נתח את הטקסט הבא והפק שאלות ותשובות שימושיות ללקוח פוטנציאלי של העסק.';
        questionExamples = `דוגמאות לשאלות מתאימות:
- מה הכתובת?
- מהן שעות הפעילות?
- איך ניתן ליצור קשר?
- אילו שירותים מוצעים?
- מהם המחירים?`;
        break;
        
      case 'educational':
        baseInstructions = 'נתח את הטקסט הבא והפק שאלות ותשובות שימושיות למי שרוצה ללמוד על הנושא.';
        questionExamples = `דוגמאות לשאלות מתאימות:
- מה המאפיינים העיקריים?
- איך זה עובד?
- מה ההבדל בין...?
- מדוע קורה...?
- איפה ניתן למצוא...?
- מהי ההשפעה של...?`;
        break;
        
      case 'informational':
        baseInstructions = 'נתח את הטקסט הבא והפק שאלות ותשובות שימושיות למי שמחפש מידע על הנושא.';
        questionExamples = `דוגמאות לשאלות מתאימות:
- מה זה...?
- איך...?
- מתי...?
- איפה...?
- למה...?
- כמה...?`;
        break;
        
      case 'mixed':
        baseInstructions = 'נתח את הטקסט הבא והפק שאלות ותשובות מתאימות לסוג התוכן (עסקי או מידעי).';
        questionExamples = `התאם את השאלות לתוכן:
- עבור מידע עסקי: כתובת, טלפון, שעות, מחירים
- עבור מידע כללי: הסברים, מאפיינים, עובדות`;
        break;
    }

    return `${baseInstructions}

${questionExamples}

דרישות:
- החזר JSON תקין: [{"question": "שאלה", "answer": "תשובה"}]
- השתמש רק במידע שמופיע בטקסט
- ענה בעברית בלבד
- אל תכלול שאלות ללא תשובה ברורה
- **אל תיצור שאלות עסקיות (כמו "שעות פעילות" או "שירותים") לתוכן מידעי/עיוני**
- התמקד בשאלות שרלוונטיות לסוג התוכן

קטע ${chunkIndex}/${totalChunks}:
---
${chunk}
---

JSON:`;
  }

  // Override buildPrompt to use buildAdaptivePrompt
  protected override buildPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
    return this.buildAdaptivePrompt(chunk, chunkIndex, totalChunks);
  }
  
  /**
   * עיבוד chunk עם prompt מותאם
   */
  // Overriding processChunk from QAExtractor
  protected async processChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<QA[]> {
    if (!this.openai) return [];
    const prompt = this.buildAdaptivePrompt(chunk, chunkIndex, totalChunks); // Uses the adaptive prompt
    
    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `אתה עוזר מומחה שמחלץ שאלות ותשובות רלוונטיות מטקסט בעברית. 
אתה מזהה את סוג התוכן ויוצר שאלות מתאימות:
- תוכן עסקי: שאלות על שירותים, מחירים, קשר
- תוכן מידעי/עיוני: שאלות על עובדות, הסברים, מאפיינים
- אל תערבב בין הסוגים!
החזר תמיד JSON תקין בפורמט מערך של אובייקטים.`
        },
        { role: 'user', content: prompt }
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const rawResponse = completion.choices[0]?.message?.content || '';
    return this.parseResponse(rawResponse, chunkIndex); // Uses base class parseResponse
  }

  /**
   * סינון שאלות לא רלוונטיות
   */
  private filterIrrelevantQuestions(qas: QA[], originalText: string): QA[] {
    const contentType = this.detectContentType(originalText);
    
    if (contentType === 'educational' || contentType === 'informational') {
      const businessQuestions = [
        'שעות פעילות', 'שעות פתיחה', 'שירותים', 'מחיר', 'עלות', 'תשלום',
        'הזמנה', 'טלפון', 'כתובת', 'איך מגיעים', 'משלוח', 'מנהל', 'בעלים'
      ];
      
      return qas.filter(qa => {
        const questionLower = qa.question.toLowerCase();
        return !businessQuestions.some(businessTerm => 
          questionLower.includes(businessTerm)
        );
      });
    }
    
    return qas;
  }

  /**
   * מתוד עיקרי מעודכן
   */
  // Overriding extract from QAExtractor
  async extract(text: string): Promise<ExtractionResult> {
    // Call the base class extract method, but it will use the overridden
    // processChunk (and thus buildAdaptivePrompt) due to polymorphism.
    const result = await super.extract(text); 
    
    const filteredQAs = this.filterIrrelevantQuestions(result.qas, text);
    
    const updatedStats = {
      ...result.stats,
      totalQAs: filteredQAs.length,
      llmQAs: filteredQAs.filter(qa => qa.source === 'llm').length 
                // Recalculate llmQAs based on filtered list if some LLM QAs were removed
    };
    
    console.log(`[ImprovedQAExtractor] Filtered ${result.qas.length - filteredQAs.length} irrelevant questions`);
    
    return {
      qas: filteredQAs,
      stats: updatedStats
    };
  }
}


// Main function to be kept in this file (example)
// Updated to allow selection of extractor type, defaulting to ImprovedQAExtractor
export async function preprocessWebsiteContent(
  content: string, 
  config?: Partial<ExtractionConfig>,
  useImprovedExtractor: boolean = true // New parameter
): Promise<ExtractionResult> {
  const extractor = useImprovedExtractor 
    ? new ImprovedQAExtractor(config) 
    : new QAExtractor(config);
  return extractor.extract(content);
}


// Convenience functions for backward compatibility (can be removed or updated based on project needs)
// These will now use ImprovedQAExtractor by default if not specified otherwise
export async function extractQAFromText(text: string): Promise<QA[]> {
  const extractor = new ImprovedQAExtractor({ useRegex: true, useLLM: false });
  const result = await extractor.extract(text);
  return result.qas;
}

export async function extractQAFromTextWithLLM(text: string): Promise<QA[]> {
  const extractor = new ImprovedQAExtractor(); 
  const result = await extractor.extract(text);
  return result.qas;
}
