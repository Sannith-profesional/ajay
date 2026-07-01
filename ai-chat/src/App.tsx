import { useState, useEffect } from 'react';
import { useChat, estimateTokens } from './hooks/useChat';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { MailLogin, loadUser, clearUser, type UserProfile } from './components/MailLogin';
import './App.css';

const THEMES = ['#7c6fd6', '#2dd4bf', '#e11d48', '#0d9488', '#d97706', '#0284c7'];
const CHIPS = [
  { icon: '💼', title: 'Resume review', sub: 'Get CV feedback', prompt: 'Review my resume for a React developer role and suggest improvements' },
  { icon: '⚛️', title: 'React help', sub: 'Debug or build', prompt: 'Explain useMemo and useCallback with examples' },
  { icon: '✍️', title: 'Cover letter', sub: 'Write compelling copy', prompt: 'Write a cover letter for a junior React developer position' },
  { icon: '🚀', title: 'Project ideas', sub: 'Portfolio projects', prompt: 'Suggest 5 impressive React projects for my portfolio' },
];

const SHORTCUTS: Array<[string, string, string]> = [
  ['New chat', 'Ctrl + K', 'start a fresh conversation'],
  ['Focus input', 'Ctrl + L', 'jump to the message box'],
  ['Toggle theme', 'Ctrl + Shift + T', 'switch dark / light'],
  ['Toolbox panel', 'Ctrl + B', 'open parameters & tools'],
  ['Search chats', 'Ctrl + F', 'find an old conversation'],
  ['Star message', 'Ctrl + S', 'save the focused reply'],
  ['Copy chat', 'Ctrl + Shift + C', 'copy full conversation'],
  ['Shortcuts', 'Ctrl + /', 'show this cheat sheet'],
  ['Send', 'Enter', 'send the message'],
  ['New line', 'Shift + Enter', 'multi-line draft'],
  ['Stop', 'Esc', 'stop generating'],
];

