"""Vercel serverless entry point.

Vercel's Python runtime looks for a module-level ASGI ``app``.  The backend package
lives one directory up, so it goes on ``sys.path`` first.  Importing the app has no
side effects (no DB writes, no BMRS calls).  ``ADMIN_SYNC_TOKEN`` is intentionally
left unset on Vercel so ``POST /api/admin/sync`` returns 503 for the read-only demo.
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app  # noqa: E402,F401
