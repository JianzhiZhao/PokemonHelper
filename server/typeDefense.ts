import type { AbilityRecord, DefenseProfile, PokemonRecord, TypeEffect } from "./types.js";

export type TypeDefensePokemon = {
  variantKey: string;
  key: string;
  name: string;
  dexId: number;
  types: string[];
  imageUrl: string | null;
  defenseProfile: DefenseProfile;
  abilities: AbilityRecord[];
  appliedAbilities: AbilityRecord[];
};

export type TypeDefenseChainResult = {
  chain: TypeDefensePokemon[];
  members: TypeDefensePokemon[];
};

export type TypeDefensePartnerResult = {
  start: TypeDefensePokemon;
  weaknesses: TypeEffect[];
  perfect: TypeDefensePokemon[];
  general: TypeDefensePokemon[];
};

export type PokemonTypeInfo = {
  type: string;
  name: string;
};

export type CoverageBlindSpotResult = {
  selectedTypes: PokemonTypeInfo[];
  absolute: TypeDefensePokemon[];
  general: TypeDefensePokemon[];
};

type AbilityRule =
  | { kind: "immunity"; types: string[] }
  | { kind: "multiplier"; types: string[]; factor: number }
  | { kind: "superEffectiveMultiplier"; factor: number }
  | { kind: "wonderGuard" };

const TYPE_NAMES: Record<string, string> = {
  normal: "一般",
  fire: "火",
  water: "水",
  electric: "電",
  grass: "草",
  ice: "冰",
  fighting: "格鬥",
  poison: "毒",
  ground: "地面",
  flying: "飛行",
  psychic: "超能力",
  bug: "蟲",
  rock: "岩石",
  ghost: "幽靈",
  dragon: "龍",
  dark: "惡",
  steel: "鋼",
  fairy: "妖精"
};

const TYPE_ORDER = Object.keys(TYPE_NAMES);

export const POKEMON_TYPE_OPTIONS: PokemonTypeInfo[] = TYPE_ORDER.map((type) => ({
  type,
  name: TYPE_NAMES[type]
}));

const KNOWN_ABILITY_RULES: Record<string, AbilityRule[]> = {
  "dry-skin": [
    { kind: "immunity", types: ["water"] },
    { kind: "multiplier", types: ["fire"], factor: 1.25 }
  ],
  "earth-eater": [{ kind: "immunity", types: ["ground"] }],
  "filter": [{ kind: "superEffectiveMultiplier", factor: 0.75 }],
  "flash-fire": [{ kind: "immunity", types: ["fire"] }],
  "fluffy": [{ kind: "multiplier", types: ["fire"], factor: 2 }],
  "heatproof": [{ kind: "multiplier", types: ["fire"], factor: 0.5 }],
  "levitate": [{ kind: "immunity", types: ["ground"] }],
  "lightning-rod": [{ kind: "immunity", types: ["electric"] }],
  "motor-drive": [{ kind: "immunity", types: ["electric"] }],
  "prism-armor": [{ kind: "superEffectiveMultiplier", factor: 0.75 }],
  "purifying-salt": [{ kind: "multiplier", types: ["ghost"], factor: 0.5 }],
  "sap-sipper": [{ kind: "immunity", types: ["grass"] }],
  "solid-rock": [{ kind: "superEffectiveMultiplier", factor: 0.75 }],
  "storm-drain": [{ kind: "immunity", types: ["water"] }],
  "thick-fat": [{ kind: "multiplier", types: ["fire", "ice"], factor: 0.5 }],
  "volt-absorb": [{ kind: "immunity", types: ["electric"] }],
  "water-absorb": [{ kind: "immunity", types: ["water"] }],
  "water-bubble": [{ kind: "multiplier", types: ["fire"], factor: 0.5 }],
  "well-baked-body": [{ kind: "immunity", types: ["fire"] }],
  "wonder-guard": [{ kind: "wonderGuard" }]
};

