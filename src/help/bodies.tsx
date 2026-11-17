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
import {
  TakeSomeoneOffASlot,
  UI as takeSomeoneOffASlotUi,
} from './articles/take-someone-off-a-slot';
import {
  CloseOrReopenASignup,
  UI as closeOrReopenASignupUi,
} from './articles/close-or-reopen-a-signup';
import { FROM_CATALOG as createAndPublishFromCatalog } from './articles/create-and-publish-a-signup.ui';
import { FROM_CATALOG as connectAnAiAssistantFromCatalog } from './articles/connect-an-ai-assistant.ui';
import { FROM_CATALOG as takeSomeoneOffASlotFromCatalog } from './articles/take-someone-off-a-slot.ui';
import { FROM_CATALOG as closeOrReopenASignupFromCatalog } from './articles/close-or-reopen-a-signup.ui';

export interface HelpBody {
  Body: ComponentType;
  /** The on-screen names the article may print in bold; see `Ui`. */
  ui: Readonly<Record<string, string>>;
  /** Where each of those names is in the English catalog, which src/help/ui-names.test.ts checks. */
  fromCatalog: Readonly<Record<string, FromCatalog | readonly FromCatalog[] | null>>;
}

/** Where a name is in the English catalog: see `FROM_CATALOG` in an article's `.ui.ts`. */
type FromCatalog = string | { key: string; values: Readonly<Record<string, string>> };

export const HELP_BODIES: Record<HelpSlug, HelpBody> = {
  'create-and-publish-a-signup': {
    Body: CreateAndPublishASignup,
    ui: createAndPublishUi,
    fromCatalog: createAndPublishFromCatalog,
  },
  'connect-an-ai-assistant': {
    Body: ConnectAnAiAssistant,
    ui: connectAnAiAssistantUi,
    fromCatalog: connectAnAiAssistantFromCatalog,
  },
  'take-someone-off-a-slot': {
    Body: TakeSomeoneOffASlot,
    ui: takeSomeoneOffASlotUi,
    fromCatalog: takeSomeoneOffASlotFromCatalog,
  },
  'close-or-reopen-a-signup': {
    Body: CloseOrReopenASignup,
    ui: closeOrReopenASignupUi,
    fromCatalog: closeOrReopenASignupFromCatalog,
  },
};
