import { slotTimeOfDay } from '@/lib/reminder-fields';
import { requiresEmail, sendsReminders } from '@/schemas/signups';
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
  settings: unknown;
  fields: SlotFieldDefinition[];
  slots: readonly SourceSlot[];
}

/**
 * The signup's slots as the page renders them. Needs the signup's settings
 * and full field definitions, not just its slots: whether a slot has a time
 * (`hasTime`) depends on which time field pairs with the reminder date field,
 * and the view's own fields carry neither the reminder ref nor sort orders.
 */
export function toSignupViewSlots(
  signup: SourceSignup,
  committedBySlot?: Record<string, number>,
): SignupViewSlot[] {
  const settings = (signup.settings ?? {}) as { reminderFromFieldRef?: string };
  return signup.slots.map((slot) => {
    const values = (slot.values as Record<string, unknown>) ?? {};
    return {
      id: slot.id,
      ref: slot.ref,
      values,
      slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
      hasTime: slot.slotAt !== null && slotTimeOfDay(settings, signup.fields, values) !== null,
      capacity: slot.capacity,
      status: slot.status as SlotStatus,
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
 */
export function toPublicSignup(
  signup: SourceSignup & {
    slug: string;
    title: string;
    description: string | null;
    status: string;
    opensAt: Date | null;
    closesAt: Date | null;
    committedBySlot: Record<string, number>;
  },
) {
  const settings = (signup.settings ?? {}) as { groupByFieldRefs?: string[] };
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
      groupByFieldRefs: settings.groupByFieldRefs ?? [],
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
