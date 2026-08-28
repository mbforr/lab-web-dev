-- api/schema.sql — the reports table. Run ONCE against your Supabase Postgres
-- (paste into the Supabase SQL editor and execute). Plain SQL, no migration tool.
--
-- The rating CHECK mirrors the server-side Pydantic bound so the database is a second line
-- of defense: even a direct SQL insert can't store a rating outside 1–5.

create table if not exists reports (
    id          uuid primary key default gen_random_uuid(),
    place_id    text        not null,
    place_name  text        not null,
    comment     text,
    rating      int         not null check (rating between 1 and 5),
    lon         double precision not null,
    lat         double precision not null,
    created_at  timestamptz not null default now()
);

-- Sample rows for testing (uncomment and run to seed three reports):
-- insert into reports (place_id, place_name, comment, rating, lon, lat) values
--   ('sample-1', 'Devoción',        'Great cold brew, easy bike parking', 5, -73.9575, 40.7192),
--   ('sample-2', 'Brooklyn Museum', 'Docks right outside, usually bikes free', 4, -73.9636, 40.6712),
--   ('sample-3', 'Fort Greene Park','Nice ride, station often empty by 9am', 3, -73.9740, 40.6919);
