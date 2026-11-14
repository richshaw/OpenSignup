import { describe, expect, it } from 'vitest';
import type { SignupSummary } from '@/services/signups';
import { descriptionsLookWrittenIn, signupsLookWrittenIn } from './written-in';

/** The guess for Swedish over these titles, as the Your signups page would ask it. */
const looksSwedish = (...titles: string[]) =>
  signupsLookWrittenIn(
    'sv',
    titles.map((title) => ({ title })),
  );

describe('signupsLookWrittenIn: English signups', () => {
  it.each([
    'Bake sale',
    'Snack schedule',
    'Volunteer shifts for the spring fair',
    'Teacher appreciation week',
    'Untitled signup',
  ])('never takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(false);
  });

  // A Swedish name is spelled with Swedish letters, but the English words
  // around it say what the title is written in.
  it.each([
    'Carpool to Malmö',
    "Potluck at Åsa's",
    "Björn's farewell lunch",
    'Midsummer in Västerås',
    'Smörgåsbord potluck',
    'Åre ski trip',
    'Malmö trip',
    'Dinner with Märta Söderberg',
  ])('never takes %j, a Swedish place or person in English, for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(false);
  });

  // Words English shares with Swedish, and Swedish words inside English ones.
  it.each([
    'Fika Friday',
    'Open till noon',
    'Swedish meatball night',
    'Ochre and gold gala',
    'Attendance sheet',
    'Interview slots',
    'Vaders and Jedis costume party',
  ])('never takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(false);
  });

  it('never takes a whole list of them for Swedish', () => {
    expect(
      looksSwedish(
        'Bake sale',
        'Carpool to Malmö',
        "Potluck at Åsa's",
        'Fika Friday',
        'Open till noon',
        'Åre ski trip',
      ),
    ).toBe(false);
  });

  it('lets a lone name for a title be outweighed by the English titles beside it', () => {
    expect(looksSwedish('Malmö', 'Bake sale', 'Carpool')).toBe(false);
  });
});

describe('signupsLookWrittenIn: Swedish signups', () => {
  // Each has one of the Swedish words, which settles it on its own.
  it.each([
    'Vem tar med vad?',
    'Kaffe och bullar',
    'Fika-lista vecka 12',
    'Kiosken på lördag',
    'Gympa för barn',
    'Bakning inför julmarknaden',
    'Skjuts till matchen',
    'Kakor till loppisen',
    'Anmälan till julbordet',
  ])('takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(true);
  });

  // No listed word, but every word is spelled with å, ä or ö.
  it.each(['Städdag på förskolan', 'Föräldramöte', 'Fotbollsträning', 'Ridläger', 'Påskpyssel'])(
    'takes %j, all words with Swedish letters, for Swedish',
    (title) => {
      expect(looksSwedish(title)).toBe(true);
    },
  );

  it('matches whatever the case, and letters typed as a base and an accent', () => {
    expect(looksSwedish('VEM TAR MED VAD?')).toBe(true);
    expect(looksSwedish('STÄDDAG')).toBe(true);
    expect(looksSwedish('Städdag'.normalize('NFD'))).toBe(true);
    expect(looksSwedish('Gympa för barn'.normalize('NFD'))).toBe(true);
  });

  it('matches whole words only', () => {
    // English words that start with a listed word ("och", "att", "vad").
    expect(looksSwedish('Ochre', 'Attendance', 'Vademecum')).toBe(false);
    // "Grillkvällen" holds "kväll" but isn't it, so only its letters count.
    expect(looksSwedish('Grillkvällen i parken')).toBe(false);
  });

  // Titles alone are thin: a compound noun without å, ä or ö says nothing, so
  // these organizers are found by their browser's language or not at all.
  it('says nothing for Swedish titles without a listed word or a Swedish letter', () => {
    expect(looksSwedish('Julfest 2026')).toBe(false);
    expect(looksSwedish('Sommarfest', 'Lucia', 'Loppis')).toBe(false);
    expect(looksSwedish('Grillkväll i parken')).toBe(false);
  });
});

describe('signupsLookWrittenIn: mixed lists', () => {
  it('needs only one title with a Swedish word, however many English ones there are', () => {
    expect(
      looksSwedish('Bake sale', 'Snack schedule', 'Carpool', 'Book fair', 'Kaffe och bullar'),
    ).toBe(true);
  });

  it('needs at least half the titles when all they have is Swedish letters', () => {
    expect(looksSwedish('Föräldramöte', 'Bake sale')).toBe(true);
    expect(looksSwedish('Föräldramöte', 'Städdag', 'Bake sale')).toBe(true);
    expect(looksSwedish('Föräldramöte', 'Bake sale', 'Snack schedule')).toBe(false);
  });

  it('counts Swedish titles that say nothing as titles, so they can outweigh a weak one', () => {
    expect(looksSwedish('Föräldramöte', 'Julfest', 'Sommarfest')).toBe(false);
  });
});

describe('signupsLookWrittenIn: empty lists and untitled signups', () => {
  it('is no for no signups', () => {
    expect(looksSwedish()).toBe(false);
  });

  it('is no for titles with no words in them', () => {
    expect(looksSwedish('', '   ', '2026', '🎉🎉', '—', '#1')).toBe(false);
  });

  it("leaves titles with no words out, so they don't outweigh the ones with words", () => {
    expect(looksSwedish('', '🎉', '2026', 'Föräldramöte')).toBe(true);
    expect(looksSwedish('', '🎉', '2026', 'Bake sale')).toBe(false);
  });
});

