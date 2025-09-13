// api/delays.js — Vercel serverless
// Renvoie { "11": min, "12": min, "13": min, "18": min, "24": min }.
// Si WAZE_JAMS_URL n'est pas défini/accessible → valeurs de démo.

const LINE_ZONES = {
  "11": [[43.727, 7.396, 43.764, 7.428]], // Monaco ↔ La Turbie (large, à affiner)
  "12": [[43.731, 7.404, 43.751, 7.431]], // Beausoleil
  "13": [[43.731, 7.404, 43.748, 7.430]], // Moneghetti
  "18": [[43.735, 7.409, 43.785, 7.494]], // Monaco ↔ Menton (littoral)
  "24": [[43.763, 7.456, 43.795, 7.530]]  // Menton
};

const FREEFLOW_KMH = 40;             // vitesse libre urbaine (simple)
const MAX_DELAY_PER_LINE_MIN = 25;   // borne anti-valeurs folles
const FEED = process.env.WAZE_JAMS_URL; // URL JSON {jams:[...], alerts:[...]}

function pointInBbox(lat, lng, [minLat, minLng, maxLat, maxLng]) {
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}
function jamTouchesZones(jam, zones) {
  if (!jam?.line?.length) return false; // Waze: jam.line = [[lng,lat], ...]
  return jam.line.some(([lng, lat]) => zones.some(b => pointInBbox(lat, lng, b)));
}
function minutesLostOnJam(jam) {
  const lengthKm = (jam?.length || 0) / 1000;
  let speedKmh = 0;
  if (typeof jam.speedKMH === "number") speedKmh = jam.speedKMH;
  else if (typeof jam.speed === "number") speedKmh = jam.speed * 3.6;
  if (speedKmh <= 0) speedKmh = 5; // évite division par 0
  const tNow = (lengthKm / speedKmh) * 60;
  const tFree = (lengthKm / FREEFLOW_KMH) * 60;
  return Math.max(0, tNow - tFree);
}

export default async function handler(req, res) {
  try {
    if (!FEED) {
      // Démo si pas encore d'URL Waze
      return res.status(200).json({ "11": 0, "12": 2, "13": 0, "18": 15, "24": 7 });
    }

    const r = await fetch(FEED, { cache: "no-store" });
    if (!r.ok) throw new Error("Feed HTTP " + r.status);
    const data = await r.json();
    const jams = Array.isArray(data?.jams) ? data.jams : [];

    const delays = { "11": 0, "12": 0, "13": 0, "18": 0, "24": 0 };
    for (const jam of jams) {
      for (const line of Object.keys(LINE_ZONES)) {
        if (jamTouchesZones(jam, LINE_ZONES[line])) {
          delays[line] += minutesLostOnJam(jam);
        }
      }
    }
    for (const k of Object.keys(delays)) {
      delays[k] = Math.min(MAX_DELAY_PER_LINE_MIN, Math.round(delays[k]));
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(delays);
  } catch (e) {
    // En cas d’erreur, on reste safe
    return res.status(200).json({ "11": 0, "12": 0, "13": 0, "18": 0, "24": 0 });
  }
}
