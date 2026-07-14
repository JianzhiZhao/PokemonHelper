import crypto from "node:crypto";
import type { PokemonDatabase } from "./db.js";
import type { CacheJob, MatchupEdge, Scraper } from "./types.js";

const CONCURRENCY = 4;
const REQUEST_DELAY_MS = 80;

export class CacheService {
  private activeJob: CacheJob | null = null;
  private jobs = new Map<string, CacheJob>();

  constructor(
    private readonly db: PokemonDatabase,
    private readonly scraper: Scraper
  ) {}

  getActiveJob() {
    return this.activeJob;
  }

  getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }

  getStatus() {
    const latestCompleted = this.db.getLatestCompletedRun();
    const latestRun = this.db.getLatestRun();
    const counts = this.db.counts();
    return {
      canQuery: Boolean(latestCompleted),
      lastCompletedAt: latestCompleted?.finishedAt ?? null,
      pokemonCount: counts.pokemonCount,
      edgeCount: counts.edgeCount,
      typeProfileCount: counts.typeProfileCount,
      activeJob: this.activeJob,
      lastRun: latestRun
    };
  }

  startRefresh() {
    if (this.activeJob?.status === "running") return this.activeJob;

    const now = new Date().toISOString();
    const job: CacheJob = {
      id: crypto.randomUUID(),
      status: "running",
      startedAt: now,
      finishedAt: null,
      totalPokemon: 0,
      processedPokemon: 0,
      edgeCount: 0,
      currentPokemon: null,
      error: null
    };

    this.activeJob = job;
    this.jobs.set(job.id, job);
    this.db.createRun({
      id: job.id,
      status: "running",
      startedAt: job.startedAt,
      finishedAt: null,
      error: null,
      pokemonCount: 0,
      edgeCount: 0
    });

    void this.runRefresh(job);
    return job;
  }

  private async runRefresh(job: CacheJob) {
    try {
      const pokemon = await this.scraper.fetchPokemonIndex();
      const validKeys = new Set(pokemon.map((item) => item.key));
      const edges: MatchupEdge[] = [];
      let cursor = 0;

      job.totalPokemon = pokemon.length;

      const worker = async () => {
        while (cursor < pokemon.length) {
          const item = pokemon[cursor];
          cursor += 1;
          job.currentPokemon = item.name;

          const detail = await this.scraper.fetchPokemonDetail(item.key);
          item.defenseProfile = detail.defenseProfile;
          item.abilities = detail.abilities;

          for (const targetKey of detail.singleLosesTo) {
            if (validKeys.has(targetKey)) {
              edges.push({ sourceKey: item.key, targetKey });
            }
          }

          job.processedPokemon += 1;
          job.edgeCount = edges.length;
          await delay(REQUEST_DELAY_MS);
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      const finishedAt = new Date().toISOString();
      this.db.replaceCache(job.id, finishedAt, pokemon, edges);
      job.status = "completed";
      job.finishedAt = finishedAt;
      job.currentPokemon = null;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : "未知快取錯誤";
      job.status = "failed";
      job.finishedAt = finishedAt;
      job.error = message;
      job.currentPokemon = null;
      this.db.markRunFailed(job.id, finishedAt, message);
    } finally {
      if (this.activeJob?.id === job.id) {
        this.activeJob = null;
      }
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
