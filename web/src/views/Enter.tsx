// Entry form. Built for a phone in a truck: big targets, one screen of questions. The questions,
// their order and wording follow Shereen's 2026 entry form plan: the hunter, how to reach you,
// the deer, the story, the photo, a parent or guardian for hunters 17 and under, then consent.
// Entrants never pick an award; the database works out which ones each deer qualifies for.
// In a `?demo` preview (/wpr-buck-board/?demo#/enter) the form is open whatever the date and
// works as it does for readers, photo handling included, but sends nothing: no bot check, no
// upload, no entry. The confirmation shows how the deer would look on the board.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { track } from "../analytics";
import { EntryCard } from "../components/EntryCard";
import { SponsorCredit } from "../components/SponsorCredit";
import { Turnstile } from "../components/Turnstile";
import { loadCatalog, loadCounties, loadSeason, submitEntry, type EntrySubmission } from "../data";
import { env } from "../env";
import { AGE_LABELS, WEAPON_LABELS, apDate, apDay, apLastDay, todayInWausau } from "../format";
import { scrollToTop } from "../host";
import { phaseLine, presentingSponsor } from "../phase";
import { preparePhoto, type PreparedPhoto } from "../photo";
import { DEMO } from "../sales";
import type { AgeGroup, DeerType, EntryFields, Weapon } from "../types";
import { useLoad } from "../useLoad";

const STORY_LIMIT = 1200;
// Checked in the browser, so a blank or unusable answer is caught before the photo uploads.
const NOT_BLANK = String.raw`.*\S.*`;
const PHONE = String.raw`(\D*\d){7,15}\D*`;

const BLANK: EntrySubmission = {
  hunter_name: "",
  hometown: "",
  county: "",
  harvest_date: "",
  weapon: "",
  deer_type: "",
  points: "",
  first_deer: "",
  age_group: "",
  guardian_consent: false,
  story: "",
  submitter_name: "",
  email: "",
  newsletter_opt_in: false,
  phone: "",
  guardian_relationship: "",
  first_name_only: "",
  photo_credit: "",
};

