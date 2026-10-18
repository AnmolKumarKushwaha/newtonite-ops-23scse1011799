'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowUpRight, ArrowRight, Plus, Search, SlidersHorizontal, LayoutDashboard, Inbox, Users, ShieldCheck, ChevronDown, ChevronLeft, ChevronRight, Clock, Check, CheckCircle2, AlertCircle, Activity, X, LogOut, RefreshCw, MessageSquare, ArrowLeft, Command, Flag, UserRound, Loader2, Layers, LockKeyhole } from 'lucide-react';
const STATES = ['Open', 'In progress', 'Review', 'Resolved', 'Closed'];
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
const TYPES = ['Incident', 'Customer issue', 'Payment', 'Compliance', 'Task'];
type Item = { id: number, title: string, description: string, status: string, priority: string, type: string, team_id: string, assignee: string | null, assignee_name?: string, version: number, due: string | null, updated_at: string };
type Member = { id: string, name: string, role: string };
type Event = { id: number, actor_name: string, kind: string, body: string, created_at: string, version: number };
type Team = { id: string, name: string, role: string };
class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
async function api(path: string, method = 'GET', data?: unknown, key?: string) { const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }); const v: any = await r.json(); if (!r.ok) throw new ApiError(v.error || 'Request failed', r.status); return v; }
const initials = (name: string) => name.split(' ').slice(0, 2).map(x => x[0]).join('');
const date = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
function Status({ value }: { value: string }) {  
return <span className={'badge status-' + value.toLowerCase().replaceAll(' ', '-')}>
    <span className="dot" />{value}</span>
}
function Priority({ value }: { value: string }) {  
return <span className={'priority p-' + value.toLowerCase()}>
    <span>{value === 'Urgent' ? '▰' : value === 'High' ? '▥' : value === 'Normal' ? '▤' : '▱'}</span>{value}</span>
}
export default function Workspace() {
  const [user, setUser] = useState<Member | null>(null), [teams, setTeams] = useState<Team[]>([]), [team, setTeam] = useState(''), [boot, setBoot] = useState(true), [loginEmail, setLoginEmail] = useState('anmol@relay.demo'), [password, setPassword] = useState('RelayDemo2026!');
  const [view, setView] = useState('all'), [query, setQuery] = useState(''), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [priority, setPriority] = useState(''), [cursor, setCursor] = useState<number | null>(null), [past, setPast] = useState<(number | null)[]>([]), [next, setNext] = useState<number | null>(null), [items, setItems] = useState<Item[]>([]), [stats, setStats] = useState<any>({}), [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState(''), [selected, setSelected] = useState<Item | null>(null), [events, setEvents] = useState<Event[]>([]), [eventCursor, setEventCursor] = useState<number | null>(null), [modal, setModal] = useState(false), [edit, setEdit] = useState(false), [tab, setTab] = useState('activity'), [comment, setComment] = useState(''), [conflict, setConflict] = useState(false), [people, setPeople] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', type: 'Task', priority: 'Normal', due: '', assignee: '' }); const requestKey = useRef(''), listSequence = useRef(0), selectionSequence = useRef(0); const activeTeam = teams.find(t => t.id === team), canWrite = activeTeam?.role !== 'Viewer', lead = activeTeam?.role === 'Lead';
  const notify = (s: string) => { setToast(s); setTimeout(() => setToast(''), 3500) };
  const session = async () => { const m = await api('me'); setUser(m.user); setTeams(m.teams); setTeam(m.teams[0]?.id || ''); };
  useEffect(() => { session().catch(() => { }).finally(() => setBoot(false)) }, []);
  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t) }, [query]);
  useEffect(() => { setCursor(null); setPast([]) }, [team, view, search, status, priority]);
  const load = useCallback(async () => { if (!user || !team) return; const seq = ++listSequence.current; setLoading(true); try { const p = new URLSearchParams({ team, view, q: search, status, priority }); if (cursor) p.set('cursor', String(cursor)); const result = await api('items?' + p); if (seq === listSequence.current) { setItems(result.items); setStats(result.stats); setNext(result.nextCursor) } } catch (e: any) { if (seq === listSequence.current) setError(e.message) } finally { if (seq === listSequence.current) setLoading(false) } }, [user, team, view, search, status, priority, cursor]);
  useEffect(() => { load() }, [load]);
  useEffect(() => { if (team) api('members?team=' + team).then(setMembers).catch(e => setError(e.message)); setSelected(null); selectionSequence.current++; }, [team]);
  useEffect(() => { if (!user) return; const interval = setInterval(() => load(), 30000); return () => clearInterval(interval) }, [user, load]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModal(false); setSelected(null); setPeople(false); selectionSequence.current++; } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, []);
  async function login(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await api('login', 'POST', { email: loginEmail, password }); await session(); } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  async function openItem(id: number) { const seq = ++selectionSequence.current; setError(''); setConflict(false); setEdit(false); setTab('activity'); setComment(''); try { const [it, history] = await Promise.all([api('items/' + id), api('items/' + id + '/activity')]); if (seq === selectionSequence.current) { setSelected(it); setEvents(history.events); setEventCursor(history.nextCursor); } } catch (e: any) { setError(e.message) } }
  async function mutate(action: string, data: any) { if (!selected) return; setBusy(true); setError(''); try { const it = await api('items/' + selected.id + (action ? '/' + action : ''), action ? 'POST' : 'PATCH', { ...data, version: selected.version }); setSelected(it); const history = await api('items/' + it.id + '/activity'); setEvents(history.events); setEventCursor(history.nextCursor); setEdit(false); setConflict(false); notify('Work item updated'); await load(); } catch (e: any) { setError(e.message); if (e.status === 409) setConflict(true) } finally { setBusy(false) } }
  const startCreate = () => { requestKey.current = crypto.randomUUID(); setDraft({ title: '', description: '', type: 'Task', priority: 'Normal', due: '', assignee: '' }); setModal(true); setError('') };
  async function create(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const it = await api('items', 'POST', { ...draft, team_id: team }, requestKey.current); setModal(false); notify('Work item created'); await load(); await openItem(it.id) } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  async function addComment(e: React.FormEvent) { e.preventDefault(); if (!selected) return; setBusy(true); setError(''); try { await api('items/' + selected.id + '/comments', 'POST', { body: comment }); setComment(''); const h = await api('items/' + selected.id + '/activity'); setEvents(h.events); setEventCursor(h.nextCursor); notify('Comment added') } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  const nav = (v: string) => { setView(v); setPeople(false); setStatus(''); setPriority(''); setQuery(''); setCursor(null); setPast([]) };
  if (boot) return <div className="boot">
    <div className="brand-icon">
      <Layers size={25} />
    </div>
    <p>Opening your workspace…</p>
  </div>;
  if (!user) return <main className="login">
    <section className="login-story">
      <div className="brand">
        <div className="brand-icon">
          <Layers />
        </div>relay<span className="brand-period">.</span>
      </div>
      <div>
        <span className="eyebrow">OPERATIONS, IN SYNC</span>
        <h1>Every issue.<br />A clear way<br />
          <em>forward.</em>
        </h1>
        <p>A shared home for the work that keeps your company moving. Clear ownership, thoughtful approvals, and a history you can trust.</p>
        <div className="story-card">
          <span className="mini-icon">
            <Check size={17} />
          </span>
          <div>
            <strong>Nothing lost between teams.</strong>
            <small>From first report to final resolution.</small>
          </div>
        </div>
      </div>
      <span className="story-footer">RELAY WORKSPACE &nbsp; / &nbsp; NEWTONITE ENGINEERING CHALLENGE</span>
    </section>
    <section className="login-form">
      <div className="login-box">
        <span className="eyebrow">WELCOME TO RELAY</span>
        <h2>Good work starts here.</h2>
        <p>Sign in to your team's operations workspace.</p>
        <form onSubmit={login}>
          <label>Email address<input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
          </label>
          <label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </label>{error && <div className="error" role="alert">{error}</div>}<button className="primary full" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <>Sign in to workspace <ArrowRight size={17} />
          </>}</button>
        </form>
        <div className="demo">
          <div className="demo-heading">
            <ShieldCheck size={16} /> Explore the demo workspace</div>
          <p>Choose a role to see permissions in action.<br />Demo password: <code>RelayDemo2026!</code>
          </p>
          <div className="demo-buttons">{[['anmol', 'Team lead'], ['maya', 'Member'], ['isha', 'Viewer'], ['kabir', 'Finance lead']].map(([id, label]) =>
            <button key={id} onClick={() => { setLoginEmail(id + '@relay.demo'); setPassword('RelayDemo2026!') }} className={loginEmail.startsWith(id) ? 'chosen' : ''}>{label}</button>)}</div>
          <small>Sample data only. These accounts are shared demo identities.</small>
        </div>
      </div>
    </section>
  </main>;
  const viewTitle: Record<string, string> = { all: 'Work overview', mine: 'Assigned to me', urgent: 'Unassigned urgent', review: 'Awaiting approval', overdue: 'Overdue work' };
  const transitions: Record<string, string[]> = { Open: ['In progress'], 'In progress': ['Review'], Review: lead ? ['Resolved', 'In progress'] : [], Resolved: lead ? ['Closed', 'In progress'] : [], Closed: lead ? ['Open'] : [] };
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Relay home">
        <div className="brand-icon">
          <Layers size={23} />
        </div>relay<span className="brand-period">.</span>
      </a>
      <div className="workspace-switch">
        <div className="workspace-avatar">N</div>
        <div>
          <strong>Newtonite</strong>
          <small>Operations workspace</small>
        </div>
        <span className="workspace-dot" />
      </div>
      <div className="nav-heading">WORKSPACE</div>
      <nav>
        <button className={!people && view === 'all' ? 'active' : ''} onClick={() => nav('all')}>
          <LayoutDashboard size={18} />Overview</button>
        <button className={!people && view === 'mine' ? 'active' : ''} onClick={() => nav('mine')}>
          <Inbox size={18} />Assigned to me<span className="nav-count">{stats.mine || 0}</span>
        </button>
        <button className={people ? 'active' : ''} onClick={() => setPeople(true)}>
          <Users size={18} />Team members</button>
      </nav>
      <div className="nav-heading attention-label">NEEDS ATTENTION</div>
      <nav>
        <button className={!people && view === 'urgent' ? 'active' : ''} onClick={() => nav('urgent')}>
          <span className="nav-dot coral" />Unassigned urgent<span className="nav-count">{stats.urgent || 0}</span>
        </button>
        <button className={!people && view === 'review' ? 'active' : ''} onClick={() => nav('review')}>
          <span className="nav-dot amber" />Awaiting approval<span className="nav-count">{stats.review || 0}</span>
        </button>
        <button className={!people && view === 'overdue' ? 'active' : ''} onClick={() => nav('overdue')}>
          <span className="nav-dot gray" />Overdue work<span className="nav-count">{stats.overdue || 0}</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="trust-card">
          <ShieldCheck size={19} />
          <strong>Built for shared responsibility</strong>
          <p>Every change has a name.<br />Every work item has a next step.</p>
        </div>
        <div className="profile">
          <span className="avatar teal">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{activeTeam?.role} · {activeTeam?.name}</small>
          </div>
          <button title="Sign out" aria-label="Sign out" onClick={async () => { try { await api('logout', 'POST', {}); setUser(null); setItems([]); setSelected(null); setError('') } catch (e: any) { setError(e.message) } }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
    <div className="main">
      <header className="topbar">
        <div>
          <span className="breadcrumb">Workspace</span>
          <ChevronRight size={14} />
          <strong>{people ? 'Team members' : viewTitle[view]}</strong>
        </div>
        <div className="top-right">
          <span className="live-dot" />
          <span>Shared workspace</span>
          <span className="header-divider" />
          <span className="avatar small teal">{initials(user.name)}</span>
        </div>
      </header>
      <main className="content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">KEEP THE IMPORTANT WORK MOVING</span>
            <h1>{people ? 'Your team, connected.' : viewTitle[view]}</h1>
            <p>{people ? 'The people behind the progress. Permissions are scoped to this team.' : 'A clear view of what’s happening, who owns it, and what’s next.'}</p>
          </div>
          <button className="primary" onClick={startCreate} disabled={!canWrite}>
            <Plus size={18} />New work item</button>
        </div>
        <div className="team-line">
          <label className="team-select">
            <span className="team-icon">
              <Users size={16} />
            </span>
            <select aria-label="Active team" value={team} onChange={e => { setTeam(e.target.value); setCursor(null); setPast([]) }}>{teams.map(t =>
              <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <ChevronDown size={14} />
          </label>
          <span className="role-pill">{activeTeam?.role} access</span>
          <button className="refresh" onClick={() => load()} title="Refresh work items">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />Refresh</button>
        </div>{error && !selected && !modal && <div className="error" role="alert">
          <AlertCircle size={17} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>}
        {people ? <section className="people-grid">{members.map(m =>
          <article key={m.id}>
            <span className="avatar large teal">{initials(m.name)}</span>
            <h3>{m.name}{m.id === user.id ? ' (you)' : ''}</h3>
            <span className="role-pill">{m.role}</span>
            <p>{m.role === 'Lead' ? 'Assign, approve and manage team work.' : m.role === 'Member' ? 'Create, claim and progress assigned work.' : 'View work items and their activity history.'}</p>
          </article>)}</section> : <>
          <section className="stat-grid">{[{ label: 'Active work', value: stats.active, sub: 'Across your team', icon: Layers, cls: 'teal', view: 'all' }, { label: 'Assigned to you', value: stats.mine, sub: 'Your open responsibilities', icon: UserRound, cls: 'blue', view: 'mine' }, { label: 'Awaiting approval', value: stats.review, sub: 'Ready for a lead’s review', icon: Clock, cls: 'amber', view: 'review' }, { label: 'Unassigned urgent', value: stats.urgent, sub: 'Needs an owner', icon: Flag, cls: 'coral', view: 'urgent' }].map(s =>
            <button key={s.label} className="stat" onClick={() => nav(s.view)}>
              <div>
                <span className={'stat-icon ' + s.cls}>
                  <s.icon size={18} />
                </span>
                <ArrowUpRight size={16} />
              </div>
              <div className="stat-number">{s.value ?? '—'}</div>
              <strong>{s.label}</strong>
              <small>{s.sub}</small>
            </button>)}</section>
          <section className="work-panel">
            <div className="panel-heading">
              <div>
                <h2>{view === 'all' ? 'Team work queue' : viewTitle[view]}</h2>
                <span className="count-label">{stats.total || 0} total in team</span>
              </div>
              <span className="panel-note">
                <span className="live-dot" />Updates every 30s</span>
            </div>
            <div className="toolbar">
              <div className="list-tabs">
                <button className={!status ? 'selected' : ''} onClick={() => setStatus('')}>All work</button>
                <button className={status === 'In progress' ? 'selected' : ''} onClick={() => setStatus('In progress')}>In progress</button>
                <button className={status === 'Resolved' ? 'selected' : ''} onClick={() => setStatus('Resolved')}>Resolved</button>
              </div>
              <div className="filter-controls">
                <label className="search">
                  <Search size={16} />
                  <input placeholder="Search work items…" aria-label="Search work items" value={query} onChange={e => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={13} />
                  </button>}</label>
                <label className="filter">
                  <SlidersHorizontal size={14} />
                  <select aria-label="Filter priority" value={priority} onChange={e => setPriority(e.target.value)}>
                    <option value="">Priority</option>{PRIORITIES.map(p =>
                      <option key={p}>{p}</option>)}</select>
                </label>
                <label className="filter status-filter">
                  <select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option>{STATES.map(p =>
                      <option key={p}>{p}</option>)}</select>
                </label>
              </div>
            </div>
            <div className={'table-scroll ' + (loading ? 'is-loading' : '')} aria-busy={loading}>
              <table>
                <thead>
                  <tr>
                    <th>WORK ITEM</th>
                    <th>STATUS</th>
                    <th>PRIORITY</th>
                    <th>OWNER</th>
                    <th>DUE DATE</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{items.map(it =>
                  <tr key={it.id} onClick={() => openItem(it.id)}>
                    <td>
                      <button className="item-link" onClick={e => { e.stopPropagation(); openItem(it.id) }}>
                        <span className="item-id">RLY-{String(it.id).padStart(3, '0')}</span>
                        <strong>{it.title}</strong>
                        <span className="item-type">{it.type}</span>
                      </button>
                    </td>
                    <td>
                      <Status value={it.status} />
                    </td>
                    <td>
                      <Priority value={it.priority} />
                    </td>
                    <td>{it.assignee ? <span className="owner">
                      <span className="avatar small">{initials(it.assignee_name || it.assignee)}</span>
                      <span>{it.assignee_name?.split(' ')[0] || it.assignee}</span>
                    </span> : <span className="unassigned">
                      <span className="empty-avatar">
                        <UserRound size={12} />
                      </span>Unassigned</span>}</td>
                    <td>
                      <span className={it.due && it.due < new Date().toISOString().slice(0, 10) && !['Resolved', 'Closed'].includes(it.status) ? 'overdue' : ''}>{it.due ? date(it.due) : '—'}</span>
                    </td>
                    <td>
                      <ChevronRight size={15} />
                    </td>
                  </tr>)}</tbody>
              </table>{!items.length && <div className="empty">
                <CheckCircle2 size={32} />
                <h3>{loading ? 'Loading your work…' : 'A little breathing room.'}</h3>
                <p>{query || status || priority ? 'No items match these filters. Try a broader search.' : 'There are no work items in this view.'}</p>
                <button className="secondary" onClick={() => { nav('all') }}>View all work</button>
              </div>}</div>
            <footer className="table-footer">
              <span>{items.length} items on this page <span className="muted">· Newest first</span>
              </span>
              <div>
                <button className="page-button" disabled={!past.length || loading} aria-label="Previous page" onClick={() => { setCursor(past[past.length - 1]); setPast(past.slice(0, -1)) }}>
                  <ChevronLeft size={16} />
                </button>
                <span>Page {past.length + 1}</span>
                <button className="page-button" disabled={!next || loading} aria-label="Next page" onClick={() => { setPast([...past, cursor]); setCursor(next) }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </section>
          <div className="below-table">
            <ShieldCheck size={15} />
            <span>Changes are permission-checked and recorded in your team’s activity history.</span>
            <span className="keyboard-hint">RELAY / OPERATIONS IN SYNC</span>
          </div>
        </>}
      </main>
    </div>
    {selected && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) { setSelected(null); selectionSequence.current++ } }}>
      <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="drawer-top">
          <span className="item-id">RLY-{String(selected.id).padStart(3, '0')} <span className="muted">/ {selected.type}</span>
          </span>
          <button className="icon-button" aria-label="Close detail" autoFocus onClick={() => { setSelected(null); selectionSequence.current++ }}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="detail-badges">
            <Status value={selected.status} />
            <Priority value={selected.priority} />
          </div>
          <h2 id="detail-title">{selected.title}</h2>
          <div className="version-label">
            <ShieldCheck size={14} />Version {selected.version} · Updated {date(selected.updated_at)}</div>{error && <div className="error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>}{conflict && <button className="secondary full" onClick={() => openItem(selected.id)}>
              <RefreshCw size={15} />Reload latest version</button>}<div className="detail-meta">
            <div>
              <span>Owner</span>
              <strong>{members.find(m => m.id === selected.assignee)?.name || 'Unassigned'}</strong>
            </div>
            <div>
              <span>Team</span>
              <strong>{activeTeam?.name}</strong>
            </div>
            <div>
              <span>Due date</span>
              <strong>{selected.due ? date(selected.due) : 'Not set'}</strong>
            </div>
          </div>
          <div className="detail-actions">{canWrite && !selected.assignee && !['Closed', 'Resolved'].includes(selected.status) && <button className="primary" disabled={busy || conflict} onClick={() => mutate('claim', {})}>
            <UserRound size={15} />Claim item</button>}{canWrite && (lead || selected.assignee === user.id) && (transitions[selected.status] || []).map(s =>
              <button key={s} className={s === 'Resolved' ? 'primary' : 'secondary'} disabled={busy || conflict || !selected.assignee} onClick={() => mutate('transition', { status: s })}>{s === 'Resolved' ? 'Approve & resolve' : s === 'Review' ? 'Request approval' : s === 'Closed' ? 'Close item' : s === 'Open' ? 'Reopen item' : 'Move to ' + s}<ArrowRight size={14} />
              </button>)}{canWrite && (lead || selected.assignee === user.id) && selected.status !== 'Closed' && <button className="secondary" disabled={busy || conflict} onClick={() => { setDraft({ title: selected.title, description: selected.description, type: selected.type, priority: selected.priority, due: selected.due || '', assignee: selected.assignee || '' }); setEdit(!edit) }}>Edit details</button>}</div>{edit ? <form className="edit-form" onSubmit={e => { e.preventDefault(); mutate('', { title: draft.title, description: draft.description, priority: draft.priority, due: draft.due, ...(lead ? { assignee: draft.assignee || null } : {}) }) }}>
                <label>Title<input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label>Description<textarea maxLength={4000} rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                </label>
                <div className="form-row">
                  <label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map(p =>
                    <option key={p}>{p}</option>)}</select>
                  </label>
                  <label>Due date<input type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} />
                  </label>
                </div>{lead && <label>Owner<select value={draft.assignee} onChange={e => setDraft({ ...draft, assignee: e.target.value })}>
                  <option value="">Unassigned</option>{members.filter(m => m.role !== 'Viewer').map(m =>
                    <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </label>}<div className="detail-actions">
                  <button className="primary" disabled={busy || conflict}>Save changes</button>
                  <button type="button" className="secondary" onClick={() => setEdit(false)}>Cancel</button>
                </div>
              </form> : <div className="description">
                <h3>Context & next steps</h3>
                <p>{selected.description || 'No additional description.'}</p>
              </div>}<div className="activity-heading">
            <Activity size={17} />
            <h3>Activity timeline</h3>
            <span>Append-only history</span>
          </div>{canWrite && <form className="comment-box" onSubmit={addComment}>
            <textarea aria-label="Add a comment" placeholder="Share a finding or add context…" maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} />
            <button className="secondary" disabled={busy || !comment.trim()}>
              <MessageSquare size={14} />Add comment</button>
          </form>}<div className="timeline">{events.map(ev =>
            <article key={ev.id}>
              <span className={'timeline-icon ' + (ev.kind === 'comment' ? 'comment-icon' : '')}>{ev.kind === 'comment' ? <MessageSquare size={13} /> : <Check size={13} />}</span>
              <div>
                <div className="event-heading">
                  <strong>{ev.actor_name}</strong>
                  <time title={new Date(ev.created_at).toLocaleString()}>{date(ev.created_at)} · {new Date(ev.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
                <p>{ev.body}</p>
                <small>{ev.kind === 'comment' ? 'Comment' : 'Version ' + ev.version}</small>
              </div>
            </article>)}</div>{eventCursor && <button className="secondary full" disabled={busy} onClick={async () => { setBusy(true); try { const h = await api('items/' + selected.id + '/activity?cursor=' + eventCursor); setEvents([...events, ...h.events]); setEventCursor(h.nextCursor) } catch (e: any) { setError(e.message) } finally { setBusy(false) } }}>Load older activity</button>}</div>
      </section>
    </div>}
    {modal && <div className="overlay modal-overlay">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">START WITH CLARITY</span>
            <h2 id="create-title">New work item</h2>
          </div>
          <button className="icon-button" aria-label="Close create form" onClick={() => setModal(false)}>
            <X size={20} />
          </button>
        </div>
        <p className="modal-intro">Give your team the context they need to move forward.</p>
        <form onSubmit={create}>
          <label>Title <span className="required">*</span>
            <input autoFocus required maxLength={160} placeholder="What needs attention?" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label>Description<textarea rows={4} maxLength={4000} placeholder="Describe the issue, impact, and expected outcome…" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <div className="form-row">
            <label>Type<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{TYPES.map(t =>
              <option key={t}>{t}</option>)}</select>
            </label>
            <label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map(t =>
              <option key={t}>{t}</option>)}</select>
            </label>
          </div>
          <div className="form-row">
            <label>Team<input disabled value={activeTeam?.name} />
            </label>
            <label>Due date<input type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} />
            </label>
          </div>{error && <div className="error" role="alert">{error}</div>}<div className="modal-foot">
            <span>
              <LockKeyhole size={13} />Visible to this team</span>
            <button type="button" className="secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}Create work item</button>
          </div>
        </form>
      </section>
    </div>}{toast && <div className="toast" role="status">
      <CheckCircle2 size={17} />{toast}</div>}</div>
}
