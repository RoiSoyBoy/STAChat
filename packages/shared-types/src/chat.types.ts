/**
 * Represents a single message in a chat conversation.
 */
export interface ChatMessageDTO {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string; // Optional: client or server can add this
}

/**
 * Request body for the POST /api/v1/chat endpoint.
 */
export interface ChatRequestBody {
  message: string;
  history?: ChatMessageDTO[]; // Optional: previous conversation messages
  // You might add other parameters like conversationId, specific model preferences, etc.
}

/**
 * Represents a source document or citation relevant to the assistant's reply.
 */
export interface SourceDocumentDTO {
  id?: string;
  name: string;
  contentPreview?: string; // A snippet of the source content
  url?: string;
  metadata?: Record<string, any>;
}

/**
 * Response body for the POST /api/v1/chat endpoint.
 */
export interface ChatResponseBody {
  reply: string;
  conversationId?: string; // Optional: if you manage conversations
  sourceDocuments?: SourceDocumentDTO[];
  error?: string; // In case of partial success or specific non-fatal errors
}

/**
 * General error response structure for APIs.
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: any;
}
