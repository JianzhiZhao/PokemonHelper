import type { AbilityRecord, DefenseProfile, PokemonPageDetail, PokemonRecord, Scraper, TypeEffect } from "./types.js";

const BASE_URL = "https://op.gg/zh-tw/pokemon-champions";
const IMAGE_BASE = "https://s-stats-platform-cdn.op.gg/pokemon/images/pokemon";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export function parsePokedexPage(html: string): PokemonRecord[] {
  const rawArray = extractEscapedArrayProperty(html, '\\"pokemon\\":');
  if (!rawArray) {
    throw new Error("找不到 OP.GG 圖鑑資料");
  }

  const json = unescapeFlightJson(rawArray);
  const rows = JSON.parse(json) as Array<{
    id: number;
    key: string;
    name: string;
    types?: string[];
  } | null>;

  return rows
    .filter((row): row is NonNullable<(typeof rows)[number]> => Boolean(row?.id && row.key && row.name))
    .map((row) => ({
      key: row.key,
      name: row.name,
      dexId: row.id,
      types: row.types ?? [],
      imageUrl: `${IMAGE_BASE}/${row.id}.png`,
      defenseProfile: emptyDefenseProfile(),
      abilities: []
    }));
}

export function parsePokemonDetailPage(html: string): PokemonPageDetail {
  return {
    singleLosesTo: parseSingleLosePokemonKeys(html),
    defenseProfile: parseDefenseProfile(html),
    abilities: parseAbilities(html)
  };
}

export function parseSingleLosePokemonKeys(html: string): string[] {
  const sectionStart = html.indexOf('\\"$1\\",\\"lose-pokemon\\"');
  if (sectionStart < 0) return [];

  const nextSection = html.indexOf('\\"$1\\",\\"lose-moves\\"', sectionStart);
  const section = html.slice(sectionStart, nextSection > sectionStart ? nextSection : sectionStart + 80_000);
  const keys = new Set<string>();
  const hrefPattern = /href\\":\\"\/pokemon-champions\/pokedex\/([^\\"]+)/g;

  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(section))) {
    const key = match[1].split(/[?#]/)[0];
    if (key) keys.add(key);
  }

  return [...keys];
}

export function parseDefenseProfile(html: string): DefenseProfile {
  const section = extractSectionByHeading(html, "屬性相剋");
  if (!section) return emptyDefenseProfile();

  return {
    weaknesses: parseDefenseGroup(section, "弱點"),
    resistances: parseDefenseGroup(section, "抵抗"),
    immunities: parseDefenseGroup(section, "免疫")
  };
}

export function parseAbilities(html: string): AbilityRecord[] {
  const section = extractSectionByHeading(html, "特性");
  if (!section) return [];

  const abilities: AbilityRecord[] = [];
  const anchorPattern = /<a\b[^>]*href="\/[^"]*pokemon-champions\/abilities\/([^"]+)"[\s\S]*?<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(section))) {
    const key = htmlDecode(match[1].split(/[?#]/)[0]);
    const anchor = match[0];
    const name = stripTags(anchor.match(/<span class="truncate">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const descriptionMatches = [...anchor.matchAll(/<span class="text-muted-foreground[^"]*">([\s\S]*?)<\/span>/g)];
    const description = stripTags(descriptionMatches.at(-1)?.[1] ?? "");

    if (key && name) {
      abilities.push({ key, name, description });
    }
  }

  return abilities;
}

export class OpggScraper implements Scraper {
  async fetchPokemonIndex() {
    const html = await fetchText(`${BASE_URL}/pokedex`);
    return parsePokedexPage(html);
  }

  async fetchPokemonDetail(key: string) {
    const html = await fetchText(`${BASE_URL}/pokedex/${encodeURIComponent(key)}?tab=stats`);
    return parsePokemonDetailPage(html);
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      "user-agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`OP.GG 回應 ${response.status}: ${url}`);
  }

  return response.text();
}

function extractEscapedArrayProperty(input: string, marker: string) {
  let markerIndex = 0;
  while ((markerIndex = input.indexOf(marker, markerIndex)) >= 0) {
    let start = markerIndex + marker.length;
    while (/\s/.test(input[start] ?? "")) start += 1;
    if (input[start] === "[") {
      return extractArrayAt(input, start);
    }
    markerIndex += marker.length;
  }

  return null;
}

function extractArrayAt(input: string, start: number) {
  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }

  return null;
}

function unescapeFlightJson(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">");
}

function emptyDefenseProfile(): DefenseProfile {
  return {
    weaknesses: [],
    resistances: [],
    immunities: []
  };
}

function extractSectionByHeading(html: string, heading: string) {
  const headingIndex = html.indexOf(`>${heading}</h3>`);
  if (headingIndex < 0) return null;

  const sectionStart = html.lastIndexOf("<section", headingIndex);
  const sectionEnd = html.indexOf("</section>", headingIndex);
  if (sectionStart < 0 || sectionEnd < 0) return null;

  return html.slice(sectionStart, sectionEnd + "</section>".length);
}

function parseDefenseGroup(section: string, label: string): TypeEffect[] {
  const labelIndex = section.indexOf(`>${label}</p>`);
  if (labelIndex < 0) return [];

  const nextLabelIndex = section.indexOf('<p class="mb-1.5 text-sm font-medium', labelIndex + label.length);
  const group = section.slice(labelIndex, nextLabelIndex > labelIndex ? nextLabelIndex : section.length);
  const effects: TypeEffect[] = [];
  const badgePattern = /\/type\/([a-z-]+)\.svg[^>]*\/>([^<]+)<\/span><span[^>]*>([^<]+)<\/span>/g;
  let match: RegExpExecArray | null;

  while ((match = badgePattern.exec(group))) {
    effects.push({
      type: htmlDecode(match[1]),
      name: stripTags(match[2]),
      multiplier: parseMultiplier(stripTags(match[3]))
    });
  }

  return effects;
}

function parseMultiplier(value: string) {
  const normalized = value.replace(/\s/g, "").toLowerCase();
  if (normalized.startsWith("0")) return 0;
  if (normalized.includes("¼")) return 0.25;
  if (normalized.includes("½")) return 0.5;

  const parsed = Number(normalized.replace("x", ""));
  return Number.isFinite(parsed) ? parsed : 1;
}

function stripTags(value: string) {
  return htmlDecode(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
