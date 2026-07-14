export type PokemonSummary = {
  key: string;
  name: string;
  dexId: number;
  types: string[];
  imageUrl: string | null;
  defenseProfile: DefenseProfile;
  abilities: AbilityRecord[];
};

export type CacheStatus = {
  canQuery: boolean;
  lastCompletedAt: string | null;
  pokemonCount: number;
  edgeCount: number;
  typeProfileCount: number;
  activeJob: CacheJob | null;
  lastRun: CacheRun | null;
};

export type CacheRun = {
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

export type SearchChain = {
  chain: PokemonSummary[];
  defenders: PokemonSummary[];
};

export type SearchResponse = {
  start: PokemonSummary;
  x: number;
  total: number;
  page: number;
  pageSize: number;
  recommended: PokemonSummary[];
  chains: SearchChain[];
};

export type TypeEffect = {
  type: string;
  name: string;
  multiplier: number;
};

export type PokemonTypeInfo = {
  type: string;
  name: string;
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

export type TypeDefensePokemonSummary = PokemonSummary & {
  variantKey: string;
  defenseProfile: DefenseProfile;
  appliedAbilities: AbilityRecord[];
};

export type TypeDefenseChain = {
  chain: TypeDefensePokemonSummary[];
  members: TypeDefensePokemonSummary[];
};

export type TypeDefenseSearchResponse = {
  start: PokemonSummary;
  x: number;
  total: number;
  page: number;
  pageSize: number;
  recommended: TypeDefensePokemonSummary[];
  chains: TypeDefenseChain[];
};

export type TypeDefensePartnerResponse = {
  start: TypeDefensePokemonSummary;
  weaknesses: TypeEffect[];
  perfect: TypeDefensePokemonSummary[];
  general: TypeDefensePokemonSummary[];
};

export type CoverageBlindSpotResponse = {
  selectedTypes: PokemonTypeInfo[];
  absolute: TypeDefensePokemonSummary[];
  general: TypeDefensePokemonSummary[];
};
