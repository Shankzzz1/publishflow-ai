import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "AUTHOR" | "OPERATIONS" | "ADMIN";

type User = {

  id: string;

  name: string;

  email: string;

  role: Role;

};

type ManuscriptStatus =

  | "SUBMITTED"

  | "UNDER_REVIEW"

  | "CHANGES_REQUESTED"

  | "APPROVED"

  | "IN_PRODUCTION"

  | "QUALITY_CHECK"

  | "PUBLISHED";

type Manuscript = {

  id: string;

  title: string;

  authorName: string;

  genre: string;

  status: ManuscriptStatus;

  createdAt: string;

};

type ManuscriptDetail = Manuscript & {
  content?: string;
  submissionNote?: string;
  history: Array<{
    fromStatus?: ManuscriptStatus;
    toStatus: ManuscriptStatus;
    changedBy?: string;
    createdAt: string;
  }>;
  reviewComments: Array<{
    comment: string;
    createdBy?: string;
    createdAt: string;
  }>;
  revisions: Array<{
    version: number;
    title: string;
    genre: string;
    content: string;
    submissionNote?: string;
    submittedAt: string;
  }>;
};

type Stats = {

  total: number;

  submitted: number;

  underReview: number;

  changesRequested: number;

  approved: number;

  published: number;

};

const statusLabels: Record<ManuscriptStatus, string> = {

  SUBMITTED: "Submitted",

  UNDER_REVIEW: "Under review",

  CHANGES_REQUESTED: "Changes requested",

  APPROVED: "Approved",

  IN_PRODUCTION: "In production",

  QUALITY_CHECK: "Quality check",

  PUBLISHED: "Published",

};

const statuses = Object.keys(statusLabels) as ManuscriptStatus[];

