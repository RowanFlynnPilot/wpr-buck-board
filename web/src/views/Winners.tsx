// Staff: the end of the season. Pick up to 10 Readers' Choice finalists while entries are open
// (the list locks when the first vote lands), watch the standings during the vote, pick each
// award's winner after entries close, run the Prize Partner drawing once, and redraw a prize
// nobody claimed. Every rule lives in the database (set_finalist, set_award_winner,
// run_prize_drawing, redraw_prize); this page shows what's allowed and relays its refusals.
import { useState } from "react";
import {
  loadAwardWinners,
  loadCatalog,
  loadDrawingWinners,
  loadFinalists,
  loadForfeits,
  loadModerationQueue,
  loadSeason,
  loadStandings,
  redrawPrize,
  runDrawing,
  setAwardWinner,
  setFinalist,
} from "../data";
import { apDate, apLastDay, describeDeer } from "../format";
import { photoUrl } from "../supabase";
import type { Award, ModerationEntry, Season, Sponsor } from "../types";
import { useLoad } from "../useLoad";

const MAX_FINALISTS = 10;

async function loadWinnersPage() {
  const season = await loadSeason();
  const [catalog, posted, finalists, standings, winners, drawn, forfeits] = await Promise.all([
    loadCatalog(season.id),
    loadModerationQueue(season.id, "approved"),
    loadFinalists(season.id),
    loadStandings(season.id),
    loadAwardWinners(season.id),
    loadDrawingWinners(season.id),
    loadForfeits(season.id),
  ]);
  return { season, ...catalog, posted, finalists, standings, winners, drawn, forfeits };
}

export function Winners() {
  const page = useLoad(loadWinnersPage);
  if (page.status === "loading") return <p className="status">Loading…</p>;
  if (page.status === "failed") return <p className="status">Couldn't load: {page.error.message}</p>;
  const { season, awards, sponsors, posted, finalists, standings, winners, drawn, forfeits } = page.data;
  const closed = !["upcoming", "entries"].includes(season.phase);
  const votes = (id: string) => standings.find((s) => s.entry_id === id)?.votes ?? 0;
  const describe = (e: ModerationEntry) => `${e.hunter_name}, ${describeDeer(e.deer_type, e.points).toLowerCase()} (${e.hometown})`;

  return (
    <div className="winners-desk">
      <Finalists season={season} posted={posted} finalists={finalists} votes={votes} onChange={page.reload} />
      <section>
        <h2>Award winners</h2>
        {!closed ? (
          <p className="hint">Winners are picked after entries close {apLastDay(season.entries_close_at)}. Readers’ Choice waits for the vote to close {apLastDay(season.voting_close_at)}.</p>
        ) : (
          <p className="hint">
            Pick a winner for each award; a pick can be changed until {apDate(season.winners_at)}, when the board shows them.
            Readers’ Choice goes to the finalist with the most votes. Entrants marked as a staff household can’t win.
          </p>
        )}
        {closed &&
          awards.map((award) => (
            <AwardPick
              key={award.id}
              award={award}
              season={season}
              candidates={posted.filter((e) =>
                award.kind === "readers_choice" ? finalists.includes(e.id) : e.award_kinds.includes(award.kind),
              )}
              votes={award.kind === "readers_choice" ? votes : undefined}
              current={winners.find((w) => w.award_id === award.id)?.entry_id}
              describe={describe}
              onChange={page.reload}
            />
          ))}
      </section>
      <Drawing
        season={season}
        partners={sponsors.filter((s) => s.tier === "prize_partner" && !s.demo)}
        posted={posted}
        drawn={drawn}
        forfeits={forfeits}
        closed={closed}
        describe={describe}
        onChange={page.reload}
      />
    </div>
  );
}

