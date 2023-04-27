import { KeyValuePair } from './data';

export interface Plugin {
  id: PluginID;
  name: PluginName;
  requiredKeys: KeyValuePair[];
}

export interface PluginKey {
  pluginId: PluginID;
  requiredKeys: KeyValuePair[];
}

export enum PluginID {
  GOOGLE_SEARCH = 'google-search',
  OPENAI_RETRIEVAL = 'openai-retrieval'
}

export enum PluginName {
  GOOGLE_SEARCH = 'Google Search',
  OPENAI_RETRIEVAL = 'OpenAI Retrieval'
}

export const Plugins: Record<PluginID, Plugin> = {
  [PluginID.GOOGLE_SEARCH]: {
    id: PluginID.GOOGLE_SEARCH,
    name: PluginName.GOOGLE_SEARCH,
    requiredKeys: [
      {
        key: 'GOOGLE_API_KEY',
        value: '',
      },
      {
        key: 'GOOGLE_CSE_ID',
        value: '',
      },
    ],
  },
  [PluginID.OPENAI_RETRIEVAL]: {
    id: PluginID.OPENAI_RETRIEVAL,
    name: PluginName.OPENAI_RETRIEVAL,
    requiredKeys: [
      {
        key: 'OPENAI_RETRIEVAL_KEY',
        value: '',
      },
    ],
  }
};

export const PluginList = Object.values(Plugins);