export function findTypeDefenseCycles(options: {
  pokemon: PokemonRecord[];
  startKey: string;
  x: number;
  page: number;
  pageSize: number;
}) {
  const { pokemon, startKey, x, page, pageSize } = options;
  const nodes = pokemon.flatMap(toTypeDefensePokemonVariants);
  const byVariantKey = new Map(nodes.map((item) => [item.variantKey, item]));
  const startVariants = nodes.filter((item) => item.key === startKey);
  const adjacency = buildTypeDefenseAdjacency(nodes);
  const offset = (page - 1) * pageSize;
  const pageChains: TypeDefenseChainResult[] = [];
  const recommendedKeys = new Set<string>();
  let total = 0;

  if (startVariants.length === 0) {
    return { total: 0, recommended: [], chains: [] };
  }

  for (const start of startVariants) {
    const path = [start.variantKey];
    const visitedSpecies = new Set([start.key]);
    const reachable = buildReachabilityToStart(adjacency, start.variantKey, x);
    dfs(start.variantKey, 0, start, path, visitedSpecies, reachable);
  }

  function dfs(
    current: string,
    depth: number,
    start: TypeDefensePokemon,
    path: string[],
    visitedSpecies: Set<string>,
    reachable: Map<string, Set<number>>
  ) {
    const remaining = x - depth;
    if (remaining === 0) {
      if (current === start.variantKey) recordChain(path);
      return;
    }

    const nextKeys = adjacency.get(current) ?? [];
    for (const nextKey of nextKeys) {
      if (!reachable.get(nextKey)?.has(remaining - 1)) continue;
      const next = byVariantKey.get(nextKey);
      if (!next) continue;

      const isLastStep = remaining === 1;
      if (isLastStep) {
        if (nextKey !== start.variantKey) continue;
      } else if (next.key === start.key || visitedSpecies.has(next.key)) {
        continue;
      }

      path.push(nextKey);
      if (!isLastStep) visitedSpecies.add(next.key);
      dfs(nextKey, depth + 1, start, path, visitedSpecies, reachable);
      if (!isLastStep) visitedSpecies.delete(next.key);
      path.pop();
    }
  }

  function recordChain(path: string[]) {
    const chain = path.map((key) => byVariantKey.get(key)).filter(Boolean) as TypeDefensePokemon[];
    if (chain.length !== path.length) return;

    const members = chain.slice(0, -1);
    for (const member of members) recommendedKeys.add(member.variantKey);

    if (total >= offset && pageChains.length < pageSize) {
      pageChains.push({ chain, members });
    }
    total += 1;
  }

  const recommended = [...recommendedKeys]
    .map((key) => byVariantKey.get(key))
    .filter(Boolean) as TypeDefensePokemon[];

  return {
    total,
    recommended,
    chains: pageChains
  };
}

export function countTypeDefenseCycles(options: { pokemon: PokemonRecord[]; startKey: string; x: number }) {
  const { pokemon, startKey, x } = options;
  const nodes = pokemon.flatMap(toTypeDefensePokemonVariants);
  const byVariantKey = new Map(nodes.map((item) => [item.variantKey, item]));
  const startVariants = nodes.filter((item) => item.key === startKey);
  const adjacency = buildTypeDefenseAdjacency(nodes);
  let total = 0;

  if (startVariants.length === 0) return 0;

  for (const start of startVariants) {
    const path = [start.variantKey];
    const visitedSpecies = new Set([start.key]);
    const reachable = buildReachabilityToStart(adjacency, start.variantKey, x);
    dfs(start.variantKey, 0, start, path, visitedSpecies, reachable);
  }

  function dfs(
    current: string,
    depth: number,
    start: TypeDefensePokemon,
    path: string[],
    visitedSpecies: Set<string>,
    reachable: Map<string, Set<number>>
  ) {
    const remaining = x - depth;
    if (remaining === 0) {
      if (current === start.variantKey) total += 1;
      return;
    }

    const nextKeys = adjacency.get(current) ?? [];
    for (const nextKey of nextKeys) {
      if (!reachable.get(nextKey)?.has(remaining - 1)) continue;
      const next = byVariantKey.get(nextKey);
      if (!next) continue;

      const isLastStep = remaining === 1;
      if (isLastStep) {
        if (nextKey !== start.variantKey) continue;
      } else if (next.key === start.key || visitedSpecies.has(next.key)) {
        continue;
      }

      path.push(nextKey);
      if (!isLastStep) visitedSpecies.add(next.key);
      dfs(nextKey, depth + 1, start, path, visitedSpecies, reachable);
      if (!isLastStep) visitedSpecies.delete(next.key);
      path.pop();
    }
  }

  return total;
}

export function findTypeDefensePartners(options: { pokemon: PokemonRecord[]; startKey: string }): TypeDefensePartnerResult | null {
  const startRecord = options.pokemon.find((item) => item.key === options.startKey);
  const start = startRecord ? selectPrimaryVariant(toTypeDefensePokemonVariants(startRecord)) : null;
  if (!start) return null;

  const candidates = options.pokemon
    .flatMap(toTypeDefensePokemonVariants)
    .filter((item) => item.key !== start.key)
    .sort(compareVariants);

  const perfect = candidates.filter((target) => isPerfectPartner(start.defenseProfile, target.defenseProfile));
  const perfectKeys = new Set(perfect.map((item) => item.variantKey));
  const general = candidates.filter(
    (target) => !perfectKeys.has(target.variantKey) && isGeneralPartner(start.defenseProfile, target.defenseProfile)
  );

  return {
    start,
    weaknesses: start.defenseProfile.weaknesses,
    perfect,
    general
  };
}

