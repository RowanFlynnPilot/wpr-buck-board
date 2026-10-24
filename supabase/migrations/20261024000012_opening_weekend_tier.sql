-- Hunting Brag Board — an Opening Weekend sponsor (new inventory for the Nov. 21 gun opener).
--
-- On its own because Postgres can't use a new enum value in the transaction that adds it; the
-- one-per-season index that uses it is in 0013.

alter type public.sponsor_tier add value if not exists 'opening_weekend';
