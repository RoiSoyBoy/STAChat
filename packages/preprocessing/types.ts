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
