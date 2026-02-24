import { describe, expect, it } from 'vitest';

import { healthCheckSchema, webhookEventSchema } from './schemas';

describe('shared schemas', () => {
  it('accepts valid health check payload', () => {
    expect(healthCheckSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects invalid webhook events', () => {
    const result = webhookEventSchema.safeParse({ type: 'invalid' });
    expect(result.success).toBe(false);
  });
});
