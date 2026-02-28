export default function CalendarCallbackFallback() {
  return (
    <main style={{ margin: '3rem auto', maxWidth: 720, padding: '0 1rem' }}>
      <p role="status" aria-live="polite" aria-atomic="true">
        Preparing callback...
      </p>
    </main>
  );
}
