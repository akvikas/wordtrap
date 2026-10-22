function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function Avatar({ id }: { id: string }) {
  const n = hash(id);
  const kind = n % 4;
  const shift = (n % 7) - 3;
  return (
    <svg viewBox="0 0 64 64" className="size-11 shrink-0 text-fg" aria-hidden>
      <rect width="64" height="64" rx="18" className="fill-surface-2" />
      {kind === 0 && <circle cx={32 + shift} cy="28" r="10" className="fill-accent" />}
      {kind === 1 && <rect x={18 + shift} y="16" width="14" height="28" rx="4" className="fill-accent" />}
      {kind === 2 && <polygon points="32,14 46,40 18,40" className="fill-accent" transform={`translate(${shift} 0)`} />}
      {kind === 3 && (
        <>
          <circle cx={22 + shift} cy="26" r="6" className="fill-fg" />
          <circle cx={40 + shift} cy="26" r="6" className="fill-accent" />
        </>
      )}
      <rect x="16" y="46" width={20 + (n % 12)} height="4" rx="2" className="fill-muted" />
    </svg>
  );
}
