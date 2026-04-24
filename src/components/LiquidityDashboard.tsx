import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Droplets, RefreshCw, ExternalLink, ChevronRight, Flame, TrendingUp, Search, Plus } from 'lucide-react';

const LOW_LIQ_KEY = '__lowliq__';
const LOW_LIQ_THRESHOLDS = [1_000, 5_000, 10_000, 25_000, 50_000] as const;
type LowLiqThreshold = typeof LOW_LIQ_THRESHOLDS[number];

// ─── Taxonomy ────────────────────────────────────────────────────────────────

interface Subcategory { label: string; keywords: RegExp }
interface Category    { label: string; color: string; keywords: RegExp; subcategories: Subcategory[] }

const CATEGORIES: Category[] = [
  {
    label: 'Politics', color: '#3b82f6',
    keywords: /trump|biden|kamala|harris|congress|senate|election|vote|white house|president|democrat|republican|tariff|cabinet|doge |executive order|inaugur|scotus|supreme court|impeach|nato|ukraine|russia|putin|zelensky|china|xi jinping|war |ceasefire|diplomacy|sanctions|north korea|iran|middle east|israel|gaza|geopolit|state department|pentagon|cia |fbi |nsa |homeland|border wall|immigration policy|deportation|asylum|refugee|foreign policy/i,
    subcategories: [
      { label: 'US Executive',  keywords: /trump|biden|kamala|harris|white house|president|cabinet|executive order|oval office|inaugur|doge |pardon/i },
      { label: 'US Congress',   keywords: /congress|senate|house of rep|speaker|majority leader|filibuster|bill passed|legislation|appropriation|debt ceiling|government shutdown/i },
      { label: 'Elections',     keywords: /election|vote|ballot|poll|candidate|primary|runoff|referendum|midterm|swing state|electoral/i },
      { label: 'Legal & Courts',keywords: /scotus|supreme court|impeach|indictment|trial|conviction|sentencing|doj |sec |ftc |antitrust|appeals court/i },
      { label: 'Immigration',   keywords: /immigration|border|deportation|asylum|refugee|visa|daca|undocumented/i },
      { label: 'Geopolitics',   keywords: /nato|ukraine|russia|putin|zelensky|china|xi jinping|war |ceasefire|diplomacy|sanctions|taiwan|north korea|iran|middle east|israel|gaza|foreign policy|state department/i },
    ],
  },
  {
    label: 'Crypto', color: '#f59e0b',
    keywords: /bitcoin|btc |ethereum|eth |crypto|defi|nft |blockchain|solana|sol |polygon|matic|cardano|ada |binance|bnb |coinbase|altcoin|memecoin|stablecoin|usdc|usdt|halving|web3|ripple|xrp |avalanche|avax|chainlink|link |dogecoin|doge coin|shiba|pepe coin|base chain|arbitrum|optimism l2|layer 2|layer2/i,
    subcategories: [
      { label: 'Bitcoin',      keywords: /bitcoin|btc /i },
      { label: 'Ethereum',     keywords: /ethereum|eth |erc-|layer 2|layer2|arbitrum|optimism l2|base chain/i },
      { label: 'Altcoins',     keywords: /solana|sol |polygon|matic|cardano|ada |avalanche|avax|ripple|xrp |chainlink|link |altcoin|memecoin|dogecoin|doge coin|shiba|pepe coin/i },
      { label: 'DeFi',         keywords: /defi|yield|uniswap|aave|compound|curve|liquidity pool|dex |amm |lending protocol/i },
      { label: 'NFT & Web3',   keywords: /nft |web3|metaverse|opensea|ordinal|inscription|digital collectible/i },
      { label: 'Stablecoins',  keywords: /stablecoin|usdc|usdt|dai |tether|depeg|peg /i },
      { label: 'Exchange & Reg', keywords: /coinbase|binance|kraken|exchange|sec crypto|cftc crypto|crypto regulation|spot etf|bitcoin etf/i },
    ],
  },
  {
    label: 'Finance', color: '#10b981',
    keywords: /stock|earn|quarterly|eps\b|\([A-Z]{2,5}\)|s&p 500|s&p500|nasdaq|dow jones|fed |federal reserve|interest rate|inflation|gdp|recession|ipo |nyse|bond |yield curve|treasury|cpi |ppi |unemployment rate|jobs report|nonfarm|forex|dollar index|usd\/|eur\/|gbp\/|wall street|etf |gold price|silver price|oil price|opec|crude oil|natural gas price|commodity|hedge fund|venture capital|private equity|merger|acquisition|layoff|bankrupt/i,
    subcategories: [
      { label: 'Earnings Calls', keywords: /earn|quarterly|eps\b|beat.*quarter|quarter.*beat|revenue.*beat|beat.*revenue|beat.*estimate|estimate.*beat|q[1-4].*20|20.*q[1-4]|fiscal year|annual report|profit warning|miss.*estimate|estimate.*miss|exceed.*forecast|guidance cut|guidance raise|\([A-Z]{2,5}\).*beat|\([A-Z]{2,5}\).*earn/i },
      { label: 'Fed & Rates',   keywords: /fed |federal reserve|interest rate|rate cut|rate hike|fomc|basis point|bps |jerome powell|monetary policy|quantitative|balance sheet/i },
      { label: 'Macro',         keywords: /gdp|inflation|cpi |ppi |recession|unemployment rate|jobs report|nonfarm|economic growth|consumer spending|retail sales|housing starts/i },
      { label: 'Equities',      keywords: /s&p 500|s&p500|nasdaq|dow jones|stock price|ipo |nyse|wall street|etf |market cap|share price|short sell|options expir/i },
      { label: 'Currencies',    keywords: /forex|dollar index|usd\/|eur\/|gbp\/|yen |yuan|currency|devaluation|exchange rate/i },
      { label: 'Commodities',   keywords: /gold price|silver price|oil price|opec|crude oil|natural gas price|copper price|wheat price|commodity/i },
      { label: 'M&A & Corp',    keywords: /merger|acquisition|takeover|buyout|spinoff|divest|restructur|layoff|bankrupt|chapter 11|private equity|venture capital/i },
    ],
  },
  {
    label: 'Sports', color: '#ef4444',
    keywords: /nfl |nba |mlb |nhl |super bowl|world series|stanley cup|nba finals|march madness|ufc |mma |boxing |ncaa |college football|playoff|championship game|mvp |heisman|draft pick|all.star|soccer|premier league|la liga|serie a|bundesliga|world cup|champions league|europa league|formula 1|f1 |grand prix|monaco gp|tennis|wimbledon|us open|australian open|roland garros|golf|pga |masters |ryder cup|cricket|ipl |rugby|six nations|olympics|tour de france|esport|league of legend|dota |cs:|valorant/i,
    subcategories: [
      { label: 'NFL',          keywords: /nfl |super bowl|touchdown|quarterback|football draft|heisman/i },
      { label: 'NBA',          keywords: /nba |nba finals|march madness|basketball|slam dunk/i },
      { label: 'MLB',          keywords: /mlb |world series|baseball|home run|cy young|batting/i },
      { label: 'NHL',          keywords: /nhl |stanley cup|hockey|goalie|hat trick/i },
      { label: 'Soccer',       keywords: /soccer|premier league|la liga|serie a|bundesliga|world cup|champions league|europa league|uefa|fifa|mls |transfer window/i },
      { label: 'Formula 1',    keywords: /formula 1|f1 |grand prix|monaco gp|constructors|verstappen|hamilton|leclerc/i },
      { label: 'Tennis',       keywords: /tennis|wimbledon|us open tennis|australian open|roland garros|djokovic|federer|nadal|alcaraz|swiatek/i },
      { label: 'Golf',         keywords: /golf|pga |masters |ryder cup|lpga|liv golf/i },
      { label: 'Combat Sports', keywords: /ufc |mma |boxing |knockout|title fight|bout|heavyweight|lightweight/i },
      { label: 'Cricket & Rugby', keywords: /cricket|ipl |test match|rugby|six nations|ashes/i },
      { label: 'Esports',      keywords: /esport|league of legend|dota |cs:|valorant|overwatch|gaming tournament|twitch|streamer/i },
      { label: 'Olympics',     keywords: /olympics|olympic games|world athletics|tour de france|cycling race/i },
    ],
  },
  {
    label: 'Science & Tech', color: '#06b6d4',
    keywords: /\bai\b|artificial intelligence|openai|gpt-|claude ai|gemini ai|llm |machine learning|deep learning|spacex|nasa|rocket launch|moon mission|mars mission|satellite|climate change|carbon tax|net zero|renewable energy|solar panel|wind farm|apple inc|google|microsoft|nvidia|meta platform|amazon aws|tesla|elon musk tech|semiconductor|chip maker|tsmc|quantum computing|biotech|gene edit|crispr|mrna/i,
    subcategories: [
      { label: 'AI & LLMs',    keywords: /\bai\b|artificial intelligence|openai|gpt-|claude ai|gemini ai|llm |machine learning|deep learning|agi |chatgpt|mistral|llama model/i },
      { label: 'Big Tech',     keywords: /apple inc|google|microsoft|nvidia|meta platform|amazon aws|tesla|elon musk tech|semiconductor|chip maker|tsmc|quantum computing/i },
      { label: 'Space',        keywords: /spacex|nasa|rocket launch|moon mission|mars mission|satellite|starship|blue origin|iss |james webb/i },
      { label: 'Energy & Climate', keywords: /climate change|carbon tax|net zero|renewable energy|solar panel|wind farm|electric vehicle|ev |battery|green hydrogen/i },
      { label: 'Biotech & Genomics', keywords: /biotech|gene edit|crispr|mrna|genomic|synthetic biology|longevity|anti.aging/i },
    ],
  },
  {
    label: 'Health & Pharma', color: '#ec4899',
    keywords: /fda |drug approval|clinical trial|vaccine|pfizer|moderna|astrazeneca|merck|johnson & johnson|ozempic|wegovy|weight loss drug|glp-1|cancer treatment|disease outbreak|pandemic|epidemic|who |cdc |nih |medicare|medicaid|health insurance|obamacare|aca |drug price|pharmacy|hospital|surgery|mental health|addiction|overdose|opioid/i,
    subcategories: [
      { label: 'FDA & Approvals', keywords: /fda |drug approval|clinical trial|phase [123]|nda |bla |fast track|breakthrough therapy/i },
      { label: 'Pharma Companies', keywords: /pfizer|moderna|astrazeneca|merck|johnson & johnson|novartis|roche|eli lilly|abbvie|gilead/i },
      { label: 'Weight Loss & GLP-1', keywords: /ozempic|wegovy|weight loss drug|glp-1|semaglutide|tirzepatide|obesity drug|mounjaro/i },
      { label: 'Disease & Outbreak', keywords: /disease outbreak|pandemic|epidemic|mpox|bird flu|h5n1|measles|ebola|dengue|malaria|tuberculosis|who alert/i },
      { label: 'Health Policy',   keywords: /medicare|medicaid|health insurance|obamacare|aca |drug price|hospital system|public health|cdc |nih /i },
      { label: 'Mental Health',   keywords: /mental health|addiction|overdose|opioid|fentanyl|depression|anxiety disorder/i },
    ],
  },
  {
    label: 'Law & Crime', color: '#f97316',
    keywords: /trial |lawsuit|indictment|arrested|conviction|sentencing|verdict|judge |prosecutor|doj |sec charge|criminal charge|investigation|grand jury|plea deal|extradition|murder|fraud case|ponzi|money laundering|insider trading|embezzle|corruption|bribery|war crime|international court|icj |icc |parole|prison sentence|death penalty/i,
    subcategories: [
      { label: 'Criminal Cases',  keywords: /murder|assault|fraud case|ponzi|money laundering|extradition|war crime|corruption|bribery|embezzle|cartel/i },
      { label: 'Corporate Legal', keywords: /sec charge|insider trading|antitrust suit|ftc case|doj investigation|class action|settlement|patent dispute/i },
      { label: 'Political Legal', keywords: /indictment|impeachment trial|grand jury|plea deal|pardon|contempt|subpoena|political prosecution/i },
      { label: 'International Law', keywords: /international court|icj |icc |war crime tribunal|human rights violation|sanctions violation/i },
    ],
  },
  {
    label: 'Entertainment', color: '#8b5cf6',
    keywords: /oscar|academy award|emmy|grammy|bafta|golden globe|box office|movie gross|film release|netflix original|disney\+|hbo max|streaming service|celebrity|taylor swift|beyoncé|kanye|kardashian|tv show|season finale|reality tv|youtube|tiktok creator|podcast|music chart|billboard|album sales|concert tour|broadway/i,
    subcategories: [
      { label: 'Awards',          keywords: /oscar|academy award|emmy|grammy|bafta|golden globe|tony award|people's choice/i },
      { label: 'Box Office',      keywords: /box office|movie gross|film release|opening weekend|blockbuster|sequel|marvel|dc film/i },
      { label: 'Streaming & TV',  keywords: /netflix original|disney\+|hbo max|streaming service|tv show|season finale|reality tv|cancelled series|renewal/i },
      { label: 'Music',           keywords: /music chart|billboard|album sales|concert tour|grammy|spotify|music video|number one hit/i },
      { label: 'Celebrity',       keywords: /celebrity|taylor swift|beyoncé|kanye|kardashian|celebrity couple|breakup|engagement|divorce/i },
    ],
  },
  {
    label: 'World Affairs', color: '#14b8a6',
    keywords: /uk |britain|prime minister|labour party|tory|keir starmer|rishi sunak|france|macron|germany|scholz|italy|meloni|canada|trudeau|australia|albanese|india|modi|japan|kishida|south korea|yoon|brazil|lula|argentina|milei|mexico|turkey|erdogan|saudi arabia|mbs |united nations|un general|g7 |g20 |imf |world bank|wto |opec\+|brics|africa|nigeri|kenya|south africa|eu budget|eurozone/i,
    subcategories: [
      { label: 'Europe',          keywords: /uk |britain|prime minister uk|labour party|tory|keir starmer|france|macron|germany|scholz|italy|meloni|eu budget|eurozone|ecb |european parliament/i },
      { label: 'Asia Pacific',    keywords: /japan|kishida|south korea|yoon|australia|albanese|india|modi|asean|southeast asia|philippines|indonesia|vietnam|thailand/i },
      { label: 'Americas',        keywords: /canada|trudeau|brazil|lula|argentina|milei|mexico|colombia|venezuela|peru|chile|latin america/i },
      { label: 'Middle East & Africa', keywords: /saudi arabia|mbs |uae|qatar|kuwait|turkey|erdogan|egypt|nigeria|kenya|south africa|africa union/i },
      { label: 'International Orgs', keywords: /united nations|un general|g7 |g20 |imf |world bank|wto |brics|opec\+|who global/i },
    ],
  },
  {
    label: 'Environment', color: '#65a30d',
    keywords: /hurricane|typhoon|cyclone|tornado|earthquake|tsunami|wildfire|flood|drought|blizzard|heat wave|cold snap|natural disaster|fema|category [1-5]|landfall|evacuation order|storm surge|el niño|la niña|sea level|ice cap|glacier|deforestation|pollution|air quality|water crisis|species extinct/i,
    subcategories: [
      { label: 'Hurricanes & Storms', keywords: /hurricane|typhoon|cyclone|tornado|tropical storm|category [1-5]|landfall|storm surge|evacuation order/i },
      { label: 'Earthquakes & Disasters', keywords: /earthquake|tsunami|volcanic|landslide|avalanche|natural disaster|fema |magnitude/i },
      { label: 'Wildfires & Drought', keywords: /wildfire|forest fire|drought|water crisis|desertification|heat wave|extreme heat/i },
      { label: 'Flooding & Cold', keywords: /flood|blizzard|cold snap|snowstorm|ice storm|extreme cold|polar vortex/i },
    ],
  },
  {
    label: 'Social & Culture', color: '#d946ef',
    keywords: /twitter|x\.com|elon musk social|tiktok ban|instagram|facebook|social media|viral|reddit|youtube ban|free speech|censorship|misinformation|content moderation|data privacy|hate speech|cancel culture|woke|dei |affirmative action|gender|abortion|lgbtq|trans right|gun control|gun law|second amendment|drug legalization|marijuana|police reform|incarceration|death penalty|minimum wage|ubi |universal basic/i,
    subcategories: [
      { label: 'Social Media',    keywords: /twitter|x\.com|elon musk social|tiktok ban|instagram|facebook|reddit|youtube ban|content moderation|free speech online|social network/i },
      { label: 'Civil Rights',    keywords: /lgbtq|trans right|abortion|gender|affirmative action|dei |racial justice|civil rights|discrimination/i },
      { label: 'Society & Policy', keywords: /gun control|gun law|second amendment|drug legalization|marijuana|police reform|incarceration|death penalty|minimum wage|ubi |universal basic|welfare|homelessness/i },
      { label: 'Culture Wars',    keywords: /cancel culture|woke|misinformation|hate speech|censorship|free speech|culture war|political correct/i },
    ],
  },
];

function categorise(question: string): { category: Category; sub: Subcategory | null } {
  const t = question.toLowerCase();
  // Score each category by counting distinct keyword matches (best fit wins)
  let bestCat: Category | null = null;
  let bestSub: Subcategory | null = null;
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    if (!cat.keywords.test(t)) continue;
    // Count sub-matches as a tiebreaker
    let score = 1;
    let matchedSub: Subcategory | null = null;
    for (const sub of cat.subcategories) {
      if (sub.keywords.test(t)) { score += 2; matchedSub = sub; break; }
    }
    if (score > bestScore) { bestScore = score; bestCat = cat; bestSub = matchedSub; }
  }

  if (bestCat) return { category: bestCat, sub: bestSub };

  // Final fallback: derive a meaningful label from the question itself
  const fallbackSub = deriveSubcategory(t);
  return {
    category: { label: 'Other', color: '#6b7280', keywords: /.*/, subcategories: [] },
    sub: fallbackSub ? { label: fallbackSub, keywords: /.*/ } : null,
  };
}

