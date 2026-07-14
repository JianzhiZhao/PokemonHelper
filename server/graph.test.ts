import { describe, expect, it } from "vitest";
import { countDefenseCycles, findDefenseCycles, resolvePokemon } from "./graph.js";
import type { MatchupEdge, PokemonRecord } from "./types.js";

function pokemon(key: string): PokemonRecord {
  return {
    key,
    name: key.toUpperCase(),
    dexId: key.charCodeAt(0),
    types: [],
    imageUrl: null,
    defenseProfile: {
      weaknesses: [],
      resistances: [],
      immunities: []
    },
    abilities: []
  };
}

describe("graph search", () => {
  it("finds a length-4 defensive cycle for X=2", () => {
    const records = ["a", "b", "c", "d"].map(pokemon);
    const edges: MatchupEdge[] = [
      { sourceKey: "a", targetKey: "b" },
      { sourceKey: "b", targetKey: "c" },
      { sourceKey: "c", targetKey: "d" },
      { sourceKey: "d", targetKey: "a" }
    ];

    const result = findDefenseCycles({
      pokemon: records,
      edges,
      startKey: "a",
      x: 2,
      page: 1,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.chains[0].chain.map((item) => item.key)).toEqual(["a", "b", "c", "d", "a"]);
    expect(result.chains[0].defenders.map((item) => item.key)).toEqual(["a", "c"]);
    expect(result.recommended.map((item) => item.key)).toEqual(["a", "c"]);
    expect(countDefenseCycles({ pokemon: records, edges, startKey: "a", x: 2 })).toBe(1);
  });

  it("resolves exact and unique fuzzy pokemon names", () => {
    const records = [pokemon("mimikyu"), { ...pokemon("metagross"), name: "巨金怪" }];

    expect(resolvePokemon(records, "巨金怪")?.key).toBe("metagross");
    expect(resolvePokemon(records, "meta")?.key).toBe("metagross");
    expect(resolvePokemon(records, "missing")).toBeNull();
  });
});
