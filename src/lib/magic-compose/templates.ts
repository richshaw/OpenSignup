import type { Translator } from '@/i18n/translator';

const STARTER_IDS = ['sports', 'classroom', 'community'] as const;

export interface MagicComposeStarter {
  id: (typeof STARTER_IDS)[number];
  label: string;
  blurb: string;
  /** The description it puts in the box, which the organizer can send as it is. */
  body: string;
}

/**
 * The examples Magic Compose offers to start from, in the language of `t`,
 * the organizer's. An example only fills the description box, so it reaches
 * a signup only as a description the AI drafts from, in that description's
 * language.
 */
export function starterPrompts(t: Translator<'organizer.compose.starters'>): MagicComposeStarter[] {
  return STARTER_IDS.map((id) => ({
    id,
    label: t(`${id}.label`),
    blurb: t(`${id}.blurb`),
    body: t(`${id}.body`),
  }));
}
