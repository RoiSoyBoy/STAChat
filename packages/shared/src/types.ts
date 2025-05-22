export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
  clientId: string;
}

export interface ChatSettings {
  primaryColor: string;
  greeting: string;
  logoUrl?: string;
  botName: string;
  language: string;
}

export interface TrainingData {
  id: string;
  content: string;
  type: 'file' | 'url';
  timestamp: number;
  status: 'pending' | 'processed' | 'error';
}

export interface WebEmbeddingDoc {
  id: string;
  url: string;
  heading: string;
  text: string;
  embedding: number[];
  createdAt: number;
  similarity?: number; // Added similarity as it's part of the processed chunk
}

export type TrainingDataSource = {
  type: 'pdf' | 'docx' | 'txt'; // Note: This might need to align with backend capabilities
  content: string;
  filename: string;
};
