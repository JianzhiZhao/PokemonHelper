import { describe, expect, it } from "vitest";
import {
  applyAbilityDefenseEffects,
  findCoverageBlindSpots,
  findTypeDefenseCycles,
  findTypeDefensePartners
} from "./typeDefense.js";
import type { DefenseProfile, PokemonRecord, TypeEffect } from "./types.js";

function effect(type: string, name: string, multiplier: number): TypeEffect {
  return { type, name, multiplier };
}

function profile(options: Partial<DefenseProfile>): DefenseProfile {
  return {
    weaknesses: options.weaknesses ?? [],
    resistances: options.resistances ?? [],
    immunities: options.immunities ?? []
  };
}

function pokemon(key: string, name: string, defenseProfile: DefenseProfile): PokemonRecord {
  return {
    key,
    name,
    dexId: key.length,
    types: [],
    imageUrl: null,
    defenseProfile,
    abilities: []
  };
}

describe("type defense graph", () => {
  it("finds the Pelipper, Swampert, Archaludon defensive loop for X=3", () => {
    const pelipper = pokemon(
      "pelipper",
      "大嘴鷗",
      profile({
        weaknesses: [effect("electric", "電", 4), effect("rock", "岩石", 2)],
        resistances: [
          effect("fire", "火", 0.5),
          effect("water", "水", 0.5),
          effect("fighting", "格鬥", 0.5),
          effect("bug", "蟲", 0.5),
          effect("steel", "鋼", 0.5)
        ],
        immunities: [effect("ground", "地面", 0)]
      })
    );
    const swampert = pokemon(
      "swampert",
      "巨沼怪",
      profile({
        weaknesses: [effect("grass", "草", 4)],
        resistances: [effect("rock", "岩石", 0.5)],
        immunities: [effect("electric", "電", 0)]
      })
    );
    const archaludon = pokemon(
      "archaludon",
      "鋁鋼橋龍",
      profile({
        weaknesses: [effect("fighting", "格鬥", 2), effect("ground", "地面", 2)],
        resistances: [effect("grass", "草", 0.25)]
      })
    );

    const result = findTypeDefenseCycles({
      pokemon: [pelipper, swampert, archaludon],
      startKey: "pelipper",
      x: 3,
      page: 1,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.chains[0].chain.map((item) => item.key)).toEqual([
      "pelipper",
      "swampert",
      "archaludon",
      "pelipper"
    ]);
    expect(result.chains[0].members.map((item) => item.name)).toEqual(["大嘴鷗", "巨沼怪", "鋁鋼橋龍"]);
  });

  it("removes Fire as a Mamoswine weakness when Thick Fat is available", () => {
    const adjusted = applyAbilityDefenseEffects(
      profile({
        weaknesses: [
          effect("fire", "火", 2),
          effect("water", "水", 2),
          effect("grass", "草", 2),
          effect("fighting", "格鬥", 2),
          effect("steel", "鋼", 2)
        ],
        resistances: [effect("poison", "毒", 0.5)],
        immunities: [effect("electric", "電", 0)]
      }),
      [
        {
          key: "thick-fat",
          name: "厚脂肪",
          description: "因火屬性、冰屬性招式 而受到的傷害會減半。"
        }
      ]
    );

    expect(adjusted.profile.weaknesses.map((item) => item.type)).toEqual(["water", "grass", "fighting", "steel"]);
    expect(adjusted.profile.resistances.map((item) => [item.type, item.multiplier])).toContainEqual(["ice", 0.5]);
    expect(adjusted.appliedAbilities.map((item) => item.key)).toEqual(["thick-fat"]);
  });

  it("separates perfect partners from general partners", () => {
    const source = pokemon(
      "source",
      "A",
      profile({
        weaknesses: [effect("ground", "地面", 2), effect("water", "水", 2)]
      })
    );
    const general = pokemon(
      "general",
      "B",
      profile({
        weaknesses: [effect("grass", "草", 2)],
        resistances: [effect("water", "水", 0.5)]
      })
    );
    const perfect = pokemon(
      "perfect",
      "C",
      profile({
        weaknesses: [effect("grass", "草", 2)],
        resistances: [effect("ground", "地面", 0.5)],
        immunities: [effect("water", "水", 0)]
      })
    );
    const sharedWeakness = pokemon(
      "shared",
      "D",
      profile({
        weaknesses: [effect("ground", "地面", 2)]
      })
    );

    const result = findTypeDefensePartners({
      pokemon: [source, general, perfect, sharedWeakness],
      startKey: "source"
    });

    expect(result?.perfect.map((item) => item.key)).toEqual(["perfect"]);
    expect(result?.general.map((item) => item.key)).toEqual(["general"]);
  });

  it("does not combine multiple defensive abilities on the same pokemon", () => {
    const source = pokemon(
      "source",
      "A",
      profile({
        weaknesses: [effect("fire", "火", 2), effect("grass", "草", 2)]
      })
    );
    const azumarill = {
      ...pokemon(
        "azumarill",
        "瑪力露麗",
        profile({
          weaknesses: [
            effect("electric", "電", 2),
            effect("grass", "草", 2),
            effect("poison", "毒", 2)
          ],
          resistances: [
            effect("fire", "火", 0.5),
            effect("water", "水", 0.5),
            effect("ice", "冰", 0.5),
            effect("fighting", "格鬥", 0.5),
            effect("bug", "蟲", 0.5),
            effect("dark", "惡", 0.5)
          ],
          immunities: [effect("dragon", "龍", 0)]
        })
      ),
      abilities: [
        {
          key: "sap-sipper",
          name: "食草",
          description: "草屬性招式無效， 反而會讓攻擊提高1階。"
        },
        {
          key: "thick-fat",
          name: "厚脂肪",
          description: "因火屬性、冰屬性招式 而受到的傷害會減半。"
        }
      ]
    };

    const result = findTypeDefensePartners({
      pokemon: [source, azumarill],
      startKey: "source"
    });

    expect(result?.perfect.map((item) => item.variantKey)).toEqual(["azumarill::sap-sipper"]);
    expect(result?.perfect[0].appliedAbilities.map((item) => item.name)).toEqual(["食草"]);
    expect(result?.general.map((item) => item.variantKey)).toEqual([]);
  });

  it("classifies coverage blind spots by selected attack types", () => {
    const absolute = pokemon(
      "absolute",
      "絕對",
      profile({
        resistances: [effect("fire", "火", 0.5)],
        immunities: [effect("grass", "草", 0)]
      })
    );
    const general = pokemon(
      "general",
      "一般",
      profile({
        resistances: [effect("fire", "火", 0.5)]
      })
    );
    const weak = pokemon(
      "weak",
      "弱點",
      profile({
        weaknesses: [effect("grass", "草", 2)]
      })
    );

    const result = findCoverageBlindSpots({
      pokemon: [absolute, general, weak],
      attackTypes: ["fire", "grass"]
    });

    expect(result.selectedTypes.map((item) => item.type)).toEqual(["fire", "grass"]);
    expect(result.absolute.map((item) => item.key)).toEqual(["absolute"]);
    expect(result.general.map((item) => item.key)).toEqual(["general"]);
  });

  it("keeps defensive abilities separate for coverage blind spots", () => {
    const azumarill = {
      ...pokemon(
        "azumarill",
        "瑪力露麗",
        profile({
          weaknesses: [
            effect("electric", "電", 2),
            effect("grass", "草", 2),
            effect("poison", "毒", 2)
          ],
          resistances: [
            effect("fire", "火", 0.5),
            effect("water", "水", 0.5),
            effect("ice", "冰", 0.5),
            effect("fighting", "格鬥", 0.5),
            effect("bug", "蟲", 0.5),
            effect("dark", "惡", 0.5)
          ],
          immunities: [effect("dragon", "龍", 0)]
        })
      ),
      abilities: [
        {
          key: "sap-sipper",
          name: "食草",
          description: "草屬性招式無效， 反而會讓攻擊提高1階。"
        },
        {
          key: "thick-fat",
          name: "厚脂肪",
          description: "因火屬性、冰屬性招式 而受到的傷害會減半。"
        }
      ]
    };

    const result = findCoverageBlindSpots({
      pokemon: [azumarill],
      attackTypes: ["fire", "grass"]
    });

    expect(result.absolute.map((item) => item.variantKey)).toEqual(["azumarill::sap-sipper"]);
    expect(result.absolute[0].appliedAbilities.map((item) => item.name)).toEqual(["食草"]);
    expect(result.general.map((item) => item.variantKey)).toEqual([]);
  });
});
