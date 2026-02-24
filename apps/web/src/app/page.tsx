const checklist = [
  'Next.js web app (App Router) in apps/web',
  'Cloudflare Worker API in apps/api',
  'Neon Postgres + Drizzle migrations in packages/db',
  'Shared Zod contracts in packages/shared',
  'Demo Credits Pool policy documented for free-tier budgeting',
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="kicker">OpenSchedule</p>
        <h1>Open-source scheduling, built for free-tier constraints.</h1>
        <p>
          This baseline includes the core monorepo, infrastructure wiring, and docs needed to build
          a scheduling MVP on Neon + Cloudflare.
        </p>
      </section>

      <section className="card">
        <h2>Feature 0 status</h2>
        <ul>
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
