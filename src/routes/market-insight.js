const express = require("express");

const router = express.Router();

const PIHPS_BASE =
  "https://www.bi.go.id/Hargapangan/WebSite/TabelHarga";

const ALLOWED_COMMODITIES = {
  rice_lower_1: { id: "com_1", name: "Beras Kualitas Bawah I", unit: "kg" },
  rice_lower_2: { id: "com_2", name: "Beras Kualitas Bawah II", unit: "kg" },
  rice_medium_1: { id: "com_3", name: "Beras Kualitas Medium I", unit: "kg" },
  rice_medium_2: { id: "com_4", name: "Beras Kualitas Medium II", unit: "kg" },
  rice_super_1: { id: "com_5", name: "Beras Kualitas Super I", unit: "kg" },
  rice_super_2: { id: "com_6", name: "Beras Kualitas Super II", unit: "kg" },
  chicken: { id: "com_7", name: "Daging Ayam Ras Segar", unit: "kg" },
  beef_quality_1: { id: "com_8", name: "Daging Sapi Kualitas 1", unit: "kg" },
  beef_quality_2: { id: "com_9", name: "Daging Sapi Kualitas 2", unit: "kg" },
  eggs: { id: "com_10", name: "Telur Ayam Ras Segar", unit: "kg" },
  shallots: { id: "com_11", name: "Bawang Merah Ukuran Sedang", unit: "kg" },
  garlic: { id: "com_12", name: "Bawang Putih Ukuran Sedang", unit: "kg" },
  red_chili_large: { id: "com_13", name: "Cabai Merah Besar", unit: "kg" },
  red_chili_curly: { id: "com_14", name: "Cabai Merah Keriting", unit: "kg" },
  green_cayenne: { id: "com_15", name: "Cabai Rawit Hijau", unit: "kg" },
  red_cayenne: { id: "com_16", name: "Cabai Rawit Merah", unit: "kg" },
  cooking_oil_bulk: { id: "com_17", name: "Minyak Goreng Curah", unit: "liter" },
  cooking_oil_branded_1: { id: "com_18", name: "Minyak Goreng Kemasan Bermerk 1", unit: "liter" },
  cooking_oil_branded_2: { id: "com_19", name: "Minyak Goreng Kemasan Bermerk 2", unit: "liter" },
  sugar_premium: { id: "com_20", name: "Gula Pasir Kualitas Premium", unit: "kg" },
  sugar_local: { id: "com_21", name: "Gula Pasir Lokal", unit: "kg" }
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIndonesianNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/[.,\s]/g, "");
  if (!normalized) return null;

  const result = Number(normalized);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function parseGridRows(payload, commodityName = "Daging Ayam Ras Segar") {
  if (!payload || !Array.isArray(payload.data)) return [];

  const row = payload.data.find(
    (item) =>
      item &&
      item.level === 2 &&
      item.name === commodityName
  );

  if (!row) return [];

  return Object.entries(row)
    .filter(([key, value]) =>
      /^\d{2}\/\d{2}\/\d{4}$/.test(key) &&
      typeof value === "string"
    )
    .map(([date, rawPrice]) => {
      const parts = date.split("/");
      const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

      return {
        date: isoDate,
        price: parseIndonesianNumber(rawPrice)
      };
    })
    .filter((item) => item.price !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}


router.get("/market-insight/commodities", (req, res) => {
  const commodities = Object.entries(ALLOWED_COMMODITIES).map(
    ([key, item]) => ({
      key,
      id: item.id,
      name: item.name,
      unit: item.unit
    })
  );

  res.json({
    source: "Bank Indonesia - PIHPS",
    count: commodities.length,
    commodities
  });
});
router.get("/market-insight/prices", async (req, res, next) => {
  try {
    const commodityKey = String(req.query.commodity || "chicken");
    const commodity = ALLOWED_COMMODITIES[commodityKey];

    if (!commodity) {
      return res.status(400).json({
        error: "Komoditas belum didukung oleh adapter PIHPS."
      });
    }

    const rawProvince = req.query.province_id;
    const provinceId =
      rawProvince === undefined || rawProvince === ""
        ? ""
        : String(rawProvince);

    if (provinceId && !/^\d+$/.test(provinceId)) {
      return res.status(400).json({
        error: "province_id harus berupa ID numerik PIHPS."
      });
    }

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const params = new URLSearchParams({
      price_type_id: "1",
      comcat_id: commodity.id,
      province_id: provinceId,
      regency_id: "",
      market_id: "",
      tipe_laporan: "1",
      start_date: formatDate(start),
      end_date: formatDate(end)
    });

    const url = `${PIHPS_BASE}/GetGridDataDaerah?${params.toString()}`;

    const upstream = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: "Sumber PIHPS tidak berhasil merespons.",
        source: "Bank Indonesia - PIHPS"
      });
    }

    const payload = await upstream.json();
    const prices = parseGridRows(payload, commodity.name);

    return res.json({
      source: {
        name: "Bank Indonesia - PIHPS",
        url: "https://www.bi.go.id/Hargapangan/TabelHarga/PasarTradisionalDaerah",
        price_type_id: 1,
        price_type: "Pasar Tradisional"
      },
      commodity: {
        key: commodityKey,
        id: commodity.id,
        name: commodity.name,
        unit: commodity.unit
      },
      region: provinceId
        ? { type: "province", id: provinceId }
        : { type: "unfiltered", label: "Tanpa filter wilayah PIHPS" },
      period: {
        start_date: formatDate(start),
        end_date: formatDate(end)
      },
      prices
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Sumber PIHPS melewati batas waktu respons."
      });
    }

    return next(error);
  }
});


