// Staff desk: the moderation queue and the Friday newsletter section. Open directly (not
// embedded): /wpr-buck-board/#/admin. Staff sign in with a one-time email code; accounts
// must already exist and be in `staff`.
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { EntryCard } from "../components/EntryCard";
import { isStaff, loadModerationQueue, loadSeason, moderate } from "../data";
import { AGE_LABELS, apDate } from "../format";
import { supabase } from "../supabase";
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
        Post photos of field-dressed deer with minimal blood. Hunters 17 and under appear by first name only. Rejecting
        needs a reason; the entrant doesn't see it, but the next editor does.
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
    <div className="entry-grid">
      {queue.data.map((entry) => (
        <ModerationItem key={entry.id} entry={entry} onDone={queue.reload} />
      ))}
    </div>
  );
}

function ModerationItem({ entry, onDone }: { entry: ModerationEntry; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contact = entry.entry_private;

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setError(null);
    try {
      await moderate(entry.id, decision, decision === "rejected" ? reason : null);
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
        {AGE_LABELS[entry.age_group]}. Entered by {contact.submitter_name} ({contact.email}) on {apDate(entry.created_at)}.
        {contact.rejection_reason && ` Not posted: ${contact.rejection_reason}`}
      </p>
      {rejecting ? (
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
