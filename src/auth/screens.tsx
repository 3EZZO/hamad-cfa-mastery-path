// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { CircleAlert, Cloud, LogIn, LogOut, ShieldCheck, Target } from "lucide-react";
import { type FormEvent, useState } from "react";
import program from "../data/program.json";

export function CloudLoadingScreen() {
  return (
    <main className="access-shell">
      <section className="access-card access-card-loading" aria-live="polite">
        <span className="access-mark"><Cloud size={28} /></span>
        <p className="eyebrow">Hamad CFA Mastery</p>
        <h1>Loading the latest progress</h1>
        <p>Connecting this device to Hamad's shared tracker...</p>
        <span className="access-loader" aria-hidden="true" />
      </section>
    </main>
  );
}


export function CloudConfigurationScreen({ missingKeys }: { missingKeys: string[] }) {
  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="access-mark"><Cloud size={28} /></span>
        <p className="eyebrow">One-time cloud setup</p>
        <h1>Connect the mastery tracker to Firebase</h1>
        <p>
          Live sync is built into this tracker. Add the Firebase web configuration
          before deploying so progress can load securely on every device.
        </p>
        <div className="access-notice">
          <strong>Configuration still needed</strong>
          <span>{missingKeys.join(", ")}</span>
        </div>
        <p className="access-footnote">
          Follow <strong>DEPLOY_GITHUB_PAGES.md</strong>. No payment method or
          private server key is required.
        </p>
      </section>
    </main>
  );
}


export function CloudAccessDeniedScreen({
  email,
  error,
  onSignOut,
}: {
  email: string | null;
  error: string | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="access-mark access-mark-warning"><ShieldCheck size={28} /></span>
        <p className="eyebrow">Private mastery workspace</p>
        <h1>This account has not been approved</h1>
        <p>{error ?? "Only Hamad and Mohamed can open this shared tracker."}</p>
        {email && <div className="access-notice"><strong>Signed in as</strong><span>{email}</span></div>}
        <button className="button button-primary" type="button" onClick={() => void onSignOut()}>
          <LogOut size={16} /> Use another account
        </button>
      </section>
    </main>
  );
}


export function SignInScreen({
  busy,
  error,
  onGoogle,
  onPassword,
}: {
  busy: boolean;
  error: string | null;
  onGoogle: () => Promise<void>;
  onPassword: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onPassword(email.trim(), password);
  };

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-brand">
          <span className="access-mark"><Target size={27} /></span>
          <div>
            <strong>HAMAD CFA MASTERY</strong>
            <span>Level I Mastery Path</span>
          </div>
        </div>
        <p className="eyebrow">Private shared tracker</p>
        <h1>Welcome back</h1>
        <p>
          Sign in as Hamad or Mohamed. The latest progress will appear
          automatically and stay synchronized across devices.
        </p>

        <button
          className="button button-google"
          disabled={busy}
          type="button"
          onClick={() => void onGoogle()}
        >
          <span className="google-mark" aria-hidden="true">G</span>
          Continue with Google
        </button>

        <div className="access-divider"><span>or use your tracker account</span></div>

        <form className="access-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={busy}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              disabled={busy}
              minLength={6}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="button button-primary" disabled={busy} type="submit">
            <LogIn size={16} /> {busy ? "Signing in..." : "Sign in securely"}
          </button>
        </form>

        {error && <div className="access-error" role="alert"><CircleAlert size={17} /> {error}</div>}
        <p className="access-footnote">
          Access is limited to the tutor and student accounts approved for this
          program. There is no public registration.
        </p>
      </section>
    </main>
  );
}
