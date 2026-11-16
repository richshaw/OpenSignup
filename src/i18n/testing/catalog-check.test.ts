import { describe, expect, it } from 'vitest';
import {
  type Catalog,
  catalogNotes,
  checkCatalogs,
  completeness,
  messagesIn,
  type TranslatedFrom,
} from './catalog-check';
import type { LanguageRules } from './language-rules';
import { markTranslated } from './translated-from';

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

/** A record that `catalog` was translated from English as it is in EN, every message of it. */
const translatedFromEN = (catalog: Catalog): TranslatedFrom =>
  Object.fromEntries(
    [...messagesIn(catalog).keys()].flatMap((key) => {
      const english = messagesIn(EN).get(key);
      return english === undefined ? [] : [[key, english]];
    }),
  );

type Input = {
  en?: Catalog;
  sv?: Catalog;
  used?: ReadonlySet<string>;
  shipped?: Readonly<Record<keyof typeof SHIPPED, readonly string[]>>;
  /** sv's record of what it was translated from: by default, English as it is in EN. */
  svFrom?: TranslatedFrom;
  /** sv's own rules: by default, none. */
  svRules?: LanguageRules;
};

const NO_RULES: LanguageRules = { sameAsEnglish: {}, banned: [] };

const inputOf = ({
  en = EN,
  sv = SV,
  used = EVERY_KEY,
  shipped = SHIPPED,
  svFrom = translatedFromEN(sv),
  svRules = NO_RULES,
}: Input) => ({
  catalogs: { en, sv },
  shipped,
  used,
  translatedFrom: { sv: svFrom },
  rules: { sv: svRules },
});

/** What the check fails on. */
const check = (input: Input = {}) => checkCatalogs(inputOf(input));

/** What it reports without failing. */
const notes = (input: Input = {}) => catalogNotes(inputOf(input));

