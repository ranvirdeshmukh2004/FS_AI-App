"""Date, time, and timezone utilities."""

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

TIMEZONE_OFFSETS = {
    "UTC": 0, "GMT": 0,
    "EST": -5, "EDT": -4, "CST": -6, "CDT": -5,
    "MST": -7, "MDT": -6, "PST": -8, "PDT": -7,
    "IST": 5.5, "JST": 9, "KST": 9, "CST_CHINA": 8,
    "AEST": 10, "AEDT": 11, "NZST": 12, "NZDT": 13,
    "CET": 1, "CEST": 2, "EET": 2, "EEST": 3,
    "BST": 1, "SGT": 8, "HKT": 8, "PKT": 5,
    "BRT": -3, "ART": -3, "CLT": -4, "COT": -5,
}


async def datetime_tool(query: str) -> str:
    """Handle date/time queries: current time, timezone conversions, date math."""
    try:
        query_lower = query.strip().lower()
        now = datetime.now(timezone.utc)

        if any(k in query_lower for k in ["current", "now", "today", "what time", "what date", "what day"]):
            lines = [
                f"Current UTC: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}",
                f"Day: {now.strftime('%A')}",
                f"ISO 8601: {now.isoformat()}",
                f"Unix timestamp: {int(now.timestamp())}",
            ]
            for tz_name in ["EST", "PST", "IST", "CET", "JST"]:
                offset = TIMEZONE_OFFSETS[tz_name]
                h, m = int(offset), int((offset % 1) * 60)
                local = now + timedelta(hours=h, minutes=m)
                lines.append(f"{tz_name}: {local.strftime('%Y-%m-%d %H:%M:%S')}")
            return "\n".join(lines)

        if "convert" in query_lower or "to" in query_lower:
            for tz_from, off_from in TIMEZONE_OFFSETS.items():
                for tz_to, off_to in TIMEZONE_OFFSETS.items():
                    if tz_from.lower() in query_lower and tz_to.lower() in query_lower and tz_from != tz_to:
                        diff = off_to - off_from
                        sign = "+" if diff >= 0 else ""
                        h_from, m_from = int(off_from), int((off_from % 1) * 60)
                        local_from = now + timedelta(hours=h_from, minutes=m_from)
                        h_to, m_to = int(off_to), int((off_to % 1) * 60)
                        local_to = now + timedelta(hours=h_to, minutes=m_to)
                        return (
                            f"Timezone conversion:\n"
                            f"{tz_from} ({local_from.strftime('%H:%M')}) -> "
                            f"{tz_to} ({local_to.strftime('%H:%M')})\n"
                            f"Difference: {sign}{diff} hours\n"
                            f"Current {tz_from}: {local_from.strftime('%Y-%m-%d %H:%M:%S')}\n"
                            f"Current {tz_to}: {local_to.strftime('%Y-%m-%d %H:%M:%S')}"
                        )

        if any(k in query_lower for k in ["days until", "days to", "days from", "days between", "how many days"]):
            import re
            date_pattern = re.compile(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})")
            dates = date_pattern.findall(query)
            if dates:
                target = datetime.strptime(dates[0].replace("/", "-"), "%Y-%m-%d").replace(tzinfo=timezone.utc)
                diff = (target - now).days
                if diff >= 0:
                    return f"Days until {dates[0]}: {diff} days ({diff // 7} weeks and {diff % 7} days)"
                else:
                    return f"Days since {dates[0]}: {abs(diff)} days ({abs(diff) // 7} weeks and {abs(diff) % 7} days)"

        if any(k in query_lower for k in ["add", "subtract", "ago", "from now", "later"]):
            import re
            num_match = re.search(r"(\d+)\s*(day|week|month|hour|minute|year)", query_lower)
            if num_match:
                amount = int(num_match.group(1))
                unit = num_match.group(2)
                if "ago" in query_lower or "subtract" in query_lower:
                    amount = -amount
                if unit == "day":
                    result = now + timedelta(days=amount)
                elif unit == "week":
                    result = now + timedelta(weeks=amount)
                elif unit == "hour":
                    result = now + timedelta(hours=amount)
                elif unit == "minute":
                    result = now + timedelta(minutes=amount)
                elif unit == "month":
                    new_month = now.month + amount
                    new_year = now.year + (new_month - 1) // 12
                    new_month = (new_month - 1) % 12 + 1
                    result = now.replace(year=new_year, month=new_month)
                elif unit == "year":
                    result = now.replace(year=now.year + amount)
                else:
                    result = now
                return f"Result: {result.strftime('%Y-%m-%d %H:%M:%S %Z')} ({result.strftime('%A')})"

        # Default: return current time info
        return (
            f"Current UTC: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}\n"
            f"Day: {now.strftime('%A')}\n"
            f"Unix timestamp: {int(now.timestamp())}\n"
            f"Tip: Ask for timezone conversion (e.g., 'convert EST to IST'), "
            f"date math (e.g., '30 days from now'), or days between dates."
        )

    except Exception as e:
        logger.error("Datetime tool error: %s", e)
        return f"Datetime error: {str(e)}"
