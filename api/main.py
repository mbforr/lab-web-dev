"""
api/main.py — the ONLY server in Bikeable NYC.

Everything else is static (PMTiles, Parquet) or a public feed (GBFS). This service exists
for the one thing that genuinely needs a backend: storing user-submitted spot reports and
serving them back. It is deliberately tiny — one file, no routers, no ORM, no auth.

Why validation lives here (not just in the browser form): the frontend can be bypassed
(anyone can POST directly), so the rules — rating 1–5, comment ≤280, coordinates inside NYC —
are enforced SERVER-side by Pydantic. A bad request is rejected with 422 before a single row
is touched. That's the teaching point of Part 4's backend.

No try/except (teaching code fails loudly). DATABASE_URL lives ONLY in this process's
environment — the frontend never sees Postgres.

Run:  uvicorn main:app --port 8000   (from the api/ directory, with DATABASE_URL set)
"""

import os

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Bikeable NYC reports")

# The Vite dev server origin. CORS must allow it or the browser blocks the POST/GET.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# NYC bounding box (must match the pipeline's study area). A report outside it is bogus.
NYC = (-74.26, 40.49, -73.70, 40.92)  # west, south, east, north


# Pydantic model = the validation gate. FastAPI returns 422 automatically if a field is
# missing or out of bounds — the handler below never runs for bad input.
class ReportIn(BaseModel):
    place_id: str
    place_name: str
    comment: str = Field(max_length=280)
    rating: int = Field(ge=1, le=5)
    lon: float = Field(ge=NYC[0], le=NYC[2])
    lat: float = Field(ge=NYC[1], le=NYC[3])


def db():
    # One short-lived connection per request. Minimal on purpose: no pool, no ORM.
    return psycopg.connect(os.environ["DATABASE_URL"])


@app.post("/reports", status_code=201)
def create_report(report: ReportIn):
    """Insert a validated report and return the created row (201)."""
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO reports (place_id, place_name, comment, rating, lon, lat)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (report.place_id, report.place_name, report.comment, report.rating, report.lon, report.lat),
        )
        report_id, created_at = cur.fetchone()
    return {"id": str(report_id), "created_at": created_at.isoformat(), **report.model_dump()}


@app.get("/reports")
def list_reports():
    """Return the latest 500 reports as a GeoJSON FeatureCollection for the map."""
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, place_id, place_name, comment, rating, lon, lat, created_at
            FROM reports ORDER BY created_at DESC LIMIT 500
            """
        )
        rows = cur.fetchall()
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": str(rid),
                "place_id": place_id,
                "place_name": place_name,
                "comment": comment,
                "rating": rating,
                "created_at": created_at.isoformat(),
            },
        }
        for (rid, place_id, place_name, comment, rating, lon, lat, created_at) in rows
    ]
    return {"type": "FeatureCollection", "features": features}
