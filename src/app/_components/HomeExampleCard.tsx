import {
  SignupViewBody,
  type SignupViewField,
  type SignupViewSlot,
} from '@/app/s/[slug]/signup-view';

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
      <div className="bg-white rounded-2xl border border-surface-sunk shadow-card overflow-hidden">
        <div className="text-ink-soft px-6 pt-5 text-xs">
          <span className="text-ink font-semibold">OpenSignup</span>
          {' · '}Public signup
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
        <div className="text-ink-soft border-t border-surface-sunk px-6 py-4 text-center text-xs">
          Ad-free · Run by OpenSignup
        </div>
      </div>
      <span className="bg-ink text-white absolute -top-3 right-4 rounded-full px-3 py-1.5 text-[11px] font-medium">
        Example
      </span>
    </div>
  );
}
