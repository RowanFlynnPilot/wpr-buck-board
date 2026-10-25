-- Hunting Brag Board — two more sponsor slots, used by migration 0016 (a new enum value can't be
-- used in the transaction that adds it).
--   thank_you         one a season: every entrant whose deer goes on the board gets its offer.
--   deer_of_the_week  one a season: presents the weekly staff pick and its weekly prize.
alter type public.sponsor_tier add value if not exists 'thank_you';
alter type public.sponsor_tier add value if not exists 'deer_of_the_week';
