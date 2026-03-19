export const resolvePostAuthRoute = (onboardingCompleted: boolean): string => {
  return onboardingCompleted ? '/organizer' : '/onboarding';
};
