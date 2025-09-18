let bannerData = {
  status: "YES", // YES / NO
  color: "blue", // green/red/blue
  message: "8:14 : pour le moment, le trafic ferroviaire est stable, aucun retard prévu sur le réseau.",
  subMessage: "grève du 18 septembre, lignes 18 et 24 perturbées"
};

export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json(bannerData);
  }

  if (req.method === "POST") {
    const { password, status, color, message, subMessage } = req.body;
    if (password !== process.env.ADMIN_PASS) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (status) bannerData.status = status;
    if (color) bannerData.color = color;
    if (message) bannerData.message = message;
    if (subMessage) bannerData.subMessage = subMessage;

    return res.status(200).json({ ok: true, data: bannerData });
  }

  res.status(405).end();
}
