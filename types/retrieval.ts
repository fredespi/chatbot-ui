import { ChatBody, Message } from './chat';

export interface OpenaiRetrievalBody extends ChatBody {
  openaiRetrievalBearerToken: string;
}

export interface OpenaiRetrievalResponse {
  message: Message;
}

export interface OpenaiRetrievalSource {
  sourceId: string;
  url: string;
  author: string;
  createdAt: string;
  text: string;
}

export interface OpenaiRetrievalDocument {
  id: string;
  text: string;
  metadata: {
    source: string;
    source_id: string;
    url: string;
    created_at: string;
    author: string;
  }
}