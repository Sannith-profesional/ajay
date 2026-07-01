import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import type { Attachment } from '../hooks/useChat';
import { formatBytes, formatAttachmentLabel, formatDuration, parseFiles } from '../lib/attachments';
import { useVoiceSession, type VoiceState } from '../lib/voice';

export function ChatInput({
  onSend,
  onStop,
  disabled,
  previewBanner,
}: {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  disabled: boolean;
  /** When truthy, show a small warning strip above the input. The label +
   *  optional sub copy are opaque strings — the caller (App.tsx) owns the
   *  wording so this stays out of the way for non-prod builds. */
  previewBanner?: { label: string; sub?: string };
}) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceSession({
    onTranscriptUpdate: (interim, _final) => {
      setValue((cur) => {
        // Replace any interim tail with the latest interim; preserve user
        // text that was typed before recording started.
        const userPart = cur.split('\u2026[transcribing]')[0] || cur;
        if (!interim) return userPart;
        return `${userPart}\u2026[transcribing]${interim}`;
      });
    },
    onTranscriptEnd: (final) => {
      setValue((cur) => {
        const cleaned = cur.replace(/\u2026\[transcribing\][^\n]*/g, '');
        const sep = cleaned.length > 0 && !cleaned.endsWith(' ') ? ' ' : '';
        // Append a tiny marker so multi-session appends stay readable.
        return `${cleaned}${sep}${final}`.trim();
      });
    },
    onAudioReady: (file) => {
      const dur = (file as File & { __durationMs?: number }).__durationMs;
      const att: Attachment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mime: file.type || 'audio/webm',
        size: file.size,
        kind: 'audio',
        durationMs: dur,
      };
      setAttachments((prev) => [...prev, att]);
      setValue((cur) => {
        const sep = cur.length > 0 && !cur.endsWith(' ') ? ' ' : '';
        return `${cur}${sep}[voice note attached: ${file.name}]`.trim();
      });
    },
  });

  // Track recording elapsed time while in 'recording' state (MediaRecorder path).
  useEffect(() => {
    if (voice.state !== 'recording') { setRecordingElapsed(0); return; }
    const start = Date.now();
    const t = window.setInterval(() => setRecordingElapsed(Date.now() - start), 250);
    return () => window.clearInterval(t);
  }, [voice.state]);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  // ── Push-to-talk: Space-bar hold when focus isn't in an input. Esc cancels.
  useEffect(() => {
    const inEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };
    const onDown = (e: globalThis.KeyboardEvent) => {
      if (e.code !== 'Space' || inEditable(e.target) || e.repeat) return;
      e.preventDefault();
      if (voice.state === 'idle') voice.start();
    };
    const onUp = (e: globalThis.KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (voice.state === 'listening' || voice.state === 'recording') voice.stop();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && (voice.state === 'listening' || voice.state === 'recording' || voice.state === 'requesting')) {
        voice.cancel();
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [voice]);

  const submit = () => {
    const hasText = !!value.trim();
    const hasAtt = attachments.length > 0;
    if ((!hasText && !hasAtt) || processing) return;
    onSend(value.trim(), attachments);
    setValue('');
    setAttachments([]);
    setErrorMsg('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || (fileList instanceof FileList && fileList.length === 0)) return;
    setProcessing(true);
    setErrorMsg('');
    try {
      const { attachments: parsed, errors } = await parseFiles(fileList);
      setAttachments((prev) => [...prev, ...parsed]);
      if (errors.length) {
        setErrorMsg(errors.map((e) => `${e.fileName}: ${e.reason}`).join(' · '));
      }
      ref.current?.focus();
    } finally {
      setProcessing(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setErrorMsg('');
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    handleFiles(files);
  };

  const micIcon = voice.mode === 'speech' ? 'ti ti-microphone' : 'ti ti-microphone-2';
  const isVoiceActive = voice.state === 'listening' || voice.state === 'recording' || voice.state === 'requesting';
  const hasAnything = !!value.trim() || attachments.length > 0;

  return (
    <div className="input-shell" ref={dropZoneRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {previewBanner && (
        <div className="preview-banner" role="status" aria-live="polite" data-testid="preview-banner">
          <i className="ti ti-alert-triangle" aria-hidden />
          <span className="preview-banner-label">{previewBanner.label}</span>
          {previewBanner.sub && <span className="preview-banner-sub">{previewBanner.sub}</span>}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-inner">
            <i className="ti ti-file-upload" aria-hidden />
            <div className="drop-overlay-title">Drop to attach</div>
            <div className="drop-overlay-sub">images · PDFs · text files</div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden-file-input"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        accept="image/*,application/pdf,text/*,audio/*,.pdf,.txt,.md,.json,.csv,.log"
      />

      {attachments.length > 0 && (
        <div className="attach-strip" role="list">
          {attachments.map((a) => (
            <div key={a.id} className="attach-chip" role="listitem">
              <div className={`attach-thumb attach-thumb-${a.kind}`}>
                {a.kind === 'image' && a.dataUrl ? (
                  <img src={a.dataUrl} alt={a.name} />
                ) : (
                  <i className={`ti ti-${a.kind === 'pdf' ? 'file-type-2-pdf' : a.kind === 'audio' ? 'microphone' : a.kind === 'text' ? 'file-text' : 'file'}`} aria-hidden />
                )}
              </div>
              <div className="attach-meta">
                <div className="attach-name" title={a.name}>{a.name}</div>
                <div className="attach-sub">
                  {formatAttachmentLabel(a)}
                  {a.kind === 'audio' && a.durationMs ? ` \u00b7 ${formatDuration(a.durationMs)}` : ` \u00b7 ${formatBytes(a.size)}`}
                </div>
              </div>
              <button className="attach-remove" onClick={() => removeAttachment(a.id)} aria-label={`Remove ${a.name}`} title="Remove" disabled={disabled}>
                <i className="ti ti-x" aria-hidden />
              </button>
            </div>
          ))}
          {processing && (
            <div className="attach-chip attach-chip-loading" role="listitem">
              <div className="attach-thumb"><i className="ti ti-loader-2 spin" aria-hidden /></div>
              <div className="attach-meta">
                <div className="attach-name">Reading files…</div>
              </div>
            </div>
          )}
        </div>
      )}

      <VoiceStatusPill
        state={voice.state}
        mode={voice.mode}
        interim={voice.interim}
        elapsed={recordingElapsed}
        onCancel={voice.cancel}
        onStop={voice.stop}
      />

      {(errorMsg || voice.errorMessage) && (
        <div className="attach-error" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden /> {[errorMsg, voice.errorMessage].filter(Boolean).join(' · ')}
          <button className="attach-error-close" onClick={() => setErrorMsg('')} aria-label="Dismiss">
            <i className="ti ti-x" aria-hidden />
          </button>
        </div>
      )}

      <div className="input-row">
        <button
          className="icon-pill attach-pill"
          title="Attach files (or drop here)"
          aria-label="Attach files"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || processing || isVoiceActive}
        >
          <i className="ti ti-paperclip" aria-hidden />
        </button>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={attachments.length ? 'Ask about the attached files… (Enter to send)' : 'Ask NexusAI anything… (drag-drop, paste, or push-to-talk)'}
          rows={1}
          disabled={disabled || isVoiceActive}
        />
        <button
          className={`icon-pill mic-pill ${isVoiceActive ? 'active' : ''} ${voice.mode === 'recorder' ? 'fallback' : ''}`}
          title={voice.mode === 'unsupported' ? 'Voice input not supported in this browser' : voice.mode === 'speech' ? 'Voice input (click to toggle, hold Space to push-to-talk)' : 'Voice recorder (click to start/stop)'}
          aria-label={voice.state === 'listening' || voice.state === 'recording' ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={isVoiceActive}
          onClick={() => voice.toggle()}
          disabled={disabled || voice.state === 'unsupported'}
        >
          <span className={`mic-dot ${isVoiceActive ? 'live' : ''}`} aria-hidden />
          <i className={micIcon} aria-hidden />
          {voice.mode === 'recorder' && <span className="mic-mode-tag" aria-hidden>R</span>}
        </button>
        {disabled && onStop ? (
          <button className="send-btn stop-btn" onClick={onStop} aria-label="Stop generating" title="Stop (Esc)">
            <i className="ti ti-square-filled" aria-hidden />
          </button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={disabled || !hasAnything || processing || isVoiceActive} aria-label="Send message" title="Send (Enter)">
            <i className="ti ti-arrow-up" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function VoiceStatusPill({
  state,
  mode,
  interim,
  elapsed,
  onCancel,
  onStop,
}: {
  state: VoiceState;
  mode: 'speech' | 'recorder' | 'unsupported';
  interim: string;
  elapsed: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  if (state === 'idle' || state === 'denied' || state === 'unsupported') return null;
  const isListening = state === 'listening';
  const isRecording = state === 'recording';
  const isRequesting = state === 'requesting';

  let label = '';
  if (isRequesting) label = 'Requesting microphone…';
  else if (isListening) label = interim ? 'Listening…' : 'Speak now';
  else if (isRecording) label = `Recording ${formatElapsed(elapsed)}`;

  return (
    <div className={`voice-pill voice-pill-${state}`} role="status" aria-live="polite">
      <span className="voice-pill-dot" aria-hidden />
      <span className="voice-pill-label">{label}</span>
      {interim && isListening && (
        <span className="voice-pill-interim">{interim}</span>
      )}
      <span className="voice-pill-spacer" />
      <span className="voice-pill-tag">
        {mode === 'speech' ? (isRecording ? '' : 'live transcript') : 'audio capture'}
      </span>
      <button className="voice-pill-stop" onClick={onStop} aria-label="Stop" title="Stop (Space release)">
        <i className="ti ti-square" aria-hidden />
      </button>
      <button className="voice-pill-cancel" onClick={onCancel} aria-label="Cancel" title="Cancel (Esc)">
        <i className="ti ti-x" aria-hidden />
      </button>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
}