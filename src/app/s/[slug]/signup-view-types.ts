import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SlotStatus } from '@/schemas/slots';

export interface OwnCommitment {
  slotId: string;
  editUrl: string;
  participantName: string;
}

export interface SignupViewSlot {
  id: string;
  ref: string;
  values: Record<string, unknown>;
  slotAt: string | null;
  /**
   * Whether `slotAt` carries a time someone entered. False when `slotAt` is
   * null, and for a date-only slot, whose `slotAt` is the noon-UTC anchor (see
   * `extractSlotAt`), not a time of day. Decided on the server by
   * `slotTimeOfDay`, the rule that built `slotAt`.
   */
  hasTime: boolean;
  capacity: number | null;
  status: SlotStatus;
  committed: number;
}

export interface SignupViewField {
  ref: string;
  label: string;
  fieldType: SlotFieldDefinition['fieldType'];
}
