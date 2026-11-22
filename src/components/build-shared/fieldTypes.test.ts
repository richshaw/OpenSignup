import { describe, it, expect } from 'vitest';
import { fieldValueControl } from './fieldTypes';

describe('fieldValueControl', () => {
  it("offers a List field's choices", () => {
    expect(fieldValueControl({ fieldType: 'enum', choices: ['Cups', 'Plates'] })).toEqual({
      kind: 'enum',
      choices: ['Cups', 'Plates'],
    });
  });

  it('offers the time list for a Time field', () => {
    expect(fieldValueControl({ fieldType: 'time' })).toEqual({ kind: 'time' });
  });

  it('types a Number field into a number input', () => {
    expect(fieldValueControl({ fieldType: 'number' })).toMatchObject({
      kind: 'input',
      fieldType: 'number',
      input: { type: 'number' },
    });
  });

  it('starts a Date field where the services do', () => {
    expect(fieldValueControl({ fieldType: 'date' })).toMatchObject({
      kind: 'input',
      fieldType: 'date',
      input: { type: 'date', min: '1900-01-01' },
    });
  });

  it('holds a Text field to its length', () => {
    expect(fieldValueControl({ fieldType: 'text', maxLength: 40 })).toMatchObject({
      kind: 'input',
      fieldType: 'text',
      input: { type: 'text', maxLength: 40 },
    });
  });
});
