"""Elexon BMRS client and strict ingest validators.

The BMRS "stream" endpoints are permissive: unknown query parameters are silently
ignored and the API returns the latest data with HTTP 200.  A wrong WINDFOR call
therefore cannot be detected by status code — only by asserting counts, date ranges,
73 points per issue and 24/24 gate coverage.  That is what the validators do.
"""

from __future__ import annotations

import math
import random
import time as time_module
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

import httpx

from . import config
from .metrics import Actual, Forecast, gate_cutoff

UTC = timezone.utc

#: The one documented departure from the canonical WINDFOR cadence.
ISSUE_TIME_EXCEPTIONS: dict[date, str] = {date(2026, 1, 15): "12:25"}

CANONICAL_ISSUE_TIMES = set(config.CANONICAL_ISSUE_TIMES)

_ACTUAL_PARAMS = {
    "settlementDateFrom": config.ACTUALS_START.isoformat(),
    "settlementDateTo": config.ACTUALS_END.isoformat(),
    "fuelType": "WIND",
}

_FORECAST_PARAMS = {
    "publishDateTimeFrom": f"{config.FORECAST_PUBLISH_START.isoformat()}T00:00:00Z",
    "publishDateTimeTo": f"{config.FORECAST_PUBLISH_END + timedelta(days=1)}T00:00:00Z",
}


class IngestValidationError(Exception):
    """Raised when a fetched payload does not match the frozen expectations."""


class BmrsTransportError(Exception):
    """Raised when BMRS cannot be reached after retries."""


@dataclass
class ValidationReport:
    actual_rows: int = 0
    forecast_rows: int = 0
    issues: int = 0
    points_per_issue: int = 0
    publish_days: int = 0
    decision_days: int = 0
    gate_hours_covered: int = 0
    gate_days_covered: int = 0
    warnings: list[str] = field(default_factory=list)

    def merge(self, other: ValidationReport) -> ValidationReport:
        return ValidationReport(
            actual_rows=self.actual_rows or other.actual_rows,
            forecast_rows=self.forecast_rows or other.forecast_rows,
            issues=self.issues or other.issues,
            points_per_issue=self.points_per_issue or other.points_per_issue,
            publish_days=self.publish_days or other.publish_days,
            decision_days=self.decision_days or other.decision_days,
            gate_hours_covered=self.gate_hours_covered or other.gate_hours_covered,
            gate_days_covered=self.gate_days_covered or other.gate_days_covered,
            warnings=[*self.warnings, *other.warnings],
        )


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def parse_utc(value: object) -> datetime:
    """Parse a BMRS ISO timestamp into an aware UTC datetime."""
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def parse_actuals(rows: list[dict]) -> list[Actual]:
    return [
        Actual(
            settlement_date=date.fromisoformat(str(row["settlementDate"])[:10]),
            settlement_period=int(row["settlementPeriod"]),
            start_time=parse_utc(row["startTime"]),
            generation_mw=float(row["generation"]),
        )
        for row in rows
    ]


def parse_forecasts(rows: list[dict]) -> list[Forecast]:
    return [
        Forecast(
            publish_time=parse_utc(row["publishTime"]),
            start_time=parse_utc(row["startTime"]),
            generation_mw=float(row["generation"]),
        )
        for row in rows
    ]


def _expected_dates(start: date, end: date) -> set[date]:
    return {start + timedelta(days=offset) for offset in range((end - start).days + 1)}


def _format_problems(header: str, problems: list[str]) -> str:
    shown = problems[:20]
    extra = len(problems) - len(shown)
    body = "\n".join(f"  - {problem}" for problem in shown)
    if extra > 0:
        body += f"\n  - ... and {extra} more"
    return f"{header}\n{body}"


# ---------------------------------------------------------------------------
# Actuals validation
# ---------------------------------------------------------------------------


