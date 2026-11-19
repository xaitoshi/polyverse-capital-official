/** Name folding for joins. Never used to invent a player. */

export function foldName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&amp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactName(name: string): string {
  return foldName(name).replace(/ /g, "");
}

export function playerId(name: string): string {
  const id = foldName(name).replace(/ /g, "-");
  return id || "player";
}

export function namesMatch(a: string, b: string): boolean {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  if (compactName(a) === compactName(b)) return true;
  const ta = fa.split(" ");
  const tb = fb.split(" ");
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
  return ta[0] === tb[0];
}

export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** Tennis Abstract jsfrag id, e.g. "Anna Kartseva" -> "AnnaKartseva". */
export function taSlugCandidates(name: string): string[] {
  const ascii = name.normalize("NFKD").replace(/\p{M}/gu, "");
  const parts = ascii.replace(/[^A-Za-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const camel = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
  return camel ? [camel] : [];
}

export function initials(name: string): string {
  const parts = name
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((p) => p && /[A-Za-z]/.test(p));
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
