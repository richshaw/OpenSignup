import { describe, expect, it } from 'vitest';
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
    expect(ics).toContain('DTSTART:20260502T150000Z');
    expect(ics).toContain('DTEND:20260502T160000Z');
    expect(ics).toContain('DTSTAMP:20260430T120000Z');
  });

  it('defaults end to start + 1 hour when not provided', () => {
    const ics = buildIcs({
      uid: 'com_x@opensignup.org',
      title: 'Pickup',
      start: new Date('2026-05-02T15:00:00Z'),
      now: new Date('2026-04-30T12:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20260502T150000Z');
    expect(ics).toContain('DTEND:20260502T160000Z');
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
});