export function findCoverageBlindSpots(options: {
  pokemon: PokemonRecord[];
  attackTypes: string[];
}): CoverageBlindSpotResult {
  const selectedTypes = uniqueValidTypes(options.attackTypes);
  const nodes = options.pokemon.flatMap(toTypeDefensePokemonVariants).sort(compareVariants);
  const absolute = nodes.filter((target) => isAbsoluteBlindSpot(target.defenseProfile, selectedTypes));
  const absoluteKeys = new Set(absolute.map((item) => item.variantKey));
  const general = nodes.filter(
    (target) => !absoluteKeys.has(target.variantKey) && isGeneralBlindSpot(target.defenseProfile, selectedTypes)
  );

  return {
    selectedTypes: selectedTypes.map((type) => ({
      type,
      name: TYPE_NAMES[type]
    })),
    absolute,
    general
  };
}

export function isKnownPokemonType(type: string) {
  return TYPE_ORDER.includes(type);
}

export function toTypeDefensePokemon(pokemon: PokemonRecord): TypeDefensePokemon {
  return selectPrimaryVariant(toTypeDefensePokemonVariants(pokemon));
}

export function toTypeDefensePokemonVariants(pokemon: PokemonRecord): TypeDefensePokemon[] {
  const variants: TypeDefensePokemon[] = [];
  let hasNeutralAbility = pokemon.abilities.length === 0;

  for (const ability of pokemon.abilities) {
    const adjusted = applyAbilityDefenseEffects(pokemon.defenseProfile, [ability]);
    if (adjusted.appliedAbilities.length === 0) {
      hasNeutralAbility = true;
      continue;
    }

    variants.push(createTypeDefensePokemon(pokemon, adjusted.profile, adjusted.appliedAbilities, ability.key));
  }

  if (hasNeutralAbility || variants.length === 0) {
    variants.unshift(createTypeDefensePokemon(pokemon, pokemon.defenseProfile, [], "base"));
  }

  return variants;
}

function createTypeDefensePokemon(
  pokemon: PokemonRecord,
  defenseProfile: DefenseProfile,
  appliedAbilities: AbilityRecord[],
  variantId: string
): TypeDefensePokemon {
  return {
    variantKey: `${pokemon.key}::${variantId}`,
    key: pokemon.key,
    name: pokemon.name,
    dexId: pokemon.dexId,
    types: pokemon.types,
    imageUrl: pokemon.imageUrl,
    defenseProfile,
    abilities: pokemon.abilities,
    appliedAbilities
  };
}

export function applyAbilityDefenseEffects(baseProfile: DefenseProfile, abilities: AbilityRecord[]) {
  const multipliers = profileToMultipliers(baseProfile);
  const appliedAbilities: AbilityRecord[] = [];

  for (const ability of abilities) {
    const rules = rulesForAbility(ability);
    let changed = false;

    for (const rule of rules) {
      if (rule.kind === "immunity") {
        for (const type of rule.types) {
          if ((multipliers.get(type) ?? 1) !== 0) changed = true;
          multipliers.set(type, 0);
        }
      }

      if (rule.kind === "multiplier") {
        for (const type of rule.types) {
          const current = multipliers.get(type) ?? 1;
          const next = normalizeMultiplier(current * rule.factor);
          if (next !== current) changed = true;
          multipliers.set(type, next);
        }
      }

      if (rule.kind === "superEffectiveMultiplier") {
        for (const type of TYPE_ORDER) {
          const current = multipliers.get(type) ?? 1;
          if (current >= 2) {
            const next = normalizeMultiplier(current * rule.factor);
            if (next !== current) changed = true;
            multipliers.set(type, next);
          }
        }
      }

      if (rule.kind === "wonderGuard") {
        for (const type of TYPE_ORDER) {
          const current = multipliers.get(type) ?? 1;
          if (current <= 1 && current !== 0) {
            changed = true;
            multipliers.set(type, 0);
          }
        }
      }
    }

    if (changed) appliedAbilities.push(ability);
  }

  return {
    profile: multipliersToProfile(multipliers),
    appliedAbilities
  };
}

function buildTypeDefenseAdjacency(nodes: TypeDefensePokemon[]) {
  const map = new Map<string, string[]>();

  for (const source of nodes) {
    const targets = nodes
      .filter((target) => target.key !== source.key && coversWeaknesses(source.defenseProfile, target.defenseProfile))
      .map((target) => target.variantKey)
      .sort();

    map.set(source.variantKey, targets);
  }

  return map;
}

function coversWeaknesses(source: DefenseProfile, target: DefenseProfile) {
  return isPerfectPartner(source, target);
}

