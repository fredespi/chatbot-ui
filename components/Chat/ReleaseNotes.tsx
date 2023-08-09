import { FC, useContext, useState } from 'react';

import { useTranslation } from 'next-i18next';

import HomeContext from '@/pages/api/home/home.context';

interface Props {
  label: string;
}

export const ReleaseNotes: FC<Props> = ({
  label,
}) => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-col">
      <label className="mb-2 text-left text-neutral-700 dark:text-neutral-400">
        {label}
      </label>
      <span className="text-[12px] text-black/50 dark:text-white/50 text-sm">
        <ul className="list-disc list-inside">
          <li>2023-08-09: Streaming responses</li>
          <li>2023-08-08:
            <ul className="pl-5 list-disc list-inside">
              <li>Access to Silo&apos;s Llama-2-7b-chat-hf installation</li>
              <li>Choose models from OpenAI or Silo AI for each conversation</li>
            </ul>
          </li>
          <li>2023-08-04: Private document collection for each user</li>
          <li>2023-07-30: URLs pasted in the message are scraped and saved to a vector DB to provide the context</li>
        </ul>
      </span>
    </div>
  );
};
