import {useSession, getSession} from "next-auth/react"
import {signOut} from "next-auth/react"

import {IconFileExport, IconSettings, IconLogout} from '@tabler/icons-react';
import {MutableRefObject, useContext, useState} from 'react';

import {useTranslation} from 'next-i18next';

import HomeContext from '@/pages/api/home/home.context';

import {SettingDialog} from '@/components/Settings/SettingDialog';

import {Import} from '../../Settings/Import';
import {Key} from '../../Settings/Key';
import {SidebarButton} from '../../Sidebar/SidebarButton';
import ChatbarContext from '../Chatbar.context';
import {ClearConversations} from './ClearConversations';
import {ClearIndex} from './ClearIndex';
import {PluginKeys} from './PluginKeys';
import {Message} from "@/types/chat";
import {Plugin} from "@/types/plugin";

interface Props {
  saveContextUrls: boolean;
}

export const ChatbarSettings = ({
                                  saveContextUrls,
                                }: Props) => {
  const {data: session, status} = useSession()
  const {t} = useTranslation('sidebar');
  const [isSettingDialogOpen, setIsSettingDialog] = useState<boolean>(false);

  const {
    state: {
      apiKey,
      lightMode,
      serverSideApiKeyIsSet,
      serverSidePluginKeysSet,
      conversations,
    },
    dispatch: homeDispatch,
  } = useContext(HomeContext);

  const {
    handleClearConversations,
    handleClearIndex,
    handleImportConversations,
    handleExportData,
    handleApiKeyChange,
  } = useContext(ChatbarContext);

  return (
    <div className="flex flex-col items-center space-y-1 border-t border-white/20 pt-1 text-sm">
      {conversations.length > 0 ? (
        <ClearConversations onClearConversations={handleClearConversations}/>
      ) : null}

      <Import onImport={handleImportConversations}/>

      <SidebarButton
        text={t('Export data')}
        icon={<IconFileExport size={18}/>}
        onClick={() => handleExportData()}
      />

      <SidebarButton
        text={t('Settings')}
        icon={<IconSettings size={18}/>}
        onClick={() => setIsSettingDialog(true)}
      />

      {!serverSideApiKeyIsSet ? (
        <Key apiKey={apiKey} onApiKeyChange={handleApiKeyChange}/>
      ) : null}

      {/*{!serverSidePluginKeysSet ? <PluginKeys /> : null}*/}

      <SettingDialog
        open={isSettingDialogOpen}
        onClose={() => {
          setIsSettingDialog(false);
        }}
      />

      {saveContextUrls && (
        <ClearIndex onClearIndex={handleClearIndex}/>
      )}


      <SidebarButton
        text={session ? t('Sign out') + " " + session.user?.name : t('Sign in')}
        icon={<IconLogout size={18}/>}
        onClick={() => signOut({redirect: true, callbackUrl: "/"})}
      />
    </div>
  );
};
