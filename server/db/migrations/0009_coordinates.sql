-- ---------------------------------------------------------------
-- Where the property actually is
--
-- map_x and map_y are not coordinates. They are a hash of the district
-- name spread over a unit square, which is enough to cluster a schematic
-- and nothing else: two homes on opposite sides of Kololo land on the
-- same dot, and no one can be sent to either of them.
--
-- These are the real thing — WGS 84, the numbers a phone's map app
-- understands. Nullable, because a portfolio that has never opened the
-- map has none, and inventing a location is worse than admitting there
-- isn't one. The schematic coordinates stay: they still draw the fallback
-- map for anyone without a Maps key configured.
-- ---------------------------------------------------------------
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "latitude" double precision;--> statement-breakpoint
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "longitude" double precision;--> statement-breakpoint

-- A pin is both numbers or neither. Half a coordinate is a point in the
-- Gulf of Guinea, which is where every mis-set latitude on earth ends up.
ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_pin_complete";--> statement-breakpoint
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_pin_complete"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));--> statement-breakpoint

ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_pin_on_earth";--> statement-breakpoint
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_pin_on_earth"
  CHECK (
    "latitude" IS NULL
    OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );--> statement-breakpoint
