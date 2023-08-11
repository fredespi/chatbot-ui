import { IconCheck, IconAlertTriangle, IconX } from '@tabler/icons-react';
import {FC, useEffect, useState} from 'react';

import { useTranslation } from 'next-i18next';

import { SidebarButton } from '@/components/Sidebar/SidebarButton';
import {useSession} from "next-auth/react";

interface Props {
  onClearIndex: () => void;
}

export const ClearIndex: FC<Props> = () => {
  const { data: session } = useSession()
  const [indexIsDeleting, setIndexIsDeleting] = useState(false);
  const [indexDeletedSuccess, setIndexDeletedSuccess] = useState(false);

  let emailAddress: string | null | undefined = ""
  if (session) {
    emailAddress = session?.user?.email
  }
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  const { t } = useTranslation('sidebar');

    const handleDeleteIndex = async () => {
    try {
      const body = {
        "filter": {
          "author": emailAddress
        }
      }
      const response = await fetch('/api/crud', {
        method: 'DELETE',
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setIndexIsDeleting(false)
        setIndexDeletedSuccess(true)
      } else {
        setIndexIsDeleting(false)
        setIndexDeletedSuccess(false)
        alert('Deleting index failed');
        console.log('Deleting index failed')
      }
    } catch (error) {
      console.error('Failed to save files', error);
    } finally {
      // After successful upload, reset the input field
      // resetFileUpload(event)
    }
  };

  const handleClearIndex = async () => {
    console.log('Clearing index...');
    await handleDeleteIndex()
    setIsConfirming(false);
  };

  useEffect(() => {
    if (!indexIsDeleting && indexDeletedSuccess) {
      setTimeout(() => {
        alert('Index deleted');
      }, 10);
      console.log('Index deleted')
      setIndexDeletedSuccess(false)
    }
  }, [indexIsDeleting, indexDeletedSuccess]);

  return isConfirming ? (
    <div className="flex w-full cursor-pointer items-center rounded-lg py-3 px-3 hover:bg-gray-500/10">
      <IconAlertTriangle size={18} />

      <div className="ml-3 flex-1 text-left text-[12.5px] leading-3 text-white">
        {t('Are you sure?')}
      </div>

      <div className="flex w-[40px]">
        <IconCheck
          className="ml-auto mr-1 min-w-[20px] text-neutral-400 hover:text-neutral-100"
          size={18}
          onClick={(e) => {
            e.stopPropagation();
            handleClearIndex();
          }}
        />

        <IconX
          className="ml-auto min-w-[20px] text-neutral-400 hover:text-neutral-100"
          size={18}
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(false);
          }}
        />
      </div>
    </div>
  ) : (
    <SidebarButton
      text={'Clear personal index'}
      icon={<IconAlertTriangle size={18} />}
      onClick={() => setIsConfirming(true)}
    />
  );
};
