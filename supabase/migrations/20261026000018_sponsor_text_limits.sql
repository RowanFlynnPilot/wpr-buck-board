-- Hunting Brag Board — sponsor text a page can hold.
--
-- A sponsor's name goes in the board's title ("presented by …") and its prize on the cards; both
-- were unbounded, so one pasted paragraph would have filled the front. The longest realistic ones
-- tried (break-ui) were 59 and 103 characters.

alter table public.sponsors
  add constraint sponsors_name_length check (length(trim(name)) <= 80),
  add constraint sponsors_prize_length check (length(trim(prize)) <= 160);
