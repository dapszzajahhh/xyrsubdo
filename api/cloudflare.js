export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const TOKEN = process.env.CF_API_TOKEN;
  const ZONE_ID = process.env.CF_ZONE_ID;

  if (!TOKEN || !ZONE_ID) {
    return res.status(500).json({ success: false, errors: [{ message: "Server belum dikonfigurasi" }] });
  }

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  const base = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}`;

  try {
    if (req.method === "GET") {
      const action = req.query?.action;
      if (action === "zone") {
        const r = await fetch(base, { headers });
        return res.status(200).json(await r.json());
      }
      if (action === "list") {
        const r = await fetch(`${base}/dns_records?per_page=100`, { headers });
        return res.status(200).json(await r.json());
      }
      return res.status(400).json({ success: false, errors: [{ message: "Aksi tidak dikenal" }] });
    }

    if (req.method === "POST") {
      const { action, ...body } = req.body || {};

      if (action === "create") {
        const { name, content, type = "A", proxied = false, ttl = 1 } = body;
        if (!name || !content) {
          return res.status(400).json({ success: false, errors: [{ message: "Field tidak lengkap" }] });
        }
        const payload = { type, name, content, ttl };
        if (["A", "AAAA", "CNAME"].includes(type)) payload.proxied = !!proxied;

        const r = await fetch(`${base}/dns_records`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        return res.status(200).json(await r.json());
      }

      if (action === "delete") {
        const { id } = body;
        if (!id) return res.status(400).json({ success: false, errors: [{ message: "ID diperlukan" }] });
        const r = await fetch(`${base}/dns_records/${id}`, { method: "DELETE", headers });
        return res.status(200).json(await r.json());
      }

      return res.status(400).json({ success: false, errors: [{ message: "Aksi tidak dikenal" }] });
    }

    return res.status(405).json({ success: false, errors: [{ message: "Method tidak diizinkan" }] });
  } catch (err) {
    return res.status(500).json({ success: false, errors: [{ message: err.message }] });
  }
}
