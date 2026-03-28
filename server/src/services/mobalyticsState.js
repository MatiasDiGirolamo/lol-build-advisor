const PAGE_CACHE_TTL_MS = 1000 * 60 * 60;
const pageCache = new Map();

function extractPatchFromTitle(html) {
  return html.match(/<title[^>]*>.*?Patch\s+([\d.]+).*?<\/title>/i)?.[1] || null;
}

function extractPreloadedState(html) {
  const rawState = html.match(/window\.__PRELOADED_STATE__=(\{[\s\S]*?\});<\/script>/)?.[1];

  if (!rawState) {
    if (/The deployment|Access Denied|Attention Required|Just a moment/i.test(html)) {
      throw new Error("Mobalytics devolvio una pagina de proteccion temporal.");
    }

    throw new Error("No pude encontrar __PRELOADED_STATE__ en Mobalytics.");
  }

  return JSON.parse(rawState);
}

export async function getMobalyticsPageState(url) {
  const cached = pageCache.get(url);

  if (cached && Date.now() - cached.cachedAt < PAGE_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Mobalytics devolvio ${response.status} para ${url}.`);
    }

    const html = await response.text();
    const data = {
      html,
      patch: extractPatchFromTitle(html),
      state: extractPreloadedState(html),
    };

    pageCache.set(url, {
      cachedAt: Date.now(),
      data,
    });

    return data;
  } catch (error) {
    if (cached?.data) {
      return cached.data;
    }

    throw error;
  }
}
