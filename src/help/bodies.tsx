import type { ComponentType } from 'react';
import type { HelpSlug } from './articles';
import {
  CreateAndPublishASignup,
  UI as createAndPublishUi,
} from './articles/create-and-publish-a-signup';
import {
  ConnectAnAiAssistant,
  UI as connectAnAiAssistantUi,
} from './articles/connect-an-ai-assistant';

export interface HelpBody {
  Body: ComponentType;
  /** The on-screen names the article may print in bold; see `Ui`. */
  ui: Readonly<Record<string, string>>;
}

export const HELP_BODIES: Record<HelpSlug, HelpBody> = {
  'create-and-publish-a-signup': { Body: CreateAndPublishASignup, ui: createAndPublishUi },
  'connect-an-ai-assistant': { Body: ConnectAnAiAssistant, ui: connectAnAiAssistantUi },
};
