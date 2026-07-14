import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CacheService } from "./cacheService.js";
import { PokemonDatabase } from "./db.js";
import type { DefenseProfile, PokemonRecord, Scraper } from "./types.js";

const emptyDefenseProfile: DefenseProfile = {
  weaknesses: [],
  resistances: [],
  immunities: []
};

function pokemon(key: string, name: string, dexId: number): PokemonRecord {
  return {
    key,
    name,
    dexId,
    types: [],
    imageUrl: null,
    defenseProfile: emptyDefenseProfile,
    abilities: []
  };
}

function waitForJob(service: CacheService, id: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      const job = service.getJob(id);
      if (!job) {
        clearInterval(timer);
        reject(new Error("missing job"));
        return;
      }
      if (job.status !== "running") {
        clearInterval(timer);
        resolve();
      }
    }, 10);
  });
}

async function createDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokemon-helper-"));
  const db = new PokemonDatabase(path.join(dir, "cache.sqlite"));
  await db.init();
  return db;
}

describe("cache service", () => {
  it("replaces cache after a successful refresh", async () => {
    const db = await createDb();
    const scraper: Scraper = {
      async fetchPokemonIndex() {
        return [pokemon("a", "A", 1), pokemon("b", "B", 2)];
      },
      async fetchPokemonDetail(key) {
        return {
          singleLosesTo: key === "a" ? ["b"] : ["a"],
          defenseProfile: emptyDefenseProfile,
          abilities: []
        };
      }
    };

    const service = new CacheService(db, scraper);
    const job = service.startRefresh();
    await waitForJob(service, job.id);

    expect(service.getJob(job.id)?.status).toBe("completed");
    expect(db.listPokemon()).toHaveLength(2);
    expect(db.listEdges()).toHaveLength(2);
    expect(service.getStatus().canQuery).toBe(true);
  });

  it("preserves old cache after a failed refresh", async () => {
    const db = await createDb();
    const goodScraper: Scraper = {
      async fetchPokemonIndex() {
        return [pokemon("a", "A", 1)];
      },
      async fetchPokemonDetail() {
        return {
          singleLosesTo: [],
          defenseProfile: emptyDefenseProfile,
          abilities: []
        };
      }
    };

    const goodService = new CacheService(db, goodScraper);
    const first = goodService.startRefresh();
    await waitForJob(goodService, first.id);

    const badScraper: Scraper = {
      async fetchPokemonIndex() {
        throw new Error("network down");
      },
      async fetchPokemonDetail() {
        return {
          singleLosesTo: [],
          defenseProfile: emptyDefenseProfile,
          abilities: []
        };
      }
    };

    const badService = new CacheService(db, badScraper);
    const failed = badService.startRefresh();
    await waitForJob(badService, failed.id);

    expect(badService.getJob(failed.id)?.status).toBe("failed");
    expect(db.listPokemon().map((item) => item.key)).toEqual(["a"]);
    expect(badService.getStatus().canQuery).toBe(true);
  });
});
