// Entry form. Built for a phone in a truck: photo first, big targets, one screen of questions.
// Entrants never pick an award; the database works out which ones each deer qualifies for.
import { useEffect, useState, type FormEvent } from "react";
import { SponsorCredit } from "../components/SponsorCredit";
import { Turnstile } from "../components/Turnstile";
import { loadCatalog, loadCounties, loadSeason, submitEntry, type EntrySubmission } from "../data";
import { env } from "../env";
import { AGE_LABELS, WEAPON_LABELS, apDay, todayInWausau } from "../format";
import { scrollToTop } from "../host";
import { phaseLine, presentingSponsor } from "../phase";
import { preparePhoto, type PreparedPhoto } from "../photo";
import type { AgeGroup, Weapon } from "../types";
import { useLoad } from "../useLoad";

const STORY_LIMIT = 1200;

const BLANK: EntrySubmission = {
  hunter_name: "",
  hometown: "",
  county: "",
  harvest_date: "",
  weapon: "",
  deer_type: "",
  points: "",
  first_deer: false,
  age_group: "",
  guardian_consent: false,
  story: "",
  submitter_name: "",
  email: "",
  newsletter_opt_in: false,
};

async function loadEnterPage() {
  const [season, counties] = await Promise.all([loadSeason(), loadCounties()]);
  return { board: { season, ...(await loadCatalog(season.id)) }, counties };
}

type Photo = PreparedPhoto & { preview: string };

