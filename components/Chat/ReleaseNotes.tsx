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
        <ul>
          <li>2023-08-04: Feature: Private document collection for each user.</li>
        </ul>
      </span>
    </div>
  );
};