function isPerfectPartner(source: DefenseProfile, target: DefenseProfile) {
  if (source.weaknesses.length === 0) return false;
  return source.weaknesses.every((weakness) => getMultiplier(target, weakness.type) < 1);
}

function isGeneralPartner(source: DefenseProfile, target: DefenseProfile) {
  if (source.weaknesses.length === 0) return false;
  return source.weaknesses.every((weakness) => getMultiplier(target, weakness.type) < 2);
}

function isAbsoluteBlindSpot(profile: DefenseProfile, attackTypes: string[]) {
  if (attackTypes.length === 0) return false;
  return attackTypes.every((type) => getMultiplier(profile, type) < 1);
}

function isGeneralBlindSpot(profile: DefenseProfile, attackTypes: string[]) {
  if (attackTypes.length === 0) return false;
  return attackTypes.every((type) => getMultiplier(profile, type) < 2);
}

function getMultiplier(profile: DefenseProfile, type: string) {
  const effect = [...profile.weaknesses, ...profile.resistances, ...profile.immunities].find((item) => item.type === type);
  return effect?.multiplier ?? 1;
}

function profileToMultipliers(profile: DefenseProfile) {
  const multipliers = new Map<string, number>();
  for (const type of TYPE_ORDER) multipliers.set(type, 1);
  for (const effect of [...profile.weaknesses, ...profile.resistances, ...profile.immunities]) {
    multipliers.set(effect.type, effect.multiplier);
  }
  return multipliers;
}

function multipliersToProfile(multipliers: Map<string, number>): DefenseProfile {
  const effects = TYPE_ORDER.map((type) => ({
    type,
    name: TYPE_NAMES[type] ?? type,
    multiplier: multipliers.get(type) ?? 1
  }));

  return {
    weaknesses: effects.filter((effect) => effect.multiplier >= 2),
    resistances: effects.filter((effect) => effect.multiplier > 0 && effect.multiplier < 1),
    immunities: effects.filter((effect) => effect.multiplier === 0)
  };
}

function rulesForAbility(ability: AbilityRecord): AbilityRule[] {
  return KNOWN_ABILITY_RULES[ability.key] ?? genericRulesForAbility(ability.description);
}

function genericRulesForAbility(description: string): AbilityRule[] {
  const types = TYPE_ORDER.filter((type) => description.includes(`${TYPE_NAMES[type]}屬性`));
  if (types.length === 0) return [];

  if (description.includes("不會受到") && description.includes("傷害")) {
    return [{ kind: "immunity", types }];
  }

  if (description.includes("不會受到") && description.includes("招式")) {
    return [{ kind: "immunity", types }];
  }

  if (description.includes("傷害會減半") || description.includes("傷害減半")) {
    return [{ kind: "multiplier", types, factor: 0.5 }];
  }

  return [];
}

function buildReachabilityToStart(adjacency: Map<string, string[]>, startKey: string, maxSteps: number) {
  const allKeys = new Set<string>([startKey]);
  for (const [source, targets] of adjacency) {
    allKeys.add(source);
    for (const target of targets) allKeys.add(target);
  }

  const reachable = new Map<string, Set<number>>();
  for (const key of allKeys) reachable.set(key, new Set());
  reachable.get(startKey)?.add(0);

  for (let steps = 1; steps <= maxSteps; steps += 1) {
    for (const key of allKeys) {
      const targets = adjacency.get(key) ?? [];
      if (targets.some((target) => reachable.get(target)?.has(steps - 1))) {
        reachable.get(key)?.add(steps);
      }
    }
  }

  return reachable;
}

function normalizeMultiplier(value: number) {
  return Math.round(value * 1000) / 1000;
}

function selectPrimaryVariant(variants: TypeDefensePokemon[]) {
  return [...variants].sort((a, b) => {
    const weaknessDiff = a.defenseProfile.weaknesses.length - b.defenseProfile.weaknesses.length;
    if (weaknessDiff !== 0) return weaknessDiff;

    const immunityDiff = b.defenseProfile.immunities.length - a.defenseProfile.immunities.length;
    if (immunityDiff !== 0) return immunityDiff;

    const resistanceDiff = b.defenseProfile.resistances.length - a.defenseProfile.resistances.length;
    if (resistanceDiff !== 0) return resistanceDiff;

    return compareVariants(a, b);
  })[0];
}

function compareVariants(a: TypeDefensePokemon, b: TypeDefensePokemon) {
  const dexDiff = a.dexId - b.dexId;
  if (dexDiff !== 0) return dexDiff;

  const nameDiff = a.name.localeCompare(b.name, "zh-TW");
  if (nameDiff !== 0) return nameDiff;

  return a.variantKey.localeCompare(b.variantKey);
}

function uniqueValidTypes(types: string[]) {
  return [...new Set(types)].filter(isKnownPokemonType);
}