describe('signupsLookWrittenIn: very short titles', () => {
  it('skips one-letter words, which Swedish and English both have', () => {
    expect(looksSwedish('Ö')).toBe(false);
    expect(looksSwedish('I')).toBe(false);
    expect(looksSwedish('Ö', 'Bake sale')).toBe(false);
  });

  it('reads a two- or three-letter title by the same rules as any other', () => {
    expect(looksSwedish('Ok')).toBe(false);
    expect(looksSwedish('Te')).toBe(false);
    expect(looksSwedish('Kör')).toBe(true);
    expect(looksSwedish('Två')).toBe(true);
  });
});

describe('signupsLookWrittenIn: the languages around Swedish', () => {
  // German writes ä and ö too, but most titles have ü, ß or a plain word
  // ("für", "und", "am"), and none of its words is on the Swedish list.
  it('takes German titles for Swedish only when they are one word spelled with ä or ö', () => {
    for (const title of [
      'Kuchen für das Sommerfest',
      'Mädchenfußball',
      'Grillfest am Wochenende',
      'Schöne Ferien',
      'Elternabend',
    ]) {
      expect(looksSwedish(title), title).toBe(false);
    }
    expect(looksSwedish('Brötchen')).toBe(true);
    expect(looksSwedish('Kuchen für das Sommerfest', 'Elternabend', 'Brötchen')).toBe(false);
  });

  // Danish and Norwegian write å as Swedish does, but æ and ø, which Swedish
  // never does, rule a word out, and the words the three share aren't listed.
  it('takes Danish and Norwegian titles for Swedish only when they are one word with å', () => {
    for (const title of [
      'Forældremøde',
      'Kage til sommerfesten',
      'Juleklip på skolen',
      'Fest hos Mette',
      'Dugnad på skolen',
      'Foreldremøte',
      'Kaker til basaren på lørdag',
      'Kaffe på fredag',
      // å beside æ or ø in one word: the ø or æ rules it out.
      'Påskeæg',
      'Vårløp',
    ]) {
      expect(looksSwedish(title), title).toBe(false);
    }
    expect(looksSwedish('Påskefrokost')).toBe(true);
    expect(looksSwedish('Vårfest')).toBe(true);
    expect(looksSwedish('Påskefrokost', 'Dugnad på skolen', 'Foreldremøte')).toBe(false);
  });

  // Finnish writes ä and ö with no other letters Swedish lacks, so a Finnish
  // title of such words reads like Swedish letters. Its titles often have a
  // plain word, though, and the half-the-list rule holds the rest back.
  it('takes Finnish titles for Swedish when at least half are words spelled with ä or ö', () => {
    for (const title of ['Talkoot lauantaina', 'Kahvi ja pulla', 'Isänpäivän kahvit']) {
      expect(looksSwedish(title), title).toBe(false);
    }
    expect(looksSwedish('Kesäjuhla')).toBe(true);
    expect(looksSwedish('Kesäjuhla', 'Äitienpäivä')).toBe(true);
    expect(looksSwedish('Kesäjuhla', 'Pikkujoulut', 'Talkoot lauantaina')).toBe(false);
  });
});

describe('signupsLookWrittenIn: the table', () => {
  it('never says signups look English, which has no entry: it needs no offer', () => {
    expect(signupsLookWrittenIn('en', [{ title: 'Bake sale for the spring fair' }])).toBe(false);
    expect(signupsLookWrittenIn('en', [{ title: 'Kaffe och bullar' }])).toBe(false);
  });

  it('takes the rows the Your signups page already loads', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const rows: SignupSummary[] = [
      {
        id: 'sig_1',
        slug: 'kaffe-och-bullar-abcde',
        title: 'Kaffe och bullar',
        status: 'open',
        closesAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    expect(signupsLookWrittenIn('sv', rows)).toBe(true);
  });
});

describe('descriptionsLookWrittenIn', () => {
  it('says yes for a description with one of the language’s words', () => {
    expect(
      descriptionsLookWrittenIn('sv', [
        'Bring a dish to share.',
        'Vi bakar kakor till kyrkkaffet och behöver hjälp att sälja dem.',
      ]),
    ).toBe(true);
  });

  // Synthetic descriptions, each naming a Swedish place or person.
  it.each([
    'Bring a dish to share. We meet at Åsa’s house in Västerås at noon.',
    'Carpool to Malmö for the away game: drivers leave at 9, open till we fill the cars.',
    'Fika Friday: coffee and cinnamon buns in the staff room. Smörgåsbord to follow.',
    'Sign up to help with the Midsommar party at Björn’s, with a med kit on hand.',
  ])('never takes %j, an English description, for Swedish', (description) => {
    expect(descriptionsLookWrittenIn('sv', [description])).toBe(false);
  });

  it('says nothing without a listed word, however Swedish the letters', () => {
    expect(descriptionsLookWrittenIn('sv', ['Föräldramöte', 'Städdag', 'Malmö Västerås Åre'])).toBe(
      false,
    );
  });

  it('says nothing for no descriptions, empty ones, or a language with no entry', () => {
    expect(descriptionsLookWrittenIn('sv', [])).toBe(false);
    expect(descriptionsLookWrittenIn('sv', ['', '   ', '2026'])).toBe(false);
    expect(descriptionsLookWrittenIn('en', ['Vi behöver hjälp att baka och sälja kakor.'])).toBe(
      false,
    );
  });

  it('matches whole words in any case, after NFC', () => {
    expect(descriptionsLookWrittenIn('sv', ['KAFFE OCH BULLAR'])).toBe(true);
    expect(descriptionsLookWrittenIn('sv', ['Ta med fo\u0308r alla'])).toBe(true);
    expect(descriptionsLookWrittenIn('sv', ['Ochre, attendance and Vemödalen'])).toBe(false);
  });
});
