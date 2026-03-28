import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import "./App.css";

const ROLE_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"];
const VIEW_TABS = [
  { id: "home", label: "Home" },
  { id: "player", label: "Player" },
  { id: "champions", label: "Champions" },
  { id: "live", label: "Live" },
];
const RECENT_RIOT_SEARCHES_KEY = "lol-build-advisor:recent-riot-searches";
const FAVORITE_RIOT_SEARCHES_KEY = "lol-build-advisor:favorite-riot-searches";

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const normalizedText = text.trim();
      throw new Error(
        normalizedText.includes("<!doctype")
          ? "La app recibio HTML en lugar de JSON. Proba con Ctrl+F5."
          : normalizedText.startsWith("The deploy")
            ? "La deploy de Vercel todavia se esta acomodando. Refresca en unos segundos."
            : "El servidor devolvio una respuesta invalida.",
      );
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || "No pude completar la solicitud.");
  }

  return payload;
}

function formatRate(value) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "-";
}

function formatCompactNumber(value) {
  if (typeof value !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStateClassName(value) {
  if (value === "Ahead") {
    return "is-ahead";
  }
  if (value === "Behind") {
    return "is-behind";
  }
  return "is-even";
}

function parseRiotIdInput(value) {
  const [gameNamePart, ...tagParts] = String(value || "").split("#");
  return { gameName: gameNamePart.trim(), tagLine: tagParts.join("#").trim() };
}

function createRiotSearchEntry(gameName, tagLine, platform) {
  const cleanGameName = String(gameName || "").trim();
  const cleanTagLine = String(tagLine || "").trim().replace(/^#/, "");
  const cleanPlatform = String(platform || "").trim().toLowerCase();
  if (!cleanGameName || !cleanTagLine || !cleanPlatform) {
    return null;
  }

  return {
    id: `${cleanGameName.toLowerCase()}#${cleanTagLine.toLowerCase()}::${cleanPlatform}`,
    gameName: cleanGameName,
    tagLine: cleanTagLine,
    riotIdInput: `${cleanGameName}#${cleanTagLine}`,
    platform: cleanPlatform,
  };
}

function readStoredSearches(key) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue)
      ? parsedValue.map((entry) => {
          if (entry?.gameName && entry?.tagLine && entry?.platform) {
            return createRiotSearchEntry(entry.gameName, entry.tagLine, entry.platform);
          }
          if (entry?.riotIdInput && entry?.platform) {
            const parsed = parseRiotIdInput(entry.riotIdInput);
            return createRiotSearchEntry(parsed.gameName, parsed.tagLine, entry.platform);
          }
          return null;
        }).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writeStoredSearches(key, entries) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(entries));
  }
}

function upsertSearchEntry(entries, candidate, limit) {
  if (!candidate) {
    return entries;
  }
  return [candidate, ...entries.filter((entry) => entry.id !== candidate.id)].slice(0, limit);
}

