// api/delays.js — Retard par ligne via TomTom Routing API (trajet complet).
// Besoin: TOMTOM_KEY en variable d'env + produit "Routing API" activé.

const KEY = process.env.TOMTOM_KEY;
const MAX_MIN = 60;             // borne haute d'affichage (minutes)
const CACHE_TTL = 60 * 1000;    // 60s : 1 appel/min max
let cache = { ts: 0, data: null };

// Itinéraires représentatifs par ligne (start : [lat,lng], end : [lat,lng], via: [[lat,lng], ...] optionnel)
const LINE_ROUTES = {
  "11": { // Jardin Exotique CHPG -> La Turbie (approx)
    start: [43.7358, 7.4148],
    end:   [43.7272, 7.4010],
    via:   [[43.7398,7.4205],[43.7446,7.4042]],
  },
  "12": { // Monaco Casino -> Beausoleil/Moneghetti (urbain)
    start: [43.7393, 7.4276],
    end:   [43.7446, 7.4207],
    via:   [[43.7426,7.4250]],
  },
  "13": { // Moneghetti -> Pont Ste Dévote (boucle urbaine)
    start: [43.7420, 7.4232],
    end:   [43.7388, 7.4202],
    via:   [[43.7408,7.4210]],
  },
  "18": { // Monaco -> Menton (bord de mer)
    start: [43.7385, 7.4246],          // Monaco centre
    end:   [43.7749, 7.4944],          // Carnolès / Menton Ouest
    via:   [[43.7566,7.4608],[43.7663,7.4915]], // Roquebrune, Menton centre
  },
  "24": { // Carnolès -> Garavan
    start: [43.7749, 7.4944],          // Carnolès
    end:   [43.7815, 7.5239],          // Garavan
    via:   [[43.7778,7.5043],[43.7806,7.5120]], // Plages -> centre -> frontière
  },
};

// Utilitaire: construit l'URL Routing API
function routeUrl({ start, end, via = [] }) {
  const fmt = ([lat, lng]) => `${lat},${lng}`;
  const legs = [fmt(start), ...via.map(fmt), fmt(end)].join(':');
  const params = new URLSearchParams({
    key: KEY,
    traffic: 'true',
    computeTravelTimeFor: 'all', // renvoie travelTimeInSeconds & noTrafficTravelTimeInSeconds
    avoid: 'unpavedRoads',
  });
  return `https://api.tomtom.com/routing/1/calculateRoute/${legs}/json?${params.toString()}`;
}

// Appelle TomTom Routing et calcule le retard (minutes)
async function fetchDelayForRoute(route) {
  const url = routeUrl(route);
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Routing HTTP ' + r.status);
  const j = await r.json();
  const sum = j?.routes?.[0]?.summary;
  const cur = Number(sum?.travelTimeInSeconds || 0);
  const free = Number(sum?.noTrafficTravelTimeInSeconds || 0);
  if (!cur || !free) return 0;
  const mins = Math.max(0, Math.round((cur - free) / 60));
  return Math.min(MAX_MIN, mins);
}

export default async function handler(req, res) {
  try {
    // 1) Cache 60s pour limiter à 1/min
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(cache.data);
    }

    // 2) Fallback démo si clé absente
    if (!KEY) {
      const demo = { "11": 2, "12": 5, "13": 1, "18": 18, "24": 7 };
      cache = { ts: Date.now(), data: demo };
      return res.status(200).json(demo);
    }

    // 3) Calcule pour chaque ligne en parallèle
    const out = {};
    await Promise.all(Object.keys(LINE_ROUTES).map(async (ln) => {
      try {
        out[ln] = await fetchDelayForRoute(LINE_ROUTES[ln]);
      } catch (e) {
        out[ln] = 0; // si échec, pas de retard
      }
    }));

    cache = { ts: Date.now(), data: out };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (e) {
    // Sécurité: renvoie 0 partout si panne
    return res.status(200).json({ "11":0, "12":0, "13":0, "18":0, "24":0 });
  }
}
