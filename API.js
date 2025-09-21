// api/delays.js — TomTom Routing → minutes de retard par ligne (trajet complet)
// Requiert la variable d'env TOMTOM_KEY sur Vercel
// Cache mémoire 60s pour limiter les appels

const KEY = process.env.TOMTOM_KEY;

// Réglages perception
const AMPLIFY = 2;          // ex: 2 → ressentis plus forts
const MIN_IF_CONGESTED = 5; // min si congestion > 0
const MAX_MIN = 60;         // plafond
const CACHE_TTL = 60 * 1000;
let cache = { ts: 0, data: null };

// Itinéraires représentatifs
const LINE_ROUTES = {
  "11": { start: [43.7358, 7.4148], end: [43.7272, 7.4010], via: [[43.7398,7.4205],[43.7446,7.4042]] },
  "12": { start: [43.7393, 7.4276], end: [43.7446, 7.4207], via: [[43.7426,7.4250]] },
  "13": { start: [43.7420, 7.4232], end: [43.7388, 7.4202], via: [[43.7408,7.4210]] },
  "18": { start: [43.7385, 7.4246], end: [43.7749, 7.4944], via: [[43.7566,7.4608],[43.7663,7.4915]] },
  "24": { start: [43.7749, 7.4944], end: [43.7815, 7.5239], via: [[43.7778,7.5043],[43.7806,7.5120]] },
};

function routeUrl({ start, end, via = [] }) {
  const fmt = ([lat, lng]) => `${lat},${lng}`;
  const legs = [fmt(start), ...via.map(fmt), fmt(end)].join(':');
  const params = new URLSearchParams({
    key: KEY,
    traffic: 'true',
    computeTravelTimeFor: 'all', // travelTimeInSeconds + noTrafficTravelTimeInSeconds
    avoid: 'unpavedRoads',
  });
  return `https://api.tomtom.com/routing/1/calculateRoute/${legs}/json?${params.toString()}`;
}

async function fetchDelayForRoute(route) {
  const r = await fetch(routeUrl(route), { cache: 'no-store' });
  if (!r.ok) throw new Error('Routing HTTP ' + r.status);
  const j = await r.json();
  const sum = j?.routes?.[0]?.summary;
  const cur = Number(sum?.travelTimeInSeconds || 0);
  const free = Number(sum?.noTrafficTravelTimeInSeconds || 0);
  if (!cur || !free) return 0;

  // Diff réel en minutes
  let mins = Math.max(0, Math.round((cur - free) / 60));
  if (mins > 0) mins = Math.max(MIN_IF_CONGESTED, Math.round(mins * AMPLIFY));
  return Math.min(MAX_MIN, mins);
}

export default async function handler(req, res) {
  // ------- CORS (important pour Hostinger -> Vercel) -------
  // Si tu veux restreindre à ton domaine, remplace * par "https://theeye.top"
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // Réponse preflight
    return res.status(204).end();
  }
  // ---------------------------------------------------------

  try {
    // Cache 60s
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(cache.data);
    }

    if (!KEY) {
      const demo = { "11": 2, "12": 6, "13": 3, "18": 18, "24": 12 };
      cache = { ts: Date.now(), data: demo };
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(demo);
    }

    const out = {};
    await Promise.all(Object.keys(LINE_ROUTES).map(async (ln) => {
      try {
        out[ln] = await fetchDelayForRoute(LINE_ROUTES[ln]);
      } catch {
        out[ln] = 0;
      }
    }));

    cache = { ts: Date.now(), data: out };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ "11":0, "12":0, "13":0, "18":0, "24":0 });
  }
}
