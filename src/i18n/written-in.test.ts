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
    'Snack duty — Spring season',
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
    'Picnic at Åre',
    "Björn's farewell",
    'Kräftskiva with the Andersons',
  ])('never takes %j, a Swedish place or person in English, for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(false);
  });

  // Words English shares with Swedish, which the list leaves out or counts
  // only beside a Swedish-lettered word, and Swedish words inside English ones.
  it.each([
    'Fika Friday',
    'Open till noon',
    'Med school potluck',
    'Midsommar party',
    'Glögg night',
    'Barn dance',
    'Fest committee',
    'Jul 4 parade',
    'Tack room rota',
    'AV club',
    'Under 12s match',
    'Class VI field trip',
    'Om yoga morning',
    'Cub Scout den meeting',
    'Yoga mat drive',
    'Vid crew for the recital',
    'MOT test carpool',
    'Ska band night',
    'Kan Jam tournament',
    'Du Bois book club',
    'Database schema workshop',
    'Swedish meatball night',
    'Ochre and gold gala',
    'Attendance sheet',
    'Interview slots',
    'Vaders and Jedis costume party',
  ])('never takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(false);
  });

  // The one way an ordinary English title says yes: "till" or "med" beside a
  // Swedish-lettered name. Accepted, since such an organizer is likely in
  // Sweden and a wrong yes costs one click on "Keep English", while "till"
  // is the word that finds the most Swedish titles.
  it.each(['Open till late in Malmö', 'Med kit for Åre trip'])(
    'takes %j, "till" or "med" beside a Swedish name, for Swedish',
    (title) => {
      expect(looksSwedish(title)).toBe(true);
    },
  );

  // Titles made up to hit a listed word that only looks English. Kept,
  // because det, som, ett, kaffe and sommar are common in Swedish titles.
  it.each([
    'Det. Smith retirement party',
    'Som tam dinner',
    'Ett Hem dinner',
    'Cafe Kaffe volunteers',
    'Sommar house cleanup',
  ])('takes %j, made up around a listed word, for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(true);
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
    'Städdag på förskolan',
    'Föräldramöte åk 3',
    'Kyrkkaffe söndag',
    'Julfest 2026',
  ])('takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(true);
  });

  // Titles that said no before the list took in words Danish or Norwegian
  // share, and "till" beside a Swedish-lettered word.
  it.each([
    'Fika efter gudstjänsten',
    'Kör till bortamatchen',
    'Loppis i gympasalen',
    'Sommarfest',
    'Tränare till F12',
  ])('takes %j for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(true);
  });

  // Signups that recur name their day in the plural ("on Mondays") or the
  // definite form ("the Monday"), and their weeks and evenings in the plural.
  // Each title says no without its day or count word.
  it.each([
    'Simskola måndagar',
    'Körövning tisdagar',
    'Fotboll onsdagar',
    'Bokcirkel torsdagar',
    'Fika fredagar',
    'Bakning lördagar',
    'Kyrkkaffe söndagar',
    'Fikat måndagen den 3 mars',
    'Kyrkkaffe tisdagen den 4 mars',
    'Grillkväll onsdagen',
    'Pyssel torsdagen den 6 mars',
    'Disco fredagen den 7 mars',
    'Städdag lördagen den 8 mars',
    'Gudstjänst söndagen den 9 mars',
    'Simskola fem veckor',
    'Läxhjälp tre kvällar',
  ])('takes %j, a day or count that recurs, for Swedish', (title) => {
    expect(looksSwedish(title)).toBe(true);
  });

  // No listed word, but every word is spelled with å, ä or ö.
  it.each(['Städdag', 'Föräldramöte', 'Fotbollsträning', 'Ridläger', 'Påskpyssel'])(
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
    // "Grillkvällen" holds "kvällen" but isn't it, so only its letters count.
    expect(looksSwedish('Grillkvällen i parken')).toBe(false);
  });

  // Titles alone are thin: a compound with no listed word beside a plain word
  // says nothing, and so does "med" with no Swedish-lettered word to stand
  // beside. These organizers are found by their browser's language or not at all.
  it.each(['Grillkväll i parken', 'Lussebak med scouterna', 'Julpyssel', 'Pantinsamling'])(
    'says nothing for %j',
    (title) => {
      expect(looksSwedish(title)).toBe(false);
    },
  );
});

describe('signupsLookWrittenIn: mixed lists', () => {
  it('needs only one title with a Swedish word, however many English ones there are', () => {
    expect(
      looksSwedish('Bake sale', 'Snack schedule', 'Carpool', 'Book fair', 'Kaffe och bullar'),
    ).toBe(true);
    expect(
      looksSwedish(
        'Bake sale',
        'Snack schedule',
        'Carpool',
        'Book fair',
        'Field day',
        'Teacher lunch',
        'Städdag på förskolan',
      ),
    ).toBe(true);
  });

  it('needs at least half the titles when all they have is Swedish letters', () => {
    expect(looksSwedish('Föräldramöte', 'Bake sale')).toBe(true);
    expect(looksSwedish('Föräldramöte', 'Städdag', 'Bake sale')).toBe(true);
    expect(looksSwedish('Föräldramöte', 'Bake sale', 'Snack schedule')).toBe(false);
  });

  it('counts Swedish titles that say nothing as titles, so they can outweigh a weak one', () => {
    expect(looksSwedish('Föräldramöte', 'Julpyssel', 'Pantinsamling')).toBe(false);
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

  // The words Swedish shares with Danish and Norwegian (på, hos, som, det,
  // fredag, kaffe) are listed, so a title with one says yes. Accepted: a Dane
  // or Norwegian dismisses the notice with one click.
  it('takes Danish and Norwegian titles with a word Swedish shares for Swedish', () => {
    for (const title of [
      'Juleklip på skolen',
      'Fest hos Mette',
      'Dugnad på skolen',
      'Kaker til basaren på lørdag',
      'Kaffe på fredag',
      'Påske på slottet',
    ]) {
      expect(looksSwedish(title), title).toBe(true);
    }
  });

  // Otherwise æ and ø, which Swedish never writes, rule a word out, and their
  // own words ("til", "lørdag", "sommerfesten") aren't listed.
  it('takes other Danish and Norwegian titles for Swedish only when they are one word with å', () => {
    for (const title of [
      'Forældremøde',
      'Kage til sommerfesten',
      'Foreldremøte',
      'Kjøring til kamp',
      // å beside æ or ø in one word: the ø or æ rules it out.
      'Påskeæg',
      'Vårløp',
    ]) {
      expect(looksSwedish(title), title).toBe(false);
    }
    expect(looksSwedish('Påskefrokost')).toBe(true);
    expect(looksSwedish('Vårfest')).toBe(true);
    expect(looksSwedish('Påskefrokost', 'Kage til sommerfesten', 'Foreldremøte')).toBe(false);
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
