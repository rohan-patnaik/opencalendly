'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getBrowserTimezone } from '../../../lib/public-booking';
import styles from './page.module.css';

type EmbedPlaygroundPageClientProps = {
  apiBaseUrl: string;
};

const DEFAULT_TITLE = 'OpenCalendly booking widget';

const toScriptSnippet = (input: {
  src: string;
  width: string;
  height: string;
  radius: string;
  shadow: string;
  title: string;
}): string => {
  const optionalShadow = input.shadow.trim().length > 0 ? `\n  data-shadow="${input.shadow}"` : '';
  return `<script\n  src="${input.src}"\n  data-width="${input.width}"\n  data-height="${input.height}"\n  data-radius="${input.radius}"${optionalShadow}\n  data-title="${input.title}"\n></script>`;
};

export default function EmbedPlaygroundPageClient({ apiBaseUrl }: EmbedPlaygroundPageClientProps) {
  const previewHostRef = useRef<HTMLDivElement | null>(null);

  const [username, setUsername] = useState('demo');
  const [eventSlug, setEventSlug] = useState('intro-call');
  const [timezone, setTimezone] = useState(getBrowserTimezone());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [width, setWidth] = useState('100%');
  const [height, setHeight] = useState('760px');
  const [radius, setRadius] = useState('14px');
  const [shadow, setShadow] = useState('');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const scriptSrc = useMemo(() => {
    const params = new URLSearchParams({
      username: username.trim() || 'demo',
      eventSlug: eventSlug.trim() || 'intro-call',
      timezone: timezone.trim() || 'UTC',
      theme,
    });
    return `${apiBaseUrl}/v0/embed/widget.js?${params.toString()}`;
  }, [apiBaseUrl, eventSlug, theme, timezone, username]);

  const scriptSnippet = useMemo(() => {
    return toScriptSnippet({
      src: scriptSrc,
      width,
      height,
      radius,
      shadow,
      title: title.trim() || DEFAULT_TITLE,
    });
  }, [height, radius, scriptSrc, shadow, title, width]);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) {
      return;
    }

    host.innerHTML = '';

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.dataset.width = width;
    script.dataset.height = height;
    script.dataset.radius = radius;
    script.dataset.title = title.trim() || DEFAULT_TITLE;
    if (shadow.trim().length > 0) {
      script.dataset.shadow = shadow;
    }

    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
  }, [height, radius, scriptSrc, shadow, title, width]);

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(scriptSnippet);
      setCopyStatus('Snippet copied.');
    } catch {
      setCopyStatus('Copy failed. Select and copy manually.');
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.kicker}>Embed playground</p>
        <h1>Generate and preview widget script</h1>
        <p>
          Use this route to tune embed script options before adding the snippet to your site.
        </p>
      </section>

      <section className={styles.layout}>
        <div className={styles.card}>
          <h2>Script settings</h2>

          <div className={styles.grid}>
            <label className={styles.label} htmlFor="embed-username">
              Username
            </label>
            <input
              id="embed-username"
              className={styles.input}
              value={username}
              onChange={(entry) => setUsername(entry.target.value)}
            />

            <label className={styles.label} htmlFor="embed-event-slug">
              Event slug
            </label>
            <input
              id="embed-event-slug"
              className={styles.input}
              value={eventSlug}
              onChange={(entry) => setEventSlug(entry.target.value)}
            />

            <label className={styles.label} htmlFor="embed-timezone">
              Timezone
            </label>
            <input
              id="embed-timezone"
              className={styles.input}
              value={timezone}
              onChange={(entry) => setTimezone(entry.target.value)}
              placeholder="Asia/Kolkata"
            />

            <label className={styles.label} htmlFor="embed-theme">
              Theme
            </label>
            <select
              id="embed-theme"
              className={styles.select}
              value={theme}
              onChange={(entry) => setTheme(entry.target.value === 'dark' ? 'dark' : 'light')}
            >
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>

            <label className={styles.label} htmlFor="embed-width">
              data-width
            </label>
            <input
              id="embed-width"
              className={styles.input}
              value={width}
              onChange={(entry) => setWidth(entry.target.value)}
            />

            <label className={styles.label} htmlFor="embed-height">
              data-height
            </label>
            <input
              id="embed-height"
              className={styles.input}
              value={height}
              onChange={(entry) => setHeight(entry.target.value)}
            />

            <label className={styles.label} htmlFor="embed-radius">
              data-radius
            </label>
            <input
              id="embed-radius"
              className={styles.input}
              value={radius}
              onChange={(entry) => setRadius(entry.target.value)}
            />

            <label className={styles.label} htmlFor="embed-shadow">
              data-shadow (optional)
            </label>
            <input
              id="embed-shadow"
              className={styles.input}
              value={shadow}
              onChange={(entry) => setShadow(entry.target.value)}
              placeholder="0 12px 24px rgba(15,23,42,.15)"
            />

            <label className={styles.label} htmlFor="embed-title">
              data-title
            </label>
            <input
              id="embed-title"
              className={styles.input}
              value={title}
              onChange={(entry) => setTitle(entry.target.value)}
            />
          </div>

          <p className={styles.muted}>Script URL</p>
          <code className={styles.codeBlock}>{scriptSrc}</code>

          <p className={styles.muted}>HTML snippet</p>
          <pre className={styles.codeBlock}>{scriptSnippet}</pre>

          <div className={styles.actionsRow}>
            <button type="button" className={styles.primaryButton} onClick={() => void copySnippet()}>
              Copy snippet
            </button>
            <a className={styles.secondaryButton} href={scriptSrc} target="_blank" rel="noreferrer">
              Open script URL
            </a>
          </div>
          {copyStatus ? <p className={styles.success}>{copyStatus}</p> : null}
        </div>

        <div className={styles.card}>
          <h2>Live preview</h2>
          <p className={styles.muted}>
            Ensure API worker is running locally at <code>{apiBaseUrl}</code>.
          </p>
          <div ref={previewHostRef} className={styles.previewHost} />
        </div>
      </section>
    </main>
  );
}
