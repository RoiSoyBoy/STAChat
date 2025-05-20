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