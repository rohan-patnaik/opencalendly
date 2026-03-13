import { healthCheckSchema } from '@opencalendly/shared';

import type { ApiApp } from '../server/types';

export const registerHealthRoutes = (app: ApiApp): void => {
  app.get('/health', (context) => {
    return context.json(healthCheckSchema.parse({ status: 'ok' }));
  });
};
