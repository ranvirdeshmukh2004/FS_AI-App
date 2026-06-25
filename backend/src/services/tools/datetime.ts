export async function datetime(query: string): Promise<string> {
  const q = query.toLowerCase();
  const now = new Date();

  // Timezone conversion
  const tzMatch = q.match(/convert\s+(.+?)\s+to\s+(.+)/i) || q.match(/(.+?)\s+(?:in|to)\s+(.+)/i);
  if (tzMatch && (q.includes("to") || q.includes("in"))) {
    try {
      const fromTz = mapTimezone(tzMatch[1].trim());
      const toTz = mapTimezone(tzMatch[2].trim());
      const fromStr = now.toLocaleString("en-US", { timeZone: fromTz, hour12: false, hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      const toStr = now.toLocaleString("en-US", { timeZone: toTz, hour12: false, hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      return `Current time — ${fromTz}: ${fromStr} | ${toTz}: ${toStr}`;
    } catch { /* fall through */ }
  }

  // Days until / since a date
  const daysMatch = q.match(/days?\s+(?:until|till|to|since|from)\s+(.+)/i);
  if (daysMatch) {
    try {
      const target = new Date(daysMatch[1].trim());
      if (!isNaN(target.getTime())) {
        const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
        return diff >= 0
          ? `${diff} day${diff === 1 ? "" : "s"} until ${target.toDateString()}`
          : `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} since ${target.toDateString()}`;
      }
    } catch { /* fall through */ }
  }

  // Default: current date/time in multiple zones
  const zones = [
    { name: "UTC", tz: "UTC" },
    { name: "US/Eastern", tz: "America/New_York" },
    { name: "US/Pacific", tz: "America/Los_Angeles" },
    { name: "India (IST)", tz: "Asia/Kolkata" },
    { name: "London", tz: "Europe/London" },
  ];

  if (q.includes("ist") || q.includes("india")) {
    const ist = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" });
    return `Current date/time in India (IST): ${ist}`;
  }

  const utc = now.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "long" });
  const local = zones.map((z) => {
    try {
      return `  ${z.name}: ${now.toLocaleString("en-US", { timeZone: z.tz, hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" })}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n");

  return `Current date/time (UTC): ${utc}\n\nOther zones:\n${local}`;
}

function mapTimezone(name: string): string {
  const map: Record<string, string> = {
    "est": "America/New_York", "eastern": "America/New_York", "et": "America/New_York",
    "cst": "America/Chicago", "central": "America/Chicago",
    "mst": "America/Denver", "mountain": "America/Denver",
    "pst": "America/Los_Angeles", "pacific": "America/Los_Angeles", "pt": "America/Los_Angeles",
    "ist": "Asia/Kolkata", "india": "Asia/Kolkata",
    "gmt": "GMT", "utc": "UTC",
    "cet": "Europe/Paris", "london": "Europe/London", "uk": "Europe/London",
    "jst": "Asia/Tokyo", "japan": "Asia/Tokyo",
    "cst china": "Asia/Shanghai", "china": "Asia/Shanghai",
    "aest": "Australia/Sydney", "australia": "Australia/Sydney",
  };
  return map[name.toLowerCase()] || name;
}
