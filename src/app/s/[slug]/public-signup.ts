import type { CatalogLocale } from '@/i18n/config';
import { slotTimeOfDay } from '@/lib/reminder-fields';
import { slotInLockout } from '@/lib/signup-closing';
import { requiresEmail, sendsReminders, type StoredSignupSettings } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SlotStatus } from '@/schemas/slots';
import type { SignupViewSlot } from './signup-view-types';

interface SourceSlot {
  id: string;
  ref: string;
  values: unknown;
  slotAt: Date | null;
  capacity: number | null;
  status: string;
}

interface SourceSignup {
  settings: StoredSignupSettings;
  fields: SlotFieldDefinition[];
  slots: readonly SourceSlot[];
}

/**
 * The signup's slots as the page renders them. Needs the signup's settings
 * and full field definitions, not just its slots: whether a slot has a time
 * (`hasTime`) depends on which time field pairs with the reminder date field,
 * and the view's own fields carry neither the reminder ref nor sort orders.
 * A slot inside the signup's lockout before it starts (`slotInLockout`) is
 * shown closed, since the service refuses a sign-up for it.
 */
export function toSignupViewSlots(
  signup: SourceSignup,
  committedBySlot?: Record<string, number>,
  now: number = Date.now(),
): SignupViewSlot[] {
  return signup.slots.map((slot) => {
    const values = (slot.values as Record<string, unknown>) ?? {};
    return {
      id: slot.id,
      ref: slot.ref,
      values,
      slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
      hasTime:
        slot.slotAt !== null && slotTimeOfDay(signup.settings, signup.fields, values) !== null,
      capacity: slot.capacity,
      status: slotInLockout(signup.settings, slot.slotAt, now)
        ? 'closed'
        : (slot.status as SlotStatus),
      committed: committedBySlot?.[slot.id] ?? 0,
    };
  });
}

/**
 * What `GET /api/public/signups/[slug]` sends: an allow-list of what a
 * participant needs, the same things the public page shows. Anything else on
 * the row (workspace and organizer ids, organizer-only settings, timestamps)
 * stays on the server, and so does any column added later until someone puts
 * it here.
 *
 * Settings are sent as they apply, defaults filled in, so `settings.locale` is
 * `locale`: the language the page is in, which the caller works out with
 * `signupLocale` as the page does, never the stored value. A stored language
 * that has left the list would otherwise name one that no participant gets.
 */
export function toPublicSignup(
  signup: SourceSignup & {
    slug: string;
    title: string;
    description: string;
    status: string;
    opensAt: Date | null;
    closesAt: Date | null;
    committedBySlot: Record<string, number>;
  },
  locale: CatalogLocale,
) {
  return {
    slug: signup.slug,
    title: signup.title,
    description: signup.description,
    status: signup.status,
    opensAt: signup.opensAt,
    closesAt: signup.closesAt,
    settings: {
      requireEmail: requiresEmail(signup.settings),
      sendReminders: sendsReminders(signup.settings),
      groupByFieldRefs: signup.settings.groupByFieldRefs ?? [],
      locale,
    },
    fields: signup.fields.map(({ ref, label, fieldType, config }) => ({
      ref,
      label,
      fieldType,
      config,
    })),
    slots: toSignupViewSlots(signup, signup.committedBySlot),
    committedBySlot: signup.committedBySlot,
  };
}
