export const resolveEmbedTheme = (rawTheme: string | undefined): 'light' | 'dark' => {
  return rawTheme?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
};

export const buildEmbedWidgetScript = (input: {
  iframeSrc: string;
  theme: 'light' | 'dark';
  timezone?: string;
}): string => {
  return `
(() => {
  const script = document.currentScript;
  if (!script) return;

  const timezone = ${JSON.stringify(input.timezone ?? '')};
  const theme = ${JSON.stringify(input.theme)};
  const frameSrc = ${JSON.stringify(input.iframeSrc)};

  const targetSelector = script.dataset.target || '';
  const mountPoint = targetSelector ? document.querySelector(targetSelector) : null;
  const container = mountPoint || document.createElement('div');

  if (!mountPoint) {
    script.parentNode?.insertBefore(container, script.nextSibling);
  }

  const radius = script.dataset.radius || (theme === 'dark' ? '14px' : '12px');
  const borderColor = theme === 'dark' ? '#1f2937' : '#d1d5db';
  const background = theme === 'dark' ? '#020617' : '#ffffff';
  const shadow = script.dataset.shadow || (theme === 'dark'
    ? '0 10px 24px rgba(15, 23, 42, 0.45)'
    : '0 10px 24px rgba(15, 23, 42, 0.10)');

  container.style.width = script.dataset.width || '100%';
  container.style.minHeight = script.dataset.height || '760px';
  container.style.border = \`1px solid \${borderColor}\`;
  container.style.borderRadius = radius;
  container.style.overflow = 'hidden';
  container.style.background = background;
  container.style.boxShadow = shadow;

  const iframe = document.createElement('iframe');
  iframe.src = frameSrc;
  iframe.style.width = '100%';
  iframe.style.height = script.dataset.height || '760px';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.title = script.dataset.title || 'OpenCalendly booking widget';

  if (timezone) {
    iframe.dataset.timezone = timezone;
  }
  iframe.dataset.theme = theme;

  container.innerHTML = '';
  container.appendChild(iframe);
})();
`;
};