/** Swedish with a catalog, but shipped to nobody. */
const NOT_SHIPPED = { participant: ['en'], organizer: ['en'], site: ['en'] };

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
    const input = {
      catalogs: { en: EN, de },
      shipped: SHIPPED,
      used: EVERY_KEY,
      translatedFrom: { de: { 'common.footer.help': 'Help' } },
      rules: {},
    };
    expect(checkCatalogs(input)).toEqual([]);
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

  it("fails a translation that shows a select's value as it is", () => {
    // Participants would read the code's value (`open`), not a word for it.
    expect(check({ sv: svWith('status', 'Status: {status}') })).toEqual([
      "sv participant.status: {status} isn't a select here, but is in English",
    ]);
  });

  it('fails a key with a dot in it, which next-intl would read as nesting', () => {
    expect(check({ en: { ...EN, participant: { ...EN.participant, 'a.b': 'A' } } })).toEqual([
      'en participant: the key "a.b" has a dot in it',
    ]);
    expect(check({ sv: { ...SV, participant: { ...SV.participant, 'a.b': 'A' } } })).toEqual([
      'sv participant: the key "a.b" has a dot in it',
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
  describe("against the record of the English it's translated from", () => {
    /** EN once the guide's English has changed, after SV was translated. */
    const EN_NOW = {
      ...EN,
      participant: { ...EN.participant, guide: 'Read <link>our guide</link>' },
    };
    const STALE = 'stale: its English changed after it was translated';

    it('fails a shipped language whose English changed after it was translated, until it is retranslated and marked', () => {
      const svFrom = translatedFromEN(SV);
      expect(check({ en: EN_NOW, svFrom })).toEqual([
        `sv participant.guide: ${STALE}, but sv is in SHIPPED.participant`,
      ]);

      // Retranslating isn't enough on its own: the record still says it was
      // translated from the old English.
      const retranslated = svWith('guide', 'Läs <link>vår guide</link>');
      expect(check({ en: EN_NOW, sv: retranslated, svFrom })).toEqual([
        `sv participant.guide: ${STALE}, but sv is in SHIPPED.participant`,
      ]);

      // Marking it, as mark-translated.mjs does, records the English it was translated from now.
      const marked = markTranslated(EN_NOW, retranslated, svFrom, ['participant.guide']);
      expect(check({ en: EN_NOW, sv: retranslated, svFrom: marked.record })).toEqual([]);
      expect(notes({ en: EN_NOW, sv: retranslated, svFrom: marked.record })).toEqual([]);
    });

    it("reports a stale message in a language that isn't shipped, without failing it", () => {
      const input = { en: EN_NOW, svFrom: translatedFromEN(SV), shipped: NOT_SHIPPED };
      expect(check(input)).toEqual([]);
      expect(notes(input)).toEqual([`sv participant.guide: ${STALE}`]);
    });

    it('fails a stale message only in the namespaces a language is shipped in', () => {
      const svOrganizer = { ...SV, organizer: { title: 'Dina anmälningslistor' } };
      const enNow = { ...EN, organizer: { title: 'All your signups' } };
      const input = { en: enNow, sv: svOrganizer, svFrom: translatedFromEN(svOrganizer) };
      // Swedish is shipped to participants, not organizers.
      expect(check(input)).toEqual([]);
      expect(notes(input)).toEqual([`sv organizer.title: ${STALE}`]);
    });

    it('fails a translated message with no record where the language is shipped, and reports it elsewhere', () => {
      const { 'participant.when': _, ...svFrom } = translatedFromEN(SV);
      const unrecorded = 'no record of the English it was translated from';
      expect(check({ svFrom })).toEqual([
        `sv participant.when: ${unrecorded}, but sv is in SHIPPED.participant`,
      ]);
      expect(check({ svFrom, shipped: NOT_SHIPPED })).toEqual([]);
      expect(notes({ svFrom, shipped: NOT_SHIPPED })).toEqual([
        `sv participant.when: ${unrecorded}`,
      ]);
    });

    it('fails, shipped or not, a record entry for a message English or the translation lacks', () => {
      const svFrom = {
        ...translatedFromEN(SV),
        'participant.deleted': 'Once in English',
        'organizer.title': 'Your signups',
      };
      const fix = "the translate skill's mark-translated.mjs sv drops it";
      const expected = [
        `sv participant.deleted: recorded as translated, but en.json doesn't have it; ${fix}`,
        `sv organizer.title: recorded as translated, but sv.json doesn't have it; ${fix}`,
      ];
      expect(check({ svFrom })).toEqual(expected);
      expect(check({ svFrom, shipped: NOT_SHIPPED })).toEqual(expected);
    });

    it('fails a record for a language with no translation', () => {
      const input = {
        ...inputOf({}),
        translatedFrom: { sv: translatedFromEN(SV), en: {}, de: {} },
      };
      expect(checkCatalogs(input)).toEqual([
        "en: there's a record of what en was translated from, but no en translation; delete the record",
        "de: there's a record of what de was translated from, but no de translation; delete the record",
      ]);
    });

    it('leaves a translated key English lacks to the check that says to delete it', () => {
      const sv = { ...SV, extra: { old: 'Gammal' } };
      expect(check({ sv, svFrom: translatedFromEN(SV) })).toEqual([
        'sv extra.old: not in en.json; delete it',
      ]);
    });
  });

  describe("against each language's rules", () => {
    /** The check over EN and one other language, `catalog`, that ships nowhere. */
    const checkOther = (locale: string, catalog: Catalog, rules: LanguageRules = NO_RULES) =>
      checkCatalogs({
        catalogs: { en: EN, [locale]: catalog },
        shipped: SHIPPED,
        used: EVERY_KEY,
        translatedFrom: { [locale]: translatedFromEN(catalog) },
        rules: { [locale]: rules },
      });

    it('fails a plural without a branch its language needs', () => {
      // Polish needs few and many as well as one and other.
      expect(
        checkOther('pl', {
          participant: { spots: '{count, plural, one {# miejsce} other {# miejsc}}' },
        }),
      ).toEqual([
        'pl participant.spots: {count, plural} has no few, many branch, which pl needs (it has few, many, one, other)',
      ]);
      expect(
        checkOther('pl', {
          participant: {
            spots:
              '{count, plural, one {# miejsce} few {# miejsca} many {# miejsc} other {# miejsca}}',
          },
        }),
      ).toEqual([]);
      // Swedish too, though it isn't shipped to organizers.
      expect(check({ sv: svWith('spots', '{count, plural, other {# platser}}') })).toEqual([
        'sv participant.spots: {count, plural} has no one branch, which sv needs (it has one, other)',
      ]);
    });

    it('takes =1 for one only where one holds no number but 1', () => {
      expect(
        check({ sv: svWith('spots', '{count, plural, =1 {en plats} other {# platser}}') }),
      ).toEqual([]);
      // Russian's one holds 21 and 101 too, and French's holds 0.
      const russian = '{count, plural, =1 {# место} few {# места} many {# мест} other {# места}}';
      expect(checkOther('ru', { participant: { spots: russian } })).toEqual([
        'ru participant.spots: {count, plural} has no one branch, which ru needs (it has few, many, one, other)',
      ]);
      const french = '{count, plural, =1 {# place} many {# de places} other {# places}}';
      expect(checkOther('fr', { participant: { spots: french } })).toEqual([
        'fr participant.spots: {count, plural} has no one branch, which fr needs (it has many, one, other)',
      ]);
    });

    it('fails a copy of the English, unless the language lists it or it has no letters of its own', () => {
      const sv = { ...SV, organizer: { title: 'Your signups' } };
      expect(check({ sv })).toEqual([
        'sv organizer.title: the same as English; translate it, or list it in sameAsEnglish in src/i18n/testing/language-rules.ts with why',
      ]);
      const svRules = { ...NO_RULES, sameAsEnglish: { 'organizer.title': 'a name' } };
      expect(check({ sv, svRules })).toEqual([]);

      const en = { ...EN, organizer: { title: 'Your signups', pair: '<b>{day}</b> · {times}' } };
      const used = new Set([...EVERY_KEY, 'organizer.pair']);
      const withPair = { ...SV, organizer: { pair: '<b>{day}</b> · {times}' } };
      expect(check({ en, used, sv: withPair })).toEqual([]);
    });

    it('fails a language that lists a message it has no copy of', () => {
      const svRules = { ...NO_RULES, sameAsEnglish: { 'participant.guide': 'a name' } };
      expect(check({ svRules })).toEqual([
        'sv participant.guide: listed in sameAsEnglish in src/i18n/testing/language-rules.ts, but sv.json has no copy of its English; take it off the list',
      ]);
    });

    it("fails a translation that drops the product's name", () => {
      const en = { ...EN, organizer: { title: 'Welcome to OpenSignup' } };
      expect(
        check({ en, sv: { ...SV, organizer: { title: 'Välkommen till Öppna listor' } } }),
      ).toEqual([
        `sv organizer.title: drops "OpenSignup", the product's name, which stays as it is`,
      ]);
      expect(
        check({ en, sv: { ...SV, organizer: { title: 'Välkommen till OpenSignup' } } }),
      ).toEqual([]);
    });

    it('fails a word the glossary rules out, only in the namespaces it names', () => {
      const svRules: LanguageRules = {
        sameAsEnglish: {},
        banned: [
          { pattern: /(?<!\p{L})ni(?!\p{L})/iu, glossary: 'Style: Tone', reason: 'du, never ni' },
          {
            pattern: /din plats/i,
            namespaces: ['participant'],
            glossary: 'Terms',
            reason: 'din anmälan',
          },
        ],
      };
      expect(check({ svRules, sv: svWith('guide', 'Läs <link>guiden</link> om Ni vill') })).toEqual(
        [
          'sv participant.guide: has "Ni", which the glossary rules out: du, never ni (Style: Tone)',
        ],
      );
      expect(check({ svRules, sv: svWith('guide', 'Läs <link>din plats</link>') })).toEqual([
        'sv participant.guide: has "din plats", which the glossary rules out: din anmälan (Terms)',
      ]);
      // Another namespace, a longer word, and a placeholder's name are left alone.
      const sv = { ...SV, organizer: { title: 'Din plats på nivån' } };
      expect(check({ svRules, sv })).toEqual([]);
      const en = { ...EN, organizer: { title: 'Hi {ni}' } };
      expect(check({ svRules, en, sv: { ...SV, organizer: { title: 'Hej {ni}' } } })).toEqual([]);
    });
  });
});
