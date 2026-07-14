export type PokemonRecord = {
  key: string;
  name: string;
  dexId: number;
  types: string[];
  imageUrl: string | null;
  defenseProfile: DefenseProfile;
  abilities: AbilityRecord[];
};

export type MatchupEdge = {
  sourceKey: string;
  targetKey: string;
};

export type CacheRunRecord = {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  pokemonCount: number;
  edgeCount: number;
};

export type CacheJob = {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  totalPokemon: number;
  processedPokemon: number;
  edgeCount: number;
  currentPokemon: string | null;
  error: string | null;
};

export type TypeEffect = {
  type: string;
  name: string;
  multiplier: number;
};

export type DefenseProfile = {
  weaknesses: TypeEffect[];
  resistances: TypeEffect[];
  immunities: TypeEffect[];
};

export type AbilityRecord = {
  key: string;
  name: string;
  description: string;
};

export type PokemonPageDetail = {
  singleLosesTo: string[];
  defenseProfile: DefenseProfile;
  abilities: AbilityRecord[];
};

export type Scraper = {
  fetchPokemonIndex(): Promise<PokemonRecord[]>;
  fetchPokemonDetail(key: string): Promise<PokemonPageDetail>;
};
