import {
  SignupViewBody,
  type SignupViewField,
  type SignupViewSlot,
} from '@/app/s/[slug]/signup-view';
// Reads process.env.NEXT_PUBLIC_* directly, so it is safe on a statically
// prerendered page (see the rule in CLAUDE.md about getEnv in static pages).
import { INSTANCE_NAME } from '@/lib/site-config';

const FIELDS: SignupViewField[] = [
  { ref: 'date', label: 'Date', fieldType: 'date' },
  { ref: 'team', label: 'Team', fieldType: 'text' },
];

const ROWS: ReadonlyArray<{ date: string; team: string }> = [
  { date: '2026-05-17', team: 'Hawks' },
  { date: '2026-05-24', team: 'Foxes' },
  { date: '2026-05-31', team: 'Bears' },
  { date: '2026-06-07', team: 'Otters' },
  { date: '2026-06-14', team: 'Wolves' },
  { date: '2026-06-21', team: 'Lions' },
];

const SLOTS: SignupViewSlot[] = ROWS.map((row, i) => ({
  id: `example-${i + 1}`,
  ref: `example-${i + 1}`,
  values: { date: row.date, team: row.team },
  slotAt: null,
  hasTime: false,
  capacity: 2,
  status: 'open',
  committed: 0,
}));

const SIGNUP = {
  title: 'U9 Soccer Snack Duty',
  description:
    'Two families per game to bring snacks and drinks. Please ensure all snacks are nut-free.',
  status: 'open' as const,
};

export function HomeExampleCard() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-surface-sunk bg-white shadow-card">
        <div className="px-6 pt-5 text-xs text-ink-soft">
          <span className="font-semibold text-ink">{INSTANCE_NAME}</span>
        </div>
        <div className="flex flex-col gap-7 px-6 pb-6 pt-3">
          <SignupViewBody
            signup={SIGNUP}
            fields={FIELDS}
            groupByRef={null}
            slots={SLOTS}
            slug="example"
            mode="showcase"
            showStateBanner={false}
          />
        </div>
        <div className="border-t border-surface-sunk px-6 py-4 text-center text-xs text-ink-soft">
          Ad-free · Run by {INSTANCE_NAME}
        </div>
      </div>
      <span className="absolute -top-3 right-4 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-white">
        Example
      </span>
    </div>
  );
}
