import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Database,
  RefreshCcw,
  Search,
  Shield,
  Swords
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CacheJob,
  CacheStatus,
  CoverageBlindSpotResponse,
  DefenseProfile,
  PokemonTypeInfo,
  PokemonSummary,
  SearchResponse,
  TypeDefensePartnerResponse,
  TypeDefensePokemonSummary,
  TypeDefenseSearchResponse,
  TypeEffect
} from "./types";

const X_VALUES = [2, 3, 4, 5] as const;
const PAGE_SIZE = 8;
const TYPE_COUNT_X = 3;

type XValue = (typeof X_VALUES)[number];
type ViewMode = "battle" | "type" | "coverage";

type ChainState<T> = {
  loading: boolean;
  error: string | null;
  page: number;
  result: T | null;
};

type PartnerState = {
  loading: boolean;
  error: string | null;
  result: TypeDefensePartnerResponse | null;
};

type CoverageState = {
  loading: boolean;
  error: string | null;
  result: CoverageBlindSpotResponse | null;
};

function createChainState<T>(loading = false): Record<XValue, ChainState<T>> {
  return X_VALUES.reduce(
    (states, x) => {
      states[x] = { loading, error: null, page: 1, result: null };
      return states;
    },
    {} as Record<XValue, ChainState<T>>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function formatTime(value: string | null) {
  if (!value) return "尚未快取";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatMultiplier(value: number) {
  if (value === 0) return "0x";
  if (value === 0.25) return "¼x";
  if (value === 0.5) return "½x";
  if (Number.isInteger(value)) return `${value}x`;
  return `${value}x`;
}

function PokemonChip({ pokemon }: { pokemon: Pick<PokemonSummary, "imageUrl" | "name"> }) {
  return (
    <span className="pokemon-chip">
      {pokemon.imageUrl ? <img src={pokemon.imageUrl} alt="" /> : null}
      <span>{pokemon.name}</span>
    </span>
  );
}

function BattleChainPanel({
  x,
  state,
  onPage
}: {
  x: XValue;
  state: ChainState<SearchResponse>;
  onPage: (x: XValue, page: number) => void;
}) {
  const result = state.result;
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section className="chain-panel">
      <ChainPanelHeader x={x} state={state} pageCount={pageCount} onPage={onPage} />

      <PanelStatus state={state} />

      {!state.loading && result && result.recommended.length > 0 ? (
        <div className="recommendation-row">
          {result.recommended.map((item) => (
            <PokemonChip pokemon={item} key={item.key} />
          ))}
        </div>
      ) : null}

      {!state.loading && result && result.total === 0 ? <div className="empty-panel">沒有符合的閉環鏈。</div> : null}

      {!state.loading && result && result.chains.length > 0 ? (
        <div className="chain-list">
          {result.chains.map((chain, index) => (
            <article className="chain-row" key={`${x}-${state.page}-${index}-${chain.chain.map((item) => item.key).join("-")}`}>
              <div className="defenders">
                {chain.defenders.map((item) => (
                  <PokemonChip pokemon={item} key={item.key} />
                ))}
              </div>
              <div className="chain-path">
                {chain.chain.map((item, itemIndex) => (
                  <span key={`${item.key}-${itemIndex}`}>
                    <PokemonChip pokemon={item} />
                    {itemIndex < chain.chain.length - 1 ? <b>→</b> : null}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TypeDefenseChainPanel({
  x,
  state,
  onPage
}: {
  x: XValue;
  state: ChainState<TypeDefenseSearchResponse>;
  onPage: (x: XValue, page: number) => void;
}) {
  const result = state.result;
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section className="chain-panel">
      <ChainPanelHeader x={x} state={state} pageCount={pageCount} onPage={onPage} />

      <PanelStatus state={state} />

      {!state.loading && result && result.recommended.length > 0 ? (
        <div className="recommendation-row">
          {result.recommended.map((item) => (
            <PokemonChip pokemon={item} key={item.variantKey} />
          ))}
        </div>
      ) : null}

      {!state.loading && result && result.total === 0 ? <div className="empty-panel">沒有符合的屬性聯防閉環。</div> : null}

      {!state.loading && result && result.chains.length > 0 ? (
        <div className="chain-list">
          {result.chains.map((chain, index) => (
            <article
              className="chain-row type-chain-row"
              key={`${x}-${state.page}-${index}-${chain.chain.map((item) => item.variantKey).join("-")}`}
            >
              <div className="type-member-grid">
                {chain.members.map((item) => (
                  <TypeDefenseCard pokemon={item} key={item.variantKey} />
                ))}
              </div>
              <div className="chain-path">
                {chain.chain.map((item, itemIndex) => (
                  <span key={`${item.variantKey}-${itemIndex}`}>
                    <PokemonChip pokemon={item} />
                    {itemIndex < chain.chain.length - 1 ? <b>→</b> : null}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TypeDefensePartnerPanel({ state }: { state: PartnerState }) {
  const result = state.result;

  return (
    <section className="chain-panel partner-panel">
      <div className="chain-panel-header">
        <div>
          <h2>聯防寶可夢</h2>
          <p>
            {state.loading
              ? "計算中..."
              : result
                ? `完美 ${result.perfect.length.toLocaleString("zh-TW")} / 一般 ${result.general.length.toLocaleString("zh-TW")}`
                : "尚未載入"}
          </p>
        </div>
      </div>

      {state.error ? (
        <div className="inline-error">
          <AlertCircle size={16} />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.loading ? (
        <div className="panel-loading">
          <span />
          <span />
        </div>
      ) : null}

      {!state.loading && result ? (
        <>
          <div className="partner-weaknesses">
            <strong>{result.start.name} 弱點</strong>
            <div>
              {result.weaknesses.length > 0 ? (
                result.weaknesses.map((effect) => <TypeEffectBadge effect={effect} tone="weak" key={effect.type} />)
              ) : (
                <small>無 2x 以上弱點</small>
              )}
            </div>
          </div>

          <PartnerGroup title="完美聯防" pokemon={result.perfect} emptyText="沒有完美聯防寶可夢。" />
          <PartnerGroup title="一般聯防" pokemon={result.general} emptyText="沒有一般聯防寶可夢。" />
        </>
      ) : null}
    </section>
  );
}

function CoveragePanel({
  attackTypes,
  selectedTypes,
  state,
  onToggleType
}: {
  attackTypes: PokemonTypeInfo[];
  selectedTypes: string[];
  state: CoverageState;
  onToggleType: (type: string) => void;
}) {
  const result = state.result;

  return (
    <section className="coverage-area">
      <section className="chain-panel">
        <div className="chain-panel-header">
          <div>
            <h2>打點盲區</h2>
            <p>
              {state.loading
                ? "計算中..."
                : result
                  ? `絕對 ${result.absolute.length.toLocaleString("zh-TW")} / 一般 ${result.general.length.toLocaleString("zh-TW")}`
                  : `${selectedTypes.length}/4`}
            </p>
          </div>
        </div>

        <div className="type-selector" role="group" aria-label="攻擊屬性">
          {attackTypes.map((type) => {
            const active = selectedTypes.includes(type.type);
            const disabled = !active && selectedTypes.length >= 4;
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                onClick={() => onToggleType(type.type)}
                disabled={disabled}
                key={type.type}
              >
                {type.name}
              </button>
            );
          })}
        </div>

        {state.error ? (
          <div className="inline-error">
            <AlertCircle size={16} />
            <span>{state.error}</span>
          </div>
        ) : null}

        {state.loading ? (
          <div className="panel-loading">
            <span />
            <span />
          </div>
        ) : null}

        {!state.loading && selectedTypes.length === 0 ? <div className="empty-panel">請選擇攻擊屬性。</div> : null}

        {!state.loading && result ? (
          <>
            <CoverageGroup title="絕對盲區" pokemon={result.absolute} emptyText="沒有絕對盲區寶可夢。" />
            <CoverageGroup title="一般盲區" pokemon={result.general} emptyText="沒有一般盲區寶可夢。" />
          </>
        ) : null}
      </section>
    </section>
  );
}

function CoverageGroup({
  title,
  pokemon,
  emptyText
}: {
  title: string;
  pokemon: TypeDefensePokemonSummary[];
  emptyText: string;
}) {
  return (
    <section className="partner-group">
      <div className="partner-group-heading">
        <h3>{title}</h3>
        <span>{pokemon.length.toLocaleString("zh-TW")}</span>
      </div>
      {pokemon.length > 0 ? (
        <div className="type-member-grid partner-grid">
          {pokemon.map((item) => (
            <TypeDefenseCard pokemon={item} key={item.variantKey} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">{emptyText}</div>
      )}
    </section>
  );
}

function PartnerGroup({
  title,
  pokemon,
  emptyText
}: {
  title: string;
  pokemon: TypeDefensePokemonSummary[];
  emptyText: string;
}) {
  return (
    <section className="partner-group">
      <div className="partner-group-heading">
        <h3>{title}</h3>
        <span>{pokemon.length.toLocaleString("zh-TW")}</span>
      </div>
      {pokemon.length > 0 ? (
        <div className="type-member-grid partner-grid">
          {pokemon.map((item) => (
            <TypeDefenseCard pokemon={item} key={item.variantKey} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">{emptyText}</div>
      )}
    </section>
  );
}

function ChainPanelHeader<T extends { total: number }>({
  x,
  state,
  pageCount,
  onPage
}: {
  x: XValue;
  state: ChainState<T>;
  pageCount: number;
  onPage: (x: XValue, page: number) => void;
}) {
  const total = state.result?.total ?? null;

  return (
    <div className="chain-panel-header">
      <div>
        <h2>X={x}</h2>
        <p>{state.loading ? "計算中..." : total !== null ? `${total.toLocaleString("zh-TW")} 條鏈` : "尚未載入"}</p>
      </div>
      <div className="pager">
        <button
          type="button"
          aria-label={`X=${x} 上一頁`}
          onClick={() => onPage(x, state.page - 1)}
          disabled={state.loading || !state.result || state.page <= 1}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {state.page}/{pageCount}
        </span>
        <button
          type="button"
          aria-label={`X=${x} 下一頁`}
          onClick={() => onPage(x, state.page + 1)}
          disabled={state.loading || !state.result || state.page >= pageCount}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function PanelStatus<T>({ state }: { state: ChainState<T> }) {
  return (
    <>
      {state.error ? (
        <div className="inline-error">
          <AlertCircle size={16} />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.loading ? (
        <div className="panel-loading">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </>
  );
}

function TypeDefenseCard({ pokemon }: { pokemon: TypeDefensePokemonSummary }) {
  return (
    <article className="type-pokemon-card">
      <div className="type-card-heading">
        <PokemonChip pokemon={pokemon} />
        {pokemon.appliedAbilities.length > 0 ? (
          <span className="ability-note">特性修正：{pokemon.appliedAbilities.map((ability) => ability.name).join("、")}</span>
        ) : null}
      </div>
      <DefenseProfileBlock profile={pokemon.defenseProfile} />
    </article>
  );
}

function DefenseProfileBlock({ profile }: { profile: DefenseProfile }) {
  return (
    <div className="defense-profile">
      <EffectGroup label="弱點" tone="weak" effects={profile.weaknesses} emptyText="無 2x 以上弱點" />
      <EffectGroup label="抵抗" tone="resist" effects={profile.resistances} emptyText="無抵抗" />
      <EffectGroup label="免疫" tone="immune" effects={profile.immunities} emptyText="無免疫" />
    </div>
  );
}

function EffectGroup({
  label,
  tone,
  effects,
  emptyText
}: {
  label: string;
  tone: "weak" | "resist" | "immune";
  effects: TypeEffect[];
  emptyText: string;
}) {
  return (
    <div className="effect-group">
      <strong>{label}</strong>
      <div>
        {effects.length > 0 ? (
          effects.map((effect) => (
            <TypeEffectBadge effect={effect} tone={tone} key={effect.type} />
          ))
        ) : (
          <small>{emptyText}</small>
        )}
      </div>
    </div>
  );
}

function TypeEffectBadge({ effect, tone }: { effect: TypeEffect; tone: "weak" | "resist" | "immune" }) {
  return (
    <span className={`type-effect ${tone}`}>
      <span>{effect.name}</span>
      <em>{formatMultiplier(effect.multiplier)}</em>
    </span>
  );
}

export function App() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [pokemon, setPokemon] = useState<PokemonSummary[]>([]);
  const [attackTypes, setAttackTypes] = useState<PokemonTypeInfo[]>([]);
  const [battleChainCounts, setBattleChainCounts] = useState<Record<string, number>>({});
  const [typeChainCounts, setTypeChainCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<ViewMode>("battle");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [battleChainStates, setBattleChainStates] = useState<Record<XValue, ChainState<SearchResponse>>>(() =>
    createChainState<SearchResponse>()
  );
  const [typeChainStates, setTypeChainStates] = useState<Record<XValue, ChainState<TypeDefenseSearchResponse>>>(() =>
    createChainState<TypeDefenseSearchResponse>()
  );
  const [typePartnerState, setTypePartnerState] = useState<PartnerState>({
    loading: false,
    error: null,
    result: null
  });
  const [selectedAttackTypes, setSelectedAttackTypes] = useState<string[]>([]);
  const [coverageState, setCoverageState] = useState<CoverageState>({
    loading: false,
    error: null,
    result: null
  });
  const [cacheJob, setCacheJob] = useState<CacheJob | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const partnerRequestVersion = useRef(0);
  const coverageRequestVersion = useRef(0);

  const selectedPokemon = useMemo(
    () => pokemon.find((item) => item.key === selectedKey) ?? null,
    [pokemon, selectedKey]
  );

  const filteredPokemon = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return pokemon;
    return pokemon.filter((item) => item.name.includes(filter.trim()) || item.key.includes(keyword));
  }, [filter, pokemon]);

  const hasTypeDefenseData = Boolean(cacheStatus?.typeProfileCount);
  const selectedAttackTypesKey = selectedAttackTypes.join("|");

  async function loadStatus() {
    const status = await api<CacheStatus>("/api/cache/status");
    setCacheStatus(status);
    setCacheJob(status.activeJob);
    return status;
  }

  async function loadPokemon(status = cacheStatus) {
    const items = await api<PokemonSummary[]>("/api/pokemon");
    setPokemon(items);
    setSelectedKey((current) => current ?? items[0]?.key ?? null);
    void loadBattleChainCounts();
    if ((status?.typeProfileCount ?? 0) > 0) void loadTypeChainCounts();
    return items;
  }

  async function loadTypes() {
    const items = await api<PokemonTypeInfo[]>("/api/types");
    setAttackTypes(items);
    return items;
  }

  async function loadBattleChainCounts() {
    try {
      const result = await api<{ x: number; counts: Record<string, number> }>("/api/pokemon/chain-counts?x=2");
      setBattleChainCounts(result.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入鏈條數失敗");
    }
  }

  async function loadTypeChainCounts() {
    try {
      const result = await api<{ x: number; counts: Record<string, number> }>(
        `/api/pokemon/type-defense-chain-counts?x=${TYPE_COUNT_X}`
      );
      setTypeChainCounts(result.counts);
    } catch (err) {
      if (activeTab === "type") setError(err instanceof Error ? err.message : "載入屬性聯防鏈數失敗");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoadingStatus(true);
        const status = await loadStatus();
        await loadTypes();
        if (!cancelled && status.canQuery) {
          await loadPokemon(status);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入狀態失敗");
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cacheJob || cacheJob.status !== "running") return;

    const timer = window.setInterval(async () => {
      try {
        const job = await api<CacheJob>(`/api/cache/jobs/${cacheJob.id}`);
        setCacheJob(job);
        if (job.status !== "running") {
          const status = await loadStatus();
          if (status.canQuery) await loadPokemon(status);
          setRefreshing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新快取狀態失敗");
        setRefreshing(false);
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [cacheJob]);

  useEffect(() => {
    if (!selectedPokemon || !cacheStatus?.canQuery) return;

    if (activeTab === "coverage") return;

    if (activeTab === "battle") {
      void loadAllBattleChains(selectedPokemon.key);
      return;
    }

    if (!hasTypeDefenseData) {
      setTypeChainStates(createChainState<TypeDefenseSearchResponse>());
      setTypePartnerState({ loading: false, error: null, result: null });
      return;
    }

    void loadTypeDefensePartners(selectedPokemon.key);
    void loadAllTypeDefenseChains(selectedPokemon.key);
  }, [selectedPokemon?.key, cacheStatus?.canQuery, activeTab, hasTypeDefenseData]);

  useEffect(() => {
    if (activeTab === "type" && hasTypeDefenseData) void loadTypeChainCounts();
  }, [activeTab, hasTypeDefenseData]);

  useEffect(() => {
    if (activeTab !== "coverage" || !cacheStatus?.canQuery) return;

    if (!hasTypeDefenseData) {
      setCoverageState({ loading: false, error: null, result: null });
      return;
    }

    if (selectedAttackTypes.length === 0) {
      setCoverageState({ loading: false, error: null, result: null });
      return;
    }

    void loadCoverageBlindSpots(selectedAttackTypes);
  }, [activeTab, cacheStatus?.canQuery, hasTypeDefenseData, selectedAttackTypesKey]);

  async function startRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      const job = await api<CacheJob>("/api/cache/refresh", { method: "POST" });
      setCacheJob(job);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "啟動快取失敗");
      setRefreshing(false);
    }
  }

  async function fetchBattleChain(key: string, x: XValue, page: number) {
    return api<SearchResponse>("/api/search", {
      method: "POST",
      body: JSON.stringify({
        pokemonName: key,
        x,
        page,
        pageSize: PAGE_SIZE
      })
    });
  }

  async function fetchTypeDefenseChain(key: string, x: XValue, page: number) {
    return api<TypeDefenseSearchResponse>("/api/type-defense/search", {
      method: "POST",
      body: JSON.stringify({
        pokemonName: key,
        x,
        page,
        pageSize: PAGE_SIZE
      })
    });
  }

  async function fetchTypeDefensePartners(key: string) {
    return api<TypeDefensePartnerResponse>("/api/type-defense/partners", {
      method: "POST",
      body: JSON.stringify({
        pokemonName: key
      })
    });
  }

  async function fetchCoverageBlindSpots(attackTypes: string[]) {
    return api<CoverageBlindSpotResponse>("/api/coverage/blind-spots", {
      method: "POST",
      body: JSON.stringify({
        attackTypes
      })
    });
  }

  async function loadCoverageBlindSpots(attackTypes: string[]) {
    const version = coverageRequestVersion.current + 1;
    coverageRequestVersion.current = version;
    setCoverageState({ loading: true, error: null, result: null });

    try {
      const result = await fetchCoverageBlindSpots(attackTypes);
      if (coverageRequestVersion.current !== version) return;
      setCoverageState({ loading: false, error: null, result });
    } catch (err) {
      if (coverageRequestVersion.current !== version) return;
      setCoverageState({
        loading: false,
        error: err instanceof Error ? err.message : "查詢打點盲區失敗",
        result: null
      });
    }
  }

  function toggleAttackType(type: string) {
    setSelectedAttackTypes((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      if (current.length >= 4) return current;
      return [...current, type];
    });
  }

  async function loadTypeDefensePartners(key: string) {
    const version = partnerRequestVersion.current + 1;
    partnerRequestVersion.current = version;
    setTypePartnerState({ loading: true, error: null, result: null });

    try {
      const result = await fetchTypeDefensePartners(key);
      if (partnerRequestVersion.current !== version) return;
      setTypePartnerState({ loading: false, error: null, result });
    } catch (err) {
      if (partnerRequestVersion.current !== version) return;
      setTypePartnerState({
        loading: false,
        error: err instanceof Error ? err.message : "查詢聯防寶可夢失敗",
        result: null
      });
    }
  }

  async function loadAllBattleChains(key: string) {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setError(null);
    setBattleChainStates(createChainState<SearchResponse>(true));

    for (const x of X_VALUES) {
      try {
        const result = await fetchBattleChain(key, x, 1);
        if (requestVersion.current !== version) return;
        setBattleChainStates((current) => ({
          ...current,
          [x]: { loading: false, error: null, page: 1, result }
        }));
      } catch (err) {
        if (requestVersion.current !== version) return;
        setBattleChainStates((current) => ({
          ...current,
          [x]: {
            ...current[x],
            loading: false,
            error: err instanceof Error ? err.message : "查詢失敗"
          }
        }));
      }
    }
  }

  async function loadAllTypeDefenseChains(key: string) {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setError(null);
    setTypeChainStates(createChainState<TypeDefenseSearchResponse>(true));

    for (const x of X_VALUES) {
      try {
        const result = await fetchTypeDefenseChain(key, x, 1);
        if (requestVersion.current !== version) return;
        setTypeChainStates((current) => ({
          ...current,
          [x]: { loading: false, error: null, page: 1, result }
        }));
      } catch (err) {
        if (requestVersion.current !== version) return;
        setTypeChainStates((current) => ({
          ...current,
          [x]: {
            ...current[x],
            loading: false,
            error: err instanceof Error ? err.message : "查詢失敗"
          }
        }));
      }
    }
  }

  async function loadBattleChainPage(x: XValue, page: number) {
    if (!selectedPokemon) return;
    setBattleChainStates((current) => ({
      ...current,
      [x]: { ...current[x], loading: true, error: null, page }
    }));

    try {
      const result = await fetchBattleChain(selectedPokemon.key, x, page);
      setBattleChainStates((current) => ({
        ...current,
        [x]: { loading: false, error: null, page, result }
      }));
    } catch (err) {
      setBattleChainStates((current) => ({
        ...current,
        [x]: {
          ...current[x],
          loading: false,
          error: err instanceof Error ? err.message : "查詢失敗"
        }
      }));
    }
  }

  async function loadTypeDefenseChainPage(x: XValue, page: number) {
    if (!selectedPokemon) return;
    setTypeChainStates((current) => ({
      ...current,
      [x]: { ...current[x], loading: true, error: null, page }
    }));

    try {
      const result = await fetchTypeDefenseChain(selectedPokemon.key, x, page);
      setTypeChainStates((current) => ({
        ...current,
        [x]: { loading: false, error: null, page, result }
      }));
    } catch (err) {
      setTypeChainStates((current) => ({
        ...current,
        [x]: {
          ...current[x],
          loading: false,
          error: err instanceof Error ? err.message : "查詢失敗"
        }
      }));
    }
  }

  const jobProgress =
    cacheJob && cacheJob.totalPokemon > 0
      ? Math.round((cacheJob.processedPokemon / cacheJob.totalPokemon) * 100)
      : 0;

  const activeCounts = activeTab === "battle" ? battleChainCounts : typeChainCounts;
  const countLabel = activeTab === "battle" ? "對戰 X=2 鏈數" : `屬性 X=${TYPE_COUNT_X} 鏈數`;

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div>
          <h1>Pokemon Champions 聯攻防</h1>
          <div className="cache-meta">
            <Database size={16} />
            <span>{formatTime(cacheStatus?.lastCompletedAt ?? null)}</span>
            <span>{cacheStatus?.pokemonCount ?? 0} 寶可夢</span>
            <span>{cacheStatus?.edgeCount ?? 0} 條單打敗於資料</span>
            <span>{cacheStatus?.typeProfileCount ?? 0} 筆屬性資料</span>
          </div>
        </div>
        <button className="icon-button primary" type="button" onClick={startRefresh} disabled={refreshing}>
          <RefreshCcw size={18} className={refreshing ? "spin" : ""} />
          <span>{cacheStatus?.canQuery ? "重新快取" : "建立快取"}</span>
        </button>
      </section>

      {error ? (
        <div className="notice error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {loadingStatus ? <div className="notice">載入中...</div> : null}

      {cacheJob ? (
        <section className="progress-band">
          <div className="progress-copy">
            <strong>{cacheJob.status === "running" ? "快取更新中" : cacheJob.status === "completed" ? "快取完成" : "快取失敗"}</strong>
            <span>
              {cacheJob.processedPokemon}/{cacheJob.totalPokemon || "?"}，{cacheJob.edgeCount} 條資料
              {cacheJob.currentPokemon ? `，目前：${cacheJob.currentPokemon}` : ""}
            </span>
            {cacheJob.error ? <span className="job-error">{cacheJob.error}</span> : null}
          </div>
          <div className="progress-track" aria-label="快取進度">
            <span style={{ width: `${jobProgress}%` }} />
          </div>
        </section>
      ) : null}

      {!cacheStatus?.canQuery ? (
        <section className="empty-state">
          <h2>尚未建立快取</h2>
          <button className="icon-button primary" type="button" onClick={startRefresh} disabled={refreshing}>
            <Database size={18} />
            <span>建立快取</span>
          </button>
        </section>
      ) : (
        <>
          <div className="view-tabs" role="tablist" aria-label="鏈條模式">
            <button
              type="button"
              className={activeTab === "battle" ? "active" : ""}
              onClick={() => setActiveTab("battle")}
              role="tab"
              aria-selected={activeTab === "battle"}
            >
              <Swords size={16} />
              <span>對戰敗於鏈</span>
            </button>
            <button
              type="button"
              className={activeTab === "type" ? "active" : ""}
              onClick={() => setActiveTab("type")}
              role="tab"
              aria-selected={activeTab === "type"}
            >
              <Shield size={16} />
              <span>屬性聯防鏈</span>
            </button>
            <button
              type="button"
              className={activeTab === "coverage" ? "active" : ""}
              onClick={() => setActiveTab("coverage")}
              role="tab"
              aria-selected={activeTab === "coverage"}
            >
              <Crosshair size={16} />
              <span>打點盲區</span>
            </button>
          </div>

          {activeTab === "coverage" ? (
            !hasTypeDefenseData ? (
              <section className="empty-state compact">
                <h2>屬性資料尚未快取</h2>
                <button className="icon-button primary" type="button" onClick={startRefresh} disabled={refreshing}>
                  <RefreshCcw size={18} className={refreshing ? "spin" : ""} />
                  <span>重新快取</span>
                </button>
              </section>
            ) : (
              <CoveragePanel
                attackTypes={attackTypes}
                selectedTypes={selectedAttackTypes}
                state={coverageState}
                onToggleType={toggleAttackType}
              />
            )
          ) : (
            <section className="workspace">
              <aside className="pokemon-sidebar">
                <div className="sidebar-header">
                  <div className="sidebar-title-row">
                    <h2>寶可夢列表</h2>
                    <span>{countLabel}</span>
                  </div>
                  <div className="filter-box">
                    <Search size={16} />
                    <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜尋名稱或 key" />
                  </div>
                </div>
                <div className="pokemon-list">
                  {filteredPokemon.map((item) => {
                    const count = activeCounts[item.key];
                    const countText =
                      activeTab === "type" && !hasTypeDefenseData
                        ? "更新"
                        : count === undefined
                          ? "..."
                          : count.toLocaleString("zh-TW");

                    return (
                      <button
                        type="button"
                        className={`pokemon-list-item ${item.key === selectedKey ? "active" : ""}`}
                        onClick={() => setSelectedKey(item.key)}
                        key={item.key}
                      >
                        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="image-placeholder" />}
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            #{item.dexId.toString().padStart(3, "0")} · {item.key}
                          </small>
                        </span>
                        <em>{countText}</em>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="chain-area">
                <div className="selected-heading">
                  <div>
                    <p>{activeTab === "battle" ? "對戰敗於鏈" : "屬性聯防鏈"}</p>
                    <h2>{selectedPokemon?.name ?? "未選擇寶可夢"}</h2>
                  </div>
                  {selectedPokemon ? <PokemonChip pokemon={selectedPokemon} /> : null}
                </div>

                {activeTab === "type" && !hasTypeDefenseData ? (
                  <section className="empty-state compact">
                    <h2>屬性聯防資料尚未快取</h2>
                    <button className="icon-button primary" type="button" onClick={startRefresh} disabled={refreshing}>
                      <RefreshCcw size={18} className={refreshing ? "spin" : ""} />
                      <span>重新快取</span>
                    </button>
                  </section>
                ) : (
                  <>
                    {activeTab === "type" ? <TypeDefensePartnerPanel state={typePartnerState} /> : null}
                    <div className="x-grid">
                      {activeTab === "battle"
                        ? X_VALUES.map((x) => (
                            <BattleChainPanel x={x} state={battleChainStates[x]} onPage={loadBattleChainPage} key={x} />
                          ))
                        : X_VALUES.map((x) => (
                            <TypeDefenseChainPanel x={x} state={typeChainStates[x]} onPage={loadTypeDefenseChainPage} key={x} />
                          ))}
                    </div>
                  </>
                )}
              </section>
            </section>
          )}
        </>
      )}
    </main>
  );
}
