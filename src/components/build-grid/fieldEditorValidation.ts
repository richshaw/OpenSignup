import {
  CHOICE_MAX_LENGTH,
  LABEL_MAX_LENGTH,
  MAX_CHOICES,
  type FieldType,
} from '@/schemas/slot-fields';

export type FieldEditorErrors = {
  name?: string;
  choices?: string[];
};

export function validate(
  name: string,
  fieldType: FieldType,
  choicesText: string,
): FieldEditorErrors {
  const errors: FieldEditorErrors = {};

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    errors.name = 'Name is required.';
  } else if (trimmedName.length > LABEL_MAX_LENGTH) {
    errors.name = `Name must be ${LABEL_MAX_LENGTH} characters or fewer.`;
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
        if (choice.length > CHOICE_MAX_LENGTH) {
          choiceErrors.push(
            `Choice ${idx + 1} must be ${CHOICE_MAX_LENGTH} characters or fewer.`,
          );
        }
      });
      if (nonEmpty.length > MAX_CHOICES) {
        choiceErrors.push(`At most ${MAX_CHOICES} choices allowed.`);
      }
      if (choiceErrors.length > 0) {
        errors.choices = choiceErrors;
      }
    }
  }

  return errors;
}