// Regional price ranking from verified PIHPS province data.
// Fetches provinces individually because unfiltered requests may time out.
const regionalCache = new Map();
const REGIONAL_CACHE_MS = 10 * 60 * 1000;

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`PIHPS HTTP ${response.status}`);
  }

  return response.json();
}

function getProvinceRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.Data)) return payload.Data;
  return [];
}

function getProvinceId(item) {
  const value =
    item?.id ??
    item?.province_id ??
    item?.provinceId ??
    item?.id_provinsi;

  return value === undefined || value === null ? "" : String(value);
}

function getProvinceName(item) {
  return String(
    item?.name ??
    item?.nama ??
    item?.province_name ??
    item?.province ??
    ""
  ).trim();
}

router.get("/market-insight/regional-prices", async (req, res, next) => {
  try {
    const commodityKey = String(req.query.commodity || "chicken");
    const commodity = ALLOWED_COMMODITIES[commodityKey];

    if (!commodity) {
      return res.status(400).json({
        error: "Komoditas belum didukung oleh adapter PIHPS."
      });
    }

    const cached = regionalCache.get(commodityKey);
    if (cached && Date.now() - cached.savedAt < REGIONAL_CACHE_MS) {
      return res.json({ ...cached.payload, cache: "HIT" });
    }

    const provincesPayload = await getJson(
      `${PIHPS_BASE}/GetRefProvince`
    );

    const provinces = getProvinceRows(provincesPayload)
      .map((item) => ({
        id: getProvinceId(item),
        name: getProvinceName(item)
      }))
      .filter((item) => /^\d+$/.test(item.id) && item.name);

    if (!provinces.length) {
      return res.status(502).json({
        error: "Daftar provinsi PIHPS kosong atau formatnya berubah.",
        source: "Bank Indonesia - PIHPS"
      });
    }

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const startDate = formatDate(start);
    const endDate = formatDate(end);
    const results = [];
    const failures = [];
    let cursor = 0;

    async function worker() {
      while (cursor < provinces.length) {
        const index = cursor++;
        const province = provinces[index];

        try {
          const params = new URLSearchParams({
            price_type_id: "1",
            comcat_id: commodity.id,
            province_id: province.id,
            regency_id: "",
            market_id: "",
            tipe_laporan: "1",
            start_date: startDate,
            end_date: endDate
          });

          const payload = await getJson(
            `${PIHPS_BASE}/GetGridDataDaerah?${params.toString()}`
          );

          const prices = parseGridRows(payload, commodity.name);
          if (!prices.length) {
            failures.push({
              province: province.name,
              reason: "Tidak ada harga valid pada periode ini"
            });
            continue;
          }

          const latestDate = prices[prices.length - 1].date;
          const latestPrices = prices.filter(
            (item) => item.date === latestDate
          );
          const latest = latestPrices[latestPrices.length - 1];

          results.push({
            province_id: province.id,
            province: province.name,
            price: latest.price,
            date: latest.date,
            unit: commodity.unit
          });
        } catch (error) {
          failures.push({
            province: province.name,
            reason: String(error?.message || "Request gagal")
          });
        }
      }
    }

    // Limit concurrency to reduce pressure on the source service.
    await Promise.all(
      Array.from(
        { length: Math.min(4, provinces.length) },
        () => worker()
      )
    );

    if (!results.length) {
      return res.status(502).json({
        error: "Belum ada harga regional valid dari PIHPS.",
        source: "Bank Indonesia - PIHPS",
        failed_provinces: failures
      });
    }

    results.sort(
      (a, b) => a.price - b.price ||
        a.province.localeCompare(b.province, "id")
    );

    const lowestPrice = results[0].price;
    const highestPrice = results[results.length - 1].price;

    const payload = {
      source: {
        name: "Bank Indonesia - PIHPS",
        url: "https://www.bi.go.id/Hargapangan/TabelHarga/PasarTradisionalDaerah",
        price_type_id: 1,
        price_type: "Pasar Tradisional"
      },
      commodity: {
        key: commodityKey,
        id: commodity.id,
        name: commodity.name,
        unit: commodity.unit
      },
      period: {
        start_date: startDate,
        end_date: endDate
      },
      generated_at: new Date().toISOString(),
      total_provinces: provinces.length,
      successful_provinces: results.length,
      failed_provinces: failures,
      lowest: results.filter((item) => item.price === lowestPrice),
      highest: results.filter((item) => item.price === highestPrice),
      prices: results
    };

    regionalCache.set(commodityKey, {
      savedAt: Date.now(),
      payload
    });

    return res.json(payload);
  } catch (error) {
    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      return res.status(504).json({
        error: "Sumber PIHPS melewati batas waktu respons."
      });
    }

    return next(error);
  }
});
module.exports = router;




