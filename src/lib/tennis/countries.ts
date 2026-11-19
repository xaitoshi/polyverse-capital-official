/** ISO 3166-1 alpha-2 names for flags we actually receive. Unknown codes display as the code. */
const NAMES: Record<string, string> = {
  ar: "Argentina", at: "Austria", au: "Australia", be: "Belgium", bg: "Bulgaria",
  br: "Brazil", by: "Belarus", ca: "Canada", ch: "Switzerland", cl: "Chile",
  cn: "China", co: "Colombia", cr: "Costa Rica", cy: "Cyprus", cz: "Czechia",
  de: "Germany", dk: "Denmark", ec: "Ecuador", ee: "Estonia", eg: "Egypt",
  es: "Spain", fi: "Finland", fr: "France", gb: "Great Britain", ge: "Georgia",
  gr: "Greece", hk: "Hong Kong", hr: "Croatia", hu: "Hungary", id: "Indonesia",
  ie: "Ireland", il: "Israel", in: "India", it: "Italy", jp: "Japan",
  kr: "South Korea", kz: "Kazakhstan", lt: "Lithuania", lv: "Latvia", ma: "Morocco",
  mx: "Mexico", nl: "Netherlands", no: "Norway", nz: "New Zealand", pe: "Peru",
  pl: "Poland", pt: "Portugal", py: "Paraguay", ro: "Romania", rs: "Serbia",
  ru: "Russia", se: "Sweden", si: "Slovenia", sk: "Slovakia", th: "Thailand",
  tn: "Tunisia", tr: "Turkey", tw: "Taiwan", ua: "Ukraine", us: "United States",
  uy: "Uruguay", uz: "Uzbekistan", za: "South Africa",
};

const ISO3: Record<string, string> = {
  arg: "ar", aus: "au", aut: "at", bel: "be", blr: "by", bra: "br", bul: "bg",
  can: "ca", chi: "cl", chn: "cn", col: "co", cro: "hr", cze: "cz", den: "dk",
  ecu: "ec", egy: "eg", esp: "es", est: "ee", fin: "fi", fra: "fr", gbr: "gb",
  geo: "ge", ger: "de", gre: "gr", hkg: "hk", hun: "hu", ina: "in", irl: "ie",
  isr: "il", ita: "it", jpn: "jp", kaz: "kz", kor: "kr", lat: "lv", ltu: "lt",
  mar: "ma", mex: "mx", ned: "nl", nor: "no", nzl: "nz", par: "py", per: "pe",
  pol: "pl", por: "pt", rou: "ro", rsa: "za", rus: "ru", srb: "rs", sui: "ch",
  svk: "sk", swe: "se", tha: "th", tpe: "tw", tun: "tn", tur: "tr", ukr: "ua",
  uru: "uy", usa: "us", uzb: "uz", slo: "si", cyp: "cy", crc: "cr",
  che: "ch", chl: "cl", ind: "in", prt: "pt", svn: "si",
  phi: "ph", mas: "my", vie: "vn", ksa: "sa", uae: "ae", pur: "pr",
  dom: "do", bol: "bo", ven: "ve", pak: "pk", ban: "bd", sri: "lk",
  mda: "md", arm: "am", aze: "az", bih: "ba", mne: "me", mkd: "mk",
  alb: "al", isl: "is", lux: "lu", mlt: "mt", qat: "qa", kgz: "kg",
  tjk: "tj", mon: "mn",
};

export function toIso2(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c === "un") return null;
  if (c.length === 2) return c;
  return ISO3[c] ?? null;
}

export function countryName(code: string | null | undefined, fallback?: string | null): string | null {
  if (fallback) return fallback;
  const iso = toIso2(code);
  if (!iso) return null;
  return NAMES[iso] ?? iso.toUpperCase();
}
