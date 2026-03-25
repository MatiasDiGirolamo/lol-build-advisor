import { getMobalyticsPageState } from "./mobalyticsState.js";

const CHAMPION_SLUG_OVERRIDES = {
  MonkeyKing: "wukong",
  RenataGlasc: "renata",
};

const BUILD_TYPE_LABEL = {
  MOST_POPULAR: "Most Popular",
  OPTIONAL: "Optional",
  ALTERNATIVE: "Alternative",
  OFF_META: "Off Meta",
};

const BUILD_TYPE_PLAYSTYLE = {
  MOST_POPULAR: "Highest sample route from current ranked meta.",
  OPTIONAL: "Alternate route with live current-patch sample.",
  ALTERNATIVE: "Flexible route for different pacing or damage profile.",
  OFF_META: "Lower sample path that still appears in live ranked data.",
};

const LANE_PATHS = {
  Top: "top",
  Jungle: "jungle",
  Mid: "mid",
  Bot: "adc",
  Support: "support",
};

const LANE_ROLES = {
  Top: "TOP",
  Jungle: "JUNGLE",
  Mid: "MID",
  Bot: "ADC",
  Support: "SUPPORT",
};

function getDynamicEntries(state) {
  return Object.values(state?.lolState?.apollo?.dynamic || {});
}

function getChampionSlug(champion) {
  return CHAMPION_SLUG_OVERRIDES[champion.id] || champion.id.toLowerCase();
}

function getBuildItems(build, type) {
  return build.items?.find((entry) => entry.type === type)?.items || [];
}

function toSkillKey(orderValue) {
  return ["Q", "W", "E", "R"][Number(orderValue) - 1] || "Q";
}

function createBuildEntry(build) {
  const matches = build.stats?.matchCount || 0;
  const wins = build.stats?.wins || 0;

  return {
    title: BUILD_TYPE_LABEL[build.type] || build.type,
    playstyle:
      BUILD_TYPE_PLAYSTYLE[build.type] ||
      "Current route sourced from ranked Mobalytics data.",
    summonerIds: build.spells || [],
    runePage: {
      styleId: build.perks?.style || null,
      subStyleId: build.perks?.subStyle || null,
      perkIds: build.perks?.IDs || [],
    },
    starterItemIds: getBuildItems(build, "Starter"),
    earlyItemIds: getBuildItems(build, "Early"),
    coreItemIds: getBuildItems(build, "Core"),
    fullBuildItemIds: getBuildItems(build, "FullBuild"),
    situationalItemIds: getBuildItems(build, "Situational"),
    skillOrder: (build.skillMaxOrder || []).map((entry, index) => ({
      slot: index + 1,
      key: toSkillKey(entry),
    })),
    notes: [],
    winRate: matches ? Number(((wins / matches) * 100).toFixed(1)) : null,
    matches: matches || null,
  };
}

function parseCounters(championData) {
  const synergies = championData.synergies || [];
  const byType = new Map(synergies.map((entry) => [entry.type, entry.synergies || []]));

  const normalizeEntries = (entries) =>
    entries.slice(0, 6).map((entry) => ({
      slug: entry.championSlug,
      winRate: entry.winRate ? Number(entry.winRate.toFixed(1)) : null,
    }));

  return {
    strongAgainst: normalizeEntries(byType.get("StrongAgainst") || []),
    weakAgainst: normalizeEntries(byType.get("WeekAgainst") || byType.get("WeakAgainst") || []),
    matchupSpecific: [],
  };
}

export async function getMobalyticsBuilds(champion, lane) {
  const slug = getChampionSlug(champion);
  const lanePath = LANE_PATHS[lane] || "mid";
  const laneRole = LANE_ROLES[lane] || "MID";
  const url = `https://mobalytics.gg/lol/champions/${slug}/build/${lanePath}`;
  const { patch, state } = await getMobalyticsPageState(url);
  const entries = getDynamicEntries(state);
  const championData = entries.find(
    (entry) =>
      entry?.__typename === "LolChampion" &&
      Number(entry.id) === Number(champion.key) &&
      entry.activeFilters?.role === laneRole,
  );

  if (!championData) {
    throw new Error(`No encontre meta build de ${champion.id} ${lane} en Mobalytics.`);
  }

  const builds = entries
    .filter(
      (entry) =>
        entry?.__typename === "LolChampionBuild" &&
        entry.championSlug === slug &&
        entry.role === laneRole &&
        BUILD_TYPE_LABEL[entry.type],
    )
    .sort(
      (left, right) =>
        ["MOST_POPULAR", "OPTIONAL", "ALTERNATIVE", "OFF_META"].indexOf(left.type) -
        ["MOST_POPULAR", "OPTIONAL", "ALTERNATIVE", "OFF_META"].indexOf(right.type),
    )
    .map(createBuildEntry)
    .filter((build) => build.coreItemIds.length >= 3);

  if (!builds.length) {
    throw new Error(`No encontre builds parseables para ${champion.id} ${lane}.`);
  }

  const stats = championData['stats({"topHistoryPoints":2})'] || null;

  return {
    provider: "Mobalytics",
    patch,
    url,
    championStats: {
      tier: stats?.tier || null,
      matches: stats?.totalMatchCount || null,
    },
    builds,
    counters: parseCounters(championData),
  };
}
