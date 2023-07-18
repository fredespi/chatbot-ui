export interface ProcessEnv {
  OPENAI_API_KEY: string;
  OPENAI_API_HOST?: string;
  OPENAI_API_TYPE?: 'openai' | 'azure';
  OPENAI_API_VERSION?: string;
  OPENAI_ORGANIZATION?: string;
  RETRIEVAL_BEARER_KEY: string;
  RETRIEVAL_PLUGIN_URL: string;
  NEXT_PUBLIC_DEFAULT_TEMPERATURE: string;
  DEFAULT_MODEL: string;
  SAVE_CONTEXT_URLS: string;
}
