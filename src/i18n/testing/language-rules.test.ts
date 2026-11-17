import { describe, expect, it } from 'vitest';
import { LANGUAGE_RULES } from './language-rules';

/** The Swedish rule whose reason mentions `text`. */
const swedish = (text: string) => {
  const rule = LANGUAGE_RULES.sv?.banned.find(({ reason }) => reason.includes(text));
  if (!rule) throw new Error(`no Swedish rule about ${text}`);
  return rule.pattern;
};

describe("Swedish's banned words", () => {
  it('catch ni, but not words that contain it', () => {
    const ni = swedish('never ni');
    expect(['Om ni vill', 'Ni kan', 'ni.'].filter((text) => ni.test(text))).toHaveLength(3);
    expect(['nivå', 'någonting', 'anmälningslista', 'inni'].some((text) => ni.test(text))).toBe(
      false,
    );
  });

  it('catch din plats, but not din anmälan or dina platser', () => {
    const dinPlats = swedish('din plats');
    expect(dinPlats.test('Visa eller ändra din plats')).toBe(true);
    expect(dinPlats.test('Din plats är sparad')).toBe(true);
    expect(dinPlats.test('Visa eller ändra din anmälan')).toBe(false);
    expect(dinPlats.test('dina platser')).toBe(false);
  });

  it('catch three full stops, but not an ellipsis', () => {
    const dots = swedish('ellipsis');
    expect(dots.test('Sparar...')).toBe(true);
    expect(dots.test('Sparar…')).toBe(false);
  });
});
