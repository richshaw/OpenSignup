import { afterEach, describe, expect, it } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs', () => {
  it('renders a minimal event with required fields', () => {
    const ics = buildIcs({
      uid: 'com_abc@opensignup.org',
      title: 'Saturday snack',
      start: new Date('2026-05-02T15:00:00Z'),
      end: new Date('2026-05-02T16:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('UID:com_abc@opensignup.org');
    expect(ics).toContain('SUMMARY:Saturday snack');
    const lines = ics.split('\r\n');
    expect(lines).toContain('DTSTART:20260502T150000');
    expect(lines).toContain('DTEND:20260502T160000');
    expect(lines).toContain('DTSTAMP:20260430T120000Z');
  });

  it('defaults end to start + 1 hour when not provided', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    const lines = ics.split('\r\n');
    expect(lines).toContain('DTSTART:20260502T150000');
    expect(lines).toContain('DTEND:20260502T160000');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text fields', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Snack; Day, fun\\time',
      description: 'line1\nline2',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).toContain('SUMMARY:Snack\\; Day\\, fun\\\\time');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });

  it('escapes carriage returns so they cannot forge ICS lines', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup\r\nSUMMARY:Injected',
      description: 'old-mac\rline',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    // CRLF, lone CR, and lone LF all collapse to a single escaped newline.
    // Assert the structural invariant: exactly one physical SUMMARY line, equal
    // to the escaped value — no forged SUMMARY line slips through.
    const summaryLines = ics.split('\r\n').filter((l) => l.startsWith('SUMMARY:'));
    expect(summaryLines).toEqual(['SUMMARY:Pickup\\nSUMMARY:Injected']);
    expect(ics).toContain('DESCRIPTION:old-mac\\nline');
  });

  it('strips line breaks from structural UID and URL fields', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org\r\nUID:forged',
      url: 'https://opensignup.org/a\r\nATTENDEE:forged',
      title: 'Pickup',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    const lines = ics.split('\r\n');
    expect(lines.filter((l) => l.startsWith('UID:'))).toEqual(['UID:com_x@opensignup.orgUID:forged']);
    expect(lines.filter((l) => l.startsWith('URL:'))).toEqual([
      'URL:https://opensignup.org/aATTENDEE:forged',
    ]);
    expect(lines).not.toContain('ATTENDEE:forged');
  });

  it('uses CRLF line endings', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it('omits DESCRIPTION/LOCATION/URL when not provided', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('URL');
  });

  it('folds lines longer than 75 octets per RFC 5545', () => {
    const longDescription = 'x'.repeat(200);
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      description: longDescription,
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    for (const physical of ics.split('\r\n')) {
      expect(Buffer.byteLength(physical, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(ics).toMatch(/\r\n /);
  });

  it('does not fold lines that fit under 75 octets', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Short',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).not.toMatch(/\r\n /);
  });

  it('includes optional URL and LOCATION', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      url: 'https://opensignup.org/s/team/c/com_x?token=abc',
      location: 'Main gym',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).toContain('URL:https://opensignup.org/s/team/c/com_x?token=abc');
    expect(ics).toContain('LOCATION:Main gym');
  });

  describe('all-day events', () => {
    it('exports VALUE=DATE with an exclusive next-day end instead of a timed noon event', () => {
      // A date-only slot is stored at 12:00Z. As a timed event that would be a
      // noon appointment nobody asked for; as an all-day event it is the day.
      const ics = buildIcs({
        uid: 'com_x@opensignup.org',
        title: 'Bake sale',
        start: new Date('2026-05-02T12:00:00Z'),
        allDay: true,
        now: new Date('2026-04-30T12:00:00Z'),
      });
      const lines = ics.split('\r\n');
      expect(lines).toContain('DTSTART;VALUE=DATE:20260502');
      expect(lines).toContain('DTEND;VALUE=DATE:20260503');
      const when = lines.filter((l) => l.startsWith('DTSTART') || l.startsWith('DTEND'));
      expect(when).toHaveLength(2);
      expect(ics).not.toContain('DTSTART:');
      // DTSTAMP is still an instant.
      expect(ics).toContain('DTSTAMP:20260430T120000Z');
    });

    it('rolls the end date over a month and a year boundary', () => {
      const ics = buildIcs({
        uid: 'com_x@opensignup.org',
        title: 'New Year',
        start: new Date('2026-12-31T12:00:00Z'),
        allDay: true,
        now: new Date('2026-04-30T12:00:00Z'),
      });
      expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
      expect(ics).toContain('DTEND;VALUE=DATE:20270101');
    });

    it('ignores an explicit end for an all-day event', () => {
      const ics = buildIcs({
        uid: 'com_x@opensignup.org',
        title: 'Bake sale',
        start: new Date('2026-05-02T12:00:00Z'),
        end: new Date('2026-05-02T13:00:00Z'),
        allDay: true,
        now: new Date('2026-04-30T12:00:00Z'),
      });
      expect(ics).toContain('DTEND;VALUE=DATE:20260503');
      expect(ics).not.toContain('DTEND:');
    });

    it('still exports a timed event when allDay is false', () => {
      const ics = buildIcs({
        uid: 'com_x@opensignup.org',
        title: 'Noon shift',
        start: new Date('2026-05-02T12:00:00Z'),
        allDay: false,
        now: new Date('2026-04-30T12:00:00Z'),
      });
      const lines = ics.split('\r\n');
      expect(lines).toContain('DTSTART:20260502T120000');
      expect(lines).toContain('DTEND:20260502T130000');
      expect(ics).not.toContain('VALUE=DATE');
    });
  });

  describe('floating times', () => {
    const originalTZ = process.env.TZ;
    afterEach(() => {
      // Assigning undefined would leave TZ set to the string "undefined".
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    });

    it('writes a timed slot with no zone, and an all-day one as dates, in any zone', () => {
      // extractSlotAt stores a 3:15 PM slot as 15:15Z. Written with a Z, it
      // showed at 7:15 AM in Los Angeles and 2:15 AM the next day in Sydney.
      // CI runs in UTC, where local and UTC getters agree, so this builds the
      // file in other zones too: reading the time with getHours() would fail.
      // Lines are compared whole because 'DTSTART:…151500' is a prefix of the
      // old '…151500Z'.
      const zones = [
        ['UTC', 15],
        ['America/Los_Angeles', 7],
        ['Australia/Sydney', 2],
      ] as const;
      for (const [tz, localHour] of zones) {
        process.env.TZ = tz;
        const start = new Date('2026-11-18T15:15:00Z');
        // The switch took effect: a local getter really would give this hour.
        expect(start.getHours()).toBe(localHour);

        const timed = buildIcs({
          uid: 'com_x@opensignup.org',
          title: 'Pickup',
          start,
          now: new Date('2026-11-01T09:30:00Z'),
        }).split('\r\n');
        expect(timed).toContain('DTSTART:20261118T151500');
        expect(timed).toContain('DTEND:20261118T161500');
        // DTSTAMP is a real instant, and RFC 5545 requires it in UTC.
        expect(timed).toContain('DTSTAMP:20261101T093000Z');

        const allDay = buildIcs({
          uid: 'com_x@opensignup.org',
          title: 'Bake sale',
          start: new Date('2026-11-18T12:00:00Z'),
          allDay: true,
          now: new Date('2026-11-01T09:30:00Z'),
        }).split('\r\n');
        expect(allDay).toContain('DTSTART;VALUE=DATE:20261118');
        expect(allDay).toContain('DTEND;VALUE=DATE:20261119');
      }
    });
  });
});