def validate_actuals(rows: list[dict]) -> ValidationReport:
    """Assert the FUELHH payload is exactly 31 days x 48 WIND settlement periods."""
    problems: list[str] = []
    warnings: list[str] = []

    if len(rows) != config.EXPECTED_ACTUAL_ROWS:
        problems.append(
            f"row count {len(rows)} != expected {config.EXPECTED_ACTUAL_ROWS}"
        )

    parsed: list[Actual] = []
    for index, row in enumerate(rows):
        try:
            parsed.append(
                Actual(
                    settlement_date=date.fromisoformat(str(row["settlementDate"])[:10]),
                    settlement_period=int(row["settlementPeriod"]),
                    start_time=parse_utc(row["startTime"]),
                    generation_mw=float(row["generation"]),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            problems.append(f"row {index} is unparseable: {exc}")

        fuel = row.get("fuelType")
        if fuel != "WIND":
            problems.append(f"row {index} fuelType={fuel!r}, expected 'WIND'")

    expected_days = _expected_dates(config.ACTUALS_START, config.ACTUALS_END)
    days = {row.settlement_date for row in parsed}
    missing_days = sorted(expected_days - days)
    extra_days = sorted(days - expected_days)
    if missing_days:
        problems.append(f"missing settlement dates: {[d.isoformat() for d in missing_days]}")
    if extra_days:
        problems.append(f"unexpected settlement dates: {[d.isoformat() for d in extra_days]}")
    if len(days) != 31:
        problems.append(f"distinct settlement dates {len(days)} != 31")

    per_day: dict[date, list[Actual]] = defaultdict(list)
    for row in parsed:
        per_day[row.settlement_date].append(row)

    for day in sorted(expected_days & days):
        day_rows = per_day[day]
        if len(day_rows) != 48:
            problems.append(f"{day.isoformat()} has {len(day_rows)} rows, expected 48")
        periods = [row.settlement_period for row in day_rows]
        counts = Counter(periods)
        duplicates = sorted(period for period, count in counts.items() if count > 1)
        if duplicates:
            problems.append(
                f"{day.isoformat()} duplicate settlement periods: {duplicates[:10]}"
            )
        missing_periods = sorted(set(range(1, 49)) - set(periods))
        if missing_periods:
            problems.append(
                f"{day.isoformat()} missing settlement periods: {missing_periods[:10]}"
            )
        extra_periods = sorted(set(periods) - set(range(1, 49)))
        if extra_periods:
            problems.append(
                f"{day.isoformat()} settlement periods out of range: {extra_periods[:10]}"
            )

    start_counts = Counter(row.start_time for row in parsed)
    duplicates_start = [stamp for stamp, count in start_counts.items() if count > 1]
    if duplicates_start:
        problems.append(
            "duplicate startTime values: "
            f"{[stamp.isoformat() for stamp in sorted(duplicates_start)[:10]]}"
        )
    for row in parsed:
        if row.start_time.minute not in (0, 30) or row.start_time.second != 0:
            problems.append(
                f"startTime {row.start_time.isoformat()} is not aligned to :00/:30"
            )
            break

    for row in parsed:
        if not math.isfinite(row.generation_mw) or row.generation_mw < 0:
            problems.append(
                f"invalid generation {row.generation_mw!r} at "
                f"{row.settlement_date.isoformat()} SP{row.settlement_period}"
            )
            break

    if problems:
        raise IngestValidationError(_format_problems("FUELHH actuals validation failed:", problems))

    return ValidationReport(
        actual_rows=len(parsed),
        decision_days=0,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Forecasts validation
# ---------------------------------------------------------------------------


def _gate_coverage(parsed: list[Forecast]) -> tuple[int, int, list[str]]:
    """Hours and days of the delivery window covered by each day's gate issue."""
    by_publish: dict[datetime, list[Forecast]] = defaultdict(list)
    for row in parsed:
        by_publish[row.publish_time].append(row)

    covered_days = 0
    covered_hours = 0
    problems: list[str] = []
    for decision in _expected_dates(config.DECISION_START, config.DECISION_END):
        cutoff = gate_cutoff(decision)
        candidates = [stamp for stamp in by_publish if stamp <= cutoff]
        if not candidates:
            problems.append(f"{decision.isoformat()}: no issue at or before {cutoff.isoformat()}")
            continue
        chosen = max(candidates)
        delivery = decision + timedelta(days=1)
        targets = {
            row.start_time.hour
            for row in by_publish[chosen]
            if row.start_time.date() == delivery and row.start_time.minute == 0
        }
        missing = [hour for hour in range(24) if hour not in targets]
        if missing:
            problems.append(
                f"{decision.isoformat()}: gate issue {chosen.isoformat()} missing delivery "
                f"hours {[f'{hour:02d}:00' for hour in missing]}"
            )
            covered_hours += 24 - len(missing)
        else:
            covered_days += 1
            covered_hours += 24
    return covered_days, covered_hours, problems


def validate_forecasts(rows: list[dict]) -> ValidationReport:
    """Assert 256 issues x 73 points, canonical cadence, and full gate coverage."""
    problems: list[str] = []
    warnings: list[str] = []

    if len(rows) != config.EXPECTED_FORECAST_ROWS:
        problems.append(
            f"row count {len(rows)} != expected {config.EXPECTED_FORECAST_ROWS}"
        )

    parsed: list[Forecast] = []
    for index, row in enumerate(rows):
        try:
            parsed.append(
                Forecast(
                    publish_time=parse_utc(row["publishTime"]),
                    start_time=parse_utc(row["startTime"]),
                    generation_mw=float(row["generation"]),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            problems.append(f"row {index} is unparseable: {exc}")
            continue
        if not math.isfinite(parsed[-1].generation_mw) or parsed[-1].generation_mw < 0:
            problems.append(f"row {index} has invalid generation {row.get('generation')!r}")

    by_publish: dict[datetime, list[Forecast]] = defaultdict(list)
    for row in parsed:
        by_publish[row.publish_time].append(row)

    if len(by_publish) != config.EXPECTED_FORECAST_ISSUES:
        problems.append(
            f"distinct publishTime values {len(by_publish)} != "
            f"{config.EXPECTED_FORECAST_ISSUES}"
        )

    publish_days: dict[date, set[datetime]] = defaultdict(set)
    for stamp in by_publish:
        publish_days[stamp.date()].add(stamp)

    expected_publish_days = _expected_dates(
        config.FORECAST_PUBLISH_START, config.FORECAST_PUBLISH_END
    )
    missing_publish_days = sorted(expected_publish_days - set(publish_days))
    extra_publish_days = sorted(set(publish_days) - expected_publish_days)
    if missing_publish_days:
        problems.append(
            "missing publication dates: "
            f"{[d.isoformat() for d in missing_publish_days]}"
        )
    if extra_publish_days:
        problems.append(
            "unexpected publication dates: "
            f"{[d.isoformat() for d in extra_publish_days]}"
        )
    if len(publish_days) != 32:
        problems.append(f"publication dates {len(publish_days)} != 32")
    for day in sorted(expected_publish_days & set(publish_days)):
        count = len(publish_days[day])
        if count != config.EXPECTED_ISSUES_PER_DAY:
            problems.append(f"{day.isoformat()} has {count} issues, expected 8")

    # Cadence: canonical set, with the single documented 2026-01-15 exception.
    for stamp in sorted(by_publish):
        day = stamp.date()
        label = stamp.strftime("%H:%M")
        exception = ISSUE_TIME_EXCEPTIONS.get(day)
        if exception and label == exception:
            continue
        if label not in CANONICAL_ISSUE_TIMES:
            problems.append(
                f"issue {stamp.isoformat()} uses non-canonical time {label}"
            )
    for day, exception in ISSUE_TIME_EXCEPTIONS.items():
        if day in publish_days:
            matching = [
                stamp for stamp in publish_days[day] if stamp.strftime("%H:%M") == exception
            ]
            if matching:
                warnings.append(
                    f"{day.isoformat()} published a {exception} issue instead of 11:30 "
                    "(documented data quirk; treated as a normal vintage)"
                )

    # Per-issue point structure.
    point_counts: Counter[int] = Counter()
    for stamp, points in by_publish.items():
        point_counts[len(points)] += 1
        if len(points) != config.EXPECTED_POINTS_PER_ISSUE:
            problems.append(
                f"issue {stamp.isoformat()} has {len(points)} points, expected 73"
            )
            continue
        targets = [point.start_time for point in points]
        if len(set(targets)) != len(targets):
            problems.append(f"issue {stamp.isoformat()} has duplicate target times")
        ordered = sorted(set(targets))
        gaps = {(b - a) for a, b in zip(ordered, ordered[1:], strict=False)}
        if gaps != {timedelta(hours=1)}:
            problems.append(
                f"issue {stamp.isoformat()} targets are not consecutive hourly points"
            )
        if any(target.minute or target.second for target in targets):
            problems.append(f"issue {stamp.isoformat()} has a target off the hour")

    duplicate_keys = len(parsed) - len({(row.publish_time, row.start_time) for row in parsed})
    if duplicate_keys:
        problems.append(f"{duplicate_keys} duplicate (publishTime, startTime) rows")

    covered_days, covered_hours, coverage_problems = _gate_coverage(parsed)
    problems.extend(coverage_problems)

    # 02:30 exists on every decision date (needed for by_issue_time).
    for decision in _expected_dates(config.DECISION_START, config.DECISION_END):
        early = datetime.combine(decision, time(2, 30), tzinfo=UTC)
        if early not in by_publish:
            problems.append(f"{decision.isoformat()} is missing the 02:30 issue")

    if problems:
        raise IngestValidationError(
            _format_problems("WINDFOR forecasts validation failed:", problems)
        )

    points_per_issue = (
        point_counts.most_common(1)[0][0] if len(point_counts) == 1 else 0
    )
    return ValidationReport(
        forecast_rows=len(parsed),
        issues=len(by_publish),
        points_per_issue=points_per_issue,
        publish_days=len(publish_days),
        decision_days=config.EXPECTED_DECISION_DAYS,
        gate_hours_covered=covered_hours,
        gate_days_covered=covered_days,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


def _request(dataset: str, params: dict[str, str]) -> list[dict]:
    url = f"{config.BMRS_BASE_URL}/{dataset}/stream"
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                response = client.get(url, params=params)
            if response.status_code == 429 or 500 <= response.status_code < 600:
                last_error = BmrsTransportError(
                    f"{dataset} returned HTTP {response.status_code}"
                )
                raise last_error
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list):
                raise BmrsTransportError(f"{dataset} returned a non-list payload")
            return payload
        except (httpx.TransportError, BmrsTransportError) as exc:
            last_error = exc
            if attempt == 2:
                break
            delay = 0.5 * (2**attempt) + random.uniform(0, 0.25)
            time_module.sleep(delay)
        except httpx.HTTPStatusError as exc:
            raise BmrsTransportError(f"{dataset} returned HTTP {exc.response.status_code}") from exc
    raise BmrsTransportError(f"{dataset} fetch failed after 3 attempts: {last_error}")


def fetch_fuelhh() -> list[dict]:
    """FUELHH WIND actuals for the 31 delivery days (48 SPs each)."""
    return _request("FUELHH", dict(_ACTUAL_PARAMS))


def fetch_windfor() -> list[dict]:
    """WINDFOR issues by publication time only.

    Never add ``startTime``/``settlementDate`` filters: the endpoint ignores unknown
    parameters and silently returns the latest data with HTTP 200.
    """
    return _request("WINDFOR", dict(_FORECAST_PARAMS))
