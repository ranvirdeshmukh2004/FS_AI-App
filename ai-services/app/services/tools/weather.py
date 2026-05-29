"""Weather tool using wttr.in (free, no API key required)."""

import logging
import httpx

logger = logging.getLogger(__name__)


async def weather(query: str) -> str:
    """Get current weather for a city using wttr.in (free API)."""
    try:
        city = query.strip()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://wttr.in/{city}",
                params={"format": "j1"},
                headers={"User-Agent": "curl/7.68.0"},
            )
            if resp.status_code != 200:
                return f"Could not get weather for '{city}'. Status: {resp.status_code}"

            data = resp.json()
            current = data.get("current_condition", [{}])[0]
            area = data.get("nearest_area", [{}])[0]

            area_name = area.get("areaName", [{}])[0].get("value", city)
            country = area.get("country", [{}])[0].get("value", "")
            region = area.get("region", [{}])[0].get("value", "")

            temp_c = current.get("temp_C", "?")
            temp_f = current.get("temp_F", "?")
            feels_c = current.get("FeelsLikeC", "?")
            feels_f = current.get("FeelsLikeF", "?")
            desc = current.get("weatherDesc", [{}])[0].get("value", "?")
            humidity = current.get("humidity", "?")
            wind_kmph = current.get("windspeedKmph", "?")
            wind_mph = current.get("windspeedMiles", "?")
            wind_dir = current.get("winddir16Point", "?")
            pressure = current.get("pressure", "?")
            visibility = current.get("visibility", "?")
            uv = current.get("uvIndex", "?")
            precip = current.get("precipMM", "?")

            location = f"{area_name}, {region}, {country}" if region else f"{area_name}, {country}"

            return (
                f"Weather for {location}:\n"
                f"Condition: {desc}\n"
                f"Temperature: {temp_c}°C / {temp_f}°F\n"
                f"Feels like: {feels_c}°C / {feels_f}°F\n"
                f"Humidity: {humidity}%\n"
                f"Wind: {wind_kmph} km/h ({wind_mph} mph) {wind_dir}\n"
                f"Pressure: {pressure} hPa\n"
                f"Visibility: {visibility} km\n"
                f"UV Index: {uv}\n"
                f"Precipitation: {precip} mm"
            )

    except Exception as e:
        logger.error("Weather tool error: %s", e)
        return f"Weather lookup failed for '{query}': {str(e)}"
