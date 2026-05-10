import type { FieldType } from '@/schemas/slot-fields';

export type FieldEditorErrors = {
  name?: string;
  choices?: string[];
};

const NAME_MAX = 80;
const CHOICE_MAX = 60;
const CHOICES_MAX = 20;

export function validate(
  name: string,
  fieldType: FieldType,
  choicesText: string,
): FieldEditorErrors {
  const errors: FieldEditorErrors = {};

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    errors.name = 'Name is required.';
  } else if (trimmedName.length > NAME_MAX) {
    errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  }

  if (fieldType === 'enum') {
    const nonEmpty = choicesText
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (nonEmpty.length === 0) {
      errors.choices = ['Add at least one choice.'];
    } else {
      const choiceErrors: string[] = [];
      nonEmpty.forEach((choice, idx) => {
        if (choice.length > CHOICE_MAX) {
          choiceErrors.push(
            `Choice ${idx + 1} must be ${CHOICE_MAX} characters or fewer.`,
          );
        }
      });
      if (nonEmpty.length > CHOICES_MAX) {
        choiceErrors.push(`At most ${CHOICES_MAX} choices allowed.`);
      }
      if (choiceErrors.length > 0) {
        errors.choices = choiceErrors;
      }
    }
  }

  return errors;
}
