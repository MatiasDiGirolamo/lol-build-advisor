import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import "./App.css";

const ROLE_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"];
const LIVE_HISTORY_LIMIT = 8;

function formatGameLength(seconds) {
  if (!seconds) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function formatRate(value) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "-";
}

function getEntryName(entry) {
  return typeof entry === "string" ? entry : entry?.name || "";
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

function getFeaturedLaneEntries(entries) {
  const sTier = (entries || []).filter((entry) => entry.tier === "S");
  return (sTier.length ? sTier : entries || []).slice(0, 5);
}

function ChampionThumb({ champion, active, onSelect }) {
  return (
    <button
      className={`champ-thumb ${active ? "is-active" : ""}`}
      type="button"
      onClick={() => onSelect(champion.id)}
      title={champion.name}
    >
      <img src={champion.squareUrl} alt={champion.name} loading="lazy" />
      <span>{champion.name}</span>
      {champion.tier ? <small>{champion.tier}</small> : null}
    </button>
  );
}

function RoleTabs({ roles, selectedLane, onChange }) {
  if (!roles?.length) {
    return null;
  }

  return (
    <div className="pill-row">
      {roles.map((role) => (
        <button
          key={role.lane}
          className={`pill-button ${selectedLane === role.lane ? "is-active" : ""}`}
          type="button"
          onClick={() => onChange(role.lane)}
        >
          <strong>{role.lane}</strong>
          <span>{role.tier || "?"}</span>
        </button>
      ))}
    </div>
  );
}

function BuildTabs({ builds, activeBuildIndex, onChange }) {
  return (
    <div className="build-tab-row">
      {builds.map((build, index) => (
        <button
          key={`${build.title}-${index}`}
          className={`build-tab ${activeBuildIndex === index ? "is-active" : ""}`}
          type="button"
          onClick={() => onChange(index)}
        >
          <strong>{build.title}</strong>
          <span>{formatRate(build.winRate)}</span>
          <small>{build.matches ? `${build.matches.toLocaleString()} games` : build.playstyle}</small>
        </button>
      ))}
    </div>
  );
}

function CompactIconRow({ title, entries, className = "" }) {
  if (!entries?.length) {
    return null;
  }

  return (
    <section className={`glass-card ${className}`.trim()}>
      <div className="card-heading">
        <p>{title}</p>
        <h3>{title}</h3>
      </div>

      <div className="icon-strip">
        {entries.map((entry) => (
          <article className="icon-tile" key={`${title}-${getEntryName(entry)}`}>
            {entry.iconUrl ? (
              <img src={entry.iconUrl} alt={getEntryName(entry)} title={getEntryName(entry)} loading="lazy" />
            ) : (
              <div className="icon-fallback">{getEntryName(entry).slice(0, 1)}</div>
            )}
            <span>{getEntryName(entry)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ItemizationBoard({ build }) {
  const mainSections = [
    { title: "Starter", entries: build.starterItems },
    { title: "Early", entries: build.earlyItems },
    { title: "Core", entries: build.coreItems },
    { title: "Full build", entries: build.fullBuildItems },
  ].filter((section) => section.entries?.length);
  const situationalSection = {
    title: "Situational",
    entries: build.situationalItems || [],
  };

  if (!mainSections.length && !situationalSection.entries.length) {
    return null;
  }

  return (
    <section className="glass-card itemization-board">
        <div className="card-heading">
          <p>Itemization</p>
          <h3>Build Path</h3>
        </div>

        <div className="itemization-mainline">
          {mainSections.map((section, sectionIndex) => (
            <div className="item-stage" key={section.title}>
              <div className="itemization-head">
                <span>{section.title}</span>
              </div>
              <div className="item-stage-row">
                {section.entries.map((entry) => (
                  <article className="icon-tile item-inline-tile" key={`${section.title}-${getEntryName(entry)}`}>
                    {entry.iconUrl ? (
                      <img src={entry.iconUrl} alt={getEntryName(entry)} title={getEntryName(entry)} loading="lazy" />
                    ) : (
                      <div className="icon-fallback">{getEntryName(entry).slice(0, 1)}</div>
                    )}
                    <span>{getEntryName(entry)}</span>
                  </article>
                ))}
              </div>
              {sectionIndex < mainSections.length - 1 ? <div className="stage-separator" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>

        {situationalSection.entries.length ? (
          <div className="situational-strip-shell">
            <div className="itemization-head">
              <span>{situationalSection.title}</span>
            </div>
            <div className="situational-strip">
              {situationalSection.entries.map((entry) => (
                <article className="icon-tile item-inline-tile situational-tile" key={`situational-${getEntryName(entry)}`}>
                  {entry.iconUrl ? (
                    <img src={entry.iconUrl} alt={getEntryName(entry)} title={getEntryName(entry)} loading="lazy" />
                  ) : (
                    <div className="icon-fallback">{getEntryName(entry).slice(0, 1)}</div>
                  )}
                  <span>{getEntryName(entry)}</span>
                </article>
              ))}
            </div>
          </div>
        ) : null}
    </section>
  );
}

function RunePanel({ runes }) {
  if (!runes) {
    return null;
  }

  const primarySlots = (runes.slots || []).map((entry) =>
    typeof entry === "string" ? { name: entry, iconUrl: null } : entry,
  );
  const secondarySlots = (runes.secondarySlots || []).map((entry) =>
    typeof entry === "string" ? { name: entry, iconUrl: null } : entry,
  );
  const shards = (runes.shards || []).map((entry) =>
    typeof entry === "string" ? { name: entry, iconUrl: null } : entry,
  );

  return (
    <section className="glass-card">
      <div className="card-heading">
        <p>Runes</p>
        <h3>Rune Page</h3>
      </div>

      <div className="rune-shell">
        <div className="rune-branch primary">
          <div className="rune-branch-head">
            {runes.keystoneIconUrl ? <img src={runes.keystoneIconUrl} alt={runes.keystone} loading="lazy" /> : null}
            <div>
              <small>{runes.primaryStyle}</small>
              <strong>{runes.keystone || "Keystone"}</strong>
            </div>
          </div>
          <div className="mini-icons">
            {primarySlots.map((entry) => (
              <span key={entry.name} title={entry.name}>
                {entry.iconUrl ? <img src={entry.iconUrl} alt={entry.name} loading="lazy" /> : null}
                <em>{entry.name}</em>
              </span>
            ))}
          </div>
        </div>

        <div className="rune-branch secondary">
          <div className="rune-branch-head">
            {runes.secondaryStyleIconUrl ? (
              <img src={runes.secondaryStyleIconUrl} alt={runes.secondaryStyle} loading="lazy" />
            ) : null}
            <div>
              <small>{runes.secondaryStyle}</small>
              <strong>Secondary</strong>
            </div>
          </div>
          <div className="mini-icons">
            {secondarySlots.map((entry) => (
              <span key={entry.name} title={entry.name}>
                {entry.iconUrl ? <img src={entry.iconUrl} alt={entry.name} loading="lazy" /> : null}
                <em>{entry.name}</em>
              </span>
            ))}
          </div>
        </div>
      </div>

      {shards.length ? (
        <div className="tag-row">
          {shards.map((entry) => (
            <span key={entry.name} className="tag-chip">
              {entry.name}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CounterRow({ title, entries, tone }) {
  if (!entries?.length) {
    return null;
  }

  return (
    <section className={`glass-card counter-card ${tone}`}>
      <div className="card-heading">
        <p>Matchups</p>
        <h3>{title}</h3>
      </div>

      <div className="counter-row">
        {entries.map((entry) => (
          <article className="counter-chip" key={`${title}-${entry.id || entry.name}`}>
            {entry.squareUrl ? <img src={entry.squareUrl} alt={entry.name} loading="lazy" /> : null}
            <div>
              <strong>{entry.name}</strong>
              <span>{formatRate(entry.winRate)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SkillOrderCard({ skills }) {
  if (!skills?.length) {
    return null;
  }

  return (
    <section className="glass-card skill-order-card">
      <div className="card-heading">
        <p>Abilities</p>
        <h3>Max order</h3>
      </div>

      <div className="skill-strip">
        {skills.map((skill) => (
          <article className="skill-chip" key={`${skill.slot}-${skill.key}`}>
            <span>{skill.slot}</span>
            <strong>{skill.key}</strong>
            <small>{skill.name}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function TierLaneColumn({ lane, entries, onSelectChampion }) {
  const featuredEntries = getFeaturedLaneEntries(entries);

  return (
    <section className="tier-lane-card">
      <div className="tier-lane-head">
        <div>
          <p>{lane}</p>
          <h3>{featuredEntries.some((entry) => entry.tier === "S") ? "S Tier" : "Meta Picks"}</h3>
        </div>
      </div>

      <div className="tier-list">
        {featuredEntries.map((entry) => (
          <button
            key={`${lane}-${entry.id}`}
            className="tier-entry"
            type="button"
            onClick={() => onSelectChampion(entry.id)}
          >
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

function LiveRecommendationCard({ item }) {
  return (
    <article className="live-reco-card">
      <div className="live-reco-top">
        {item.iconUrl ? <img src={item.iconUrl} alt={item.name} loading="lazy" /> : <div className="icon-fallback">{item.name.slice(0, 1)}</div>}
        <div>
          <p>{item.category}</p>
          <h3>{item.name}</h3>
        </div>
      </div>
      <span className="live-reco-body">{item.reason}</span>
    </article>
  );
}

function PurchasePlan({ plan }) {
  if (!plan) {
    return null;
  }

  return (
    <section className="glass-card purchase-plan-card">
      <div className="card-heading">
        <p>Purchase plan</p>
        <h3>Now / Next / Fallback</h3>
      </div>

      <div className="purchase-highlight">
        <small>Buy now</small>
        {plan.buyNow ? <LiveRecommendationCard item={plan.buyNow} /> : <span>No urgent buy</span>}
      </div>

      <div className="purchase-columns compact">
        <div className="purchase-column">
          <small>Buy next</small>
          <div className="purchase-mini-list">
            {(plan.buyNext || []).map((item) => (
              <article className="purchase-mini-card" key={`next-${item.name}`}>
                {item.iconUrl ? <img src={item.iconUrl} alt={item.name} loading="lazy" /> : <div className="icon-fallback">{item.name.slice(0, 1)}</div>}
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="purchase-column">
          <small>Fallback</small>
          <div className="purchase-mini-list">
            {(plan.fallback || []).map((item) => (
              <article className="purchase-mini-card" key={`fallback-${item.name}`}>
                {item.iconUrl ? <img src={item.iconUrl} alt={item.name} loading="lazy" /> : <div className="icon-fallback">{item.name.slice(0, 1)}</div>}
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PressurePointList({ points }) {
  if (!points?.length) {
    return null;
  }

  return (
    <div className="pressure-list">
      {points.map((point) => (
        <article className="pressure-card" key={point}>
          <span>{point}</span>
        </article>
      ))}
    </div>
  );
}

function TargetPriorityCard({ targets, winCondition, gameState }) {
  return (
    <section className="glass-card priority-card">
      <div className="card-heading">
        <p>Fight plan</p>
        <h3>{winCondition?.title || "Win condition"}</h3>
      </div>

      {winCondition?.summary ? <p className="priority-summary">{winCondition.summary}</p> : null}

      <div className="priority-headline">
        <div className="priority-copy">
          <span>{gameState?.enemyLeadLabel || "Live read"}</span>
          {gameState?.summary ? <small>{gameState.summary}</small> : null}
        </div>

        <div className="priority-meta">
          {gameState?.statusLabel ? (
            <strong className={`state-pill ${getStateClassName(gameState.statusLabel)}`}>
              {gameState.statusLabel}
            </strong>
          ) : null}
          {gameState?.currentGold ? <strong>{Math.round(gameState.currentGold)}g</strong> : null}
        </div>
      </div>

      <div className="priority-list">
        {(targets || []).map((target) => (
          <article className="priority-row" key={`${target.rank}-${target.championName}`}>
            <strong>#{target.rank}</strong>
            <div>
              <h4>{target.championName}</h4>
              <span>{target.scoreLine}</span>
            </div>
            <p>{target.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScanHistory({ entries }) {
  if (!entries?.length) {
    return null;
  }

  return (
    <section className="glass-card history-card">
      <div className="card-heading">
        <p>Scan history</p>
        <h3>Recent reads</h3>
      </div>

      <div className="history-list">
        {entries.map((entry) => (
          <article className="history-row" key={`${entry.timestamp}-${entry.buyNow || entry.damageBias}`}>
            <strong>{entry.timeLabel}</strong>
            <span>{entry.buyNow || "No urgent buy"}</span>
            <div className="history-meta">
              <small>{entry.damageBias}</small>
              {entry.statusLabel ? (
                <em className={`state-pill ${getStateClassName(entry.statusLabel)}`}>{entry.statusLabel}</em>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveRoster({ title, players, championMap, tone }) {
  if (!players?.length) {
    return null;
  }

  return (
    <section className={`glass-card roster-card ${tone}`}>
      <div className="card-heading">
        <p>{title}</p>
        <h3>{title}</h3>
      </div>

      <div className="roster-list">
        {players.map((player) => {
          const champion = championMap.get(player.championName);
          return (
            <article className="roster-row" key={`${title}-${player.name}-${player.championName}`}>
              <div className="roster-main">
                {champion?.squareUrl ? <img src={champion.squareUrl} alt={player.championName} loading="lazy" /> : null}
                <div>
                  <strong>{player.championName}</strong>
                  <span>{player.scoreLine}</span>
                </div>
              </div>
              <div className="mini-item-row">
                {(player.items || []).map((item) => (
                  <img
                    key={`${player.name}-${item.id}`}
                    src={item.iconUrl}
                    alt={item.name}
                    title={item.name}
                    loading="lazy"
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ModeTabs({ viewMode, liveAvailable, onChange }) {
  return (
    <div className="mode-tabs">
      <button
        className={`mode-tab ${viewMode === "draft" ? "is-active" : ""}`}
        type="button"
        onClick={() => onChange("draft")}
      >
        Draft
      </button>
      <button
        className={`mode-tab ${viewMode === "live" ? "is-active" : ""}`}
        type="button"
        onClick={() => liveAvailable && onChange("live")}
        disabled={!liveAvailable}
      >
        Live
      </button>
    </div>
  );
}

function App() {
  const [champions, setChampions] = useState([]);
  const [selectedChampionId, setSelectedChampionId] = useState("");
  const [selectedLane, setSelectedLane] = useState("");
  const [buildPackage, setBuildPackage] = useState(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [activeBuildIndex, setActiveBuildIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [tierOverview, setTierOverview] = useState(null);
  const [tierError, setTierError] = useState("");

  const [liveResult, setLiveResult] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [viewMode, setViewMode] = useState("draft");
  const [scanHistory, setScanHistory] = useState([]);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    Promise.all([
      fetch("/api/champions").then((response) => response.json()),
      fetch("/api/meta/tiers").then((response) => response.json()),
    ])
      .then(([championData, tierData]) => {
        if (!Array.isArray(championData)) {
          throw new Error("Champion catalog unavailable.");
        }

        startTransition(() => {
          setChampions(championData);
          if (tierData?.roles) {
            setTierOverview(tierData);
          }

          const defaultChampion = championData.find((champion) => champion.id === "Ahri") || championData[0];
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

    fetch(`/api/champions/${selectedChampionId}/builds?lane=${encodeURIComponent(selectedLane)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok) {
          throw new Error(payload.message || "No pude cargar la build.");
        }

        startTransition(() => {
          setBuildPackage(payload);
          setActiveBuildIndex(0);
        });
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }
        setBuildError(error.message || "No pude cargar la build.");
      })
      .finally(() => {
        setBuildLoading(false);
      });

    return () => controller.abort();
  }, [selectedChampionId, selectedLane]);

  const championMap = useMemo(
    () => new Map(champions.map((champion) => [champion.id, champion])),
    [champions],
  );

  const championByName = useMemo(
    () => new Map(champions.map((champion) => [champion.name, champion])),
    [champions],
  );

  const filteredChampions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return champions;
    }

    return champions.filter((champion) => {
      const haystack = `${champion.name} ${champion.title} ${champion.lane} ${(champion.roles || []).map((role) => role.lane).join(" ")} ${champion.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [champions, deferredSearch]);

  const selectedChampion = buildPackage?.champion || championMap.get(selectedChampionId);
  const activeBuild = buildPackage?.builds?.[activeBuildIndex] || null;
  const liveAllies = liveResult?.participants?.filter((participant) => participant.relation === "ALLY") || [];
  const liveEnemies = liveResult?.participants?.filter((participant) => participant.relation === "ENEMY") || [];

  async function scanLiveGame({ silent = false } = {}) {
    setLiveLoading(true);
    if (!silent) {
      setLiveError("");
    }

    try {
      const response = await fetch("/api/analyze/live-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No pude leer la partida local.");
      }

      startTransition(() => {
        setLiveResult(payload);
        setLiveMode(true);
        setLiveError("");
        setLastScanAt(Date.now());
        setViewMode("live");
        setScanHistory((previous) => {
          const nextEntry = {
            timestamp: Date.now(),
            timeLabel: new Date().toLocaleTimeString(),
            buyNow: payload.analysis.purchasePlan?.buyNow?.name || null,
            damageBias: payload.analysis.threatSummary?.damageBias || "Mixed",
            statusLabel: payload.analysis.gameState?.statusLabel || "Even",
          };
          return [nextEntry, ...previous].slice(0, LIVE_HISTORY_LIMIT);
        });
        if (payload.metaBuild?.champion?.id) {
          setSelectedChampionId(payload.metaBuild.champion.id);
          setSelectedLane(payload.metaBuild.champion.lane);
        }
      });
    } catch (error) {
      if (!silent) {
        setLiveError(error.message || "No pude leer la partida local.");
      } else if (liveMode) {
        setLiveMode(false);
        setViewMode("draft");
      }
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    scanLiveGame({ silent: true });
  }, []);

  useEffect(() => {
    if (!liveMode) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scanLiveGame({ silent: true });
    }, liveResult?.refreshIntervalMs || 120000);

    return () => window.clearInterval(intervalId);
  }, [liveMode, liveResult?.refreshIntervalMs]);

  function handleChampionSelect(championId) {
    const champion = championMap.get(championId);
    setSelectedChampionId(championId);
    setSelectedLane(champion?.roles?.[0]?.lane || champion?.lane || "Mid");
  }

  const liveMetaBuild = liveResult?.metaBuild?.builds?.[0] || null;
  const liveMetaChampion = liveResult?.metaBuild?.champion || null;
  const liveAvailable = liveMode && Boolean(liveResult);

  if (viewMode === "live" && liveAvailable) {
    return (
      <main className="app-shell live-shell">
        <ModeTabs viewMode={viewMode} liveAvailable={liveAvailable} onChange={setViewMode} />

        <section className="live-hero">
          <div className="live-hero-copy">
            <p className="eyebrow">Live War Room</p>
            <h1>{liveResult.player.championName}</h1>
            <div className="live-stat-bar">
              <span>{formatGameLength(liveResult.game.gameLengthSeconds)}</span>
              <span>{liveResult.analysis.playerRole}</span>
              {liveResult.analysis.gameState?.statusLabel ? (
                <span className={`state-pill ${getStateClassName(liveResult.analysis.gameState.statusLabel)}`}>
                  {liveResult.analysis.gameState.statusLabel}
                </span>
              ) : null}
              <span>Auto refresh 2m</span>
              {lastScanAt ? <span>{new Date(lastScanAt).toLocaleTimeString()}</span> : null}
            </div>
          </div>

          <div className="live-actions">
            <button className="primary-button" type="button" onClick={() => scanLiveGame()} disabled={liveLoading}>
              {liveLoading ? "Updating..." : "Refresh now"}
            </button>
          </div>
        </section>

        {liveError ? <div className="feedback-banner error">{liveError}</div> : null}

        <section className="live-grid">
          <section className="glass-card focus-panel compact-live-panel">
            <div className="card-heading">
              <p>Build now</p>
              <h2>Next buys</h2>
            </div>

            <div className="live-reco-grid">
              {(liveResult.analysis.nextItems || []).map((item) => (
                <LiveRecommendationCard key={`${item.category}-${item.name}`} item={item} />
              ))}
            </div>
          </section>

          <PurchasePlan plan={liveResult.analysis.purchasePlan} />

          <section className="glass-card threat-panel">
            <div className="card-heading">
              <p>Threat read</p>
              <h3>What matters</h3>
            </div>

            <div className="threat-stats">
              <div>
                <small>Damage</small>
                <strong>{liveResult.analysis.threatSummary.damageBias}</strong>
              </div>
              <div>
                <small>CC</small>
                <strong>{liveResult.analysis.threatSummary.cc}</strong>
              </div>
              <div>
                <small>Tanks</small>
                <strong>{liveResult.analysis.threatSummary.tanks}</strong>
              </div>
              <div>
                <small>Healing</small>
                <strong>{liveResult.analysis.threatSummary.healing}</strong>
              </div>
            </div>

            <PressurePointList points={liveResult.analysis.pressurePoints} />
          </section>

          <TargetPriorityCard
            targets={liveResult.analysis.targetPriority}
            winCondition={liveResult.analysis.winCondition}
            gameState={liveResult.analysis.gameState}
          />

          <section className="glass-card plan-panel">
            <div className="card-heading">
              <p>Combat plan</p>
              <h3>Enemy read</h3>
            </div>

            <div className="insight-list">
              {(liveResult.analysis.enemyThreats || []).map((entry) => (
                <article className="insight-card" key={`${entry.title}-${entry.detail}`}>
                  <strong>{entry.title}</strong>
                  <span>{entry.detail}</span>
                </article>
              ))}
            </div>
          </section>

          {liveMetaBuild ? (
            <section className="glass-card meta-live-panel">
              <div className="card-heading">
                <p>Baseline meta</p>
                <h3>
                  {liveMetaChampion?.name} {liveMetaChampion?.lane}
                </h3>
              </div>

              <CompactIconRow title="Core path" entries={liveMetaBuild.coreItems} />
              <CompactIconRow title="Situational" entries={liveMetaBuild.situationalItems} />
            </section>
          ) : null}

          <ScanHistory entries={scanHistory} />
          <LiveRoster title="Enemies" players={liveEnemies} championMap={championByName} tone="danger" />
          <LiveRoster title="Allies" players={liveAllies} championMap={championByName} tone="ally" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ModeTabs viewMode={viewMode} liveAvailable={liveAvailable} onChange={setViewMode} />

      <section className="draft-topbar">
        <div>
          <p className="eyebrow">Draft Board</p>
          <h1>Meta by role, then live adapt in game.</h1>
        </div>

        <div className="topbar-actions">
          <div className="patch-pill">
            <span>{tierOverview?.provider || buildPackage?.source?.provider || "Meta"}</span>
            <strong>{tierOverview?.patch || buildPackage?.source?.patch || "Current patch"}</strong>
          </div>
          <button className="primary-button" type="button" onClick={() => scanLiveGame()} disabled={liveLoading}>
            {liveLoading ? "Scanning..." : "Scan local game"}
          </button>
        </div>
      </section>

      {liveError ? <div className="feedback-banner error">{liveError}</div> : null}
      {tierError ? <div className="feedback-banner">{tierError}</div> : null}

      {tierOverview?.roles ? (
        <section className="tier-board">
          {ROLE_ORDER.map((lane) => (
            <TierLaneColumn
              key={lane}
              lane={lane}
              entries={tierOverview.roles[lane] || []}
              onSelectChampion={handleChampionSelect}
            />
          ))}
        </section>
      ) : null}

      <section className="draft-grid">
        <aside className="champion-rail glass-card">
          <div className="card-heading">
            <p>Champion pool</p>
            <h3>Pick a champ</h3>
          </div>

          <label className="search-box">
            <input
              placeholder="Ahri, support, assassin..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="champion-grid">
            {filteredChampions.map((champion) => (
              <ChampionThumb
                key={champion.id}
                champion={champion}
                active={champion.id === selectedChampionId}
                onSelect={handleChampionSelect}
              />
            ))}
          </div>
        </aside>

        <section className="draft-main">
          <section
            className="champion-panel"
            style={selectedChampion?.splashUrl ? { "--panel-splash": `url(${selectedChampion.splashUrl})` } : undefined}
          >
            <div className="champion-panel-overlay" />
            <div className="champion-panel-content">
              <div className="champion-summary">
                <div className="champion-head">
                  {selectedChampion?.squareUrl ? (
                    <img src={selectedChampion.squareUrl} alt={selectedChampion.name} loading="lazy" />
                  ) : null}
                  <div>
                    <p className="eyebrow">Champion build</p>
                    <h2>{selectedChampion?.name || "Loading..."}</h2>
                    <span>{selectedChampion?.title || "Champion"}</span>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag-chip gold">{selectedChampion?.tier ? `${selectedChampion.tier} Tier` : selectedLane}</span>
                  {(selectedChampion?.tags || []).map((tag) => (
                    <span className="tag-chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <RoleTabs roles={selectedChampion?.roles || buildPackage?.champion?.roles} selectedLane={selectedLane} onChange={setSelectedLane} />
            </div>
          </section>

          {buildError ? <div className="feedback-banner error">{buildError}</div> : null}
          {buildLoading ? <div className="feedback-banner">Loading build...</div> : null}

          {buildPackage && activeBuild ? (
            <>
              <BuildTabs
                builds={buildPackage.builds}
                activeBuildIndex={activeBuildIndex}
                onChange={setActiveBuildIndex}
              />

              <section className="build-dashboard">
                <div className="pregame-top">
                  <div className="pregame-stack">
                    <section className="glass-card hero-build-card">
                      <div className="card-heading">
                        <p>Selected route</p>
                        <h3>{activeBuild.title}</h3>
                      </div>

                      <div className="hero-build-stats">
                        <div>
                          <small>Tier</small>
                          <strong>{buildPackage.champion.tier || "-"}</strong>
                        </div>
                        <div>
                          <small>WR</small>
                          <strong>{formatRate(activeBuild.winRate)}</strong>
                        </div>
                        <div>
                          <small>Games</small>
                          <strong>{activeBuild.matches ? activeBuild.matches.toLocaleString() : "-"}</strong>
                        </div>
                        <div>
                          <small>Patch</small>
                          <strong>{buildPackage.source?.patch || "-"}</strong>
                        </div>
                      </div>
                    </section>

                    <CompactIconRow title="Summoners" entries={activeBuild.summoners} className="summoners-card" />
                  </div>

                  <RunePanel runes={activeBuild.runes} />
                </div>

                <div className="pregame-bottom">
                  <ItemizationBoard build={activeBuild} />
                  <SkillOrderCard skills={activeBuild.skillOrder} />
                  <CounterRow title="Weak Against" entries={buildPackage.counters?.weakAgainst} tone="danger" />
                  <CounterRow title="Strong Against" entries={buildPackage.counters?.strongAgainst} tone="good" />
                </div>
              </section>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

export default App;
