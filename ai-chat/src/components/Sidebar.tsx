import type { Conversation } from '../hooks/useChat';
import { Avatar } from './Avatar';
import type { UserProfile } from './MailLogin';

const quickPrompts = [
  { icon: '💼', label: 'Resume review', prompt: 'Review my resume for a React developer role' },
  { icon: '✍️', label: 'Cover letter', prompt: 'Write a cover letter for a junior developer role' },
  { icon: '🚀', label: 'Project ideas', prompt: 'Suggest 5 portfolio-worthy React projects' },
];

export function Sidebar({
  conversations, activeId, onSelect, onNew, search, onSearch,
  msgCount, avgLatency, modelName, onSend, user, onSignOut,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  search: string;
  onSearch: (v: string) => void;
  msgCount: number;
  avgLatency: number;
  modelName: string;
  onSend: (text: string) => void;
  user: UserProfile;
  onSignOut: () => void;
}) {
  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const barHeights = [35, 55, 90, 65, 50, 42, 58];
  const qualityPct = 82;

  // The sidebar footer (avatar + email + sign-out button) only shows when the
  // visitor has a real claimed identity. Because the app opens straight into
  // a Guest profile, the footer would otherwise be visible to every visitor
  // and surface a sign-out button that just cycles back to a new Guest.
  // Two guest-creation paths share the `nexusai.local` domain:
  //   App.tsx autoGuest  -> "guest@nexusai.local"
  //   MailLogin guest    -> "guest-<ts>@nexusai.local"
  // Anything else is a real identity and gets the full footer.
  const guestEmailRe = /^guest(?:@nexusai\.local|-\d+@nexusai\.local)$/;
  const isGuest = guestEmailRe.test(user.email);

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-icon">✦</div>
        <div>
          <div className="brand-name">NexusAI Pro</div>
          <div className="brand-sub">live dashboard</div>
        </div>
      </div>

      <div className="search-box">
        <i className="ti ti-search" aria-hidden="true" />
        <input placeholder="Search conversations..." value={search} onChange={e => onSearch(e.target.value)} />
      </div>

      <button className="new-chat-btn" onClick={onNew}>
        <i className="ti ti-plus" aria-hidden="true" /> New conversation
      </button>

      <div className="dash-card">
        <div className="dash-label">Latency <span><span className="live-dot" />live</span></div>
        <div className="bars">
          {barHeights.map((h, i) => (
            <div key={i} className={`bar ${h > 80 ? 'peak' : ''}`} style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="bar-meta"><span>avg <b>{avgLatency}ms</b></span><span>msgs <b>{msgCount}</b></span></div>
      </div>

      <div className="dash-card">
        <div className="dash-label">Quality score</div>
        <div className="ring-wrap">
          <div className="ring" style={{ background: `conic-gradient(var(--teal) 0% ${qualityPct}%, var(--border) ${qualityPct}% 100%)` }}>
            <div className="ring-inner">{qualityPct}%</div>
          </div>
          <div className="ring-text">helpful rate<b>+12% this week</b></div>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-label">Model pool</div>
        <div className="cluster-row"><span className="cluster-dot" /><span className="cluster-name">{modelName}</span><span className="cluster-status">active</span></div>
        <div className="cluster-row"><span className="cluster-dot dim" /><span className="cluster-name">backup-model</span><span className="cluster-status">idle</span></div>
      </div>

      <div className="mini-stats">
        <div className="mini-stat"><div className="mini-label">messages</div><div className="mini-val">{msgCount}</div></div>
        <div className="mini-stat"><div className="mini-label">tokens</div><div className="mini-val">{(msgCount * 180).toLocaleString()}</div></div>
        <div className="mini-stat"><div className="mini-label">chats</div><div className="mini-val teal">{conversations.length}</div></div>
        <div className="mini-stat"><div className="mini-label">uptime</div><div className="mini-val teal">99.9%</div></div>
      </div>

      <div className="dash-card" style={{ padding: '8px' }}>
        <div className="dash-label" style={{ marginBottom: 4 }}>Quick prompts</div>
        {quickPrompts.map(q => (
          <div key={q.label} className="convo-item" onClick={() => onSend(q.prompt)} style={{ cursor: 'pointer' }}>
            <span>{q.icon}</span><span>{q.label}</span>
          </div>
        ))}
      </div>

      <div className="convo-section">
        {filtered.map((c, i) => (
          <button
            key={c.id}
            className={`convo-item ${c.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
            title={`⌘${i < 9 ? i + 1 : '·'}`}
          >
            <i className="ti ti-message" aria-hidden="true" /><span>{c.title}</span>
            {i < 9 && <span className="convo-shortcut">⌘{i + 1}</span>}
          </button>
        ))}
      </div>

      {!isGuest && (
        <div className="side-footer">
          <Avatar role="user" name={user.name} email={user.email} variant="large" title={user.name} />
          <div className="side-footer-info">
            <div className="side-footer-name">{user.name}</div>
            <div className="side-footer-email" title={user.email}>{user.email}</div>
          </div>
          <button className="side-footer-btn" onClick={onSignOut} title="Sign out" aria-label="Sign out">
            <i className="ti ti-logout" aria-hidden />
          </button>
        </div>
      )}
    </aside>
  );
}