.PHONY: help seed check from-raw api ui test typecheck build docker up down verify

VENV := .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

help:
	@echo "Targets:"
	@echo "  make setup      create venv and install backend deps"
	@echo "  make seed       fetch + validate + seed data/portal.db (network)"
	@echo "  make check      validate live BMRS data without writing"
	@echo "  make from-raw   rebuild the DB from data/raw (offline)"
	@echo "  make api        run uvicorn on :8000"
	@echo "  make ui         run the Vite dev server on :5173 (or PORT=5174)"
	@echo "  make test       backend pytest + frontend vitest"
	@echo "  make build      frontend production build"
	@echo "  make docker     docker compose build"
	@echo "  make up         docker compose up -d --build"
	@echo "  make verify     seed check + backend tests + API smoke"

setup:
	python3 -m venv $(VENV)
	$(PIP) install -r backend/requirements.txt -r backend/requirements-dev.txt
	cd frontend && npm ci

seed:
	$(PY) scripts/fetch_data.py

check:
	$(PY) scripts/fetch_data.py --check

from-raw:
	$(PY) scripts/fetch_data.py --from-raw

api:
	cd backend && ADMIN_SYNC_TOKEN=$${ADMIN_SYNC_TOKEN:-dev-token} ../$(VENV)/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

ui:
	cd frontend && npm run dev -- --port $${PORT:-5173}

test:
	cd backend && ../$(VENV)/bin/python -m pytest -q
	cd frontend && npm test

typecheck:
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

docker:
	docker compose build

up:
	docker compose up -d --build

down:
	docker compose down

verify:
	$(PY) scripts/fetch_data.py --check
	cd backend && ../$(VENV)/bin/python -m pytest -q
	curl -sf http://127.0.0.1:8000/api/meta | $(PY) -c "import json,sys; d=json.load(sys.stdin); assert d['counts']['actual_rows']==1488; assert d['gate_closure']['cutoff_time_utc']=='09:50'; print('API smoke OK')"
