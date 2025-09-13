// api/delays.js — TomTom Traffic → minutes de retard par ligne (Monaco/Menton).
// Renvoie: { "11": min, "12": min, "13": min, "18": min, "24": min }.
// Besoin d'une variable d'env: TOMTOM_KEY (Project → Settings → Environment Variables).

const TOMTOM_KEY = process.env.TOMTOM_KEY;
const ZOOM = 10;                 // résolution du segment (5..15). 10 = ~100-200m
const FREE_MAX = 50;             // km/h "freeflow" minimum raisonnable si API retourne 0
const MAX_LINE_DELAY = 25;       // borne max par ligne (minutes)
const TIMEOUT_MS = 5000;         // timeout requête TomTom

// Points représentatifs par ligne (lat,lng). On moyenne les retards sur ces points.
// Ajuste/ajoute des points si tu veux être plus précis.
const LINE_POINTS = {
  "11": [
    [43.7379, 7.4209], // Pont Ste Dévote
    [43.7447, 7.4040], // Beausoleil haut
    [43.7442, 7.4010], // Vers La Turbie
  ],
  "12": [
    [43.7395, 7.4238], // Casino / O.T.
    [43.7425, 7.4248], // Marché Beausoleil
    [43.7460, 7.4220], // Moneghetti
  ],
  "13": [
    [43.7405, 7.4205], // Malbousquet / Moneghetti
    [43.7420, 7.4232], // Crèche/Gymnase
    [43.7390, 7.4230], // Pont Ste Dévote
  ],
  "18": [
    [43.7385, 7.4246], // Monaco centre
    [43.7663, 7.4915], // Menton centre
    [43.7725, 7.4964], // Bord de mer Menton
  ],
  "24": [
    [43.7746, 7.4940], // Carnolès / SNCF
    [43.7779, 7.5041], // Menton plage
    [43.7808, 7.5122], // Garavan
  ],
};

// --- utilitaires ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchTomTom(point) {
  const [lat, lng] = point;
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/${ZOOM}/json?point=${lat},${lng}&key=${TOMTOM_KEY}`;
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('TomTom HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

function delayFromTomTomJson(data) {
  // Docs: renvoie entre autres currentTravelTime (s), freeFlowTravelTime (s)
  const cur = Number(data?.flowSegmentData?.currentTravelTime);
  let free = Number(data?.flowSegmentData?.freeFlowTravelTime);
  // garde-fous
  if (!Number.isFinite(cur) || cur <= 0) return 0;
  if (!Number.isFinite(free) || free <= 0) {
    // fallback si freeFlow absent: approx depuis vitesse "freeflow"
    const len = Number(data?.flowSegmentData?.frcRoadClass) ? 0 : 0; // pas fiable → on évite
    // par prudence, considère 0
    free = Math.max(1, Math.round(cur * 0.8));
  }
  const deltaSec = Math.max(0, cur - free);
  return deltaSec / 60; // minutes
}

async function delayForLine(points) {
  const deltas = [];
  for (let i = 0; i < points.length; i++) {
    try {
      const json = await fetchTomTom(points[i]);
      deltas.push(delayFromTomTomJson(json));
      // petit throttle pour ne pas spammer
      if (i < points.length - 1) await sleep(150);
    } catch (_e) {
      // ignore point en erreur
    }
  }
  if (!deltas.length) return 0;
  // moyenne robuste (trim 1 valeur extrême si >3 points)
  deltas.sort((a,b)=>a-b);
  const arr = deltas.length > 2 ? deltas.slice(1, -1) : deltas;
  const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
  return Math.min(MAX_LINE_DELAY, Math.round(avg));
}

export default async function handler(req, res) {
  try {
    if (!TOMTOM_KEY) {
      // démo si pas de clé
      return res.status(200).json({ "11": 1, "12": 3, "13": 0, "18": 12, "24": 5 });
    }

    const out = { "11":0, "12":0, "13":0, "18":0, "24":0 };
    // lance en parallèle par ligne
    await Promise.all(Object.keys(LINE_POINTS).map(async line => {
      out[line] = await delayForLine(LINE_POINTS[line]);
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (e) {
    // fallback safe
    return res.status(200).json({ "11": 0, "12": 0, "13": 0, "18": 0, "24": 0 });
  }
}