function Finalists({
  season,
  posted,
  finalists,
  votes,
  onChange,
}: {
  season: Season;
  posted: ModerationEntry[];
  finalists: string[];
  votes: (id: string) => number;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voting = season.phase === "voting" || season.phase === "tallying" || season.phase === "winners";
  const [query, setQuery] = useState("");
  const shown = posted.filter((e) => !query || `${e.hunter_name} ${e.hometown} ${e.county}`.toLowerCase().includes(query.toLowerCase()));

  const toggle = async (entry: ModerationEntry, on: boolean) => {
    setBusy(entry.id);
    setError(null);
    try {
      await setFinalist(entry.id, on);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };

  return (
    <section>
      <h2>Readers’ Choice finalists</h2>
      <p className="hint">
        {finalists.length} of {MAX_FINALISTS} picked. Readers vote among the finalists {apDate(season.voting_open_at)} to{" "}
        {apLastDay(season.voting_close_at)}; the list locks when the first vote lands. A finalist can be withdrawn at any
        time, and its votes then stop counting.
      </p>
      {voting && (
        <ol className="standings">
          {[...posted]
            .filter((e) => finalists.includes(e.id))
            .sort((a, b) => votes(b.id) - votes(a.id))
            .map((e) => (
              <li key={e.id}>
                <strong>{votes(e.id)}</strong> {votes(e.id) === 1 ? "vote" : "votes"}: {e.hunter_name}, {describeDeer(e.deer_type, e.points).toLowerCase()}
              </li>
            ))}
        </ol>
      )}
      <label className="finalist-search">
        Find a deer
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, hometown or county" />
      </label>
      <ul className="finalist-picks">
        {shown.map((e) => {
          const on = finalists.includes(e.id);
          return (
            <li key={e.id}>
              <label className={on ? "pick pick-on" : "pick"}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy === e.id || (!on && finalists.length >= MAX_FINALISTS)}
                  onChange={(ev) => toggle(e, ev.target.checked)}
                />
                <img src={photoUrl(e.photo_id, "thumb")} alt="" />
                <span>
                  <strong>{e.hunter_name}</strong>, {describeDeer(e.deer_type, e.points).toLowerCase()}
                  <span className="pick-when">
                    {e.hometown} · {e.county} County{!e.entry_private.prize_eligible && " · staff household"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function AwardPick({
  award,
  season,
  candidates,
  votes,
  current,
  describe,
  onChange,
}: {
  award: Award;
  season: Season;
  candidates: ModerationEntry[];
  votes?: (id: string) => number;
  current: string | undefined;
  describe: (e: ModerationEntry) => string;
  onChange: () => void;
}) {
  const [choice, setChoice] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = votes ? [...candidates].sort((a, b) => votes(b.id) - votes(a.id)) : candidates;
  const readersChoiceWaits = award.kind === "readers_choice" && !["tallying", "winners"].includes(season.phase);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setAwardWinner(award.id, choice);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="award-pick">
      <label>
        {award.label}
        {current && <span className="hint"> · winner picked</span>}
        <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={readersChoiceWaits}>
          <option value="">{readersChoiceWaits ? "After the vote closes" : "Choose the winner"}</option>
          {sorted.map((e) => (
            <option key={e.id} value={e.id}>
              {votes ? `${votes(e.id)} ${votes(e.id) === 1 ? "vote" : "votes"} · ` : ""}
              {describe(e)}
              {!e.entry_private.prize_eligible ? " · staff household" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="button" disabled={busy || !choice || choice === current} onClick={save}>
        {current ? "Change winner" : "Save winner"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Drawing({
  season,
  partners,
  posted,
  drawn,
  forfeits,
  closed,
  describe,
  onChange,
}: {
  season: Season;
  partners: Sponsor[];
  posted: ModerationEntry[];
  drawn: { sponsor_id: string; entry_id: string }[];
  forfeits: { sponsor_id: string; entry_id: string }[];
  closed: boolean;
  describe: (e: ModerationEntry) => string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const entry = (id: string) => posted.find((e) => e.id === id);

  const run = async (action: () => Promise<unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      setConfirming(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(null);
  };

  return (
    <section>
      <h2>Prize drawing</h2>
      {partners.length === 0 ? (
        <p className="hint">No Prize Partners yet. The drawing needs at least one prize.</p>
      ) : drawn.length === 0 ? (
        <>
          <p className="hint">
            One prize per Prize Partner, one ticket per entrant (by email), drawn at random from everyone with a deer on
            the board, skipping staff households. It runs once, after entries close {apLastDay(season.entries_close_at)}{" "}
            and every entry is posted or declined.
          </p>
          <button type="button" className="button" disabled={!closed || busy === "draw"} onClick={() => run(() => runDrawing(season.id), "draw")}>
            {busy === "draw" ? "Drawing…" : `Run the drawing (${partners.length} ${partners.length === 1 ? "prize" : "prizes"})`}
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            Email each winner. A winner who doesn’t respond within 14 days forfeits the prize: Redraw records the forfeit
            and draws again among the entrants left. Winners show on the board from {apDate(season.winners_at)}.
          </p>
          <ul className="drawn-list">
            {partners.map((partner) => {
              const win = drawn.find((d) => d.sponsor_id === partner.id);
              const winner = win && entry(win.entry_id);
              const lost = forfeits.filter((f) => f.sponsor_id === partner.id).map((f) => entry(f.entry_id)?.hunter_name).filter(Boolean);
              return (
                <li key={partner.id}>
                  <strong>{partner.prize}</strong> from {partner.name}
                  {winner ? (
                    <>
                      {" "}
                      → {describe(winner)}, {winner.entry_private.email}
                      {winner.entry_private.phone && `, ${winner.entry_private.phone}`}
                      {lost.length > 0 && <span className="hint"> · forfeited by {lost.join(", ")}</span>}
                      {confirming === partner.id ? (
                        <span className="actions">
                          <button type="button" className="button" disabled={busy === partner.id} onClick={() => run(() => redrawPrize(partner.id), partner.id)}>
                            {busy === partner.id ? "Drawing…" : "Yes, draw again"}
                          </button>
                          <button type="button" className="link-button" onClick={() => setConfirming(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="link-button" onClick={() => setConfirming(partner.id)}>
                          Redraw…
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="hint"> · not drawn (added after the drawing?)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
