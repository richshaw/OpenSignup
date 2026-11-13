import { describe, expect, it } from 'vitest';
import { type Catalog, checkCatalogs, completeness } from './catalog-check';

/** English, and a Swedish translation of everything participants read. */
const EN = {
  common: { footer: { help: 'Help' } },
  participant: {
    spots: '{count, plural, one {# spot} other {# spots}}',
    guide: 'Read <link>the guide</link>',
    status: '{status, select, open {Open} closed {Closed} other {Unknown}}',
    when: 'On {date, date, short}',
  },
  organizer: { title: 'Your signups' },
} satisfies Catalog;

const SV = {
  common: { footer: { help: 'Hjälp' } },
  participant: {
    spots: '{count, plural, one {en plats} other {# platser}}',
    guide: 'Läs <link>guiden</link>',
    status: '{status, select, open {Öppen} closed {Stängd} other {Okänd}}',
    when: 'Den {date, date, short}',
  },
} satisfies Catalog;

const SHIPPED = { participant: ['en', 'sv'], organizer: ['en'], site: ['en'] } as const;
const EVERY_KEY = new Set([
  'common.footer.help',
  'participant.spots',
  'participant.guide',
  'participant.status',
  'participant.when',
  'organizer.title',
]);

function check({
  en = EN,
  sv = SV,
  used = EVERY_KEY,
}: { en?: Catalog; sv?: Catalog; used?: ReadonlySet<string> } = {}) {
  return checkCatalogs({ catalogs: { en, sv }, shipped: SHIPPED, used });
}

/** SV with one participant message replaced. */
const svWith = (key: keyof typeof SV.participant, message: unknown) =>
  ({ ...SV, participant: { ...SV.participant, [key]: message } }) as Catalog;

describe('checkCatalogs', () => {
  it('passes catalogs that are complete for where they ship, and match English', () => {
    // Swedish has no organizer text, and isn't shipped to organizers.
    expect(check()).toEqual([]);
  });

  it('fails a key missing from a language shipped to an audience that reads it', () => {
    const { guide: _, ...participant } = SV.participant;
    expect(check({ sv: { ...SV, participant } })).toEqual([
      'sv participant.guide: missing, but sv is in SHIPPED.participant',
    ]);
  });

  it("knows how complete a language is that isn't shipped, without failing it", () => {
    const de = { common: { footer: { help: 'Hilfe' } } };
    expect(checkCatalogs({ catalogs: { en: EN, de }, shipped: SHIPPED, used: EVERY_KEY })).toEqual(
      [],
    );
    expect(completeness(EN, de)).toEqual({
      common: { total: 1, missing: [] },
      participant: {
        total: 4,
        missing: [
          'participant.spots',
          'participant.guide',
          'participant.status',
          'participant.when',
        ],
      },
      organizer: { total: 1, missing: ['organizer.title'] },
    });
  });

  it("fails a message that doesn't compile, in English or a translation", () => {
    expect(check({ sv: svWith('when', 'Den {date, date, short') })).toEqual([
      "sv participant.when: doesn't compile (EXPECT_ARGUMENT_CLOSING_BRACE)",
    ]);
    expect(check({ en: { ...EN, organizer: { title: 'Your <b>signups</i>' } } })).toEqual([
      "en organizer.title: doesn't compile (UNMATCHED_CLOSING_TAG)",
    ]);
  });

  it('fails a translation that drops a placeholder, or adds one', () => {
    expect(check({ sv: svWith('when', 'Den {datum, date, short}') })).toEqual([
      'sv participant.when: drops {date}',
      "sv participant.when: has {datum}, which English doesn't",
    ]);
  });

  it('fails a translation that renames a tag', () => {
    expect(check({ sv: svWith('guide', 'Läs <länk>guiden</länk>') })).toEqual([
      'sv participant.guide: drops <link>',
      "sv participant.guide: has <länk>, which English doesn't",
    ]);
  });

  it('fails a placeholder that takes a different kind of value than in English', () => {
    expect(check({ sv: svWith('when', 'Den {date}') })).toEqual([
      'sv participant.when: {date} is text here but a date in English',
    ]);
    // A number can be shown as plain text: some languages need no plural.
    expect(check({ sv: svWith('spots', '{count} platser') })).toEqual([]);
  });

  it("fails a select whose branches aren't English's", () => {
    const translated = '{status, select, öppen {Öppen} stängd {Stängd} other {Okänd}}';
    expect(check({ sv: svWith('status', translated) })).toEqual([
      'sv participant.status: {status, select} has branches öppen, stängd, other here but open, closed, other in English',
    ]);
  });

  it('fails an English message nothing uses', () => {
    const used = new Set([...EVERY_KEY].filter((key) => key !== 'participant.when'));
    expect(check({ used })).toEqual([
      'en participant.when: nothing in src/ uses it; delete it from every catalog',
    ]);
  });

  it('fails a translated key English lacks, and a value that is not a message', () => {
    expect(check({ sv: { ...svWith('spots', 3), extra: { old: 'Gammal' } } })).toEqual([
      'sv participant.spots: not a message or a section of messages',
      'sv extra.old: not in en.json; delete it',
      'sv participant.spots: missing, but sv is in SHIPPED.participant',
    ]);
  });

  it('fails a namespace no audience reads', () => {
    expect(
      check({
        en: { ...EN, admin: { title: 'Admin' } },
        used: new Set([...EVERY_KEY, 'admin.title']),
      }),
    ).toEqual([
      'en admin: no audience reads this namespace; add it to AUDIENCE_NAMESPACES in src/i18n/config.ts',
    ]);
  });
});
