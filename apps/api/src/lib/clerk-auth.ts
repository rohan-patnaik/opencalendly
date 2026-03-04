import { createRawToken } from './auth';

export const normalizeUsernameCandidate = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const truncated = normalized.slice(0, 64).replace(/-+$/g, '');
  if (!truncated) {
    return 'user';
  }

  if (truncated.length >= 3) {
    return truncated;
  }

  return `${truncated}user`.slice(0, 64).replace(/-+$/g, '');
};

export const deriveUsernameSeedFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] ?? 'user';
  return normalizeUsernameCandidate(localPart || 'user');
};

export const resolveDisplayName = (input: {
  providedDisplayName?: string | undefined;
  clerkFirstName?: string | null;
  clerkLastName?: string | null;
  email: string;
}): string => {
  const provided = input.providedDisplayName?.trim();
  if (provided) {
    return provided.slice(0, 120);
  }

  const fromClerk = [input.clerkFirstName, input.clerkLastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim();

  if (fromClerk) {
    return fromClerk.slice(0, 120);
  }

  return deriveUsernameSeedFromEmail(input.email).slice(0, 120);
};

export const resolveUniqueUsername = async (input: {
  preferredCandidate: string;
  email: string;
  isUsernameTaken: (candidate: string) => Promise<boolean>;
  tokenGenerator?: () => string;
}): Promise<string> => {
  const base = normalizeUsernameCandidate(
    input.preferredCandidate || deriveUsernameSeedFromEmail(input.email),
  )
    .slice(0, 58)
    .replace(/-+$/g, '') || 'user';

  for (let suffix = 0; suffix < 500; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    if (!(await input.isUsernameTaken(candidate))) {
      return candidate;
    }
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const token = (input.tokenGenerator ?? createRawToken)().slice(0, 8);
    const suffix = attempt === 0 ? token : `${token}-${attempt}`;
    const candidate = normalizeUsernameCandidate(`${base}-${suffix}`);
    if (!(await input.isUsernameTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve unique username after retries.');
};
