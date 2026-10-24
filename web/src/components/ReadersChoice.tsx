// Readers' Choice, Dec. 14–18: the finalists, and a vote for one of them. A reader taps Vote
// under a deer, gives an email address, types the 6-digit code the address receives, and the
// vote is cast (`cast_vote`: one per person, finalists only, no throwaway inboxes; the database
// says so in plain English when it refuses). The sign-in lives in this tab only (sessionStorage).
// After voting closes the finalists stay up, without buttons, until the winners are announced.
import { useEffect, useState, type FormEvent } from "react";
import { track } from "../analytics";
import { castVote, loadBlockedDomains, loadMyVote } from "../data";
import { apLastDay, apDate } from "../format";
import { supabase } from "../supabase";
import type { GalleryEntry, Season, Sponsor } from "../types";
import { EntryCard } from "./EntryCard";
import { SponsorCredit } from "./SponsorCredit";

type Step = "pick" | "email" | "code" | "done";

export function ReadersChoice({
  season,
  finalists,
  presenting,
  storyFacts,
}: {
  season: Season;
  finalists: GalleryEntry[];
  presenting: Sponsor | undefined;
  storyFacts: Parameters<typeof EntryCard>[0]["storyFacts"];
}) {
  const open = season.phase === "voting";
  const [myVote, setMyVote] = useState<string | null | undefined>(undefined);
  const [chosen, setChosen] = useState<GalleryEntry | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);

  // A reader who already voted in this tab sees their vote, not the buttons.
  useEffect(() => {
    let live = true;
    const read = async () => {
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      if (!data.session) return setMyVote(null);
      setMyVote(await loadMyVote(season.id).catch(() => null));
    };
    read();
    loadBlockedDomains().then((d) => live && setBlocked(d), () => undefined);
    return () => {
      live = false;
    };
  }, [season.id]);

  const fail = (err: unknown) => {
    const message = (err as Error).message || "";
    // The database's own refusals are written for readers; anything else gets a plain retry line.
    setError(/^[A-Z][^{}<>]*[.!]$/.test(message) ? message : "That didn't go through. Try again in a moment.");
  };

  const pick = (entry: GalleryEntry) => {
    setChosen(entry);
    setError(null);
    setStep("email");
    track("Vote Started");
  };

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (blocked.includes(address.split("@")[1] ?? "")) {
      setError("Vote with a personal or work email address, not a temporary one.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return fail(error);
    setStep("code");
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      return fail(error);
    }
    try {
      await castVote(chosen.id, newsletter);
      track("Vote Cast");
      setMyVote(chosen.id);
      setStep("done");
    } catch (err) {
      // Already voted (another spelling of the same inbox, or an earlier tab): say so, and show it.
      fail(err);
      setMyVote(await loadMyVote(season.id).catch(() => null));
      setStep("pick");
    }
    setBusy(false);
  };

  const votedFor = myVote ? finalists.find((f) => f.id === myVote) : undefined;

  return (
    <section className="ballot" aria-labelledby="ballot-heading">
      <div className="ballot-head">
        <h2 id="ballot-heading">Readers’ Choice</h2>
        {presenting && <SponsorCredit sponsor={presenting} placement="award-filter" lead="Grand prize from" />}
        <p className="ballot-intro">
          {open ? (
            <>
              Our staff picked {finalists.length === 1 ? "one finalist" : `these ${finalists.length} finalists`}. Vote for
              your favorite by {apLastDay(season.voting_close_at)}: one vote per person, confirmed by email, and we never
              publish or share your address.
            </>
          ) : (
            <>Voting has closed. The winner will be announced {apDate(season.winners_at)}.</>
          )}
        </p>
        {votedFor && (
          <p className="ballot-done" role="status">
            {step === "done" ? "Your vote is in: " : "You voted for "}
            <strong>{votedFor.hunter_name}</strong>. Thanks for voting.
          </p>
        )}
      </div>

      {open && chosen && step === "email" && (
        <form className="ballot-form" onSubmit={sendCode}>
          <h3>Vote for {chosen.hunter_name}</h3>
          <label>
            Your email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <span className="hint">We’ll send a 6-digit code to confirm it’s you. One vote per person.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
            <span>Sign me up for Wausau Pilot &amp; Review’s free newsletter</span>
          </label>
          <div className="actions">
            <button type="submit" className="button button-blaze" disabled={busy}>
              {busy ? "Sending the code…" : "Send me a code"}
            </button>
            <button type="button" className="link-button" onClick={() => setStep("pick")}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {open && chosen && step === "code" && (
        <form className="ballot-form" onSubmit={confirm}>
          <h3>Vote for {chosen.hunter_name}</h3>
          <label>
            The 6-digit code we sent to {email.trim()}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <span className="hint">Check your spam folder if it hasn’t arrived in a minute.</span>
          </label>
          <div className="actions">
            <button type="submit" className="button button-blaze" disabled={busy}>
              {busy ? "Casting your vote…" : "Cast my vote"}
            </button>
            <button type="button" className="link-button" onClick={() => setStep("email")}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="entry-grid">
        {finalists.map((entry) => (
          <div key={entry.id} className={myVote === entry.id ? "finalist finalist-mine" : "finalist"}>
            <EntryCard entry={entry} share storyFacts={storyFacts} />
            {open && myVote === null && (
              <button type="button" className="button" onClick={() => pick(entry)} disabled={busy}>
                Vote for this deer
              </button>
            )}
            {myVote === entry.id && <p className="finalist-voted">Your vote</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
