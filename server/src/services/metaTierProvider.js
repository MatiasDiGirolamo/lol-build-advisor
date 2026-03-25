import { getChampionAssetUrls, getDDragonData } from "./ddragon.js";
import { getMobalyticsPageState } from "./mobalyticsState.js";

const TIER_URL = "https://mobalytics.gg/lol/tier-list/stats";
const TIER_SCORE = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

const ROLE_LABELS = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "Bot",
  SUPPORT: "Support",
};

function getDynamicEntries(state) {
  return Object.values(state?.lolState?.apollo?.dynamic || {});
}

function findChampionList(entries) {
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (Array.isArray(entry.champions)) {
      return entry;
    }

    for (const value of Object.values(entry)) {
      if (value && typeof value === "object" && Array.isArray(value.champions)) {
        return value;
      }
    }
  }

  return null;
}

function sortRoleEntries(entries) {
  return [...entries].sort((left, right) => {
    const tierDelta = (TIER_SCORE[right.tier] || 0) - (TIER_SCORE[left.tier] || 0);
    if (tierDelta) {
      return tierDelta;
    }

    const winRateDelta = (right.winRate || 0) - (left.winRate || 0);
    if (winRateDelta) {
      return winRateDelta;
    }

    return (right.pickRate || 0) - (left.pickRate || 0);
  });
}

export async function getTierListOverview() {
  const [{ patch, state }, { championsByKey, version }] = await Promise.all([
    getMobalyticsPageState(TIER_URL),
    getDDragonData(),
  ]);

  const championList = findChampionList(getDynamicEntries(state));

  if (!championList) {
    throw new Error("No pude leer la tier list actual de Mobalytics.");
  }

  const roles = {
    Top: [],
    Jungle: [],
    Mid: [],
    Bot: [],
    Support: [],
  };

  const champions = new Map();

  for (const entry of championList.champions) {
    const champion = championsByKey.get(String(entry.id));
    if (!champion) {
      continue;
    }

    const assets = getChampionAssetUrls(version, champion);
    const roleEntries = (entry.roleData || [])
      .map((roleData) => {
        const lane = ROLE_LABELS[roleData.role];
        const stats = roleData.currentStats;

        if (!lane || !stats) {
          return null;
        }

        return {
          lane,
          tier: stats.tier || null,
          winRate: stats.winRate ? Number(stats.winRate.toFixed(1)) : null,
          pickRate: stats.pickRate ? Number(stats.pickRate.toFixed(1)) : null,
          banRate: stats.banRate ? Number(stats.banRate.toFixed(1)) : null,
          matches: stats.totalMatchCount || null,
        };
      })
      .filter(Boolean);

    champions.set(champion.id, {
      id: champion.id,
      key: champion.key,
      name: champion.name,
      roles: sortRoleEntries(roleEntries),
      squareUrl: assets.square,
    });

    for (const roleEntry of roleEntries) {
      roles[roleEntry.lane].push({
        id: champion.id,
        key: champion.key,
        name: champion.name,
        squareUrl: assets.square,
        ...roleEntry,
      });
    }
  }

  return {
    provider: "Mobalytics",
    patch,
    roles: Object.fromEntries(
      Object.entries(roles).map(([lane, entries]) => [
        lane,
        sortRoleEntries(entries).slice(0, 8),
      ]),
    ),
    champions: Object.fromEntries(champions),
  };
}