function ViewTabs({ viewMode, liveAvailable, onChange }) {
  return (
    <div className="view-tabs">
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`view-tab ${viewMode === tab.id ? "is-active" : ""}`}
          type="button"
          disabled={tab.id === "live" && !liveAvailable}
          onClick={() => {
            if (tab.id === "live" && !liveAvailable) {
              return;
            }
            onChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SearchPanel(props) {
  return (
    <section className="shell-card search-panel">
      <div className="search-panel-copy">
        <p className="eyebrow">Lookup</p>
        <h3>Profile first, live after</h3>
        <span>Carga el perfil del jugador y después saltá al live cuando entre en partida.</span>
      </div>

      <form
        className="riot-lookup-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onLoadProfile();
        }}
      >
        <input className="riot-name-input" placeholder="Game name" value={props.gameName} onChange={(event) => props.onGameNameChange(event.target.value)} />
        <input className="riot-tag-input" placeholder="Tag line" value={props.tagLine} onChange={(event) => props.onTagLineChange(event.target.value.replace(/^#/, ""))} />
        <select value={props.platform} onChange={(event) => props.onPlatformChange(event.target.value)}>
          {props.platforms.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.label}</option>
          ))}
        </select>
        <button className={`riot-favorite-toggle ${props.isFavorite ? "is-active" : ""}`} type="button" onClick={props.onToggleFavorite} disabled={!props.canFavorite}>★</button>
        <button className="secondary-button" type="submit" disabled={props.profileLoading}>{props.profileLoading ? "Cargando..." : "Load profile"}</button>
        <button className="primary-button" type="button" onClick={props.onFindLive} disabled={props.liveLoading}>{props.liveLoading ? "Buscando..." : "Find live game"}</button>
      </form>
    </section>
  );
}

function RiotLookupSuggestions({ suggestions, favorites, selectedId, onSelect, onToggleFavorite }) {
  if (!suggestions.length && !favorites.length) {
    return null;
  }

  return (
    <div className="riot-suggestions-shell">
      {suggestions.length ? (
        <div className="riot-suggestion-group">
          <span className="riot-suggestion-label">Suggestions</span>
          <div className="riot-suggestion-row">
            {suggestions.map((entry) => (
              <button key={entry.id} className={`riot-suggestion-chip ${selectedId === entry.id ? "is-active" : ""}`} type="button" onClick={() => onSelect(entry)}>
                <strong>{entry.riotIdInput}</strong>
                <small>{entry.platform.toUpperCase()}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {favorites.length ? (
        <div className="riot-suggestion-group">
          <span className="riot-suggestion-label">Favorites</span>
          <div className="riot-suggestion-row">
            {favorites.map((entry) => (
              <div className="riot-favorite-card" key={entry.id}>
                <button className={`riot-suggestion-chip ${selectedId === entry.id ? "is-active" : ""}`} type="button" onClick={() => onSelect(entry)}>
                  <strong>{entry.riotIdInput}</strong>
                  <small>{entry.platform.toUpperCase()}</small>
                </button>
                <button className="riot-favorite-toggle is-active" type="button" onClick={() => onToggleFavorite(entry)}>★</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LaneColumn({ lane, entries, onSelectChampion }) {
  const featuredEntries = ((entries || []).filter((entry) => entry.tier === "S").length ? (entries || []).filter((entry) => entry.tier === "S") : entries || []).slice(0, 5);

  return (
    <section className="shell-card lane-card">
      <div className="lane-card-head">
        <p>{lane}</p>
        <h3>{featuredEntries.some((entry) => entry.tier === "S") ? "S Tier" : "Meta picks"}</h3>
      </div>
      <div className="tier-list">
        {featuredEntries.map((entry) => (
          <button key={`${lane}-${entry.id}`} className="tier-entry" type="button" onClick={() => onSelectChampion(entry.id)}>
            <img src={entry.squareUrl} alt={entry.name} loading="lazy" />
            <div>
              <strong>{entry.name}</strong>
              <span>{formatRate(entry.winRate)}</span>
            </div>
            <small>{entry.tier}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChampionThumb({ champion, active, onSelect }) {
  return (
    <button className={`champ-thumb ${active ? "is-active" : ""}`} type="button" onClick={() => onSelect(champion.id)}>
      <img src={champion.squareUrl} alt={champion.name} loading="lazy" />
      <span>{champion.name}</span>
      {champion.tier ? <small>{champion.tier}</small> : null}
    </button>
  );
}

function MiniIconGrid({ title, entries }) {
  if (!entries?.length) {
    return null;
  }

  return (
    <section className="shell-card compact-icon-card">
      <div className="card-heading">
        <p>{title}</p>
        <h3>{title}</h3>
      </div>
      <div className="icon-strip">
        {entries.map((entry) => (
          <article className="icon-tile" key={`${title}-${entry.id || entry.name}`}>
            {entry.iconUrl ? <img src={entry.iconUrl} alt={entry.name} loading="lazy" /> : <div className="icon-fallback">{(entry.name || "?").slice(0, 1)}</div>}
            <span>{entry.name}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [champions, setChampions] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [healthData, setHealthData] = useState(null);
  const [tierOverview, setTierOverview] = useState(null);
  const [tierError, setTierError] = useState("");
  const [viewMode, setViewMode] = useState("home");
  const [championSearch, setChampionSearch] = useState("");
  const [selectedChampionId, setSelectedChampionId] = useState("");
  const [selectedLane, setSelectedLane] = useState("");
  const [buildPackage, setBuildPackage] = useState(null);
  const [activeBuildIndex, setActiveBuildIndex] = useState(0);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [playerProfile, setPlayerProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [liveResult, setLiveResult] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [lastScanAt, setLastScanAt] = useState(null);
  const [riotGameName, setRiotGameName] = useState("");
  const [riotTagLine, setRiotTagLine] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("la2");
  const [liveQuery, setLiveQuery] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [recentRiotSearches, setRecentRiotSearches] = useState([]);
  const [favoriteRiotSearches, setFavoriteRiotSearches] = useState([]);

  const deferredChampionSearch = useDeferredValue(championSearch);

  useEffect(() => {
    setRecentRiotSearches(readStoredSearches(RECENT_RIOT_SEARCHES_KEY));
    setFavoriteRiotSearches(readStoredSearches(FAVORITE_RIOT_SEARCHES_KEY));
  }, []);

  useEffect(() => writeStoredSearches(RECENT_RIOT_SEARCHES_KEY, recentRiotSearches), [recentRiotSearches]);
  useEffect(() => writeStoredSearches(FAVORITE_RIOT_SEARCHES_KEY, favoriteRiotSearches), [favoriteRiotSearches]);

  useEffect(() => {
    Promise.all([requestJson("/api/champions"), requestJson("/api/meta/tiers"), requestJson("/api/platforms"), requestJson("/api/health")])
      .then(([championData, tierData, platformData, healthPayload]) => {
        startTransition(() => {
          setChampions(Array.isArray(championData) ? championData : []);
          setTierOverview(tierData?.roles ? tierData : null);
          setPlatforms(Array.isArray(platformData) ? platformData : []);
          setHealthData(healthPayload || null);
          const defaultChampion = (Array.isArray(championData) ? championData : []).find((entry) => entry.id === "Ahri") || championData?.[0];
          setSelectedChampionId(defaultChampion?.id || "");
          setSelectedLane(defaultChampion?.roles?.[0]?.lane || defaultChampion?.lane || "Mid");
        });
      })
      .catch((error) => {
        setBuildError(error.message || "No pude cargar la app.");
        setTierError(error.message || "No pude cargar la tier list.");
      });
  }, []);

  useEffect(() => {
    if (!selectedChampionId || !selectedLane) {
      return;
    }

    const controller = new AbortController();
    setBuildLoading(true);
    setBuildError("");
    setBuildPackage(null);

    requestJson(`/api/champions/${selectedChampionId}/builds?lane=${encodeURIComponent(selectedLane)}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        startTransition(() => {
          setBuildPackage(payload);
          setActiveBuildIndex(0);
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setBuildPackage(null);
          setBuildError(error.message || "No pude cargar la build.");
        }
      })
      .finally(() => setBuildLoading(false));

    return () => controller.abort();
  }, [selectedChampionId, selectedLane]);

  const championMap = useMemo(() => new Map(champions.map((entry) => [entry.id, entry])), [champions]);
  const championByName = useMemo(() => new Map(champions.map((entry) => [entry.name, entry])), [champions]);
  const filteredChampions = useMemo(() => {
    const query = deferredChampionSearch.trim().toLowerCase();
    if (!query) {
      return champions;
    }
    return champions.filter((champion) => {
      const haystack = `${champion.name} ${champion.title} ${champion.lane} ${(champion.roles || []).map((role) => role.lane).join(" ")} ${champion.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [champions, deferredChampionSearch]);

  const selectedChampionBase = championMap.get(selectedChampionId) || null;
  const currentBuildPackage = buildPackage?.champion?.id === selectedChampionId ? buildPackage : null;
  const selectedChampion = currentBuildPackage?.champion ? { ...selectedChampionBase, ...currentBuildPackage.champion } : selectedChampionBase;
  const activeBuild = currentBuildPackage?.builds?.[activeBuildIndex] || null;
  const liveAvailable = Boolean(liveResult);
  const currentRiotSearch = createRiotSearchEntry(riotGameName, riotTagLine, selectedPlatform);
  const favoriteSearchIds = useMemo(() => new Set(favoriteRiotSearches.map((entry) => entry.id)), [favoriteRiotSearches]);
  const riotLookupQuery = `${riotGameName} ${riotTagLine}`.trim().toLowerCase();
  const riotLookupSuggestions = useMemo(() => {
    const merged = [...favoriteRiotSearches, ...recentRiotSearches];
    const deduped = merged.filter((entry, index) => merged.findIndex((candidate) => candidate.id === entry.id) === index);
    return deduped.filter((entry) => {
      if (!riotLookupQuery) {
        return true;
      }
      return `${entry.gameName} ${entry.tagLine} ${entry.platform}`.toLowerCase().includes(riotLookupQuery);
    }).slice(0, 6);
  }, [favoriteRiotSearches, recentRiotSearches, riotLookupQuery]);
  const visibleFavoriteSuggestions = useMemo(() => {
    const suggestionIds = new Set(riotLookupSuggestions.map((entry) => entry.id));
    return favoriteRiotSearches.filter((entry) => !suggestionIds.has(entry.id)).slice(0, 4);
  }, [favoriteRiotSearches, riotLookupSuggestions]);

  function rememberRiotSearch(entry) {
    setRecentRiotSearches((current) => upsertSearchEntry(current, entry, 8));
  }

  function applyRiotSearchEntry(entry) {
    setRiotGameName(entry.gameName);
    setRiotTagLine(entry.tagLine);
    setSelectedPlatform(entry.platform);
  }

  function toggleFavoriteRiotSearch(entry = currentRiotSearch) {
    if (!entry) {
      return;
    }
    setFavoriteRiotSearches((current) => {
      const exists = current.some((candidate) => candidate.id === entry.id);
      return exists
        ? current.filter((candidate) => candidate.id !== entry.id)
        : upsertSearchEntry(current, entry, 6);
    });
    rememberRiotSearch(entry);
  }

  function handleChampionSelect(championId) {
    const champion = championMap.get(championId);
    setSelectedChampionId(championId);
    setSelectedLane(champion?.roles?.[0]?.lane || champion?.lane || "Mid");
    setViewMode("champions");
  }

  function openChampionLab(championName) {
    const champion = championMap.get(championName) || championByName.get(championName);
    if (champion) {
      handleChampionSelect(champion.id);
    }
  }

  async function loadPlayerProfile() {
    const gameName = String(riotGameName || "").trim();
    const tagLine = String(riotTagLine || "").trim().replace(/^#/, "");
    if (!gameName || !tagLine || !selectedPlatform) {
      setProfileError("Escribi tu game name, tu tag line y elegi un servidor.");
      return;
    }

    setProfileLoading(true);
    setProfileError("");

    try {
      const payload = await requestJson("/api/player-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine, platform: selectedPlatform }),
      });
      setPlayerProfile(payload);
      setViewMode("player");
      rememberRiotSearch(createRiotSearchEntry(gameName, tagLine, selectedPlatform));
    } catch (error) {
      setProfileError(error.message || "No pude cargar el perfil del jugador.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function findLiveGameByRiotId({ silent = false, queryOverride = null } = {}) {
    const query = queryOverride || { gameName: riotGameName, tagLine: riotTagLine, platform: selectedPlatform };
    const gameName = String(query.gameName || "").trim();
    const tagLine = String(query.tagLine || "").trim().replace(/^#/, "");
    if (!gameName || !tagLine || !query.platform) {
      if (!silent) {
        setLiveError("Escribi tu game name, tu tag line y elegi un servidor.");
      }
      return;
    }

    setLiveLoading(true);
    if (!silent) {
      setLiveError("");
    }

    try {
      const payload = await requestJson("/api/analyze/riot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine, platform: query.platform }),
      });

      if (!payload.found) {
        setLiveResult(null);
        setLiveError(payload.message || "No encontre una partida activa para ese Riot ID.");
        return;
      }

      setLiveResult(payload);
      setViewMode("live");
      setLiveQuery({ gameName, tagLine, platform: query.platform });
      setLastScanAt(Date.now());
      setScanHistory((previous) => [
        {
          timestamp: Date.now(),
          timeLabel: new Date().toLocaleTimeString(),
          buyNow: payload.analysis.purchasePlan?.buyNow?.name || null,
          damageBias: payload.analysis.threatSummary?.damageBias || "Mixed",
          statusLabel: payload.analysis.gameState?.statusLabel || "Even",
        },
        ...previous,
      ].slice(0, 8));

      if (payload.metaBuild?.champion?.id) {
        setSelectedChampionId(payload.metaBuild.champion.id);
        setSelectedLane(payload.metaBuild.champion.lane);
      }
      rememberRiotSearch(createRiotSearchEntry(gameName, tagLine, query.platform));
    } catch (error) {
      if (!silent) {
        setLiveError(error.message || "No pude leer la partida con Riot API.");
      } else {
        setLiveResult(null);
      }
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    if (!liveAvailable || !liveQuery) {
      return;
    }
    const intervalId = window.setInterval(() => {
      findLiveGameByRiotId({ silent: true, queryOverride: liveQuery });
    }, liveResult?.refreshIntervalMs || 120000);
    return () => window.clearInterval(intervalId);
  }, [liveAvailable, liveQuery, liveResult?.refreshIntervalMs]);

  return (
    <main className={`app-shell app-shell--${viewMode}`}>
      <header className="app-header">
        <div className="header-brand">
          <p className="eyebrow">Draft companion</p>
          <h1>Meta by role, then live adapt in game.</h1>
          <span>Player hub, champion lab y live separados para que desktop y mobile no sean una sola sábana.</span>
        </div>

        <div className="header-meta">
          <div className="patch-pill">
            <span>{tierOverview?.provider || currentBuildPackage?.source?.provider || "Meta"}</span>
            <strong>{tierOverview?.patch || currentBuildPackage?.source?.patch || "Current patch"}</strong>
          </div>
        </div>
      </header>

      <ViewTabs viewMode={viewMode} liveAvailable={liveAvailable} onChange={setViewMode} />

      <SearchPanel
        gameName={riotGameName}
        tagLine={riotTagLine}
        platform={selectedPlatform}
        platforms={platforms}
        liveLoading={liveLoading}
        profileLoading={profileLoading}
        canFavorite={Boolean(currentRiotSearch)}
        isFavorite={Boolean(currentRiotSearch && favoriteSearchIds.has(currentRiotSearch.id))}
        onGameNameChange={setRiotGameName}
        onTagLineChange={setRiotTagLine}
        onPlatformChange={setSelectedPlatform}
        onLoadProfile={loadPlayerProfile}
        onFindLive={() => findLiveGameByRiotId()}
        onToggleFavorite={() => toggleFavoriteRiotSearch()}
      />

      <RiotLookupSuggestions
        suggestions={riotLookupSuggestions}
        favorites={visibleFavoriteSuggestions}
        selectedId={currentRiotSearch?.id || ""}
        onSelect={applyRiotSearchEntry}
        onToggleFavorite={toggleFavoriteRiotSearch}
      />

      {healthData ? (
        <div className="feedback-banner diagnostic-banner">
          Deploy {healthData.deployment?.env || "-"} · commit {healthData.deployment?.commit || "-"} · Riot key fp {healthData.riotKeyFingerprint || "missing"}
        </div>
      ) : null}

      {profileError ? <div className="feedback-banner error">{profileError}</div> : null}
      {liveError ? <div className="feedback-banner error">{liveError}</div> : null}
      {tierError ? <div className="feedback-banner">{tierError}</div> : null}
      {buildError && viewMode === "champions" ? <div className="feedback-banner error">{buildError}</div> : null}

      {viewMode === "home" ? (
        <section className="page-grid home-page-grid">
          <div className="home-hero-grid">
            <section className="shell-card profile-snapshot-card">
              <div className="snapshot-head">
                {playerProfile?.player?.profileIconUrl ? <img src={playerProfile.player.profileIconUrl} alt={playerProfile.player.riotId} loading="lazy" /> : null}
                <div>
                  <p className="eyebrow">Player snapshot</p>
                  <h3>{playerProfile?.player?.riotId || "No player selected"}</h3>
                  <span>
                    {playerProfile?.ranked?.primary
                      ? `${playerProfile.ranked.primary.label} · ${playerProfile.ranked.primary.tierText} · ${playerProfile.ranked.primary.lp} LP`
                      : "Carga un perfil para ver ranked, win rate reciente y últimas partidas."}
                  </span>
                </div>
              </div>
              <div className="snapshot-stats">
                <div><small>Recent WR</small><strong>{formatRate(playerProfile?.overview?.recentWinRate)}</strong></div>
                <div><small>Games</small><strong>{playerProfile?.overview?.gamesAnalyzed ?? "-"}</strong></div>
                <div><small>Avg KDA</small><strong>{playerProfile ? `${playerProfile.overview.averageKills}/${playerProfile.overview.averageDeaths}/${playerProfile.overview.averageAssists}` : "-"}</strong></div>
              </div>
            </section>

            <section className="shell-card home-intro-card">
              <div className="card-heading">
                <p>Flow</p>
                <h3>How to use it</h3>
              </div>
              <div className="intro-steps">
                <article><strong>1. Load profile</strong><span>Mirá ranked, champion pool, win rate reciente y últimas partidas.</span></article>
                <article><strong>2. Open champion lab</strong><span>Revisá builds, runas y matchups por línea con datos meta actuales.</span></article>
                <article><strong>3. Refresh live</strong><span>Cuando entres en partida, saltá al live war room y refrescá cada 2 minutos.</span></article>
              </div>
            </section>
          </div>

          {tierOverview?.roles ? (
            <section className="tier-board">
              {ROLE_ORDER.map((lane) => (
                <LaneColumn key={lane} lane={lane} entries={tierOverview.roles[lane] || []} onSelectChampion={handleChampionSelect} />
              ))}
            </section>
          ) : null}
        </section>
      ) : null}

      {viewMode === "player" ? (
        <section className="page-grid player-page-grid">
          {playerProfile ? (
            <>
              <section className="shell-card player-hero-card">
                <div className="snapshot-head">
                  <img src={playerProfile.player.profileIconUrl} alt={playerProfile.player.riotId} loading="lazy" />
                  <div>
                    <p className="eyebrow">Player profile</p>
                    <h2>{playerProfile.player.riotId}</h2>
                    <span>Level {playerProfile.player.summonerLevel} · {playerProfile.player.platform.toUpperCase()}</span>
                  </div>
                </div>
                <div className="snapshot-stats">
                  <div><small>Recent WR</small><strong>{formatRate(playerProfile.overview.recentWinRate)}</strong></div>
                  <div><small>Avg KDA</small><strong>{playerProfile.overview.averageKills}/{playerProfile.overview.averageDeaths}/{playerProfile.overview.averageAssists}</strong></div>
                  <div><small>Avg CS</small><strong>{playerProfile.overview.averageCs}</strong></div>
                  <div><small>Matches</small><strong>{playerProfile.overview.gamesAnalyzed}</strong></div>
                </div>
              </section>

              <div className="player-grid">
                <section className="shell-card">
                  <div className="card-heading"><p>Queues</p><h3>Ranked overview</h3></div>
                  <div className="queue-grid">
                    {(playerProfile.ranked?.queues || []).length ? playerProfile.ranked.queues.map((queue) => (
                      <article className="queue-card" key={queue.queueType}>
                        <p>{queue.label}</p>
                        <h4>{queue.tierText}</h4>
                        <span>{queue.lp} LP · {queue.wins}W / {queue.losses}L</span>
                        <strong>{formatRate(queue.winRate)}</strong>
                      </article>
                    )) : <div className="empty-inline">No hay colas ranked visibles.</div>}
                  </div>
                </section>

                <section className="shell-card">
                  <div className="card-heading"><p>Most played</p><h3>Champion pool</h3></div>
                  <div className="favorite-champion-list">
                    {(playerProfile.overview.favoriteChampions || []).length ? playerProfile.overview.favoriteChampions.map((entry) => (
                      <button className="favorite-champion-row" type="button" key={entry.championName} onClick={() => openChampionLab(entry.championName)}>
                        {entry.squareUrl ? <img src={entry.squareUrl} alt={entry.championName} loading="lazy" /> : null}
                        <div><strong>{entry.championName}</strong><span>{entry.games} games · {formatRate(entry.winRate)}</span></div>
                        <small>{entry.averageKda} KDA</small>
                      </button>
                    )) : <div className="empty-inline">No hay suficientes partidas recientes.</div>}
                  </div>
                </section>

                <section className="shell-card">
                  <div className="card-heading"><p>Masteries</p><h3>Top champions</h3></div>
                  <div className="mastery-grid">
                    {(playerProfile.masteries || []).length ? playerProfile.masteries.map((entry) => (
                      <button className="mastery-tile" type="button" key={`${entry.championName}-${entry.points}`} onClick={() => openChampionLab(entry.championName)}>
                        {entry.squareUrl ? <img src={entry.squareUrl} alt={entry.championName} loading="lazy" /> : null}
                        <strong>{entry.championName}</strong>
                        <span>Lvl {entry.level}</span>
                        <small>{formatCompactNumber(entry.points)} pts</small>
                      </button>
                    )) : <div className="empty-inline">No pude cargar maestrías.</div>}
                  </div>
                </section>

                <section className="shell-card recent-matches-card">
                  <div className="card-heading"><p>Recent games</p><h3>Latest matches</h3></div>
                  <div className="match-list">
                    {(playerProfile.recentMatches || []).length ? playerProfile.recentMatches.map((match) => (
                      <article className={`match-row ${match.result === "Win" ? "is-win" : "is-loss"}`} key={match.matchId}>
                        <button className="match-champion" type="button" onClick={() => openChampionLab(match.championName)}>
                          {match.championSquareUrl ? <img src={match.championSquareUrl} alt={match.championName} loading="lazy" /> : null}
                          <div><strong>{match.championName}</strong><span>{match.queueLabel}</span></div>
                        </button>
                        <div className="match-core-stats"><strong>{match.result}</strong><span>{match.kdaLine}</span><small>{match.cs} CS · {match.durationText}</small></div>
                        <div className="mini-item-row">{(match.items || []).map((item) => item.iconUrl ? <img key={`${match.matchId}-${item.id}`} src={item.iconUrl} alt={item.name} title={item.name} loading="lazy" /> : null)}</div>
                        <div className="match-meta"><span>{formatCompactNumber(match.damageDealt)} dmg</span><small>{formatDateTime(match.startedAt)}</small></div>
                      </article>
                    )) : <div className="empty-inline">No pude cargar últimas partidas.</div>}
                  </div>
                </section>
              </div>
            </>
          ) : <section className="shell-card empty-state-card"><h3>Cargá un perfil para abrir el player hub.</h3><span>La búsqueda trae ranked, champ pool, maestrías y últimas partidas.</span></section>}
        </section>
      ) : null}

      {viewMode === "champions" ? (
        <section className="page-grid champion-page-grid">
          <div className="champion-lab-shell">
          <aside className="shell-card champion-rail">
            <div className="card-heading"><p>Champion pool</p><h3>Champion lab</h3></div>
            <label className="search-box">
              <input placeholder="Ahri, support, assassin..." value={championSearch} onChange={(event) => setChampionSearch(event.target.value)} />
            </label>
            <div className="champion-grid">
              {filteredChampions.map((champion) => (
                <ChampionThumb key={champion.id} champion={champion} active={champion.id === selectedChampionId} onSelect={handleChampionSelect} />
              ))}
            </div>
          </aside>

          <div className="champion-main-shell">
            <section className="champion-hero-panel" style={selectedChampion?.splashUrl ? { "--panel-splash": `url(${selectedChampion.splashUrl})` } : undefined}>
              <div className="champion-hero-overlay" />
              <div className="champion-hero-content">
                <div className="snapshot-head">
                  {selectedChampion?.squareUrl ? <img src={selectedChampion.squareUrl} alt={selectedChampion.name} loading="lazy" /> : null}
                  <div>
                    <p className="eyebrow">Champion build</p>
                    <h2>{selectedChampion?.name || "Loading..."}</h2>
                    <span>{selectedChampion?.title || "Champion"}</span>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag-chip gold">{selectedChampion?.tier ? `${selectedChampion.tier} Tier` : selectedLane}</span>
                  {(selectedChampion?.tags || []).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
                </div>

                <div className="pill-row">
                  {(selectedChampion?.roles || currentBuildPackage?.champion?.roles || []).map((role) => (
                    <button key={role.lane} className={`pill-button ${selectedLane === role.lane ? "is-active" : ""}`} type="button" onClick={() => setSelectedLane(role.lane)}>
                      <strong>{role.lane}</strong>
                      <span>{role.tier || "?"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {buildLoading ? <div className="feedback-banner">Loading build...</div> : null}
            {currentBuildPackage && activeBuild ? (
              <>
                <div className="build-tab-row">
                  {currentBuildPackage.builds.map((build, index) => (
                    <button key={`${build.title}-${index}`} className={`build-tab ${activeBuildIndex === index ? "is-active" : ""}`} type="button" onClick={() => setActiveBuildIndex(index)}>
                      <strong>{build.title}</strong>
                      <span>{formatRate(build.winRate)}</span>
                      <small>{build.matches ? `${build.matches.toLocaleString()} games` : build.playstyle}</small>
                    </button>
                  ))}
                </div>

                <section className="champion-dashboard">
                  <section className="shell-card stat-card">
                    <div className="card-heading"><p>Selected route</p><h3>{activeBuild.title}</h3></div>
                    <div className="snapshot-stats">
                      <div><small>Tier</small><strong>{currentBuildPackage.champion.tier || "-"}</strong></div>
                      <div><small>WR</small><strong>{formatRate(activeBuild.winRate)}</strong></div>
                      <div><small>Games</small><strong>{activeBuild.matches ? activeBuild.matches.toLocaleString() : "-"}</strong></div>
                      <div><small>Patch</small><strong>{currentBuildPackage.source?.patch || "-"}</strong></div>
                    </div>
                  </section>

                  <MiniIconGrid title="Summoners" entries={activeBuild.summoners} />
                  <MiniIconGrid title="Starter" entries={activeBuild.starterItems} />
                  <MiniIconGrid title="Core" entries={activeBuild.coreItems} />
                  <MiniIconGrid title="Situational" entries={activeBuild.situationalItems} />
                  <MiniIconGrid title="Runes" entries={[
                    ...(activeBuild.runes?.keystone ? [{ name: activeBuild.runes.keystone, iconUrl: activeBuild.runes.keystoneIconUrl }] : []),
                    ...((activeBuild.runes?.slots || []).slice(0, 3)),
                    ...((activeBuild.runes?.secondarySlots || []).slice(0, 2)),
                  ]} />
                  <MiniIconGrid title="Skill order" entries={(activeBuild.skillOrder || []).map((entry) => ({ name: `${entry.key} · ${entry.name}` }))} />
                </section>
              </>
            ) : null}
          </div>
          </div>
        </section>
      ) : null}

      {viewMode === "live" ? (
        liveAvailable ? (
          <section className="page-grid live-page-grid">
            <section className="shell-card player-hero-card">
              <div className="snapshot-head">
                <div>
                  <p className="eyebrow">Live war room</p>
                  <h2>{liveResult.player.championName}</h2>
                  <span>{liveResult.modeLabel || "Live read"} · Auto refresh 2m</span>
                </div>
              </div>
              <div className="live-stat-bar">
                <span>{liveResult.analysis.playerRole}</span>
                {liveResult.analysis.gameState?.statusLabel ? <span className={`state-pill ${getStateClassName(liveResult.analysis.gameState.statusLabel)}`}>{liveResult.analysis.gameState.statusLabel}</span> : null}
                {lastScanAt ? <span>{new Date(lastScanAt).toLocaleTimeString()}</span> : null}
              </div>
            </section>

            {liveResult.limitations?.length ? <div className="feedback-banner">{liveResult.limitations[0]}</div> : null}

            <div className="player-grid">
              <section className="shell-card">
                <div className="card-heading"><p>Build now</p><h3>Next buys</h3></div>
                <div className="live-reco-grid">
                  {(liveResult.analysis.nextItems || []).map((item) => (
                    <article className="live-reco-card" key={`${item.category}-${item.name}`}>
                      <div className="live-reco-top">
                        {item.iconUrl ? <img src={item.iconUrl} alt={item.name} loading="lazy" /> : <div className="icon-fallback">{item.name.slice(0, 1)}</div>}
                        <div><p>{item.category}</p><h3>{item.name}</h3></div>
                      </div>
                      <span className="live-reco-body">{item.reason}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="shell-card">
                <div className="card-heading"><p>Threat read</p><h3>What matters</h3></div>
                <div className="snapshot-stats">
                  <div><small>Damage</small><strong>{liveResult.analysis.threatSummary.damageBias}</strong></div>
                  <div><small>CC</small><strong>{liveResult.analysis.threatSummary.cc}</strong></div>
                  <div><small>Tanks</small><strong>{liveResult.analysis.threatSummary.tanks}</strong></div>
                  <div><small>Healing</small><strong>{liveResult.analysis.threatSummary.healing}</strong></div>
                </div>
                <div className="pressure-list">{(liveResult.analysis.pressurePoints || []).map((point) => <article className="pressure-card" key={point}><span>{point}</span></article>)}</div>
              </section>

              {liveMetaBuild ? <MiniIconGrid title="Baseline meta" entries={liveMetaBuild.coreItems} /> : null}

              <section className="shell-card recent-matches-card">
                <div className="card-heading"><p>Priority</p><h3>Fight plan</h3></div>
                <div className="priority-list">
                  {(liveResult.analysis.targetPriority || []).map((target) => (
                    <article className="priority-row" key={`${target.rank}-${target.championName}`}>
                      <strong>#{target.rank}</strong>
                      <div><h4>{target.championName}</h4><span>{target.scoreLine}</span></div>
                      <p>{target.reason}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="shell-card">
                <div className="card-heading"><p>Scan history</p><h3>Recent reads</h3></div>
                <div className="history-list">
                  {scanHistory.map((entry) => (
                    <article className="history-row" key={`${entry.timestamp}-${entry.buyNow}`}>
                      <strong>{entry.timeLabel}</strong>
                      <span>{entry.buyNow || "No urgent buy"}</span>
                      <div className="history-meta"><small>{entry.damageBias}</small>{entry.statusLabel ? <em className={`state-pill ${getStateClassName(entry.statusLabel)}`}>{entry.statusLabel}</em> : null}</div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : <section className="shell-card empty-state-card"><h3>Live game</h3><span>Usá `Find live game` cuando ya estés en partida para abrir esta vista.</span></section>
      ) : null}

      <footer className="app-footer">
        <div>
          <strong>Draft Companion</strong>
          <span>Player hub, champion lab y live war room para League of Legends.</span>
        </div>
        <div className="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/riot.txt">riot.txt</a>
        </div>
      </footer>
    </main>
  );
}

export default App;