export function Enter() {
  const page = useLoad(loadEnterPage);
  const [entry, setEntry] = useState<EntrySubmission>(BLANK);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.preview);
  }, [photo]);

  // Runs after the confirmation renders, so the host has already shrunk the iframe.
  useEffect(() => {
    if (sent) scrollToTop();
  }, [sent]);

  if (page.status === "loading") return <p className="status">Loading the entry form…</p>;
  if (page.status === "failed") {
    return <p className="status">The entry form isn't loading right now. Try again in a few minutes.</p>;
  }

  const { board, counties } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);

  const set = <K extends keyof EntrySubmission>(field: K, value: EntrySubmission[K]) =>
    setEntry((current) => ({ ...current, [field]: value }));

  const choosePhoto = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ ...prepared, preview: URL.createObjectURL(prepared.full) });
    } catch (err) {
      setPhoto(null);
      setError((err as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo) {
      setError("Add a photo of your deer.");
      return;
    }
    if (!token) {
      setError("Wait for the check above the button to finish.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitEntry(entry, photo, token);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
      // The token was spent on that attempt; a fresh widget fetches a new one.
      setToken(null);
      setAttempt((n) => n + 1);
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    setEntry(BLANK);
    setPhoto(null);
    setRulesAccepted(false);
    setToken(null);
    setSent(false);
  };

  if (season.phase !== "entries") {
    return (
      <main className="enter">
        <h1>Enter your deer</h1>
        <p>{phaseLine(season)}</p>
        <a className="button" href={env.galleryPageUrl} target="_top">
          See the board
        </a>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="enter">
        <h1>Your deer is entered</h1>
        <p>
          It will show up on the Brag Board once our staff reviews it. We'll email you if it wins. You're also in the
          prize drawing.
        </p>
        <div className="actions">
          <a className="button" href={env.galleryPageUrl} target="_top">
            See the board
          </a>
          <button type="button" className="button" onClick={startOver}>
            Enter another deer
          </button>
        </div>
      </main>
    );
  }

  const youth = entry.age_group === "youth";

  return (
    <main className="enter">
      <header>
        <h1>Enter your deer</h1>
        {presenting && <SponsorCredit sponsor={presenting} />}
        <p>
          Any deer taken in Wisconsin since {apDay(season.harvest_since)} can go on the {season.year} Brag Board. Entering
          puts you in the prize drawing, and our staff sorts every deer into the awards it qualifies for.
        </p>
      </header>

      <form onSubmit={send}>
        <fieldset>
          <legend>The photo</legend>
          <label className="photo-picker">
            {photo ? (
              <img src={photo.preview} alt="Your deer" />
            ) : (
              <span>{preparing ? "Preparing your photo…" : "Choose a photo"}</span>
            )}
            <input
              type="file"
              accept="image/*"
              required={!photo}
              disabled={preparing}
              onChange={(e) => choosePhoto(e.target.files?.[0])}
            />
          </label>
          <p className="hint">
            Field-dressed, with as little blood as possible. Photos that don't meet that standard won't be posted.
            {photo && " Tap the photo to pick a different one."}
          </p>
        </fieldset>

        <fieldset>
          <legend>The deer</legend>
          <label>
            Date taken
            <input
              type="date"
              required
              min={season.harvest_since}
              max={todayInWausau()}
              value={entry.harvest_date}
              onChange={(e) => set("harvest_date", e.target.value)}
            />
          </label>
          <label>
            County
            <select required value={entry.county} onChange={(e) => set("county", e.target.value)}>
              <option value="" disabled>
                Choose a county
              </option>
              {counties.map((county) => (
                <option key={county}>{county}</option>
              ))}
            </select>
          </label>
          <label>
            Taken with
            <select required value={entry.weapon} onChange={(e) => set("weapon", e.target.value)}>
              <option value="" disabled>
                Choose one
              </option>
              {(Object.keys(WEAPON_LABELS) as Weapon[]).map((weapon) => (
                <option key={weapon} value={weapon}>
                  {WEAPON_LABELS[weapon]}
                </option>
              ))}
            </select>
          </label>
          <div className="choice-group" role="radiogroup" aria-label="Buck or antlerless">
            {(["buck", "antlerless"] as const).map((deer) => (
              <label key={deer} className="choice">
                <input
                  type="radio"
                  name="deer_type"
                  required
                  checked={entry.deer_type === deer}
                  onChange={() => setEntry((current) => ({ ...current, deer_type: deer, points: "" }))}
                />
                {deer === "buck" ? "Buck" : "Antlerless"}
              </label>
            ))}
          </div>
          {entry.deer_type === "buck" && (
            <label>
              <span>
                Points <span className="optional">(optional)</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={40}
                value={entry.points}
                onChange={(e) => set("points", e.target.value)}
              />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={entry.first_deer} onChange={(e) => set("first_deer", e.target.checked)} />
            This was the hunter's first deer ever
          </label>
        </fieldset>

        <fieldset>
          <legend>The hunter</legend>
          <p id="age-label" className="group-label">
            Hunter's age
          </p>
          <div className="choice-group" role="radiogroup" aria-labelledby="age-label">
            {(Object.keys(AGE_LABELS) as AgeGroup[]).map((age) => (
              <label key={age} className="choice">
                <input
                  type="radio"
                  name="age_group"
                  required
                  checked={entry.age_group === age}
                  onChange={() => setEntry((current) => ({ ...current, age_group: age, guardian_consent: false }))}
                />
                {AGE_LABELS[age]}
              </label>
            ))}
          </div>
          <label>
            Name to show on the board
            <input
              required
              maxLength={60}
              autoComplete="off"
              value={entry.hunter_name}
              onChange={(e) => set("hunter_name", e.target.value)}
            />
            {youth && <span className="hint">First name only for hunters 17 and under.</span>}
          </label>
          <label>
            Hometown
            <input required maxLength={60} value={entry.hometown} onChange={(e) => set("hometown", e.target.value)} />
          </label>
          {youth && (
            <label className="check">
              <input
                type="checkbox"
                required
                checked={entry.guardian_consent}
                onChange={(e) => set("guardian_consent", e.target.checked)}
              />
              I'm this hunter's parent or guardian, and I agree to their photo and first name appearing on the Brag Board.
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>The story</legend>
          <label>
            <span>
              Tell us about the hunt <span className="optional">(optional)</span>
            </span>
            <textarea
              rows={5}
              maxLength={STORY_LIMIT}
              value={entry.story}
              onChange={(e) => set("story", e.target.value)}
            />
            <span className="hint">
              Our staff picks a Best Story winner. {STORY_LIMIT - entry.story.length} characters left.
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>You</legend>
          <label>
            Your name
            <input
              required
              maxLength={100}
              autoComplete="name"
              value={entry.submitter_name}
              onChange={(e) => set("submitter_name", e.target.value)}
            />
          </label>
          <label>
            Your email
            <input
              type="email"
              required
              autoComplete="email"
              value={entry.email}
              onChange={(e) => set("email", e.target.value)}
            />
            <span className="hint">We'll only use it to reach you about prizes.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={entry.newsletter_opt_in}
              onChange={(e) => set("newsletter_opt_in", e.target.checked)}
            />
            Send me the Pilot's free newsletter, with new Brag Board entries every Friday
          </label>
          <label className="check">
            <input type="checkbox" required checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} />
            <span>
              I've read the{" "}
              <a href={env.rulesUrl} target="_blank" rel="noreferrer">
                contest rules
              </a>
              .
            </span>
          </label>
        </fieldset>

        <Turnstile key={attempt} onToken={setToken} onError={setError} />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button-blaze" disabled={sending || preparing || !token}>
          {sending ? "Entering your deer…" : "Enter your deer"}
        </button>
      </form>
    </main>
  );
}
