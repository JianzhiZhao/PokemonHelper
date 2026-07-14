import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CacheService } from "./cacheService.js";
import { PokemonDatabase } from "./db.js";
import { countDefenseCycles, findDefenseCycles, resolvePokemon } from "./graph.js";
import { OpggScraper } from "./scraper.js";
import {
  POKEMON_TYPE_OPTIONS,
  countTypeDefenseCycles,
  findCoverageBlindSpots,
  findTypeDefenseCycles,
  findTypeDefensePartners,
  isKnownPokemonType
} from "./typeDefense.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 5174);

const db = new PokemonDatabase(path.join(rootDir, "data", "pokemon-cache.sqlite"));
await db.init();

const cacheService = new CacheService(db, new OpggScraper());
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/cache/status", (_request, response) => {
  response.json(cacheService.getStatus());
});

app.post("/api/cache/refresh", (_request, response) => {
  response.json(cacheService.startRefresh());
});

app.get("/api/cache/jobs/:id", (request, response) => {
  const job = cacheService.getJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: "找不到快取任務" });
    return;
  }
  response.json(job);
});

app.get("/api/pokemon", (_request, response) => {
  response.json(db.listPokemon());
});

app.get("/api/types", (_request, response) => {
  response.json(POKEMON_TYPE_OPTIONS);
});

app.get("/api/pokemon/chain-counts", (request, response) => {
  const x = Number(request.query.x ?? 2);
  if (x !== 2) {
    response.status(400).json({ error: "全列表鏈條數目前只支援 X=2" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  const pokemon = db.listPokemon();
  const edges = db.listEdges();
  const counts = Object.fromEntries(
    pokemon.map((item) => [
      item.key,
      countDefenseCycles({
        pokemon,
        edges,
        startKey: item.key,
        x
      })
    ])
  );

  response.json({ x, counts });
});

app.get("/api/pokemon/type-defense-chain-counts", (request, response) => {
  const x = Number(request.query.x ?? 3);
  if (!Number.isInteger(x) || x < 2 || x > 5) {
    response.status(400).json({ error: "屬性聯防鏈數支援 X=2..5" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  if (!db.hasTypeDefenseData()) {
    response.status(409).json({ error: "屬性聯防資料尚未快取，請重新快取" });
    return;
  }

  const pokemon = db.listPokemon();
  const counts = Object.fromEntries(
    pokemon.map((item) => [
      item.key,
      countTypeDefenseCycles({
        pokemon,
        startKey: item.key,
        x
      })
    ])
  );

  response.json({ x, counts });
});

app.post("/api/search", (request, response) => {
  const body = z
    .object({
      pokemonName: z.string().min(1),
      x: z.number().int().min(1).max(5),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20)
    })
    .safeParse(request.body);

  if (!body.success) {
    response.status(400).json({ error: "查詢參數不正確" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  const pokemon = db.listPokemon();
  const start = resolvePokemon(pokemon, body.data.pokemonName);
  if (!start) {
    response.status(404).json({ error: "找不到唯一相符的寶可夢" });
    return;
  }

  const result = findDefenseCycles({
    pokemon,
    edges: db.listEdges(),
    startKey: start.key,
    x: body.data.x,
    page: body.data.page,
    pageSize: body.data.pageSize
  });

  response.json({
    start,
    x: body.data.x,
    page: body.data.page,
    pageSize: body.data.pageSize,
    total: result.total,
    recommended: result.recommended,
    chains: result.chains
  });
});

app.post("/api/type-defense/search", (request, response) => {
  const body = z
    .object({
      pokemonName: z.string().min(1),
      x: z.number().int().min(2).max(5),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20)
    })
    .safeParse(request.body);

  if (!body.success) {
    response.status(400).json({ error: "查詢參數不正確" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  if (!db.hasTypeDefenseData()) {
    response.status(409).json({ error: "屬性聯防資料尚未快取，請重新快取" });
    return;
  }

  const pokemon = db.listPokemon();
  const start = resolvePokemon(pokemon, body.data.pokemonName);
  if (!start) {
    response.status(404).json({ error: "找不到唯一相符的寶可夢" });
    return;
  }

  const result = findTypeDefenseCycles({
    pokemon,
    startKey: start.key,
    x: body.data.x,
    page: body.data.page,
    pageSize: body.data.pageSize
  });

  response.json({
    start,
    x: body.data.x,
    page: body.data.page,
    pageSize: body.data.pageSize,
    total: result.total,
    recommended: result.recommended,
    chains: result.chains
  });
});

app.post("/api/type-defense/partners", (request, response) => {
  const body = z
    .object({
      pokemonName: z.string().min(1)
    })
    .safeParse(request.body);

  if (!body.success) {
    response.status(400).json({ error: "查詢參數不正確" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  if (!db.hasTypeDefenseData()) {
    response.status(409).json({ error: "屬性聯防資料尚未快取，請重新快取" });
    return;
  }

  const pokemon = db.listPokemon();
  const start = resolvePokemon(pokemon, body.data.pokemonName);
  if (!start) {
    response.status(404).json({ error: "找不到唯一相符的寶可夢" });
    return;
  }

  const result = findTypeDefensePartners({
    pokemon,
    startKey: start.key
  });

  if (!result) {
    response.status(404).json({ error: "找不到唯一相符的寶可夢" });
    return;
  }

  response.json(result);
});

app.post("/api/coverage/blind-spots", (request, response) => {
  const body = z
    .object({
      attackTypes: z.array(z.string()).min(1).max(4)
    })
    .safeParse(request.body);

  if (!body.success) {
    response.status(400).json({ error: "請選擇 1 到 4 個攻擊屬性" });
    return;
  }

  const attackTypes = [...new Set(body.data.attackTypes)];
  if (attackTypes.length !== body.data.attackTypes.length || attackTypes.some((type) => !isKnownPokemonType(type))) {
    response.status(400).json({ error: "攻擊屬性不正確" });
    return;
  }

  const latest = db.getLatestCompletedRun();
  if (!latest) {
    response.status(409).json({ error: "尚未建立快取" });
    return;
  }

  if (!db.hasTypeDefenseData()) {
    response.status(409).json({ error: "屬性聯防資料尚未快取，請重新快取" });
    return;
  }

  response.json(
    findCoverageBlindSpots({
      pokemon: db.listPokemon(),
      attackTypes
    })
  );
});

const distDir = path.join(rootDir, "dist");
app.use(express.static(distDir));
app.get("*", (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Pokemon Helper API listening on http://127.0.0.1:${port}`);
});