async function api<T>(path: string, init?: RequestInit): Promise<T> {

  const token = sessionStorage.getItem("publishflow_token");

  const response = await fetch(path, {

    ...init,

    headers: {

      "Content-Type": "application/json",

      ...(token ? { Authorization: `Bearer ${token}` } : {}),

      ...init?.headers,

    },

  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {

    throw new Error(data.error || "Something went wrong");

  }

  return data as T;

}

export default function App() {

  const [user, setUser] = useState<User | null>(null);

  const [checkingSession, setCheckingSession] = useState(true);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [authName, setAuthName] = useState("");

  const [authEmail, setAuthEmail] = useState("");

  const [authPassword, setAuthPassword] = useState("");

  const [authBusy, setAuthBusy] = useState(false);

  const [authError, setAuthError] = useState("");

  const [authMessage, setAuthMessage] = useState("");

  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);

  const [stats, setStats] = useState<Stats>({

    total: 0,

    submitted: 0,

    underReview: 0,

    changesRequested: 0,

    approved: 0,

    published: 0,

  });

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");

  const [authorName, setAuthorName] = useState("");

  const [genre, setGenre] = useState("Fiction");

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");

  const [apiOnline, setApiOnline] = useState(false);
  const [selectedManuscript, setSelectedManuscript] = useState<ManuscriptDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function load() {

    try {

      const [manuscriptData, statsData] = await Promise.all([

        api<{ manuscripts: Manuscript[] }>("/api/v1/manuscripts"),

        api<{ stats: Stats }>("/api/v1/dashboard/stats"),

      ]);

      setManuscripts(manuscriptData.manuscripts);

      setStats(statsData.stats);

      setApiOnline(true);

      setError("");

    } catch (e) {

      setApiOnline(false);

      setError(e instanceof Error ? e.message : "Unable to connect to API");

    }

  }

  useEffect(() => {

    let active = true;

    async function restoreSession() {

      const token = sessionStorage.getItem("publishflow_token");

      if (!token) {

        if (active) setCheckingSession(false);

        return;

      }

      try {

        const result = await api<{ user: User }>("/api/v1/auth/me");

        if (active) {

          setUser(result.user);

          setAuthorName(result.user.name);

          await load();

        }

      } catch {

        sessionStorage.removeItem("publishflow_token");

      } finally {

        if (active) setCheckingSession(false);

      }

    }

    void restoreSession();

    return () => {

      active = false;

    };

  }, []);

  async function submitAuth(event: FormEvent) {

    event.preventDefault();

    setAuthBusy(true);

    setAuthError("");

    setAuthMessage("");

    try {

      if (authMode === "register") {

        await api("/api/v1/auth/register", {

          method: "POST",

          body: JSON.stringify({

            name: authName,

            email: authEmail,

            password: authPassword,

          }),

        });

        setAuthMode("login");

        setAuthPassword("");

        setAuthMessage("Account created. Please sign in.");

      } else {

        const result = await api<{ token: string; user: User }>(

          "/api/v1/auth/login",

          {

            method: "POST",

            body: JSON.stringify({

              email: authEmail,

              password: authPassword,

            }),

          },

        );

        sessionStorage.setItem("publishflow_token", result.token);

        setUser(result.user);

        setAuthorName(result.user.name);

        setAuthPassword("");

        await load();

      }

    } catch (e) {

      setAuthError(e instanceof Error ? e.message : "Authentication failed");

    } finally {

      setAuthBusy(false);

    }

  }

  function logout() {

    sessionStorage.removeItem("publishflow_token");

    setUser(null);

    setManuscripts([]);

    setStats({

      total: 0,

      submitted: 0,

      underReview: 0,

      changesRequested: 0,

      approved: 0,

      published: 0,

    });

    setShowForm(false);

    setError("");

    setAuthError("");

    setAuthMessage("");

    setAuthPassword("");

    setAuthMode("login");

  }

  const filtered = useMemo(

    () =>

      manuscripts.filter((item) => {

        const query = search.toLowerCase();

        const matchesSearch =

          item.title.toLowerCase().includes(query) ||

          item.authorName.toLowerCase().includes(query);

        return (

          matchesSearch &&

          (statusFilter === "ALL" || item.status === statusFilter)

        );

      }),

    [manuscripts, search, statusFilter],

  );

  async function createManuscript(event: FormEvent) {

    event.preventDefault();

    setBusy(true);

    setError("");

    try {

      await api("/api/v1/manuscripts", {

        method: "POST",

        body: JSON.stringify({ title, authorName, genre }),

      });

      setTitle("");

      setAuthorName(user?.name ?? "");

      setGenre("Fiction");

      setShowForm(false);

      await load();

    } catch (e) {

      setError(e instanceof Error ? e.message : "Could not create manuscript");

    } finally {

      setBusy(false);

    }

  }

  async function openManuscript(id: string) {
    setDetailBusy(true);
    setDetailError("");
    setSelectedManuscript(null);
    try {
      const result = await api<{ manuscript: ManuscriptDetail }>(`/api/v1/manuscripts/${id}`);
      setSelectedManuscript(result.manuscript);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Could not load manuscript details");
    } finally {
      setDetailBusy(false);
    }
  }

  async function updateStatus(id: string, status: ManuscriptStatus) {

    try {

      await api(`/api/v1/manuscripts/${id}/status`, {

        method: "PATCH",

        body: JSON.stringify({ status }),

      });

      await load();

    } catch (e) {

      setError(e instanceof Error ? e.message : "Could not update status");

    }

  }

  if (checkingSession) {

    return (

      <div className="auth-page">

        <div className="auth-card">

          <div className="brand">

            <span className="brand-mark">P</span>

            <span>

              publishflow<span className="brand-ai"> AI</span>

            </span>

          </div>

          <p>Checking your session...</p>

        </div>

      </div>

    );

  }

  if (!user) {

    return (

      <div className="auth-page">

        <form className="auth-card" onSubmit={submitAuth}>

          <div className="brand auth-brand">

            <span className="brand-mark">P</span>

            <span>

              publishflow<span className="brand-ai"> AI</span>

            </span>

          </div>

          <div className="auth-heading">

            <div className="eyebrow">PUBLISHING OPERATIONS</div>

            <h1>

              {authMode === "login" ? "Welcome back" : "Create your account"}

            </h1>

            <p>

              {authMode === "login"

                ? "Sign in to manage your publishing workspace."

                : "Get started with your publishing workspace."}

            </p>

          </div>

          {authError && <div className="error-banner">{authError}</div>}

          {authMessage && <div className="success-banner">{authMessage}</div>}

          {authMode === "register" && (

            <label className="auth-label">

              Full name

              <input

                required

                minLength={2}

                maxLength={100}

                autoComplete="name"

                value={authName}

                onChange={(e) => setAuthName(e.target.value)}

                placeholder="Your name"

              />

            </label>

          )}

          <label className="auth-label">

            Email address

            <input

              required

              type="email"

              autoComplete="email"

              value={authEmail}

              onChange={(e) => setAuthEmail(e.target.value)}

              placeholder="you@example.com"

            />

          </label>

          <label className="auth-label">

            Password

            <input

              required

              type="password"

              minLength={authMode === "register" ? 12 : 1}

              maxLength={72}

              autoComplete={

                authMode === "login" ? "current-password" : "new-password"

              }

              value={authPassword}

              onChange={(e) => setAuthPassword(e.target.value)}

              placeholder={

                authMode === "register"

                  ? "At least 12 characters"

                  : "Enter your password"

              }

            />

          </label>

          <button className="primary-button auth-submit" disabled={authBusy}>

            {authBusy

              ? "Please wait..."

              : authMode === "login"

                ? "Sign in"

                : "Create account"}

          </button>

          <p className="auth-switch">

            {authMode === "login"

              ? "Don't have an account?"

              : "Already have an account?"}{" "}

            <button

              type="button"

              onClick={() => {

                setAuthMode(authMode === "login" ? "register" : "login");

                setAuthError("");

                setAuthMessage("");

              }}

            >

              {authMode === "login" ? "Register" : "Sign in"}

            </button>

          </p>

        </form>

      </div>

    );

  }

  return (

    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand">

          <span className="brand-mark">P</span>

          <span>

            publishflow<span className="brand-ai"> AI</span>

          </span>

        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav>

          <a className="nav-item active" href="#overview">

            <span>▦</span> Overview

          </a>

          <a className="nav-item" href="#manuscripts">

            <span>▤</span> Manuscripts{" "}

            <span className="nav-count">{stats.total}</span>

          </a>

          <a className="nav-item" href="#production">

            <span>◷</span> Production

          </a>

          <a className="nav-item" href="#automation">

            <span>⌘</span> Automations <span className="soon">SOON</span>

          </a>

          <a className="nav-item" href="#integrations">

            <span>⚙</span> Integrations <span className="soon">SOON</span>

          </a>

        </nav>

        <div className="sidebar-bottom">

          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>

          <div className="account-details">

            <strong>{user.name}</strong>

            <small>{user.role}</small>

          </div>

          <button

            type="button"

            className="logout-button"

            onClick={logout}

            title="Sign out"

          >

            Logout

          </button>

        </div>

      </aside>

      <main className="main">

        <header className="topbar">

          <div className="breadcrumbs">

            Workspace <span>/</span> Overview

          </div>

          <div className="topbar-right">

            <span className={`connection ${apiOnline ? "online" : ""}`}>

              <i />

              {apiOnline ? "API connected" : "API disconnected"}

            </span>

            <div className="top-avatar">

              {user.name.slice(0, 2).toUpperCase()}

            </div>

          </div>

        </header>

        <section className="page-content" id="overview">

          <div className="welcome-row">

            <div>

              <div className="eyebrow">PUBLISHING OPERATIONS</div>

              <h1>Good work starts here.</h1>

              <p>

                Manage manuscripts, track production, and keep every book

                moving.

              </p>

            </div>

            <button

              className="primary-button"

              onClick={() => {

                setAuthorName(user.name);

                setShowForm(!showForm);

              }}

            >

              + New manuscript

            </button>

          </div>

          {error && (

            <div className="error-banner">

              <span>{error}</span>

              <button onClick={() => void load()}>Retry</button>

            </div>

          )}

          {showForm && (

            <form className="create-form" onSubmit={createManuscript}>

              <div className="form-heading">

                <div>

                  <h2>Add a manuscript</h2>

                  <p>Create a submission in your publishing pipeline.</p>

                </div>

                <button

                  type="button"

                  className="icon-button"

                  onClick={() => setShowForm(false)}

                >

                  ×

                </button>

              </div>

              <div className="form-grid">

                <label>

                  Book title

                  <input

                    required

                    value={title}

                    onChange={(e) => setTitle(e.target.value)}

                    placeholder="e.g. The Quiet Horizon"

                  />

                </label>

                {user.role !== "AUTHOR" && (

                  <label>

                    Author name

                    <input

                      required

                      value={authorName}

                      onChange={(e) => setAuthorName(e.target.value)}

                      placeholder="e.g. A. Sharma"

                    />

                  </label>

                )}

                <label>

                  Genre

                  <select

                    value={genre}

                    onChange={(e) => setGenre(e.target.value)}

                  >

                    <option>Fiction</option>

                    <option>Non-fiction</option>

                    <option>Business</option>

                    <option>Self-help</option>

                    <option>Children's</option>

                    <option>Poetry</option>

                    <option>Academic</option>

                  </select>

                </label>

              </div>

              <div className="form-actions">

                <button

                  type="button"

                  className="secondary-button"

                  onClick={() => setShowForm(false)}

                >

                  Cancel

                </button>

                <button className="primary-button" disabled={busy}>

                  {busy ? "Saving..." : "Create manuscript"}

                </button>

              </div>

            </form>

          )}

          <div className="stats-grid">

            <Stat

              label="Total manuscripts"

              value={stats.total}

              detail="Across all stages"

              icon="▤"

            />

            <Stat

              label="Awaiting review"

              value={stats.submitted}

              detail="Needs an initial review"

              icon="◷"

            />

            <Stat

              label="Under review"

              value={stats.underReview}

              detail="Currently being evaluated"

              icon="◷"

            />

            <Stat

              label="Published"

              value={stats.published}

              detail="Completed titles"

              icon="✓"

            />

          </div>

          <section className="panel" id="manuscripts">

            <div className="panel-header">

              <div>

                <h2>Manuscript pipeline</h2>

                <p>Track every submission from arrival to publication.</p>

              </div>

              <button className="secondary-button" onClick={() => void load()}>

                ↻ Refresh

              </button>

            </div>

            <div className="toolbar">

              <div className="search-box">

                <span>⌕</span>

                <input

                  aria-label="Search manuscripts"

                  placeholder="Search title or author..."

                  value={search}

                  onChange={(e) => setSearch(e.target.value)}

                />

              </div>

              <select

                aria-label="Filter by status"

                value={statusFilter}

                onChange={(e) => setStatusFilter(e.target.value)}

              >

                <option value="ALL">All statuses</option>

                {statuses.map((s) => (

                  <option key={s} value={s}>

                    {statusLabels[s]}

                  </option>

                ))}

              </select>

            </div>

            <div className="table-wrap">

              <table>

                <thead>

                  <tr>

                    <th>MANUSCRIPT</th>

                    <th>AUTHOR</th>

                    <th>STATUS</th>

                    <th>SUBMITTED</th>

                    <th>UPDATE STATUS</th>

                  </tr>

                </thead>

                <tbody>

                  {filtered.map((item) => (

                    <tr key={item.id}>

                      <td>

                        <div className="book-title">

                          <span className="book-icon">▤</span>

                          <div>

                            <strong>{item.title}</strong>

                            <small>{item.genre}</small>

                          </div>

                        </div>

                      </td>

                      <td>{item.authorName}</td>

                      <td>

                        <span

                          className={`status status-${item.status.toLowerCase()}`}

                        >

                          <i />

                          {statusLabels[item.status]}

                        </span>

                      </td>

                      <td>

                        {new Date(item.createdAt).toLocaleDateString(

                          undefined,

                          {

                            month: "short",

                            day: "numeric",

                            year: "numeric",

                          },

                        )}

                      </td>

                      <td>

                        {user.role === "AUTHOR" ? (

                          <span className="status">

                            {statusLabels[item.status]}

                          </span>

                        ) : (

                          <select

                            aria-label={`Change status for ${item.title}`}

                            value={item.status}

                            onChange={(e) =>

                              void updateStatus(

                                item.id,

                                e.target.value as ManuscriptStatus,

                              )

                            }

                          >

                            {statuses.map((s) => (

                              <option key={s} value={s}>

                                {statusLabels[s]}

                              </option>

                            ))}

                          </select>

                        )}

                      </td>

                    </tr>

                  ))}

                  {filtered.length === 0 && (

                    <tr>

                      <td colSpan={5} className="empty-state">

                        {apiOnline

                          ? "No manuscripts match your search."

                          : "Connect the API and database to load manuscripts."}

                      </td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

            <div className="panel-footer">

              <span>

                Showing <strong>{filtered.length}</strong> of{" "}

                <strong>{manuscripts.length}</strong> manuscripts

              </span>

              <span className="footer-note">

                PublishFlow AI · Development preview

              </span>

            </div>

          </section>

          {(detailBusy || detailError || selectedManuscript) && (
            <section className="panel manuscript-detail-panel" aria-live="polite">
              <div className="panel-header">
                <div>
                  <div className="eyebrow">MANUSCRIPT DETAILS</div>
                  <h2>{selectedManuscript?.title ?? (detailBusy ? "Loading manuscript..." : "Unable to load manuscript")}</h2>
                  {selectedManuscript && (
                    <p>{selectedManuscript.authorName} · {selectedManuscript.genre}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSelectedManuscript(null);
                    setDetailError("");
                  }}
                >
                  Close
                </button>
              </div>

              {detailBusy && <p className="detail-empty">Loading manuscript details...</p>}
              {detailError && <div className="error-banner">{detailError}</div>}

              {selectedManuscript && (
                <div className="manuscript-detail-content">
                  <div className="detail-meta">
                    <span className={`status status-${selectedManuscript.status.toLowerCase()}`}>
                      <i />{statusLabels[selectedManuscript.status]}
                    </span>
                    <span>Submitted {new Date(selectedManuscript.createdAt).toLocaleDateString()}</span>
                  </div>

                  <section className="detail-section">
                    <h3>Manuscript content</h3>
                    <div className="manuscript-text">
                      {selectedManuscript.content?.trim() || "No manuscript content was saved for this submission."}
                    </div>
                  </section>

                  <div className="detail-columns">
                    <section className="detail-section">
                      <h3>Status history</h3>
                      {selectedManuscript.history?.length ? (
                        <ol className="detail-timeline">
                          {selectedManuscript.history.map((entry, index) => (
                            <li key={`${entry.createdAt}-${index}`}>
                              <strong>
                                {entry.fromStatus ? `${statusLabels[entry.fromStatus]} → ` : ""}
                                {statusLabels[entry.toStatus]}
                              </strong>
                              <small>{new Date(entry.createdAt).toLocaleString()}</small>
                            </li>
                          ))}
                        </ol>
                      ) : <p className="detail-empty">No status history available.</p>}
                    </section>

                    <section className="detail-section">
                      <h3>Review feedback</h3>
                      {selectedManuscript.reviewComments?.length ? (
                        <div className="detail-list">
                          {selectedManuscript.reviewComments.map((review, index) => (
                            <article className="detail-entry" key={`${review.createdAt}-${index}`}>
                              <p>{review.comment}</p>
                              <small>{new Date(review.createdAt).toLocaleString()}</small>
                            </article>
                          ))}
                        </div>
                      ) : <p className="detail-empty">No review comments yet.</p>}
                    </section>
                  </div>

                  <section className="detail-section">
                    <h3>Revision history</h3>
                    {selectedManuscript.revisions?.length ? (
                      <div className="revision-list">
                        {[...selectedManuscript.revisions].sort((a, b) => b.version - a.version).map((revision) => (
                          <article className="revision-card" key={revision.version}>
                            <div>
                              <strong>Version {revision.version}: {revision.title}</strong>
                              <small>{new Date(revision.submittedAt).toLocaleString()}</small>
                            </div>
                            {revision.submissionNote && <p>{revision.submissionNote}</p>}
                            <details>
                              <summary>View version content</summary>
                              <div className="manuscript-text">{revision.content || "No content saved for this version."}</div>
                            </details>
                          </article>
                        ))}
                      </div>
                    ) : <p className="detail-empty">No revisions recorded.</p>}
                  </section>
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">

            Built for better publishing operations · PublishFlow AI

          </footer>

        </section>

      </main>

    </div>

  );

}

function Stat({

  label,

  value,

  detail,

  icon,

}: {

  label: string;

  value: number;

  detail: string;

  icon: string;

}) {

  return (

    <div className="stat-card">

      <div className="stat-top">

        <span>{label}</span>

        <span className="stat-icon">{icon}</span>

      </div>

      <div className="stat-value">{value.toLocaleString()}</div>

      <div className="stat-detail">{detail}</div>

    </div>

  );

}
