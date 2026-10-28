"""Strict ingest validation: wrong shapes must fail loudly with a diff."""

from __future__ import annotations

import copy

import pytest

from app import bmrs


def test_valid_payloads_match_expected_counts(raw_payloads):
    actuals, forecasts = raw_payloads
    actual_report = bmrs.validate_actuals(actuals)
    forecast_report = bmrs.validate_forecasts(forecasts)

    assert actual_report.actual_rows == 1488
    assert forecast_report.forecast_rows == 18688
    assert forecast_report.issues == 256
    assert forecast_report.points_per_issue == 73
    assert forecast_report.publish_days == 32
    assert forecast_report.decision_days == 31
    assert forecast_report.gate_days_covered == 31
    assert forecast_report.gate_hours_covered == 744
    assert any("12:25" in warning for warning in forecast_report.warnings)


def test_actuals_wrong_row_count_rejected(raw_payloads):
    actuals, _ = raw_payloads
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_actuals(actuals[:-1])
    assert "row count 1487" in str(excinfo.value)


def test_actuals_missing_settlement_period_rejected(raw_payloads):
    actuals, _ = raw_payloads
    mutated = [row for row in copy.deepcopy(actuals) if not (
        row["settlementDate"] == "2026-01-02" and row["settlementPeriod"] == 24
    )]
    # Remove one point from another day so the total row count stays plausible but SPs break.
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_actuals(mutated)
    assert "missing settlement periods" in str(excinfo.value)
    assert "2026-01-02" in str(excinfo.value)


def test_actuals_duplicate_key_rejected(raw_payloads):
    actuals, _ = raw_payloads
    mutated = copy.deepcopy(actuals)
    mutated.append(copy.deepcopy(mutated[0]))
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_actuals(mutated)
    message = str(excinfo.value)
    assert "duplicate settlement periods" in message or "duplicate startTime" in message


def test_actuals_non_wind_rejected(raw_payloads):
    actuals, _ = raw_payloads
    mutated = copy.deepcopy(actuals)
    mutated[0]["fuelType"] = "CCGT"
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_actuals(mutated)
    assert "fuelType" in str(excinfo.value)


def test_actuals_negative_generation_rejected(raw_payloads):
    actuals, _ = raw_payloads
    mutated = copy.deepcopy(actuals)
    mutated[0]["generation"] = -1.0
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_actuals(mutated)
    assert "invalid generation" in str(excinfo.value)


def test_forecasts_wrong_row_count_rejected(raw_payloads):
    _, forecasts = raw_payloads
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(forecasts[:-1])
    assert "row count 18687" in str(excinfo.value)


def test_forecast_wrong_issue_count_rejected(raw_payloads):
    _, forecasts = raw_payloads
    mutated = [
        row for row in copy.deepcopy(forecasts) if row["publishTime"] != "2026-01-20T11:30:00Z"
    ]
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(mutated)
    message = str(excinfo.value)
    assert "distinct publishTime values 255" in message
    assert "2026-01-20 has 7 issues" in message


def test_forecast_issue_with_72_points_rejected(raw_payloads):
    _, forecasts = raw_payloads
    mutated = copy.deepcopy(forecasts)
    removed = False
    for index, row in enumerate(mutated):
        if row["publishTime"] == "2026-01-20T11:30:00Z" and not removed:
            del mutated[index]
            removed = True
            break
    assert removed
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(mutated)
    assert "has 72 points" in str(excinfo.value)


def test_documented_1225_issue_is_accepted(raw_payloads):
    _, forecasts = raw_payloads
    report = bmrs.validate_forecasts(forecasts)
    labels = {row["publishTime"] for row in forecasts if row["publishTime"].startswith("2026-01-15")}
    assert "2026-01-15T12:25:00Z" in labels
    assert "2026-01-15T11:30:00Z" not in labels
    assert any("12:25" in warning for warning in report.warnings)


def test_non_canonical_issue_time_rejected(raw_payloads):
    _, forecasts = raw_payloads
    mutated = copy.deepcopy(forecasts)
    for row in mutated:
        if row["publishTime"] == "2026-01-10T18:30:00Z":
            row["publishTime"] = "2026-01-10T18:29:00Z"
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(mutated)
    assert "non-canonical time 18:29" in str(excinfo.value)


def test_missing_0930_issue_rejected(raw_payloads):
    _, forecasts = raw_payloads
    mutated = [
        row for row in copy.deepcopy(forecasts) if row["publishTime"] != "2026-01-05T09:30:00Z"
    ]
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(mutated)
    message = str(excinfo.value)
    assert "255" in message and "2026-01-05 has 7 issues" in message


def test_gate_coverage_failure_rejected(raw_payloads):
    _, forecasts = raw_payloads
    mutated = copy.deepcopy(forecasts)
    moved = False
    for row in mutated:
        if (
            row["publishTime"] == "2026-01-05T09:30:00Z"
            and row["startTime"] == "2026-01-06T05:00:00Z"
        ):
            row["startTime"] = "2026-01-06T04:00:00Z"  # duplicate 04:00, lose 05:00
            moved = True
            break
    assert moved
    with pytest.raises(bmrs.IngestValidationError) as excinfo:
        bmrs.validate_forecasts(mutated)
    message = str(excinfo.value)
    assert "duplicate target times" in message
    assert "missing delivery hours" in message
    assert "05:00" in message
