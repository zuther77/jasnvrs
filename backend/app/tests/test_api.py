"""API contract tests against the seeded database (TestClient, no network)."""

from __future__ import annotations

import copy
from datetime import date

import pytest

from app import bmrs


def test_meta_matches_contract(seeded_db, client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["cache-control"] == "no-store"

    body = response.json()
    assert body["contract_version"] == "1.0"
    assert body["product"] == "Wind Forecast Insights Portal"
    assert body["window"] == {
        "decision_date_from": "2026-01-01",
        "decision_date_to": "2026-01-31",
        "delivery_date_from": "2026-01-02",
        "delivery_date_to": "2026-02-01",
        "decision_days": 31,
        "delivery_hours": 744,
        "timezone": "UTC",
    }
    assert body["gate_closure"]["cutoff_time_utc"] == "09:50"
    assert body["gate_closure"]["expected_issue_time_utc"] == "09:30"
    assert body["gate_closure"]["lead_minutes"] == 20
    assert body["gate_closure"]["timezone"] == "Europe/London"
    assert body["counts"] == {
        "actual_rows": 1488,
        "forecast_rows": 18688,
        "forecast_issues": 256,
        "points_per_issue": 73,
        "issues_per_day": 8,
        "decision_days": 31,
        "delivery_hours": 744,
        "hours_evaluated": 744,
    }
    assert body["data_vintage"]["last_sync_status"] == "ok"
    assert len(body["sources"]) == 2
    assert len(body["definitions"]) == 11
    assert len(body["assumptions"]) == 7
    assert body["generated_at"].endswith("Z")


def test_days_matches_contract(seeded_db, client):
    body = client.get("/api/days").json()
    assert body["count"] == 31 == len(body["days"])
    assert body["decision_date_from"] == "2026-01-01"
    assert body["decision_date_to"] == "2026-01-31"
    dates = [row["decision_date"] for row in body["days"]]
    assert dates == sorted(dates)
    assert dates[0] == "2026-01-01" and dates[-1] == "2026-01-31"
    assert all(row["hours_evaluated"] == 24 for row in body["days"])
    assert all(row["is_complete"] is True for row in body["days"])
    assert all(
        row["gate_closure_publish_time"].endswith("T09:30:00Z") for row in body["days"]
    )
    jan5 = next(row for row in body["days"] if row["decision_date"] == "2026-01-05")
    assert jan5["delivery_date"] == "2026-01-06"
    assert jan5["mae_mw"] == 2127.3
    assert jan5["bias_mw"] == 2016.0
    assert jan5["max_shortfall_mw"] == 4080.0
    assert jan5["max_shortfall_hour_utc"] == "2026-01-06T05:00:00Z"


def test_day_detail_matches_contract(seeded_db, client):
    body = client.get("/api/days/2026-01-05").json()
    assert body["decision_date"] == "2026-01-05"
    assert body["delivery_date"] == "2026-01-06"
    assert body["gate_closure_cutoff_utc"] == "2026-01-05T09:50:00Z"
    assert body["gate_closure_publish_time"] == "2026-01-05T09:30:00Z"
    assert body["gate_closure_lead_minutes"] == 20
    assert body["hours_evaluated"] == 24
    assert body["is_complete"] is True
    assert len(body["series"]) == 24
    assert [row["hour_of_day"] for row in body["series"]] == list(range(24))
    assert body["series"][0]["hour_utc"] == "2026-01-06T00:00:00Z"
    assert body["series"][5] == {
        "hour_utc": "2026-01-06T05:00:00Z",
        "hour_of_day": 5,
        "forecast_mw": 8662.0,
        "actual_mw": 4582.0,
        "error_mw": 4080.0,
    }
    assert body["series"][21]["error_mw"] == -714.0
    for row in body["series"]:
        assert abs(row["error_mw"] - (row["forecast_mw"] - row["actual_mw"])) <= 0.11

    metrics = body["metrics"]
    assert metrics["count"] == 24
    assert metrics["mae_mw"] == 2127.3
    assert metrics["rmse_mw"] == 2504.4
    assert metrics["bias_mw"] == 2016.0
    assert metrics["mape_pct"] == 35.49
    assert metrics["mape_hours"] == 24

    summary = body["summary"]
    assert summary["forecast_total_mwh"] == 275_148.0
    assert summary["actual_total_mwh"] == 226_764.5
    assert summary["forecast_peak_mw"] == 16_898.0
    assert summary["forecast_min_mw"] == 6_449.0
    assert summary["forecast_peak_hour_utc"] == "2026-01-06T23:00:00Z"
    assert summary["forecast_min_hour_utc"] == "2026-01-06T00:00:00Z"
    assert summary["actual_peak_mw"] == 16_638.0
    assert summary["actual_min_mw"] == 3_608.5
    assert summary["actual_peak_hour_utc"] == "2026-01-06T21:00:00Z"
    assert summary["actual_min_hour_utc"] == "2026-01-06T03:00:00Z"

    percentiles = body["percentiles"]
    assert percentiles["p05_mw"] < percentiles["p50_mw"] < percentiles["p95_mw"]
    assert body["extremes"]["max_shortfall_mw"] == 4080.0
    assert body["extremes"]["max_shortfall_hour_utc"] == "2026-01-06T05:00:00Z"
    assert body["extremes"]["max_overdelivery_mw"] == -714.0
    assert body["extremes"]["max_overdelivery_hour_utc"] == "2026-01-06T21:00:00Z"
    assert body["window_context"] == {
        "window_mae_mw": 2013.0,
        "window_bias_mw": 1729.9,
        "day_mae_percentile": 77.4,
        "day_bias_percentile": 74.2,
    }


def test_day_outside_window_is_404_with_detail(seeded_db, client):
    response = client.get("/api/days/2026-02-05")
    assert response.status_code == 404
    assert response.json() == {
        "detail": "Decision date 2026-02-05 is outside the analysis window 2026-01-01..2026-01-31"
    }


def test_malformed_date_is_422(seeded_db, client):
    response = client.get("/api/days/2026-13-01")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert detail[0]["type"] == "date_from_datetime_parsing"
    assert detail[0]["loc"] == ["path", "decision_date"]
    assert detail[0]["input"] == "2026-13-01"


def test_forecast_vintages_match_contract(seeded_db, client):
    body = client.get("/api/forecast/2026-01-05").json()
    assert body["decision_date"] == "2026-01-05"
    assert body["delivery_date"] == "2026-01-06"
    assert body["gate_closure_cutoff_utc"] == "2026-01-05T09:50:00Z"
    assert body["gate_closure_publish_time"] == "2026-01-05T09:30:00Z"
    assert body["issue_count"] == 8 == len(body["issues"])
    assert [issue["publish_time"] for issue in body["issues"]] == sorted(
        issue["publish_time"] for issue in body["issues"]
    )
    assert {issue["point_count"] for issue in body["issues"]} == {73}
    assert all(len(issue["points"]) == issue["point_count"] for issue in body["issues"])
    gate = [issue for issue in body["issues"] if issue["is_gate_closure"]]
    assert len(gate) == 1
    assert gate[0]["issue_time_utc"] == "09:30"
    assert sum(1 for issue in body["issues"] if issue["is_usable_at_gate_closure"]) == 4
    # Gate issue covers all 24 delivery hours.
    delivery_hours = {
        point["target_time"]
        for point in gate[0]["points"]
        if point["target_time"].startswith("2026-01-06")
    }
    assert len(delivery_hours) == 24
    # Every point is an hourly target with a signed horizon.
    for issue in body["issues"]:
        targets = [point["target_time"] for point in issue["points"]]
        assert targets == sorted(targets)
        assert all(target.endswith(":00:00Z") for target in targets)


def test_forecast_day_quirk_has_1225_issue(seeded_db, client):
    body = client.get("/api/forecast/2026-01-15").json()
    labels = [issue["issue_time_utc"] for issue in body["issues"]]
    assert body["issue_count"] == 8
    assert "12:25" in labels and "11:30" not in labels
    assert body["gate_closure_issue_time_utc"] == "09:30"


def test_forecast_outside_window_404(seeded_db, client):
    assert client.get("/api/forecast/2026-02-05").status_code == 404


def test_summary_shapes_and_totals(seeded_db, client):
    body = client.get("/api/summary").json()
    assert body["window"]["hours_evaluated"] == 744
    assert body["window"]["decision_days"] == 31
    assert body["overall"]["count"] == 744
    assert body["overall"]["mae_mw"] == 2013.0
    assert body["overall"]["rmse_mw"] == 2505.9
    assert body["overall"]["bias_mw"] == 1729.9
    assert body["overall"]["mape_pct"] == 21.61
    assert body["overall"]["mean_forecast_mw"] == 13013.5
    assert body["overall"]["mean_actual_mw"] == 11283.6
    assert body["overall"]["mae_pct_of_mean_actual"] == 17.84
    assert body["overall"]["hours_in_shortfall"] == 627
    assert body["overall"]["hours_in_shortfall_pct"] == 84.27
    assert body["overall"]["p05_mw"] == -1145.5
    assert body["overall"]["p50_mw"] == 1560.2
    assert body["overall"]["p95_mw"] == 5322.2
    assert body["overall"]["worst_day"] == {"decision_date": "2026-01-27", "mae_mw": 5374.8}
    assert body["overall"]["best_day"] == {"decision_date": "2026-01-08", "mae_mw": 797.1}

    assert len(body["by_day"]) == 31
    assert len(body["by_hour"]) == 24
    assert len(body["by_horizon"]) == 8
    assert len(body["by_issue_time"]) == 4
    assert len(body["scatter"]) == 744

    assert [row["horizon_start_h"] for row in body["by_horizon"]] == [0, 6, 12, 18, 24, 30, 36, 42]
    assert [row["issue_time_utc"] for row in body["by_issue_time"]] == [
        "02:30",
        "04:30",
        "07:30",
        "09:30",
    ]
    assert [row["minutes_before_gate"] for row in body["by_issue_time"]] == [440, 320, 140, 20]
    assert all(row["count"] == 744 for row in body["by_issue_time"])
    assert [row["hour_of_day"] for row in body["by_hour"]] == list(range(24))
    assert all(row["p05_mw"] < row["p50_mw"] < row["p95_mw"] for row in body["by_hour"])
    assert all(row["count"] == 31 for row in body["by_hour"])

    energy = body["energy"]
    assert energy["forecast_total_mwh"] == 9_682_036.0
    assert energy["actual_total_mwh"] == 8_394_967.0
    assert energy["forecast_total_gwh"] == 9682.04
    assert energy["actual_total_gwh"] == 8394.97
    assert energy["difference_mwh"] == 1_287_069.0
    assert energy["forecast_vs_actual_pct"] == 15.33

    scatter = body["scatter"]
    assert scatter[0]["delivery_hour_utc"] == "2026-01-02T00:00:00Z"
    assert scatter[0]["decision_date"] == "2026-01-01"
    times = [row["delivery_hour_utc"] for row in scatter]
    assert times == sorted(times)


def test_get_endpoints_never_call_bmrs(seeded_db, client, no_network):
    for path in (
        "/api/meta",
        "/api/summary",
        "/api/days",
        "/api/days/2026-01-05",
        "/api/forecast/2026-01-05",
    ):
        response = client.get(path)
        assert response.status_code == 200, path


def test_admin_sync_requires_token(seeded_db, client):
    response = client.post("/api/admin/sync")
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or missing X-Admin-Token"}
    assert client.post("/api/admin/sync", headers={"X-Admin-Token": "wrong"}).status_code == 401


def test_admin_sync_disabled_without_env(seeded_db, client, monkeypatch):
    monkeypatch.delenv("ADMIN_SYNC_TOKEN", raising=False)
    response = client.post("/api/admin/sync", headers={"X-Admin-Token": "test-token"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Sync disabled: ADMIN_SYNC_TOKEN is not set"}


def test_admin_sync_success_with_stubbed_fetch(seeded_db, client, monkeypatch, raw_payloads):
    actuals, forecasts = raw_payloads

    monkeypatch.setattr(bmrs, "fetch_fuelhh", lambda: copy.deepcopy(actuals))
    monkeypatch.setattr(bmrs, "fetch_windfor", lambda: copy.deepcopy(forecasts))

    response = client.post("/api/admin/sync", headers={"X-Admin-Token": "test-token"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["rows"] == {"actuals": 1488, "forecasts": 18688}
    assert body["issues"] == 256
    assert body["decision_days"] == 31
    assert body["validation"] == {
        "actuals_rows_ok": True,
        "forecast_rows_ok": True,
        "issues_ok": True,
        "gate_closure_days_covered": 31,
        "gate_closure_hours_covered": 744,
    }
    assert body["database"].endswith("portal.db")
    assert body["started_at"].endswith("Z") and body["finished_at"].endswith("Z")
    assert body["last_sync_at"].endswith("Z")

    # The write is visible on the next GET without a restart.
    meta = client.get("/api/meta").json()
    assert meta["data_vintage"]["last_sync_at"] == body["last_sync_at"]


def test_admin_sync_validation_failure_leaves_db_unchanged(seeded_db, client, monkeypatch, raw_payloads):
    actuals, forecasts = raw_payloads
    broken = copy.deepcopy(forecasts)[:-1]

    monkeypatch.setattr(bmrs, "fetch_fuelhh", lambda: copy.deepcopy(actuals))
    monkeypatch.setattr(bmrs, "fetch_windfor", lambda: broken)

    before = client.get("/api/meta").json()["data_vintage"]["last_sync_at"]
    response = client.post("/api/admin/sync", headers={"X-Admin-Token": "test-token"})
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail.startswith("BMRS sync failed:")
    assert detail.endswith("Database left unchanged.")

    after = client.get("/api/meta").json()["data_vintage"]["last_sync_at"]
    assert after == before


def test_missing_database_returns_503(seeded_db, monkeypatch, tmp_path):
    from app import service
    from app.main import app
    from fastapi.testclient import TestClient

    monkeypatch.setenv("PORTAL_DB_PATH", str(tmp_path / "does-not-exist.db"))
    service.clear_cache()
    with TestClient(app) as fresh_client:
        for path in ("/api/meta", "/api/summary", "/api/days", "/api/days/2026-01-05"):
            response = fresh_client.get(path)
            assert response.status_code == 503, path
            assert isinstance(response.json()["detail"], str)


def test_empty_database_returns_503(seeded_db, monkeypatch, tmp_path):
    from app import db, service
    from app.main import app
    from fastapi.testclient import TestClient

    empty = tmp_path / "empty.db"
    connection = db.connect(empty)
    db.ensure_schema(connection)
    connection.close()

    monkeypatch.setenv("PORTAL_DB_PATH", str(empty))
    service.clear_cache()
    with TestClient(app) as fresh_client:
        response = fresh_client.get("/api/days")
        assert response.status_code == 503
        assert "empty" in response.json()["detail"].lower()
