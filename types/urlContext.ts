import { ChatBody, Message } from './chat';

export interface UrlContextBody extends ChatBody {
}

export interface ContextSource {
  link: string;
  text: string;
  file: Blob | '';
}