// Shown just above the upload, in Shereen's words (one photo, where her plan allowed three).
const PHOTO_GUIDELINES: [lead: string, text: string][] = [
  ["Get in the picture.", "We feature hunters with their deer, so the hunter needs to be in the photo."],
  [
    "Keep the photo respectful.",
    "Wipe away blood where you can and tuck the tongue in. We can't publish photos that show heavy blood, open wounds or field dressing.",
  ],
  [
    "Handle weapons safely.",
    "If a firearm or bow is in the frame, point the muzzle or arrow away from the camera and everyone else.",
  ],
  ["Leave the drinks out of the shot.", "We can't publish photos with alcohol in them."],
  ["Find good light.", "Daylight works best. Step out of the garage and get close enough that we can see faces and antlers."],
  ["Send the original.", "No filters, stickers, text or borders. We may crop your photo to fit."],
  ["", "Share only your own photos, or photos you have permission to send."],
  ["", "JPG, PNG or iPhone photos."],
];

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
  const [publishingAllowed, setPublishingAllowed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown by the photo picker, where the reader is looking when a photo won't read.
  const [photoError, setPhotoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasSent = useRef(sent);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.preview);
  }, [photo]);

  // Runs after the confirmation renders, so the host has already shrunk the iframe. Sending, or
  // starting another entry, swaps the whole page: focus its heading so a screen reader says so.
  useEffect(() => {
    if (sent) scrollToTop();
    if (wasSent.current !== sent) headingRef.current?.focus({ preventScroll: true });
    wasSent.current = sent;
  }, [sent]);

  if (page.status === "loading") return <p className="status">Loading the entry form…</p>;
  if (page.status === "failed") {
    return <p className="status">The entry form isn't loading right now. Try again in a few minutes.</p>;
  }

  const { board, counties } = page.data;
  const { season } = board;
  const presenting = presentingSponsor(board);
  const youth = entry.age_group === "youth";
  const lastDay = apLastDay(season.entries_close_at);

  const set = <K extends keyof EntrySubmission>(field: K, value: EntrySubmission[K]) =>
    setEntry((current) => ({ ...current, [field]: value }));

  // A photo that won't read leaves the one already chosen, if any, in place.
  const choosePhoto = async (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ ...prepared, preview: URL.createObjectURL(prepared.full) });
    } catch (err) {
      setPhotoError((err as Error).message);
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
    if (DEMO) {
      setSending(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      setSending(false);
      setSent(true);
      return;
    }
    if (!token) {
      setError("Wait for the check above the button to finish.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitEntry(forSubmission(entry), photo, token);
      track("Entry Submitted");
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
    setPublishingAllowed(false);
    setPhotoError(null);
    setToken(null);
    setSent(false);
  };

  if (season.phase !== "entries" && !DEMO) {
    return (
      <main className="enter">
        <h1>Enter your deer</h1>
        <p>{phaseLine(season)}</p>
        <div className="actions">
          <a className="button" href={env.galleryPageUrl} target="_top">
            See the board
          </a>
        </div>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="enter">
        <h1 ref={headingRef} tabIndex={-1}>
          Thanks for entering the Hunting Brag Board!
        </h1>
        <p>
          Watch for your deer in our Friday Brag Board feature. Winners will be announced {apDate(season.winners_at)} and
          contacted by email. Got another deer this season? Enter again anytime through {lastDay}.
        </p>
        {DEMO && photo && (
          <>
            <p className="demo-note">
              Preview only: nothing was sent. Here's how this deer would look on the Brag Board once our staff posts it.
            </p>
            <div className="entry-preview">
              <EntryCard entry={previewCard(entry)} photo={photo.preview} />
            </div>
          </>
        )}
        <div className="actions">
          {/* The preview stays in the preview; the WordPress page may not exist yet. */}
          <a className="button" href={DEMO ? "?demo#/gallery" : env.galleryPageUrl} target={DEMO ? undefined : "_top"}>
            See the board
          </a>
          <button type="button" className="button" onClick={startOver}>
            Enter another deer
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="enter">
      <header>
        <h1 ref={headingRef} tabIndex={-1}>
          Hunting Brag Board {season.year}
        </h1>
        {presenting && <SponsorCredit sponsor={presenting} placement="entry-form" />}
        <p>
          Show off your deer! Send us a photo of you with your deer from the {season.year} Wisconsin season for a chance
          to be featured on Wausau Pilot & Review and win prizes from local businesses. Entry is free, hunters of all ages
          are welcome, and bow and gun hunters alike can enter. Entries close at 11:59 p.m. {lastDay}.
        </p>
      </header>

      <form onSubmit={send}>
        <fieldset>
          <legend>About the hunter</legend>
          <label>
            Hunter's first and last name
            <input
              required
              maxLength={60}
              pattern={NOT_BLANK}
              title="The hunter's name, as it should appear"
              autoComplete="off"
              value={entry.hunter_name}
              onChange={(e) => set("hunter_name", e.target.value)}
            />
            <span className="hint">
              As you'd like the name to appear if we feature your deer.
              {youth && " For a hunter 17 and under, you'll choose below whether we use the last name."}
            </span>
          </label>
          <Choices
            label="Hunter's age group"
            name="age_group"
            options={(Object.keys(AGE_LABELS) as AgeGroup[]).map((age) => [age, AGE_LABELS[age]])}
            value={entry.age_group}
            hint="Hunters 17 and under must be entered by a parent or guardian."
            onChange={(age) =>
              setEntry((current) => ({
                ...current,
                age_group: age,
                submitter_name: "",
                guardian_relationship: "",
                first_name_only: "",
                guardian_consent: false,
              }))
            }
          />
          <label>
            Hometown
            <input
              required
              maxLength={60}
              pattern={NOT_BLANK}
              title="A city, village or town"
              value={entry.hometown}
              onChange={(e) => set("hometown", e.target.value)}
            />
            <span className="hint">City, village or town. We publish your hometown, never your street address.</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>How we reach you</legend>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={entry.email}
              onChange={(e) => set("email", e.target.value)}
            />
            <span className="hint">
              We use this only to contact you about your entry and prizes. We never publish your email. For a hunter under
              18, enter a parent or guardian's email.
            </span>
          </label>
          <label>
            {youth ? (
              "Parent or guardian's phone"
            ) : (
              <span>
                Phone <span className="optional">(optional)</span>
              </span>
            )}
            <input
              type="tel"
              required={youth}
              autoComplete="tel"
              maxLength={25}
              pattern={PHONE}
              title="A phone number with area code, like 715-555-0100"
              value={entry.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
            <span className="hint">In case we can't reach you by email.</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={entry.newsletter_opt_in}
              onChange={(e) => set("newsletter_opt_in", e.target.checked)}
            />
            <span>
              Sign me up for Wausau Pilot & Review's free newsletter
              <span className="hint">Local news in your inbox twice a day, plus the weekly Brag Board feature.</span>
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>About the deer</legend>
          <label>
            Date harvested
            <input
              type="date"
              required
              min={season.harvest_since}
              max={todayInWausau()}
              value={entry.harvest_date}
              onChange={(e) => set("harvest_date", e.target.value)}
            />
            <span className="hint">
              Any date from {apDay(season.harvest_since)}, {season.year}, on.
            </span>
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
            <span className="hint">County is all we need. Keep your favorite spot to yourself.</span>
          </label>
          <label>
            Weapon
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
          <Choices
            label="Buck or doe?"
            name="deer_type"
            options={[
              ["buck", "Buck"],
              ["antlerless", "Doe"],
            ]}
            value={entry.deer_type}
            hint="Antlerless deer are welcome too: choose Doe for any deer without antlers."
            onChange={(deer) => setEntry((current) => ({ ...current, deer_type: deer, points: "" }))}
          />
          {entry.deer_type === "buck" && (
            <label>
              <span>
                Number of antler points <span className="optional">(optional)</span>
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
          <Choices
            label="Is this the hunter's first deer ever?"
            name="first_deer"
            options={[
              ["true", "Yes"],
              ["false", "No"],
            ]}
            value={entry.first_deer}
            onChange={(answer) => set("first_deer", answer as EntrySubmission["first_deer"])}
          />
        </fieldset>

        <fieldset>
          <legend>The story</legend>
          <label>
            <span>
              Tell us how it happened <span className="optional">(optional)</span>
            </span>
            <textarea
              rows={5}
              maxLength={STORY_LIMIT}
              value={entry.story}
              onChange={(e) => set("story", e.target.value)}
            />
            <span className="hint">
              Where were you sitting? What went through your head when the deer stepped out? Did anything go wrong, or
              perfectly right? The best telling wins the Best Story award. We may edit for length and clarity.{" "}
              {STORY_LIMIT - entry.story.length} characters left.
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>The photo</legend>
          <div className="guidelines">
            <p className="group-label">Photo guidelines</p>
            <ul>
              {PHOTO_GUIDELINES.map(([lead, text]) => (
                <li key={text}>
                  {lead && <strong>{lead} </strong>}
                  {text}
                </li>
              ))}
            </ul>
            <p className="hint">
              <a href={env.rulesUrl} target="_blank" rel="noreferrer">
                Read the full contest rules
              </a>
              .
            </p>
          </div>
          <label className="photo-picker">
            {photo ? (
              <img src={photo.preview} alt="Your deer" />
            ) : (
              <span>{preparing ? "Preparing your photo…" : "Upload your photo"}</span>
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
            One photo of the hunter with the deer is all we need.
            {photo && " Tap the photo to pick a different one."}
          </p>
          {photoError && (
            <p className="error" role="alert">
              {photoError}
              {photo && " Your earlier photo is still in place."}
            </p>
          )}
          <label>
            <span>
              Who took the photo? <span className="optional">(optional)</span>
            </span>
            <input maxLength={60} value={entry.photo_credit} onChange={(e) => set("photo_credit", e.target.value)} />
            <span className="hint">We'll give them credit.</span>
          </label>
        </fieldset>

        {youth && (
          <fieldset>
            <legend>Parent or guardian</legend>
            <p>
              Hunters 17 and under must be entered by a parent or legal guardian. We'll contact you, not the hunter, about
              this entry and any prize.
            </p>
            <label>
              Parent or guardian's full name
              <input
                required
                maxLength={100}
                pattern={NOT_BLANK}
                title="Your full name"
                autoComplete="name"
                value={entry.submitter_name}
                onChange={(e) => set("submitter_name", e.target.value)}
              />
            </label>
            <Choices
              label="Relationship to the hunter"
              name="guardian_relationship"
              options={[
                ["parent", "Parent"],
                ["legal guardian", "Legal guardian"],
              ]}
              value={entry.guardian_relationship}
              onChange={(relationship) => set("guardian_relationship", relationship)}
            />
            <Choices
              label="How should we name the hunter if we publish this entry?"
              name="first_name_only"
              options={[
                ["false", "First and last name"],
                ["true", "First name only"],
              ]}
              value={entry.first_name_only}
              hint="Either way, we publish the hunter's hometown, never a street address or school."
              onChange={(choice) => set("first_name_only", choice as EntrySubmission["first_name_only"])}
            />
            <label className="check">
              <input
                type="checkbox"
                required
                checked={entry.guardian_consent}
                onChange={(e) => set("guardian_consent", e.target.checked)}
              />
              <span>
                I am the parent or legal guardian of the hunter named in this entry, and I am submitting this entry on the
                hunter's behalf. I give Wausau Pilot & Review permission to publish the hunter's photos, name as I chose
                above, hometown and story on its website, newsletters and social media, and in promotions for the Hunting
                Brag Board. I understand that Wausau Pilot & Review will contact me, not the hunter, about this entry and
                any prize, and that I can have the entry removed at any time by emailing editor@wausaupilotandreview.com.
              </span>
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend>Before you submit</legend>
          <label className="check">
            <input type="checkbox" required checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} />
            <span>
              I have read and agree to the{" "}
              <a href={env.rulesUrl} target="_blank" rel="noreferrer">
                contest rules
              </a>{" "}
              and photo guidelines. The deer in this entry was legally harvested and registered in Wisconsin, and I have
              the right to share these photos.
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              required
              checked={publishingAllowed}
              onChange={(e) => setPublishingAllowed(e.target.checked)}
            />
            I give Wausau Pilot & Review permission to publish the photos, the hunter's name and hometown, and the story on
            its website, newsletters and social media, and in promotions for the Hunting Brag Board.
          </label>
        </fieldset>

        {!DEMO && <Turnstile key={attempt} onToken={setToken} onError={setError} />}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button-blaze" disabled={sending || preparing || (!DEMO && !token)}>
          {sending ? "Entering your deer…" : "Enter your deer"}
        </button>
      </form>
    </main>
  );
}

// One required question with a few big buttons to choose from.
function Choices({
  label,
  name,
  options,
  value,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  options: [value: string, label: string][];
  value: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  return (
    <div className="choices">
      <p id={labelId} className="group-label">
        {label}
      </p>
      <div className="choice-group" role="radiogroup" aria-labelledby={labelId}>
        {options.map(([option, text]) => (
          <label key={option} className="choice">
            <input type="radio" name={name} required checked={value === option} onChange={() => onChange(option)} />
            {text}
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

// An adult enters themselves, so the hunter is the person to contact; a youth entry names the
// parent or guardian. Youth-only answers go only with a youth entry.
function forSubmission(entry: EntrySubmission): EntrySubmission {
  const youth = entry.age_group === "youth";
  const hunter = entry.hunter_name.trim();
  return {
    ...entry,
    hunter_name: hunter,
    hometown: entry.hometown.trim(),
    email: entry.email.trim(),
    phone: entry.phone.trim(),
    photo_credit: entry.photo_credit.trim(),
    submitter_name: youth ? entry.submitter_name.trim() : hunter,
    guardian_relationship: youth ? entry.guardian_relationship : "",
    first_name_only: youth ? entry.first_name_only : "false",
    guardian_consent: youth && entry.guardian_consent,
  };
}

// The preview's answers as a board card, named the way the parent chose for a youth hunter.
function previewCard(entry: EntrySubmission): EntryFields {
  const name = entry.hunter_name.trim();
  const firstOnly = entry.age_group === "youth" && entry.first_name_only === "true";
  return {
    id: "preview",
    hunter_name: firstOnly ? name.split(/\s+/)[0] : name,
    hometown: entry.hometown.trim(),
    county: entry.county,
    harvest_date: entry.harvest_date,
    weapon: entry.weapon as Weapon,
    deer_type: entry.deer_type as DeerType,
    points: entry.deer_type === "buck" && entry.points ? Number(entry.points) : null,
    first_deer: entry.first_deer === "true",
    age_group: entry.age_group as AgeGroup,
    story: entry.story.trim() || null,
    photo_id: "",
    photo_credit: entry.photo_credit.trim() || null,
    created_at: new Date().toISOString(),
  };
}
