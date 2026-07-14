import { describe, expect, it } from "vitest";
import { parsePokedexPage, parsePokemonDetailPage, parseSingleLosePokemonKeys } from "./scraper.js";

describe("scraper parsers", () => {
  it("extracts the pokedex payload", () => {
    const html = 'x \\"pokemon\\":[{\\"id\\":778,\\"key\\":\\"mimikyu\\",\\"name\\":\\"謎擬Ｑ\\",\\"types\\":[\\"ghost\\",\\"fairy\\"]}] y';

    expect(parsePokedexPage(html)).toEqual([
      {
        key: "mimikyu",
        name: "謎擬Ｑ",
        dexId: 778,
        types: ["ghost", "fairy"],
        imageUrl: "https://s-stats-platform-cdn.op.gg/pokemon/images/pokemon/778.png",
        defenseProfile: {
          weaknesses: [],
          resistances: [],
          immunities: []
        },
        abilities: []
      }
    ]);
  });

  it("extracts only the first single-battle lose-pokemon section", () => {
    const html = [
      '\\"$1\\",\\"lose-pokemon\\"',
      '\\"href\\":\\"/pokemon-champions/pokedex/metagross\\"',
      '\\"href\\":\\"/pokemon-champions/pokedex/archaludon\\"',
      '\\"href\\":\\"/pokemon-champions/pokedex/mimikyu\\"',
      '\\"href\\":\\"/pokemon-champions/pokedex/gyarados\\"',
      '\\"$1\\",\\"lose-moves\\"',
      '\\"$1\\",\\"lose-pokemon\\"',
      '\\"href\\":\\"/pokemon-champions/pokedex/passimian\\"',
      '\\"$1\\",\\"lose-moves\\"'
    ].join("");

    expect(parseSingleLosePokemonKeys(html)).toEqual(["metagross", "archaludon", "mimikyu", "gyarados"]);
  });

  it("extracts type defenses and abilities from a pokemon detail page", () => {
    const html = [
      '<section><h3 class="mb-3 text-base font-semibold">屬性相剋</h3>',
      '<div><p class="mb-1.5 text-sm font-medium text-red-400">弱點</p>',
      '<span><img src="https://cdn/pokemon/images/type/electric.svg"/>電</span><span>4x</span>',
      '<span><img src="https://cdn/pokemon/images/type/rock.svg"/>岩石</span><span>2x</span></div>',
      '<div><p class="mb-1.5 text-sm font-medium text-green-400">抵抗</p>',
      '<span><img src="https://cdn/pokemon/images/type/fire.svg"/>火</span><span>½x</span></div>',
      '<div><p class="mb-1.5 text-sm font-medium text-blue-400">免疫</p>',
      '<span><img src="https://cdn/pokemon/images/type/ground.svg"/>地面</span><span>0x</span></div>',
      "</section>",
      '<section><h3 class="mb-3 text-base font-semibold">特性</h3>',
      '<a href="/zh-tw/pokemon-champions/abilities/thick-fat">',
      '<span><span class="truncate">厚脂肪</span></span>',
      '<span class="text-muted-foreground text-sm leading-snug">因火屬性、冰屬性招式 而受到的傷害會減半。</span>',
      "</a></section>"
    ].join("");

    const detail = parsePokemonDetailPage(html);

    expect(detail.defenseProfile.weaknesses.map((item) => [item.type, item.multiplier])).toEqual([
      ["electric", 4],
      ["rock", 2]
    ]);
    expect(detail.defenseProfile.resistances.map((item) => [item.type, item.multiplier])).toEqual([["fire", 0.5]]);
    expect(detail.defenseProfile.immunities.map((item) => [item.type, item.multiplier])).toEqual([["ground", 0]]);
    expect(detail.abilities).toEqual([
      {
        key: "thick-fat",
        name: "厚脂肪",
        description: "因火屬性、冰屬性招式 而受到的傷害會減半。"
      }
    ]);
  });
});
