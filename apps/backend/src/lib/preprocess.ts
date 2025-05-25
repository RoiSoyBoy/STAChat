import OpenAI from "openai";
import { chunkText } from 'shared/chunkText';

export interface QA {
  question: string;
  answer: string;
  source: 'regex' | 'llm';
  confidence?: number;
}

export interface ExtractionConfig {
  useRegex: boolean;
  useLLM: boolean;
  maxChunkSize: number;
  chunkDelayMs: number;
  rateLimitDelayMs: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
}

export interface ExtractionResult {
  qas: QA[];
  stats: {
    totalQAs: number;
    regexQAs: number;
    llmQAs: number;
    chunksProcessed: number;
    errors: number;
  };
}

// Structured regex patterns for better maintainability
const REGEX_PATTERNS = {
  // Contact Information
  address: {
    pattern: /כתובת[:\s]+([^\n]+)/gi,
    question: 'מה הכתובת?'
  },
  phone: {
    pattern: /טל[׳']?[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה הטלפון?'
  },
  fax: {
    pattern: /פקס[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה מספר הפקס?'
  },
  whatsapp: {
    pattern: /וואטסאפ[:\s]+([0-9\-\s()]+)/gi,
    question: 'מה מספר הוואטסאפ?'
  },
  email: {
    pattern: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    question: 'מה כתובת המייל?'
  },
  website: {
    pattern: /(https?:\/\/[\w\.-]+\.[a-z]{2,}(?:\/[\w\-\/?=&#%]*)?)/gi,
    question: 'מה האתר של העסק?'
  },

  // Business Hours & Operations
  hours: {
    pattern: /שעות פתיחה[:\s]+([^\n]+)/gi,
    question: 'מהן שעות הפתיחה?'
  },
  deliveryAreas: {
    pattern: /אזור(?:י)? משלוח[:\s]+([^\n]+)/gi,
    question: 'לאן ניתן להזמין משלוח?'
  },
  serviceArea: {
    pattern: /אזור(?:י)? שירות[:\s]+([^\n]+)/gi,
    question: 'מהו אזור השירות?'
  },

  // Business Details
  manager: {
    pattern: /(?:מנהל|בעלים|בעל העסק)[:\s]+([^\n]+)/gi,
    questions: ['מי המנהל?', 'מי הבעלים?']
  },
  businessNumber: {
    pattern: /(?:מספר עסק|מספר רישיון|רישיון עסק)[:\s]+([\w\d]+)/gi,
    questions: ['מה מספר העסק?', 'מה מספר הרישיון?']
  },
  founded: {
    pattern: /(?:שנת ייסוד|נוסד בשנת|הוקם בשנת)[:\s]*([\d]{4})/gi,
    question: 'מתי נוסד העסק?'
  },
  branchCount: {
    pattern: /(?:מספר סניפים|כמות סניפים)[:\s]+([\d]+)/gi,
    question: 'כמה סניפים יש לעסק?'
  },

  // Services & Features
  payment: {
    pattern: /(?:אמצעי|אפשרויות) תשלום[:\s]+([^\n]+)/gi,
    question: 'באילו אמצעי תשלום ניתן לשלם?'
  },
  kosher: {
    pattern: /כשרות[:\s]+([^\n]+)/gi,
    question: 'האם המקום כשר?'
  },
  vegan: {
    pattern: /(?:טבעוני|צמחוני)[:\s]+([^\n]+)/gi,
    question: 'האם יש מנות טבעוניות/צמחוניות?'
  },
  parking: {
    pattern: /חניה[:\s]+([^\n]+)/gi,
    question: 'האם יש חניה?'
  },
  accessibility: {
    pattern: /נגישות[:\s]+([^\n]+)/gi,
    question: 'האם המקום נגיש?'
  },
  wifi: {
    pattern: /WiFi[:\s]+([^\n]+)/gi,
    question: 'האם יש WiFi?'
  },
  reservation: {
    pattern: /(?:הזמנה מראש|הזמנות מראש)[:\s]+([^\n]+)/gi,
    question: 'האם צריך להזמין מקום מראש?'
  },
  menu: {
    pattern: /תפריט(?:ים)?[:\s]*([^\n]+)/gi,
    question: 'האם יש תפריט?'
  },
  loyaltyClub: {
    pattern: /(?:מועדון לקוחות|מועדון חברים)[:\s]+([^\n]+)/gi,
    question: 'האם יש מועדון לקוחות?'
  },
  app: {
    pattern: /אפליקציה[:\s]+([^\n]+)/gi,
    question: 'האם יש אפליקציה?'
  },
  languages: {
    pattern: /שפות[:\s]+([^\n]+)/gi,
    question: 'באילו שפות ניתן לקבל שירות?'
  },

  // General Information
  about: {
    pattern: /(?:אודות|על העסק|מי אנחנו)[:\s]+([^\n]+)/gi,
    question: 'ספר לי על העסק.'
  },
  reviews: {
    pattern: /ביקורות[:\s]+([^\n]+)/gi,
    question: 'מה חושבים על המקום?'
  },
  openDate: {
    pattern: /(?:נוסד|נפתח|הוקם)[:\s]+([^\n]+)/gi,
    question: 'מתי נפתח העסק?'
  },
  closeDate: {
    pattern: /(?:נסגר|סגור)[:\s]+([^\n]+)/gi,
    question: 'מתי נסגר העסק?'
  }
} as const;

const DEFAULT_CONFIG: ExtractionConfig = {
  useRegex: true,
  useLLM: true,
  maxChunkSize: 8000,
  chunkDelayMs: 200,
  rateLimitDelayMs: 1000,
  maxRetries: 3,
  temperature: 0.0,
  maxTokens: 2048 // Increased from 1024
};

export class QAExtractor {
  private config: ExtractionConfig;
  private openai?: OpenAI;
  private stats = {
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
   * Extract Q&A pairs using regex patterns
   */
  private extractWithRegex(text: string): QA[] {
    const qas: QA[] = [];

    // Special handling for branches
    const branchQAs = this.extractBranches(text);
    qas.push(...branchQAs);

    // Process all other patterns
    for (const [key, config] of Object.entries(REGEX_PATTERNS)) {
      const matches = this.extractPattern(text, config);
      qas.push(...matches);
    }

    this.stats.regexQAs = qas.length;
    return qas;
  }

  /**
   * Extract branch information with special logic
   */
  private extractBranches(text: string): QA[] {
    const qas: QA[] = [];
    const branchLineRegex = /^( -  \S+|[\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w]+)\s+([\u0590-\u05FF\w\s\d\-,]+)/gm;
    const branches: string[] = [];
    let brandName = '';
    let match;

    while ((match = branchLineRegex.exec(text)) !== null) {
      if (!brandName) brandName = match[1].trim();
      branches.push(`${match[2].trim()}: ${match[3].trim()}`);
    }

    if (branches.length > 0 && brandName) {
      const brandVariants = [brandName];
      if (!brandName.includes('שווארמה')) {
        brandVariants.push('שווארמה ' + brandName);
      }

      for (const variant of brandVariants) {
        qas.push({
          question: `מה הם הסניפים של ${variant}?`,
          answer: branches.join('; '),
          source: 'regex',
          confidence: 0.9
        });
      }
    }

    return qas;
  }

  /**
   * Extract matches for a specific pattern configuration
   */
  private extractPattern(text: string, config: any): QA[] {
    const qas: QA[] = [];
    let match;

    while ((match = config.pattern.exec(text)) !== null) {
      const answer = match[1]?.trim();
      if (!answer) continue;

      if (config.questions) {
        // Multiple questions for the same answer
        for (const question of config.questions) {
          qas.push({
            question,
            answer,
            source: 'regex',
            confidence: 0.8
          });
        }
      } else if (config.question) {
        // Single question
        qas.push({
          question: config.question,
          answer,
          source: 'regex',
          confidence: 0.8
        });
      }
    }

    return qas;
  }

  /**
   * Extract Q&A pairs using LLM with improved error handling
   */
  private async extractWithLLM(text: string): Promise<QA[]> {
    if (!this.openai || !this.config.useLLM) {
      return [];
    }

    const chunks = chunkText(text, this.config.maxChunkSize);
    console.log(`[QAExtractor] Processing ${chunks.length} chunks with LLM`);

    const allQAs: QA[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkQAs = await this.processChunkWithRetry(chunk, i + 1, chunks.length);
      allQAs.push(...chunkQAs);

      // Add delay between chunks to respect rate limits
      if (i < chunks.length - 1) {
        await this.delay(this.config.chunkDelayMs);
      }
    }

    this.stats.llmQAs = allQAs.length;
    this.stats.chunksProcessed = chunks.length;
    return allQAs;
  }

  /**
   * Process a single chunk with retry logic
   */
  private async processChunkWithRetry(chunk: string, chunkIndex: number, totalChunks: number): Promise<QA[]> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.processChunk(chunk, chunkIndex, totalChunks);
      } catch (error: any) {
        console.error(`[QAExtractor] Attempt ${attempt}/${this.config.maxRetries} failed for chunk ${chunkIndex}:`, error.message);
        
        if (error.status === 429) {
          console.log(`[QAExtractor] Rate limit hit. Waiting ${this.config.rateLimitDelayMs}ms...`);
          await this.delay(this.config.rateLimitDelayMs);
        }

        if (attempt === this.config.maxRetries) {
          this.stats.errors++;
          console.error(`[QAExtractor] All retry attempts failed for chunk ${chunkIndex}`);
          return [];
        }

        // Exponential backoff
        await this.delay(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
      }
    }
    return [];
  }

  /**
   * Process a single chunk with the LLM
   */
  private async processChunk(chunk: string, chunkIndex: number, totalChunks: number): Promise<QA[]> {
    const prompt = this.buildPrompt(chunk, chunkIndex, totalChunks);
    
    const completion = await this.openai!.chat.completions.create({
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
    return this.parseResponse(rawResponse, chunkIndex);
  }

  /**
   * Build optimized prompt for LLM
   */
  private buildPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
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
  private parseResponse(rawResponse: string, chunkIndex: number): QA[] {
    try {
      // Find JSON array boundaries
      const firstBracket = rawResponse.indexOf('[');
      const lastBracket = rawResponse.lastIndexOf(']');

      if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
        console.warn(`[QAExtractor] No valid JSON array found in chunk ${chunkIndex} response`);
        return [];
      }

      let jsonStr = rawResponse.substring(firstBracket, lastBracket + 1);
      
      // Handle over-escaped brackets
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

      // Clean and validate Q&A pairs
      const qas: QA[] = parsed
        .filter(item => item && typeof item.question === 'string' && typeof item.answer === 'string')
        .map(item => ({
          question: this.cleanMarkdown(item.question.trim()),
          answer: this.cleanMarkdown(item.answer.trim()),
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
   * Clean markdown artifacts from text
   */
  private cleanMarkdown(text: string): string {
    return text.replace(/\\([*_~`])/g, '$1');
  }

  /**
   * Remove duplicate Q&A pairs
   */
  private deduplicateQAs(qas: QA[]): QA[] {
    const seen = new Set<string>();
    return qas.filter(qa => {
      const key = `${qa.question}|${qa.answer}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main extraction method
   */
  async extract(text: string): Promise<ExtractionResult> {
    // Reset stats
    this.stats = { totalQAs: 0, regexQAs: 0, llmQAs: 0, chunksProcessed: 0, errors: 0 };

    const startTime = Date.now();
    console.log(`[QAExtractor] Starting extraction (regex: ${this.config.useRegex}, LLM: ${this.config.useLLM})`);

    const allQAs: QA[] = [];

    // Extract with regex
    if (this.config.useRegex) {
      const regexQAs = this.extractWithRegex(text);
      allQAs.push(...regexQAs);
      console.log(`[QAExtractor] Extracted ${regexQAs.length} QAs using regex`);
    }

    // Extract with LLM
    if (this.config.useLLM) {
      const llmQAs = await this.extractWithLLM(text);
      allQAs.push(...llmQAs);
      console.log(`[QAExtractor] Extracted ${llmQAs.length} QAs using LLM`);
    }

    // Deduplicate
    const finalQAs = this.deduplicateQAs(allQAs);
    this.stats.totalQAs = finalQAs.length;

    const duration = Date.now() - startTime;
    console.log(`[QAExtractor] Extraction completed in ${duration}ms. Total QAs: ${finalQAs.length}`);

    return {
      qas: finalQAs,
      stats: { ...this.stats }
    };
  }
}

// Convenience functions for backward compatibility
export async function extractQAFromText(text: string): Promise<QA[]> {
  const extractor = new QAExtractor({ useRegex: true, useLLM: false });
  const result = await extractor.extract(text);
  return result.qas;
}

export async function extractQAFromTextWithLLM(text: string): Promise<QA[]> {
  const extractor = new QAExtractor();
  const result = await extractor.extract(text);
  return result.qas;
}
