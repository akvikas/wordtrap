const ID_KEY = "wordtrap-player";
const NAME_KEY = "wordtrap-name";

export function loadPlayerId(): string {
  const existing = localStorage.getItem(ID_KEY);
  if (existing && /^[a-zA-Z0-9_-]{1,64}$/.test(existing)) return existing;
  const id = `p${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  localStorage.setItem(ID_KEY, id);
  return id;
}

export function loadName(): string {
  const saved = localStorage.getItem(NAME_KEY);
  return saved && saved.trim() ? saved.slice(0, 16) : "Player";
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name.slice(0, 16));
}
