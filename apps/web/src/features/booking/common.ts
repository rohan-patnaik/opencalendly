import type { BookingQuestion, PublicBookingActionLinks } from '@opencalendly/shared';

export const buildInitialAnswers = (
  questions: BookingQuestion[],
): Record<string, string> => {
  return questions.reduce<Record<string, string>>((accumulator, question) => {
    accumulator[question.id] = '';
    return accumulator;
  }, {});
};

export const readableLocation = (locationType: string, locationValue: string | null): string => {
  if (locationValue && locationValue.trim().length > 0) {
    return locationValue;
  }
  return locationType.replaceAll('_', ' ');
};

export const toAnsweredQuestions = (answers: Record<string, string>): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(answers).filter((entry) => entry[1].trim().length > 0),
  );
};

export const toActionLinks = (
  actions: PublicBookingActionLinks | undefined,
): {
  cancelPageUrl?: string;
  reschedulePageUrl?: string;
} | null => {
  const cancelPageUrl = actions?.cancel?.pageUrl;
  const reschedulePageUrl = actions?.reschedule?.pageUrl;

  if (!cancelPageUrl && !reschedulePageUrl) {
    return null;
  }

  return {
    ...(cancelPageUrl ? { cancelPageUrl } : {}),
    ...(reschedulePageUrl ? { reschedulePageUrl } : {}),
  };
};
