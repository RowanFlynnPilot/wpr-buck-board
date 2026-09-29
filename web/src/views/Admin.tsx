// Staff desk: the moderation queue and the Friday newsletter section. Open directly (not
// embedded): /wpr-buck-board/#/admin. Staff sign in with a one-time email code; accounts
// must already exist and be in `staff`.
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { EntryCard } from "../components/EntryCard";
import { editEntry, isStaff, loadModerationQueue, loadSeason, moderate } from "../data";
import { AGE_LABELS, apDate } from "../format";
import { makeShareCard } from "../shareCard";
import { shareCardUrl, supabase } from "../supabase";
import type { EntryStatus, ModerationEntry } from "../types";
import { useLoad } from "../useLoad";
import { NewsletterBlock } from "./NewsletterBlock";

const TOOLS = [
  { tool: "queue", label: "Moderation queue" },
  { tool: "newsletter", label: "Friday newsletter" },
] as const;
type Tool = (typeof TOOLS)[number]["tool"];

export function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="status">Checking sign-in…</p>;
  return <main className="admin">{session ? <StaffOnly email={session.user.email} /> : <SignIn />}</main>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (event: FormEvent, action: () => Promise<{ error: Error | null }>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await action();
    setBusy(false);
    if (error) setError(error.message);
    return !error;
  };

  const sendCode = async (event: FormEvent) => {
    const ok = await run(event, () => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
    if (ok) setCodeSent(true);
  };

  const verify = (event: FormEvent) =>
    run(event, () => supabase.auth.verifyOtp({ email, token: code, type: "email" }));

  return (
    <>
      <h1>Brag Board staff</h1>
      {codeSent ? (
        <form onSubmit={verify}>
          <label>
            The 6-digit code we sent to {email}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            Sign in
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode}>
          <label>
            Staff email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="button" disabled={busy}>
            Send me a code
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function StaffOnly({ email }: { email: string | undefined }) {
  const staff = useLoad(isStaff);
  const [tool, setTool] = useState<Tool>("queue");
  const signOut = (
    <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
      Sign out
    </button>
  );

  if (staff.status === "loading") return <p className="status">Checking staff access…</p>;
  if (staff.status === "failed") return <p className="status">Couldn't check staff access: {staff.error.message}</p>;
  if (!staff.data) {
    return (
      <p className="status">
        {email} isn't on the Brag Board staff list. {signOut}
      </p>
    );
  }

  return (
    <>
      <header className="admin-head">
        <h1>Brag Board staff</h1>
        <p>
          Signed in as {email}. {signOut}
        </p>
      </header>
      <nav className="tools" aria-label="Staff tools">
        {TOOLS.map(({ tool: t, label }) => (
          <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
            {label}
          </button>
        ))}
      </nav>
      {tool === "queue" ? <Queue /> : <NewsletterBlock />}
    </>
  );
}

const TABS: { status: EntryStatus; label: string }[] = [
  { status: "pending", label: "Waiting for review" },
  { status: "approved", label: "On the board" },
  { status: "rejected", label: "Not posted" },
];

function Queue() {
  const season = useLoad(loadSeason);
  const [tab, setTab] = useState<EntryStatus>("pending");

  if (season.status === "loading") return <p className="status">Loading…</p>;
  if (season.status === "failed") return <p className="status">Couldn't load the season: {season.error.message}</p>;

  return (
    <>
      <p className="hint">
        Post photos that follow the photo guidelines: the hunter in the picture, blood wiped away, no open wounds or
        field dressing, weapons pointed safely, no alcohol. Rejecting needs a reason; the entrant doesn't see it, but
        the next editor does.
      </p>
      <nav className="filters" aria-label="Moderation status">
        {TABS.map(({ status, label }) => (
          <button key={status} type="button" aria-pressed={tab === status} onClick={() => setTab(status)}>
            {label}
          </button>
        ))}
      </nav>
      <QueueList key={tab} seasonId={season.data.id} status={tab} />
    </>
  );
}

function QueueList({ seasonId, status }: { seasonId: string; status: EntryStatus }) {
  const queue = useLoad(() => loadModerationQueue(seasonId, status));

  if (queue.status === "loading") return <p className="status">Loading entries…</p>;
  if (queue.status === "failed") return <p className="status">Couldn't load entries: {queue.error.message}</p>;
  if (queue.data.length === 0) return <p className="empty">Nothing here.</p>;

  return (
    <>
      {status === "approved" && <RemakeAll entries={queue.data} onDone={queue.reload} />}
      <div className="entry-grid">
        {queue.data.map((entry) => (
          <ModerationItem key={entry.id} entry={entry} onDone={queue.reload} />
        ))}
      </div>
    </>
  );
}

// Every card names the presenting sponsor, so when that changes, every card needs redrawing.
function RemakeAll({ entries, onDone }: { entries: ModerationEntry[]; onDone: () => void }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remakeAll = async () => {
    setBusy(true);
    let failed = 0;
    for (const [i, entry] of entries.entries()) {
      setProgress(`Remaking share images: ${i + 1} of ${entries.length}…`);
      await makeShareCard(entry.id).catch((err: Error) => {
        failed += 1;
        console.error(`Share image for ${entry.id}:`, err);
      });
    }
    setProgress(
      failed
        ? `Remade ${entries.length - failed} of ${entries.length}. ${failed} didn't save; remake those below.`
        : `Remade all ${entries.length} share images.`,
    );
    setBusy(false);
    onDone();
  };

  return (
    <div className="remake-all">
      <p className="hint">
        Each share image names the presenting sponsor. After the sponsor is added or changes, remake them all.
      </p>
      <button type="button" className="button" disabled={busy} onClick={remakeAll}>
        Remake all share images
      </button>
      {progress && <p aria-live="polite">{progress}</p>}
    </div>
  );
}

function ModerationItem({ entry, onDone }: { entry: ModerationEntry; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contact = entry.entry_private;
  const lastEdit = entry.entry_edits.map((edit) => edit.edited_at).sort().at(-1);
  const youth = entry.age_group === "youth";
  // A parent can publish a youth hunter by first name only; the name as entered is kept for staff.
  const enteredAs =
    contact.hunter_full_name && contact.hunter_full_name !== entry.hunter_name ? contact.hunter_full_name : null;

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setError(null);
    try {
      await moderate(entry.id, decision, decision === "rejected" ? reason : null);
      // The deer is posted either way; if its card fails, the "On the board" tab offers to make it.
      if (decision === "approved") await makeShareCard(entry.id).catch((err) => console.error("Share image:", err));
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="moderation-item">
      <EntryCard entry={entry} />
      <p className="hint">
        {AGE_LABELS[entry.age_group]}. Entered by {contact.submitter_name}
        {youth && contact.guardian_relationship && `, the hunter's ${contact.guardian_relationship},`} on{" "}
        {apDate(entry.created_at)}: {[contact.email, contact.phone].filter(Boolean).join(", ")}.
        {enteredAs && ` Full name: ${enteredAs}.`}
        {contact.rejection_reason && ` Not posted: ${contact.rejection_reason}`}
        {lastEdit && ` Edited ${apDate(lastEdit)}.`}
      </p>
      {entry.status === "approved" && <ShareImage entry={entry} onMade={onDone} />}
      {editing ? (
        <EditForm
          entry={entry}
          onSaved={() => {
            setEditing(false);
            onDone();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : rejecting ? (
        <div className="actions">
          <label>
            Reason
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="button" disabled={busy || !reason.trim()} onClick={() => decide("rejected")}>
            {entry.status === "approved" ? "Take down" : "Don't post"}
          </button>
          <button type="button" className="link-button" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="actions">
          {entry.status !== "approved" && (
            <button type="button" className="button" disabled={busy} onClick={() => decide("approved")}>
              Post it
            </button>
          )}
          {entry.status !== "rejected" && (
            <button type="button" className="button" disabled={busy} onClick={() => setRejecting(true)}>
              {entry.status === "approved" ? "Take down…" : "Don't post…"}
            </button>
          )}
          <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(true)}>
            Edit…
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// The card a share link previews with. Posting a deer makes it; this remakes it, or makes it
// if posting couldn't.
function ShareImage({ entry, onMade }: { entry: ModerationEntry; onMade: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      await makeShareCard(entry.id);
      onMade();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="share-image">
      {entry.share_card ? (
        <a href={shareCardUrl(entry.share_card)} target="_blank" rel="noreferrer">
          <img src={shareCardUrl(entry.share_card)} alt="This deer's share image" width="240" height="126" loading="lazy" />
        </a>
      ) : (
        <p className="hint">No share image yet, so a shared link shows the photo alone.</p>
      )}
      <button type="button" className="link-button" disabled={busy} onClick={make}>
        {busy ? "Making the share image…" : entry.share_card ? "Remake share image" : "Make share image"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Fix the words on an entry: a typo, or a youth hunter entered by full name. Anything that
// decides awards stays as the entrant gave it; the original words go in the edit log.
function EditForm({ entry, onSaved, onCancel }: { entry: ModerationEntry; onSaved: () => void; onCancel: () => void }) {
  const [fields, setFields] = useState({ hunter_name: entry.hunter_name, hometown: entry.hometown, story: entry.story ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [field]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await editEntry(entry.id, fields);
      // A posted deer's card shows its name and hometown; redraw it with the new words.
      if (entry.status === "approved") await makeShareCard(entry.id).catch((err) => console.error("Share image:", err));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="edit-entry" onSubmit={save}>
      <label>
        Name on the board
        <input required maxLength={60} value={fields.hunter_name} onChange={(e) => set("hunter_name", e.target.value)} />
      </label>
      <label>
        Hometown
        <input required maxLength={60} value={fields.hometown} onChange={(e) => set("hometown", e.target.value)} />
      </label>
      <label>
        Story
        <textarea rows={4} maxLength={1200} value={fields.story} onChange={(e) => set("story", e.target.value)} />
      </label>
      <p className="hint">
        Only these words change; the weapon, deer, age and dates stay as entered. Adding or clearing the story puts the
        deer in or out of the running for Best Story.
      </p>
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          Save
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