// Extract a meaningful subcategory label from uncategorised questions
function deriveSubcategory(q: string): string | null {
  if (/\bpopular\b|\bpoll\b|\bapproval\b/.test(q)) return 'Polling';
  if (/\bprice\b|\brate\b|\bindex\b|\bmarket\b/.test(q)) return 'Prices & Rates';
  if (/\bwar\b|\battack\b|\bmilitary\b|\bconflict\b/.test(q)) return 'Conflict';
  if (/\bdeal\b|\bagreement\b|\bnegotiat\b|\bsanction\b/.test(q)) return 'Diplomacy';
  if (/\bwin\b|\bbeat\b|\bscore\b|\bchampion\b|\bdefeat\b/.test(q)) return 'Competition';
  if (/\bsign\b|\bjoin\b|\bappoint\b|\bfire\b|\bresign\b/.test(q)) return 'Personnel';
  if (/\bpass\b|\blaw\b|\bbill\b|\bpolicy\b|\bregulat\b/.test(q)) return 'Policy';
  if (/\bdie\b|\bdeath\b|\bkilled\b|\bsurvivor\b/.test(q)) return 'Life Events';
  if (/\brelease\b|\blaunch\b|\bannounce\b|\breveal\b/.test(q)) return 'Announcements';
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawMarket {
  question: string;
  volume: string;
  liquidity?: string;
  volume24hr?: number;
  slug?: string;
  conditionId?: string;
  events?: { slug?: string }[];
  tokens?: { token_id: string; outcome: string }[];
  clobTokenIds?: string; // JSON string e.g. '["yesTokenId","noTokenId"]'
}

interface MarketItem {
  question: string;
  slug: string;
  liquidity: number;
  volume24h: number;
  category: string;
  sub: string;
  color: string;
  yesTokenId?: string;
}

interface PricePoint { t: number; p: number }
interface PriceSeries {
  label: string;   // shown in legend
  color: string;
  marketTitle: string;
  history: PricePoint[];
}

interface SubData { label: string; liquidity: number; volume24h: number; count: number }
interface CatData  {
  label: string; color: string;
  liquidity: number; volume24h: number; count: number;
  subs: SubData[];
  markets: MarketItem[];
}

// ─── Snapshots (localStorage) ────────────────────────────────────────────────

const SNAP_KEY = 'klvs_liq_v2';
interface DailySnap { date: string; byCategory: Record<string, number> }

function loadSnaps(): DailySnap[] {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '[]'); } catch { return []; }
}
function saveSnap(cats: CatData[]): DailySnap[] {
  const today = new Date().toISOString().split('T')[0];
  const prev = loadSnaps().filter(s => s.date !== today);
  const snap: DailySnap = { date: today, byCategory: Object.fromEntries(cats.map(c => [c.label, c.liquidity])) };
  const next = [...prev, snap].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  localStorage.setItem(SNAP_KEY, JSON.stringify(next));
  return next;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function marketUrl(m: RawMarket) {
  if (m.events?.[0]?.slug) return `https://polymarket.com/event/${m.events[0].slug}`;
  if (m.slug) return `https://polymarket.com/event/${m.slug}`;
  return '';
}

// ─── Charts ──────────────────────────────────────────────────────────────────

function HBarChart({ cats, selected, onSelect }: { cats: CatData[]; selected: string | null; onSelect: (l: string) => void }) {
  const max = Math.max(...cats.map(c => c.liquidity), 1);
  return (
    <div className="space-y-2.5">
      {cats.map(c => {
        const pct = (c.liquidity / max) * 100;
        const active = selected === c.label;
        return (
          <div key={c.label} onClick={() => onSelect(c.label)} className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-28 text-right text-[10px] font-mono truncate transition-colors ${active ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
              {c.label}
            </div>
            <div className="flex-1 h-7 bg-black/40 rounded-sm relative overflow-hidden border border-blue-500/10">
              <div
                className="h-full rounded-sm transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: c.color + (active ? 'ff' : '80') }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/70 tabular-nums">
                {fmtUSD(c.liquidity)}
              </span>
            </div>
            <div className="w-14 text-[10px] font-mono text-gray-600 text-right">{c.count} mkts</div>
          </div>
        );
      })}
    </div>
  );
}

function SubBarChart({ subs, color, selected, onSelect }: {
  subs: SubData[];
  color: string;
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  const max = Math.max(...subs.map(s => s.liquidity), 1);
  return (
    <div className="space-y-2">
      {subs.map(s => {
        const empty = s.count === 0;
        const active = selected === s.label;
        const pct = empty ? 0 : (s.liquidity / max) * 100;
        return (
          <div
            key={s.label}
            onClick={() => !empty && onSelect(s.label)}
            className={`flex items-center gap-3 transition-opacity ${empty ? 'opacity-35' : 'cursor-pointer group'}`}
          >
            <div className={`w-32 text-right text-[10px] font-mono truncate transition-colors ${active ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
              {s.label}
            </div>
            <div className={`flex-1 h-6 bg-black/40 rounded-sm relative overflow-hidden border transition-colors ${active ? 'border-white/30' : 'border-blue-500/10 group-hover:border-blue-500/25'}`}>
              {!empty && (
                <div
                  className="h-full rounded-sm transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: color + (active ? 'cc' : '70') }}
                />
              )}
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/50">
                {empty ? 'no data' : fmtUSD(s.liquidity)}
              </span>
            </div>
            <div className="w-14 text-[10px] font-mono text-gray-600 text-right">
              {s.count > 0 ? `${s.count} mkts` : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriceHistoryChart({ series, onRemove }: { series: PriceSeries[]; onRemove?: (label: string) => void }) {
  if (!series.length) return null;

  const now = Date.now() / 1000;
  const since = now - 30 * 86400;

  const daySet = new Set<number>();
  for (const h of series)
    for (const pt of h.history)
      if (pt.t >= since) daySet.add(Math.floor(pt.t / 86400) * 86400);
  const days = [...daySet].sort();
  if (days.length < 2) return null;

  const W = 800, H = 200, pL = 44, pR = 16, pT = 12, pB = 28;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const xS = (i: number) => pL + (i / (days.length - 1)) * plotW;
  const yS = (p: number) => pT + plotH - p * plotH;
  const gridPs = [0, 0.25, 0.5, 0.75, 1];
  const fmtDay = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {gridPs.map(p => {
          const y = yS(p);
          return (
            <g key={p}>
              <line x1={pL} y1={y} x2={pL + plotW} y2={y} stroke="rgba(0,255,65,0.07)" strokeWidth={1} />
              <text x={pL - 4} y={y + 3} fontSize={7} fill="rgba(0,255,65,0.35)" textAnchor="end" fontFamily="monospace">
                {Math.round(p * 100)}¢
              </text>
            </g>
          );
        })}
        {series.map(h => {
          const byDay = new Map<number, number>();
          for (const pt of h.history) {
            const d = Math.floor(pt.t / 86400) * 86400;
            byDay.set(d, pt.p);
          }
          const pts = days
            .map((d, i) => byDay.has(d) ? `${xS(i)},${yS(byDay.get(d)!)}` : null)
            .filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <g key={h.label}>
              <polyline points={pts.join(' ')} fill="none" stroke={h.color} strokeWidth={1.5} strokeOpacity={0.85} />
              {(() => {
                let last = -1; for (let i = days.length - 1; i >= 0; i--) { if (byDay.has(days[i])) { last = i; break; } }
                if (last < 0) return null;
                return <circle cx={xS(last)} cy={yS(byDay.get(days[last])!)} r={2.5} fill={h.color} />;
              })()}
            </g>
          );
        })}
        {days.filter((_, i) => i === 0 || i === days.length - 1 || i % Math.max(1, Math.floor(days.length / 5)) === 0).map(d => {
          const i = days.indexOf(d);
          return (
            <text key={d} x={xS(i)} y={H - 6} fontSize={7} fill="rgba(0,255,65,0.35)" textAnchor="middle" fontFamily="monospace">
              {fmtDay(d)}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 space-y-1.5">
        {series.map(h => (
          <div key={h.label} className="flex items-start gap-2 group">
            <div className="w-2 h-2 rounded-sm mt-0.5 shrink-0" style={{ backgroundColor: h.color }} />
            <span className="text-[10px] font-mono text-gray-500 flex-1 leading-tight">{h.marketTitle}</span>
            {onRemove && (
              <button onClick={() => onRemove(h.label)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Price Trends View ────────────────────────────────────────────────────────

const SERIES_COLORS = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];

/** Extract the slug from a polymarket.com URL.
 *  Handles:
 *   https://polymarket.com/event/some-event-slug
 *   https://polymarket.com/event/some-event-slug/some-market-slug
 *  Returns [eventSlug, marketSlug | null]
 */
function parsePolyUrl(input: string): { eventSlug: string; marketSlug: string | null } | null {
  try {
    const url = new URL(input.trim());
    if (!url.hostname.includes('polymarket.com')) return null;
    const parts = url.pathname.replace(/^\//, '').split('/');
    // parts: ['event', 'event-slug'] or ['event', 'event-slug', 'market-slug']
    if (parts[0] !== 'event' || !parts[1]) return null;
    return { eventSlug: parts[1], marketSlug: parts[2] ?? null };
  } catch { return null; }
}

function PriceTrendsView({ allMarkets }: { allMarkets: MarketItem[] }) {
  const [query, setQuery]           = useState('');
  const [urlStatus, setUrlStatus]   = useState<'idle' | 'loading' | 'error'>('idle');
  const [pinned, setPinned]         = useState<MarketItem[]>([]);
  const [series, setSeries]         = useState<PriceSeries[]>([]);
  const [fetching, setFetching]     = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const isUrl = query.trim().startsWith('http') && query.includes('polymarket.com');

  const results = useMemo(() => {
    if (!query.trim() || isUrl) return [];
    const q = query.toLowerCase();
    return allMarkets
      .filter(m => m.question.toLowerCase().includes(q) && m.yesTokenId)
      .slice(0, 8);
  }, [query, allMarkets, isUrl]);

  const pinnedIds = useMemo(() => new Set(pinned.map(m => m.yesTokenId!)), [pinned]);

  async function addMarketByUrl() {
    const parsed = parsePolyUrl(query);
    if (!parsed) { setUrlStatus('error'); return; }
    setUrlStatus('loading');
    try {
      // Try market slug first, then fall back to event slug
      const slugsToTry = parsed.marketSlug
        ? [parsed.marketSlug, parsed.eventSlug]
        : [parsed.eventSlug];

      let yesTokenId: string | undefined;
      let question: string | undefined;

      for (const slug of slugsToTry) {
        // Try direct market lookup
        const mRes = await fetch(`/api/polymarket/markets?slug=${slug}`);
        if (mRes.ok) {
          const mData = await mRes.json();
          const market = Array.isArray(mData) ? mData[0] : mData;
          if (market?.clobTokenIds) {
            try {
              const ids: string[] = JSON.parse(market.clobTokenIds);
              yesTokenId = ids[0] || undefined;
              question = market.question;
            } catch {}
          }
          if (yesTokenId) break;
        }
        // Try event lookup
        const eRes = await fetch(`/api/polymarket/events?slug=${slug}`);
        if (eRes.ok) {
          const eData = await eRes.json();
          const events = Array.isArray(eData) ? eData : [eData];
          const firstMarket = events[0]?.markets?.[0];
          if (firstMarket?.clobTokenIds) {
            try {
              const ids: string[] = JSON.parse(firstMarket.clobTokenIds);
              yesTokenId = ids[0] || undefined;
              question = firstMarket.question;
            } catch {}
          }
          if (yesTokenId) break;
        }
      }

      if (!yesTokenId || !question) { setUrlStatus('error'); return; }
      if (pinnedIds.has(yesTokenId)) { setQuery(''); setUrlStatus('idle'); return; }

      setUrlStatus('idle');
      setQuery('');
      const syntheticMarket: MarketItem = {
        question,
        slug: query.trim(),
        liquidity: 0,
        volume24h: 0,
        category: 'Other',
        sub: '',
        color: '#6b7280',
        yesTokenId,
      };
      await addMarket(syntheticMarket);
    } catch { setUrlStatus('error'); }
  }

  async function addMarket(m: MarketItem) {
    if (!m.yesTokenId || pinnedIds.has(m.yesTokenId) || pinned.length >= 8) return;
    setQuery('');
    setPinned(prev => [...prev, m]);

    setFetching(prev => new Set(prev).add(m.yesTokenId!));
    try {
      const res = await fetch(`/api/clob/prices-history?market=${m.yesTokenId}&interval=1m&fidelity=1440`);
      if (!res.ok) return;
      const json = await res.json();
      const history: PricePoint[] = (json.history ?? []).map((pt: any) => ({ t: Number(pt.t), p: Number(pt.p) }));
      if (history.length > 1) {
        setSeries(prev => {
          const colorIdx = prev.length % SERIES_COLORS.length;
          return [...prev, { label: m.yesTokenId!, color: SERIES_COLORS[colorIdx], marketTitle: m.question, history }];
        });
      }
    } catch { /* ignore */ } finally {
      setFetching(prev => { const s = new Set(prev); s.delete(m.yesTokenId!); return s; });
    }
  }

  function removeMarket(tokenId: string) {
    setPinned(prev => prev.filter(m => m.yesTokenId !== tokenId));
    setSeries(prev => prev.filter(s => s.label !== tokenId));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-blue-400 text-xs font-bold tracking-widest flex items-center gap-2 mb-1">
          <TrendingUp className="w-3.5 h-3.5" /> PRICE TRENDS
        </h2>
        <p className="text-[10px] text-gray-600">Search by keyword or paste a polymarket.com link to compare YES price over 30 days</p>
      </div>

      {/* Search / URL input */}
      <div className="relative">
        <div className={`flex items-center gap-2 border rounded px-3 py-2 bg-black/30 transition-colors
          ${urlStatus === 'error' ? 'border-red-500/50' : isUrl ? 'border-cyan-500/40 focus-within:border-cyan-500/70' : 'border-blue-500/30 focus-within:border-blue-500/60'}`}>
          {isUrl
            ? <ExternalLink className="w-3.5 h-3.5 text-cyan-500/50 shrink-0" />
            : <Search className="w-3.5 h-3.5 text-blue-500/40 shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setUrlStatus('idle'); }}
            onKeyDown={e => { if (e.key === 'Enter' && isUrl) addMarketByUrl(); }}
            placeholder="Search markets or paste a polymarket.com/event/… URL"
            className="flex-1 bg-transparent text-xs font-mono text-gray-200 placeholder-gray-700 outline-none"
          />
          {isUrl && (
            <button
              onClick={addMarketByUrl}
              disabled={urlStatus === 'loading' || pinned.length >= 8}
              className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-40 transition-colors"
            >
              {urlStatus === 'loading' ? '…' : 'ADD'}
            </button>
          )}
          {query && !isUrl && <button onClick={() => { setQuery(''); setUrlStatus('idle'); }} className="text-gray-600 hover:text-gray-300"><X className="w-3 h-3" /></button>}
        </div>

        {urlStatus === 'error' && (
          <div className="mt-1 text-[10px] text-red-400/70 font-mono px-1">
            Could not resolve market — check the URL or try a different link
          </div>
        )}

        {/* Dropdown results (keyword search only) */}
        {results.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0a0a0a] border border-blue-500/25 rounded shadow-xl z-10 overflow-hidden">
            {results.map((m, i) => {
              const already = pinnedIds.has(m.yesTokenId!);
              return (
                <button
                  key={i}
                  onClick={() => !already && addMarket(m)}
                  disabled={already || pinned.length >= 8}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors text-xs font-mono border-b border-blue-500/10 last:border-0
                    ${already ? 'opacity-40 cursor-default' : 'hover:bg-blue-500/8 cursor-pointer'}`}
                >
                  <Plus className={`w-3 h-3 shrink-0 ${already ? 'text-gray-600' : 'text-blue-500/50'}`} />
                  <span className="flex-1 truncate text-gray-300">{m.question}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">{fmtUSD(m.liquidity)}</span>
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && !isUrl && results.length === 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0a0a0a] border border-blue-500/15 rounded px-3 py-2 text-[10px] text-gray-600 font-mono">
            No markets found — try different keywords or paste a URL
          </div>
        )}
      </div>

      {/* Pinned chips */}
      {pinned.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pinned.map((m, i) => {
            const isFetching = fetching.has(m.yesTokenId!);
            const hasSeries = series.some(s => s.label === m.yesTokenId);
            const color = series.find(s => s.label === m.yesTokenId)?.color ?? '#6b7280';
            return (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-mono"
                style={{ borderColor: color + '50', backgroundColor: color + '12', color }}>
                {isFetching && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />}
                {!isFetching && !hasSeries && <span className="text-red-400/60 shrink-0">!</span>}
                <span className="max-w-[200px] truncate">{m.question}</span>
                <button onClick={() => removeMarket(m.yesTokenId!)} className="opacity-50 hover:opacity-100 transition-opacity ml-0.5 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {series.length > 0 ? (
        <div className="border border-blue-500/15 rounded p-4 bg-blue-500/3">
          <PriceHistoryChart series={series} onRemove={removeMarket} />
        </div>
      ) : pinned.length > 0 && fetching.size > 0 ? (
        <div className="border border-blue-500/10 rounded p-6 text-center text-[10px] text-blue-500/30 font-mono animate-pulse">
          FETCHING PRICE DATA…
        </div>
      ) : pinned.length > 0 ? (
        <div className="border border-blue-500/10 rounded p-6 text-center text-[10px] text-gray-600 font-mono">
          No price history available for selected markets
        </div>
      ) : (
        <div className="border border-blue-500/10 rounded p-10 text-center space-y-2">
          <div className="text-[10px] text-gray-700 font-mono">Search by keyword or paste a market URL to get started</div>
          <div className="text-[9px] text-gray-800 font-mono">e.g. polymarket.com/event/will-trump-impose-tariffs-on-canada</div>
        </div>
      )}

      {pinned.length >= 8 && (
        <div className="text-[10px] text-amber-500/50 font-mono">Max 8 markets — remove one to add another</div>
      )}
    </div>
  );
}

function BarSnapshot({ snap, cats }: { snap: DailySnap; cats: CatData[] }) {
  const maxVal = Math.max(...cats.map(c => snap.byCategory[c.label] ?? 0), 1);
  return (
    <div>
      <div className="space-y-2">
        {cats.filter(c => (snap.byCategory[c.label] ?? 0) > 0).map(cat => {
          const val = snap.byCategory[cat.label] ?? 0;
          const pct = (val / maxVal) * 100;
          return (
            <div key={cat.label} className="flex items-center gap-2">
              <div className="w-20 text-right text-[9px] font-mono shrink-0" style={{ color: cat.color }}>{cat.label}</div>
              <div className="flex-1 h-4 bg-white/5 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color, opacity: 0.75 }} />
              </div>
              <div className="w-20 text-[9px] font-mono text-gray-500 shrink-0">{fmtUSD(val)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {cats.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
            <span className="text-[9px] font-mono text-gray-600">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ snaps, cats }: { snaps: DailySnap[]; cats: CatData[] }) {
  if (snaps.length < 2) return null;
  const W = 800, H = 160, pL = 64, pR = 16, pT = 12, pB = 28;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const maxVal = Math.max(...snaps.flatMap(s => Object.values(s.byCategory)), 1);
  const xS = (i: number) => pL + (i / (snaps.length - 1)) * plotW;
  const yS = (v: number) => pT + plotH - (v / maxVal) * plotH;
  const gridVals = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* grid */}
        {gridVals.map(t => {
          const y = pT + (1 - t) * plotH;
          return (
            <g key={t}>
              <line x1={pL} y1={y} x2={pL + plotW} y2={y} stroke="rgba(0,255,65,0.07)" strokeWidth={1} />
              <text x={pL - 4} y={y + 3} fontSize={7} fill="rgba(0,255,65,0.35)" textAnchor="end" fontFamily="monospace">
                {fmtUSD(maxVal * t)}
              </text>
            </g>
          );
        })}
        {/* lines */}
        {cats.map(cat => {
          const pts = snaps.map((s, i) => `${xS(i)},${yS(s.byCategory[cat.label] ?? 0)}`).join(' ');
          return <polyline key={cat.label} points={pts} fill="none" stroke={cat.color} strokeWidth={1.5} strokeOpacity={0.85} />;
        })}
        {/* dots for latest */}
        {cats.map(cat => {
          const last = snaps[snaps.length - 1];
          const v = last.byCategory[cat.label] ?? 0;
          return <circle key={cat.label} cx={xS(snaps.length - 1)} cy={yS(v)} r={2.5} fill={cat.color} />;
        })}
        {/* x labels */}
        {snaps.map((s, i) => (
          <text key={s.date} x={xS(i)} y={H - 6} fontSize={7} fill="rgba(0,255,65,0.35)" textAnchor="middle" fontFamily="monospace">
            {s.date.slice(5)}
          </text>
        ))}
      </svg>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {cats.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
            <span className="text-[10px] font-mono text-gray-500">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketTable({ markets }: { markets: MarketItem[] }) {
  return (
    <div className="border border-blue-500/20 rounded overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-blue-500/20 bg-blue-500/5">
            <th className="text-left px-3 py-2 text-blue-500/50 font-normal tracking-widest">MARKET</th>
            <th className="text-left px-3 py-2 text-blue-500/50 font-normal tracking-widest w-28">SUBCATEGORY</th>
            <th className="text-right px-3 py-2 text-blue-500/50 font-normal tracking-widest w-24">LIQUIDITY</th>
            <th className="text-right px-3 py-2 text-blue-500/50 font-normal tracking-widest w-24">24H VOL</th>
            <th className="w-8 px-2" />
          </tr>
        </thead>
        <tbody>
          {markets.slice(0, 25).map((m, i) => (
            <tr key={i} className="border-b border-blue-500/10 last:border-0 hover:bg-blue-500/5 transition-colors">
              <td className="px-3 py-2 text-gray-300 max-w-0"><div className="truncate" title={m.question}>{m.question}</div></td>
              <td className="px-3 py-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded border font-mono" style={{ color: m.color, borderColor: m.color + '40', backgroundColor: m.color + '15' }}>
                  {m.sub || m.category}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-blue-400 tabular-nums">{fmtUSD(m.liquidity)}</td>
              <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmtUSD(m.volume24h)}</td>
              <td className="px-2 py-2 text-center">
                {m.slug && (
                  <a href={m.slug} target="_blank" rel="noopener noreferrer" className="text-blue-500/30 hover:text-blue-400 inline-flex">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-blue-500/20 bg-blue-500/5 rounded p-4">
      <div className="text-[10px] font-mono text-blue-500/50 tracking-widest mb-1">{label}</div>
      <div className="text-xl font-mono text-blue-400 font-bold">{value}</div>
      {sub && <div className="text-[10px] font-mono text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function LiquidityDashboard({ onClose }: { onClose: () => void }) {
  const [catData, setCatData]           = useState<CatData[]>([]);
  const [allMarkets, setAllMarkets]     = useState<MarketItem[]>([]);
  const [snaps, setSnaps]               = useState<DailySnap[]>(loadSnaps());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [selected, setSelected]         = useState<string | null>(null);
  const [view, setView]                 = useState<'overview' | 'markets' | 'price-trends'>('overview');
  const [lowLiqThreshold, setLowLiqThreshold] = useState<LowLiqThreshold>(10_000);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Batch 1: top markets by volume (broad coverage)
      const volumeFetches = [0, 100, 200, 300, 400].map(offset =>
        fetch(`/api/polymarket/markets?active=true&closed=false&limit=100&offset=${offset}&order=volume24hr&ascending=false`)
      );
      // Batch 2: keyword searches for niche categories with low liquidity
      const KEYWORD_SEARCHES = [
        'earnings', 'quarterly', 'beat earnings',       // Earnings Calls
        'FDA', 'drug approval', 'clinical trial',       // Health & Pharma
        'hurricane', 'earthquake', 'wildfire',          // Environment
        'lawsuit', 'trial', 'indictment',               // Law & Crime
        'merger', 'acquisition', 'CEO',                 // M&A
      ];
      const keywordFetches = KEYWORD_SEARCHES.map(q =>
        fetch(`/api/polymarket/markets?active=true&closed=false&limit=50&q=${encodeURIComponent(q)}`)
      );

      const allResponses = await Promise.all([...volumeFetches, ...keywordFetches]);
      const allJsons = await Promise.all(allResponses.map(r => r.ok ? r.json() : []));
      const allRaw: RawMarket[] = allJsons.flatMap(j => Array.isArray(j) ? j : []);

      // Deduplicate by conditionId
      const seen = new Set<string>();
      const raw: RawMarket[] = [];
      for (const m of allRaw) {
        const key = (m as any).conditionId ?? m.question;
        if (!seen.has(key)) { seen.add(key); raw.push(m); }
      }
      console.log('[liquidity] total unique markets after keyword search:', raw.length);

      // Build market items with categorisation
      const items: MarketItem[] = raw
        .filter(r => r.question)
        .map(r => {
          const liq = parseFloat(r.liquidity ?? '0') || parseFloat(r.volume ?? '0') * 0.1;
          const vol24 = Number(r.volume24hr ?? 0) || parseFloat(r.volume ?? '0') * 0.05;
          const url = marketUrl(r);
          const { category, sub } = categorise(r.question);
          // gamma API returns clobTokenIds as JSON string; first entry is YES token
          let yesTokenId: string | undefined;
          try {
            const ids: string[] = JSON.parse(r.clobTokenIds ?? '[]');
            yesTokenId = ids[0] || undefined;
          } catch { /* skip */ }
          // fallback to tokens array if present (some responses include it)
          if (!yesTokenId) yesTokenId = r.tokens?.find(t => t.outcome.toLowerCase() === 'yes')?.token_id;
          return {
            question: r.question,
            slug: url,
            liquidity: liq,
            volume24h: vol24,
            category: category.label,
            sub: sub?.label ?? '',
            color: category.color,
            yesTokenId,
          };
        });

      // Aggregate into category buckets
      const catMap = new Map<string, { def: Category; markets: MarketItem[] }>();
      for (const item of items) {
        const catDef = CATEGORIES.find(c => c.label === item.category)
          ?? { label: 'Other', color: '#6b7280', keywords: /.*/, subcategories: [] };
        if (!catMap.has(item.category)) catMap.set(item.category, { def: catDef, markets: [] });
        catMap.get(item.category)!.markets.push(item);
      }

      const cats: CatData[] = [...catMap.values()].map(({ def, markets }) => {
        const subMap = new Map<string, SubData>();
        for (const sub of def.subcategories) {
          subMap.set(sub.label, { label: sub.label, liquidity: 0, volume24h: 0, count: 0 });
        }
        for (const m of markets) {
          if (m.sub && subMap.has(m.sub)) {
            const s = subMap.get(m.sub)!;
            s.liquidity += m.liquidity; s.volume24h += m.volume24h; s.count++;
          }
        }
        return {
          label: def.label, color: def.color,
          liquidity: markets.reduce((s, m) => s + m.liquidity, 0),
          volume24h: markets.reduce((s, m) => s + m.volume24h, 0),
          count: markets.length,
          subs: [...subMap.values()],
          markets: [...markets].sort((a, b) => b.liquidity - a.liquidity),
        };
      }).sort((a, b) => b.liquidity - a.liquidity);

      setCatData(cats);
      setAllMarkets([...items].sort((a, b) => b.liquidity - a.liquidity));
      const updated = saveSnap(cats);
      setSnaps(updated);
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const selCat = catData.find(c => c.label === selected) ?? null;
  useEffect(() => { setSelectedSub(null); }, [selected]);
  const totalLiq = catData.reduce((s, c) => s + c.liquidity, 0);
  const totalVol = catData.reduce((s, c) => s + c.volume24h, 0);
  const topCat = catData[0]?.label ?? '—';

  // Low liquidity derived data
  const lowLiqMarkets = useMemo(() =>
    [...allMarkets]
      .filter(m => m.liquidity < lowLiqThreshold && m.liquidity > 0)
      .sort((a, b) => b.liquidity - a.liquidity),
    [allMarkets, lowLiqThreshold]
  );
  const lowLiqByCat = useMemo(() => {
    const map = new Map<string, { color: string; markets: MarketItem[]; liquidity: number }>();
    for (const m of lowLiqMarkets) {
      if (!map.has(m.category)) map.set(m.category, { color: m.color, markets: [], liquidity: 0 });
      const entry = map.get(m.category)!;
      entry.markets.push(m);
      entry.liquidity += m.liquidity;
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.liquidity - a.liquidity);
  }, [lowLiqMarkets]);
  const isLowLiq = selected === LOW_LIQ_KEY;

  return (
    <div className="fixed inset-0 z-50 bg-[#04070c] flex flex-col font-mono">
      {/* Header */}
      <div className="shrink-0 border-b border-blue-500/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Droplets className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-blue-400 font-bold tracking-widest text-sm">// POLYMARKET LIQUIDITY</div>
            <div className="text-[10px] text-blue-500/40 tracking-wider">market depth · categorised by topic</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-500/30 text-blue-400 rounded text-xs hover:bg-blue-500/10 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> REFRESH
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-600 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Mobile: horizontal scroll tab bar */}
        <div className="md:hidden flex overflow-x-auto border-b border-blue-500/20 bg-black/40 shrink-0 scrollbar-hide">
          <button onClick={() => setSelected(null)}
            className={`shrink-0 px-4 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${!selected ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-500'}`}>
            All
          </button>
          {catData.map(c => (
            <button key={c.label} onClick={() => setSelected(c.label)}
              className={`shrink-0 px-4 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${selected === c.label ? 'border-blue-400 text-white' : 'border-transparent text-gray-500'}`}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              {c.label}
            </button>
          ))}
          <button onClick={() => setSelected(LOW_LIQ_KEY)}
            className={`shrink-0 px-4 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${isLowLiq ? 'border-amber-400 text-amber-300' : 'border-transparent text-gray-500'}`}>
            🔥 Low Liq
          </button>
          {([['overview','Overview'],['markets','Top Markets'],['price-trends','Trends']] as const).map(([v,label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`shrink-0 px-4 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-colors ${view === v ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Desktop: sidebar */}
        <div className="hidden md:flex w-48 shrink-0 border-r border-blue-500/20 flex-col py-4 overflow-y-auto">
          <div className="px-4 mb-3 text-[9px] text-blue-500/40 tracking-widest font-bold">CATEGORIES</div>

          <button onClick={() => setSelected(null)}
            className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors ${!selected ? 'text-blue-400 bg-blue-500/10' : 'text-gray-500 hover:text-gray-300'}`}>
            All Markets
            {!selected && <ChevronRight className="w-3 h-3" />}
          </button>

          {loading && !catData.length ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="mx-4 my-1 h-5 bg-blue-500/5 rounded animate-pulse" />
            ))
          ) : (
            catData.map(c => (
              <button key={c.label} onClick={() => setSelected(c.label)}
                className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between group transition-colors ${selected === c.label ? 'bg-blue-500/10' : 'hover:bg-blue-500/5'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className={selected === c.label ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}>{c.label}</span>
                </div>
                <span className="text-[9px] text-gray-600">{fmtUSD(c.liquidity)}</span>
              </button>
            ))
          )}

          {/* Low Liquidity special entry */}
          <div className="mx-3 my-3 border-t border-blue-500/10" />
          <button
            onClick={() => setSelected(LOW_LIQ_KEY)}
            className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between group transition-colors ${isLowLiq ? 'bg-amber-500/10' : 'hover:bg-amber-500/5'}`}
          >
            <div className="flex items-center gap-2">
              <Flame className={`w-3 h-3 shrink-0 ${isLowLiq ? 'text-amber-400' : 'text-amber-500/50 group-hover:text-amber-400'}`} />
              <span className={isLowLiq ? 'text-amber-300' : 'text-gray-400 group-hover:text-amber-300'}>Low Liquidity</span>
            </div>
            <span className="text-[9px] text-gray-600">{lowLiqMarkets.length} mkts</span>
          </button>

          <div className="px-4 mt-6 mb-2 text-[9px] text-blue-500/40 tracking-widest font-bold">VIEW</div>
          {([
            ['overview',     'Overview'],
            ['markets',      'Top Markets'],
            ['price-trends', 'Price Trends'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`w-full text-left px-4 py-1.5 text-xs transition-colors flex items-center gap-2 ${view === v ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}>
              {v === 'price-trends' && <TrendingUp className="w-3 h-3 shrink-0" />}
              {label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6 custom-scrollbar">
          {error && (
            <div className="text-red-400 text-xs font-mono mb-4 border border-red-500/20 rounded p-3">
              ERROR: {error} — <button onClick={loadData} className="underline">retry</button>
            </div>
          )}

          {loading && !catData.length ? (
            <div className="flex items-center justify-center h-64 text-blue-500/40 text-sm tracking-widest">
              <span className="animate-pulse">FETCHING MARKET DATA…</span>
            </div>
          ) : isLowLiq ? (
            /* ── Low Liquidity view ── */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-amber-400 text-xs font-bold tracking-widest flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5" /> LOW LIQUIDITY MARKETS
                  </h2>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Markets with less than {fmtUSD(lowLiqThreshold)} liquidity — often newer, niche, or between-season markets
                  </p>
                </div>
                {/* Threshold picker */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-600">under</span>
                  <div className="flex rounded border border-amber-500/20 overflow-hidden">
                    {LOW_LIQ_THRESHOLDS.map(t => (
                      <button
                        key={t}
                        onClick={() => setLowLiqThreshold(t)}
                        className={`px-2 py-1 text-[10px] font-mono transition-colors ${lowLiqThreshold === t ? 'bg-amber-500/20 text-amber-300' : 'text-gray-600 hover:text-amber-400'}`}
                      >
                        {fmtUSD(t)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Stat label="MARKETS FOUND" value={String(lowLiqMarkets.length)} sub={`under ${fmtUSD(lowLiqThreshold)}`} />
                <Stat label="COMBINED LIQUIDITY" value={fmtUSD(lowLiqMarkets.reduce((s, m) => s + m.liquidity, 0))} />
                <Stat label="AVG LIQUIDITY" value={lowLiqMarkets.length ? fmtUSD(lowLiqMarkets.reduce((s, m) => s + m.liquidity, 0) / lowLiqMarkets.length) : '$0'} />
              </div>

              {/* By-category breakdown */}
              {lowLiqByCat.length > 0 && (
                <div>
                  <div className="text-[10px] text-amber-500/50 tracking-widest mb-3">BREAKDOWN BY CATEGORY</div>
                  <div className="space-y-2">
                    {lowLiqByCat.map(cat => {
                      const max = lowLiqByCat[0].liquidity || 1;
                      const pct = (cat.liquidity / max) * 100;
                      return (
                        <div key={cat.label} className="flex items-center gap-3">
                          <div className="w-28 text-right text-[10px] font-mono text-gray-500 truncate">{cat.label}</div>
                          <div className="flex-1 h-6 bg-black/40 rounded-sm relative overflow-hidden border border-amber-500/10">
                            <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: cat.color + '70' }} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/60">{fmtUSD(cat.liquidity)}</span>
                          </div>
                          <div className="w-14 text-[10px] font-mono text-gray-600 text-right">{cat.markets.length} mkts</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Markets table — sorted ascending so smallest liquidity last */}
              <div>
                <div className="text-[10px] text-amber-500/50 tracking-widest mb-3">ALL LOW LIQUIDITY MARKETS</div>
                {lowLiqMarkets.length === 0 ? (
                  <div className="text-center text-gray-600 text-xs py-12 border border-blue-500/10 rounded">
                    No markets found under {fmtUSD(lowLiqThreshold)} — try a higher threshold
                  </div>
                ) : (
                  <div className="border border-amber-500/20 rounded overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-amber-500/20 bg-amber-500/5">
                          <th className="text-left px-3 py-2 text-amber-500/50 font-normal tracking-widest">MARKET</th>
                          <th className="text-left px-3 py-2 text-amber-500/50 font-normal tracking-widest w-28">CATEGORY</th>
                          <th className="text-right px-3 py-2 text-amber-500/50 font-normal tracking-widest w-24">LIQUIDITY</th>
                          <th className="text-right px-3 py-2 text-amber-500/50 font-normal tracking-widest w-24">24H VOL</th>
                          <th className="w-8 px-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {lowLiqMarkets.map((m, i) => (
                          <tr key={i} className="border-b border-amber-500/10 last:border-0 hover:bg-amber-500/5 transition-colors">
                            <td className="px-3 py-2 text-gray-300 max-w-0"><div className="truncate" title={m.question}>{m.question}</div></td>
                            <td className="px-3 py-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded border font-mono" style={{ color: m.color, borderColor: m.color + '40', backgroundColor: m.color + '15' }}>
                                {m.sub || m.category}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-amber-400 tabular-nums">{fmtUSD(m.liquidity)}</td>
                            <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmtUSD(m.volume24h)}</td>
                            <td className="px-2 py-2 text-center">
                              {m.slug && (
                                <a href={m.slug} target="_blank" rel="noopener noreferrer" className="text-amber-500/30 hover:text-amber-400 inline-flex">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : view === 'price-trends' ? (
            /* ── Price Trends view ── */
            <PriceTrendsView allMarkets={allMarkets} />
          ) : view === 'markets' ? (
            /* ── Top Markets view ── */
            <div>
              <h2 className="text-blue-400 text-xs font-bold tracking-widest mb-4">
                {selCat ? `// ${selCat.label.toUpperCase()} MARKETS` : '// TOP MARKETS'}
              </h2>
              <MarketTable markets={selCat ? selCat.markets : allMarkets} />
            </div>
          ) : selCat ? (
            /* ── Category drill-down ── */
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-bold tracking-widest mb-4" style={{ color: selCat.color }}>
                  // {selCat.label.toUpperCase()}
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="TOTAL LIQUIDITY" value={fmtUSD(selCat.liquidity)} />
                  <Stat label="24H VOLUME" value={fmtUSD(selCat.volume24h)} />
                  <Stat label="ACTIVE MARKETS" value={String(selCat.count)} />
                </div>
              </div>

              {selCat.subs.length > 0 && (
                <div>
                  <div className="text-[10px] text-blue-500/50 tracking-widest mb-3">SUBCATEGORY BREAKDOWN — click to filter markets</div>
                  <SubBarChart
                    subs={selCat.subs}
                    color={selCat.color}
                    selected={selectedSub}
                    onSelect={s => setSelectedSub(prev => prev === s ? null : s)}
                  />
                </div>
              )}

              {/* Snapshot liquidity trend */}
              {snaps.length >= 2 && (
                <div>
                  <div className="text-[10px] text-blue-500/50 tracking-widest mb-3">LIQUIDITY OVER TIME ({snaps.length} days)</div>
                  <div className="border border-blue-500/15 rounded p-3 bg-blue-500/5">
                    <LineChart
                      snaps={snaps.map(s => ({ date: s.date, byCategory: { [selCat.label]: s.byCategory[selCat.label] ?? 0 } }))}
                      cats={[selCat]}
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] text-blue-500/50 tracking-widest">
                    {selectedSub ? (
                      <span>
                        MARKETS IN <span style={{ color: selCat.color }}>{selectedSub.toUpperCase()}</span>
                      </span>
                    ) : 'ALL MARKETS IN CATEGORY'}
                  </div>
                  {selectedSub && (
                    <button
                      onClick={() => setSelectedSub(null)}
                      className="text-[10px] text-gray-600 hover:text-gray-300 flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" /> clear filter
                    </button>
                  )}
                </div>
                <MarketTable
                  markets={selectedSub
                    ? selCat.markets.filter(m => m.sub === selectedSub)
                    : selCat.markets}
                />
              </div>
            </div>
          ) : (
            /* ── Overview ── */
            <div className="space-y-8">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="TOTAL LIQUIDITY" value={fmtUSD(totalLiq)} sub="across all categories" />
                <Stat label="24H VOLUME" value={fmtUSD(totalVol)} sub="last 24 hours" />
                <Stat label="ACTIVE MARKETS" value={String(allMarkets.length)} sub="tracked this session" />
                <Stat label="TOP CATEGORY" value={topCat} sub={catData[0] ? fmtUSD(catData[0].liquidity) : ''} />
              </div>

              {/* Category bar chart */}
              <div>
                <div className="text-[10px] text-blue-500/50 tracking-widest mb-4">LIQUIDITY BY CATEGORY — click to drill in</div>
                <HBarChart cats={catData} selected={selected} onSelect={setSelected} />
              </div>

              {/* Liquidity over time */}
              <div>
                <div className="text-[10px] text-blue-500/50 tracking-widest mb-1">LIQUIDITY BY CATEGORY OVER TIME</div>
                <div className="text-[9px] text-gray-700 mb-3 font-mono">
                  {snaps.length >= 2
                    ? `${snaps.length}/30 days recorded · line chart · for price trends see the Price Trends view`
                    : `Day 1 of 30 captured · return tomorrow for trend line · showing today's snapshot`}
                </div>
                {snaps.length >= 2 ? (
                  <div className="border border-blue-500/15 rounded p-4 bg-blue-500/5">
                    <LineChart snaps={snaps} cats={catData} />
                  </div>
                ) : snaps.length === 1 ? (
                  <div className="border border-blue-500/15 rounded p-4 bg-blue-500/5">
                    <BarSnapshot snap={snaps[0]} cats={catData} />
                  </div>
                ) : null}
              </div>

              {/* Top markets table */}
              <div>
                <div className="text-[10px] text-blue-500/50 tracking-widest mb-3">TOP MARKETS BY LIQUIDITY</div>
                <MarketTable markets={allMarkets} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
