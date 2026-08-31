export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://moonlat.top");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const apiKey = process.env.UNTERA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "UNTERA_API_KEY is not configured in Vercel." });
  }

  const incoming = new URL(req.url, `https://${req.headers.host}`);
  const params = new URLSearchParams();
  const allowed = ["country","location","minPrice","maxPrice","minBeds","minBaths","minSqm","maxSqm","type","transaction","sort","page","pageSize"];

  for (const key of allowed) {
    const value = incoming.searchParams.get(key);
    if (value) params.set(key, value);
  }

  if (!params.has("country")) params.set("country", "NG");
  if (!params.has("page")) params.set("page", "1");

  const size = Number(params.get("pageSize") || 24);
  params.set("pageSize", String(Math.min(Math.max(Number.isFinite(size) ? size : 24, 1), 50)));

  try {
    const response = await fetch(
      `https://api.untera.io/api/v1/listings/search?${params.toString()}`,
      {
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json"
        }
      }
    );

    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: payload?.error || payload?.message || `Untera returned HTTP ${response.status}.`
      });
    }

    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    return res.status(200).json({
      ok: true,
      source: "Untera",
      total: payload?.total ?? payload?.count ?? results.length,
      data: results.map(normalizeListing).filter(Boolean)
    });
  } catch (error) {
    console.error("MoonLat Live Market Untera error:", error);
    return res.status(502).json({
      ok: false,
      error: "The external property market feed is temporarily unavailable."
    });
  }
}

function normalizeListing(item) {
  if (!item || typeof item !== "object") return null;

  const location = item.location && typeof item.location === "object" ? item.location : {};
  const images = Array.isArray(item.images) ? item.images : [];

  return {
    id: String(item.id ?? item.listing_id ?? crypto.randomUUID()),
    title: item.title || item.name || "Property listing",
    price: item.price_original ?? item.price ?? null,
    original_currency: item.original_currency || item.currency || "NGN",
    price_usd: item.price_usd ?? null,
    type: item.type || item.property_type || "Property",
    transaction: item.transaction || item.listing_type || item.purpose || "",
    beds: item.beds ?? item.bedrooms ?? null,
    baths: item.baths ?? item.bathrooms ?? null,
    location: {
      name: location.name || item.location_name || "",
      area: location.area || location.district || item.area || "",
      city: location.city || item.city || "",
      state: location.state || item.state || "",
      country: location.country || item.country || "Nigeria"
    },
    image: item.image || item.image_url || item.thumbnail || images[0] || "",
    source_name: item.source_name || item.source || "Untera",
    original_url: item.original_url || item.listing_url || item.url || "",
    updated_at: item.updated_at || item.updatedAt || item.modified_at || item.created_at || null,
    created_at: item.created_at || item.createdAt || null
  };
}
