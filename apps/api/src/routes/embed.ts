import { findPublicEventView } from '../server/public-events';
import { jsonError } from '../server/core';
import { withDatabase } from '../server/database';
import { buildEmbedWidgetScript, resolveEmbedTheme } from '../server/embed';
import { resolveAppBaseUrl } from '../server/env';
import type { ApiApp } from '../server/types';

export const registerEmbedRoutes = (app: ApiApp): void => {
  app.get('/v0/embed/widget.js', async (context) => {
    return withDatabase(context, async (db) => {
      const username = context.req.query('username')?.trim().toLowerCase();
      const eventSlug = context.req.query('eventSlug')?.trim().toLowerCase();
      if (!username || !eventSlug) {
        return jsonError(context, 400, 'username and eventSlug query params are required.');
      }

      const eventView = await findPublicEventView(db, username, eventSlug);
      if (!eventView) {
        return jsonError(context, 404, 'Event type not found.');
      }

      const timezone = context.req.query('timezone')?.trim();
      const theme = resolveEmbedTheme(context.req.query('theme'));
      const appBaseUrl = resolveAppBaseUrl(context.env, context.req.raw);
      const iframeUrl = new URL(`/${encodeURIComponent(username)}/${encodeURIComponent(eventSlug)}`, appBaseUrl);
      iframeUrl.searchParams.set('embed', '1');
      iframeUrl.searchParams.set('theme', theme);
      if (timezone) {
        iframeUrl.searchParams.set('timezone', timezone);
      }

      return new Response(
        buildEmbedWidgetScript({
          iframeSrc: iframeUrl.toString(),
          theme,
          ...(timezone ? { timezone } : {}),
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'public, max-age=60',
          },
        },
      );
    });
  });
};
