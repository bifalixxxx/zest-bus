function setCors(req, res) {
  // Autorise uniquement ton domaine principal
  res.setHeader("Access-Control-Allow-Origin", "https://theeye.top");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);

  // Préflight (OPTIONS) → obligatoire pour que le navigateur accepte
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Ici tu définis les retards des lignes
  const delays = {
    11: 0,
    12: 5,
    13: 0,
    18: 0,
    24: 5,
  };

  res.status(200).json(delays);
}
