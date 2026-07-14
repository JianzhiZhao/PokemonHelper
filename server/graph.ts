import type { MatchupEdge, PokemonRecord } from "./types.js";

export type ChainResult = {
  chain: PokemonRecord[];
  defenders: PokemonRecord[];
};

export function resolvePokemon(pokemon: PokemonRecord[], query: string) {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return null;

  const exact = pokemon.find((item) => item.key === lower || item.name === trimmed);
  if (exact) return exact;

  const matches = pokemon.filter((item) => item.name.includes(trimmed) || item.key.includes(lower));
  return matches.length === 1 ? matches[0] : null;
}

export function findDefenseCycles(options: {
  pokemon: PokemonRecord[];
  edges: MatchupEdge[];
  startKey: string;
  x: number;
  page: number;
  pageSize: number;
}) {
  const { pokemon, edges, startKey, x, page, pageSize } = options;
  const byKey = new Map(pokemon.map((item) => [item.key, item]));
  const adjacency = buildAdjacency(edges);
  const pathLength = x * 2;
  const offset = (page - 1) * pageSize;
  const pageChains: ChainResult[] = [];
  const recommendedKeys = new Set<string>();
  const path = [startKey];
  const visited = new Set([startKey]);
  const reachable = buildReachabilityToStart(adjacency, startKey, pathLength);
  let total = 0;

  function dfs(current: string, depth: number) {
    const remaining = pathLength - depth;
    if (remaining === 0) {
      if (current === startKey) recordChain();
      return;
    }

    const nextKeys = adjacency.get(current) ?? [];
    for (const nextKey of nextKeys) {
      if (!reachable.get(nextKey)?.has(remaining - 1)) continue;

      const isLastStep = remaining === 1;
      if (isLastStep) {
        if (nextKey !== startKey) continue;
      } else if (nextKey === startKey || visited.has(nextKey)) {
        continue;
      }

      path.push(nextKey);
      if (!isLastStep) visited.add(nextKey);
      dfs(nextKey, depth + 1);
      if (!isLastStep) visited.delete(nextKey);
      path.pop();
    }
  }

  function recordChain() {
    const chain = path.map((key) => byKey.get(key)).filter(Boolean) as PokemonRecord[];
    if (chain.length !== path.length) return;

    const defenders = chain.filter((_, index) => index < chain.length - 1 && index % 2 === 0);
    for (const defender of defenders) recommendedKeys.add(defender.key);

    if (total >= offset && pageChains.length < pageSize) {
      pageChains.push({ chain, defenders });
    }
    total += 1;
  }

  dfs(startKey, 0);

  const recommended = [...recommendedKeys]
    .map((key) => byKey.get(key))
    .filter(Boolean) as PokemonRecord[];

  return {
    total,
    recommended,
    chains: pageChains
  };
}

export function countDefenseCycles(options: {
  pokemon: PokemonRecord[];
  edges: MatchupEdge[];
  startKey: string;
  x: number;
}) {
  const { pokemon, edges, startKey, x } = options;
  const knownKeys = new Set(pokemon.map((item) => item.key));
  const adjacency = buildAdjacency(edges);
  const pathLength = x * 2;
  const path = [startKey];
  const visited = new Set([startKey]);
  const reachable = buildReachabilityToStart(adjacency, startKey, pathLength);
  let total = 0;

  if (!knownKeys.has(startKey)) return 0;

  function dfs(current: string, depth: number) {
    const remaining = pathLength - depth;
    if (remaining === 0) {
      if (current === startKey) total += 1;
      return;
    }

    const nextKeys = adjacency.get(current) ?? [];
    for (const nextKey of nextKeys) {
      if (!knownKeys.has(nextKey)) continue;
      if (!reachable.get(nextKey)?.has(remaining - 1)) continue;

      const isLastStep = remaining === 1;
      if (isLastStep) {
        if (nextKey !== startKey) continue;
      } else if (nextKey === startKey || visited.has(nextKey)) {
        continue;
      }

      path.push(nextKey);
      if (!isLastStep) visited.add(nextKey);
      dfs(nextKey, depth + 1);
      if (!isLastStep) visited.delete(nextKey);
      path.pop();
    }
  }

  dfs(startKey, 0);
  return total;
}

function buildAdjacency(edges: MatchupEdge[]) {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.sourceKey) ?? [];
    if (!list.includes(edge.targetKey)) list.push(edge.targetKey);
    map.set(edge.sourceKey, list);
  }
  for (const list of map.values()) list.sort();
  return map;
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