export default function App() {
  const chat = useChat();
  const {
    conversations, activeId, setActiveId, messages, isStreaming, avgLatency,
    sendMessage, newConversation, clearMessages, toggleStar,
    params, setParams, setSystemPrompt, setPersona, currentPersonaId,
    stopGenerating: chatStop,
  } = chat;

  const [user, setUser] = useState<UserProfile | null>(() => loadUser());
  const [theme, setTheme] = useState('dark');
  const [accent, setAccent] = useState('#7c6fd6');
  const [search, setSearch] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2000); };

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent2', accent + 'cc');
  }, [accent]);

  useEffect(() => {
    if (!user) return;
    const h = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      // Skip when the input is focused (we let the ChatInput handle its own keys)
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isInput = tag === 'textarea' || tag === 'input';

      if (ctrl && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); newConversation(); showToast('New chat'); }
      else if (ctrl && e.key === '/') { e.preventDefault(); setShowShortcuts(s => !s); }
      else if (ctrl && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); setShowPanel(p => !p); }
      else if (ctrl && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        focusInput();
        showToast('Focus');
      }
      else if (ctrl && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault(); setTheme(t => t === 'dark' ? 'light' : 'dark');
      }
      else if (ctrl && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault(); copyAll();
      }
      else if (ctrl && !e.shiftKey && !isInput && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        chat.switchToIndex(parseInt(e.key, 10) - 1);
      }
      else if (ctrl && !isInput && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const el = document.querySelector('.search-box input') as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
      else if (e.key === 'Escape') {
        if (isStreaming) chatStop();
        setShowShortcuts(false); setShowColors(false); setShowPanel(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isStreaming, messages, conversations]);

  const focusInput = () => {
    const ta = document.querySelector('.input-row textarea') as HTMLTextAreaElement | null;
    ta?.focus();
  };

  const stopGenerating = () => {
    if (chatStop()) showToast('Stopped');
  };

  const copyAll = () => {
    navigator.clipboard.writeText(messages.map(m => `${m.role}: ${m.content}`).join('\n\n'));
    showToast('Chat copied');
  };

  const exportChat = (kind: 'txt' | 'pdf' = 'txt') => {
    const text = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    if (kind === 'txt') {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'nexusai-chat.txt'; a.click();
      URL.revokeObjectURL(url);
      showToast('Exported');
      return;
    }
    // Lazy-load jsPDF to keep the initial bundle small
    import('jspdf').then(({ jsPDF }) => {
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      const lineHeight = 14;
      const maxWidth = 515;
      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.setFontSize(11);
      pdf.text(lines, margin, margin + lineHeight);
      pdf.save('nexusai-chat.pdf');
      showToast('PDF saved');
    });
  };

  const summarize = () => sendMessage('Summarize this conversation in 5 concise bullet points.');

  const handleToolAction = (action: string) => {
    switch (action) {
      case 'summarize': summarize(); break;
      case 'export': exportChat('txt'); break;
      case 'export-pdf': exportChat('pdf'); break;
      case 'copy': copyAll(); break;
      case 'share': showToast('Share link copied to clipboard'); navigator.clipboard.writeText(window.location.href); break;
      case 'clear': clearMessages(); break;
    }
  };

  const regenLast = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return showToast('Nothing to retry');
    sendMessage(lastUser.content);
  };

  const activeConvo = conversations.find(c => c.id === activeId);
  const tokens = estimateTokens(conversations.find(c => c.id === activeId)?.messages ?? []);

  if (!user) {
    return <MailLogin onSignedIn={setUser} />;
  }

  return (
    <div className={`app ${showPanel ? 'panel-open' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setShowPanel(false); }}
        onNew={newConversation}
        search={search}
        onSearch={setSearch}
        msgCount={messages.length}
        avgLatency={Math.round(avgLatency)}
        modelName={params.model}
        onSend={sendMessage}
        user={user}
        onSignOut={() => { clearUser(); setUser(null); }}
      />

      <div className="main">
        <header className="mh">
          <div>
            <div className="mh-title">{activeConvo?.title || 'New conversation'}</div>
            <div className="mh-sub">
              {params.model} · {params.temperature.toFixed(2)}° · {messages.length} messages
              {isStreaming && <span className="mh-streaming"><span className="mh-streaming-dot" /> streaming…</span>}
            </div>
          </div>
          <div className="mh-tools">
            <button className="tool-pill" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme (Ctrl+Shift+T)">
              <i className={`ti ti-${theme === 'dark' ? 'sun' : 'moon'}`} aria-hidden />
            </button>
            <button className={`tool-pill ${showColors ? 'active' : ''}`} onClick={() => setShowColors(s => !s)} title="Accent colour">
              <i className="ti ti-palette" aria-hidden />
            </button>
            <button className={`tool-pill ${showPanel ? 'active' : ''}`} onClick={() => setShowPanel(p => !p)} title="Toolbox (Ctrl+B)">
              <i className="ti ti-adjustments-horizontal" aria-hidden />
            </button>
            <button className="tool-pill" onClick={copyAll} disabled={messages.length === 0} title="Copy chat (Ctrl+Shift+C)">
              <i className="ti ti-copy" aria-hidden />
            </button>
            <button className="tool-pill" onClick={() => exportChat('txt')} disabled={messages.length === 0} title="Export (.txt)">
              <i className="ti ti-download" aria-hidden />
            </button>
            <button className="tool-pill" onClick={showShortcuts ? () => setShowShortcuts(false) : () => setShowShortcuts(true)} title="Shortcuts (Ctrl+/)">
              <i className="ti ti-keyboard" aria-hidden />
            </button>
            <button className="tool-pill" onClick={clearMessages} disabled={messages.length === 0} title="Clear chat">
              <i className="ti ti-trash" aria-hidden />
            </button>
          </div>
        </header>

        {showColors && (
          <div className="theme-strip">
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>Accent</span>
            {THEMES.map(c => (
              <button key={c} className={`color-swatch ${accent === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { setAccent(c); showToast('Theme updated'); }} aria-label={c} />
            ))}
          </div>
        )}

        <div className="msgs">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onSend={(t) => { setShowPanel(false); sendMessage(t); }}
            chips={CHIPS}
            onToggleStar={toggleStar}
            onSimplify={() => sendMessage('Explain the previous reply in simpler terms')}
            onExpand={() => sendMessage('Give me more detail on the previous reply')}
            onRegenerate={regenLast}
            user={user}
          />
        </div>

        <div className="input-area">
          <div className="input-inner">
            <ChatInput
              onSend={(text, attachments) => { setShowPanel(false); sendMessage(text, attachments); }}
              onStop={stopGenerating}
              disabled={isStreaming}
              previewBanner={
                import.meta.env.VITE_VERCEL_ENV === 'preview'
                  ? { label: 'Preview deployment', sub: "non-prod build — don't point real users here" }
                  : import.meta.env.VITE_VERCEL_ENV === 'development' || import.meta.env.DEV
                  ? { label: 'Development build', sub: 'local dev server' }
                  : undefined
              }
            />
            <div className="input-meta">
              <span>
                <kbd className="kbd-inline">↵</kbd> send · <kbd className="kbd-inline">⇧↵</kbd> newline · <kbd className="kbd-inline">Ctrl K</kbd> new chat · <kbd className="kbd-inline">Ctrl B</kbd> toolbox · <kbd className="kbd-inline">Ctrl /</kbd> shortcuts
              </span>
              <span className="input-meta-r">
                {isStreaming ? <span className="meta-streaming"><span className="meta-streaming-dot" />generating</span> : `${messages.length} msgs · ${tokens.toLocaleString()} tokens`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <RightPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        model={params}
        onModelChange={setParams}
        personaId={currentPersonaId}
        onPersonaChange={setPersona}
        onSystemPromptChange={setSystemPrompt}
        onToolAction={(a) => { handleToolAction(a); setShowPanel(false); }}
        msgCount={messages.length}
        tokenCount={tokens}
        avgLatency={Math.round(avgLatency)}
      />

      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="modal shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Keyboard shortcuts</h3>
                <p className="modal-sub">Move faster. Stay in flow.</p>
              </div>
              <button className="modal-close" onClick={() => setShowShortcuts(false)} aria-label="Close">
                <i className="ti ti-x" aria-hidden />
              </button>
            </div>
            <div className="shortcut-list">
              {SHORTCUTS.map(([label, keys, desc]) => (
                <div key={label} className="shortcut-row">
                  <div className="shortcut-row-info">
                    <span className="shortcut-row-label">{label}</span>
                    <span className="shortcut-row-desc">{desc}</span>
                  </div>
                  <span className="kbd">{keys}</span>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              Tip: use <kbd className="kbd-inline">Ctrl + 1-9</kbd> to jump between conversations.
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}