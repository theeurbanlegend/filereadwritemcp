export function Loading() {
  return <div className="center muted">Loading…</div>;
}

export function ServerUnreachable() {
  return <div className="center error">Couldn't reach the server. Try again shortly.</div>;
}

export function RateLimited({ seconds }: { seconds: number }) {
  return (
    <div className="center muted" role="status">
      Too many requests from your network. Trying again in {seconds} seconds…
    </div>
  );
}
