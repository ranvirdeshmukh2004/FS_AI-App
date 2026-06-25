import { logger } from "../../utils/logger.js";

export async function weather(city: string): Promise<string> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city.trim())}?format=j1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "curl/7.68.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return `Could not get weather for "${city}" (status ${resp.status})`;

    const data = await resp.json() as {
      current_condition?: {
        temp_C?: string; temp_F?: string; weatherDesc?: { value: string }[];
        humidity?: string; windspeedKmph?: string; FeelsLikeC?: string;
      }[];
      nearest_area?: { areaName?: { value: string }[]; country?: { value: string }[] }[];
    };

    const current = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!current) return `No weather data found for "${city}"`;

    const location = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(", ") || city;
    const desc = current.weatherDesc?.[0]?.value || "Unknown";
    return [
      `Weather for ${location}:`,
      `  Condition: ${desc}`,
      `  Temperature: ${current.temp_C}°C / ${current.temp_F}°F (feels like ${current.FeelsLikeC}°C)`,
      `  Humidity: ${current.humidity}%`,
      `  Wind: ${current.windspeedKmph} km/h`,
    ].join("\n");
  } catch (err) {
    logger.error({ err }, "Weather fetch failed");
    return `Weather lookup failed for "${city}": ${err instanceof Error ? err.message : "unknown"}`;
  }
}
