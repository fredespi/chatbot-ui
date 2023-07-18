import { ChatBody, Message } from './chat';

export interface UrlContextBody extends ChatBody {
}

export interface UrlContextSource {
  link: string;
  text: string;
  pdf: Blob | '';
}
