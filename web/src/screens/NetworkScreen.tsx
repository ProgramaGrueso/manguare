import {
  Bot,
  Camera,
  Heart,
  ImagePlus,
  MessageCircle,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
}from 'lucide-react';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import { InterfaceError, message, type MessageKey } from '../i18n/catalog';
import { useTranslation } from '../i18n/LanguageContext';
import { useSession } from '../app/SessionContext';
import { EmptyState } from '../components/EmptyState';
import { Sheet } from '../components/Sheet';
import {
  ASSISTANT_SUGGESTIONS,
  assistantReply,
  type AssistantAction,
} from '../lib/assistant';
import { compressImage } from '../lib/photo';
import { syncPosts } from '../lib/social-sync';
import {
  addComment,
  addPost,
  demoReply,
  initials,
  loadSocialState,
  MATCH_PROFILES,
  MAX_COMMENT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_POST_CHARS,
  pendingProfiles,
  applySync,
  hasPendingWork,
  removePost,
  resetSwipes,
  ROLE_LABEL,
  saveSocialState,
  sendMessage,
  swipe,
  timeAgo,
  toggleLike,
  type MatchProfile,
  type Post,
  type SocialState,
} from '../lib/social';

type NetworkTab = 'wall' | 'match' | 'agent';

export function NetworkScreen({
  onNewAlert,
  onOpenCommunity,
  onOpenVoice,
  initialTab = 'wall',
}: {
  onNewAlert: () => void;
  onOpenCommunity: () => void;
  onOpenVoice: () => void;
  initialTab?: NetworkTab;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<NetworkTab>(initialTab);
  const [state, setState] = useState<SocialState>(() => loadSocialState());
  const { showToast } = useApp();
  const warnedRef = useRef(false);
  const { session } = useSession();
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (busyRef.current || !navigator.onLine) return;
      busyRef.current = true;
      try {
        const result = await syncPosts(session.phone, stateRef.current);
        if (!alive) return;
        setOnline(result.serverPosts !== null);
        if (result.patches.length > 0 || result.serverPosts) {
          setState((previous) => applySync(previous, result.patches, result.serverPosts));
        }
      } finally {
        busyRef.current = false;
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 20_000);
    const onOnline = () => void run();
    window.addEventListener('online', onOnline);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [session.phone]);

  // Si hay algo pendiente, reintenta pronto (publicar, comentar, dar «me gusta»).
  const pending = hasPendingWork(state);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      if (busyRef.current || !navigator.onLine) return;
      busyRef.current = true;
      void syncPosts(session.phone, stateRef.current)
        .then((result) => {
          setOnline(result.serverPosts !== null);
          setState((previous) => applySync(previous, result.patches, result.serverPosts));
        })
        .finally(() => {
          busyRef.current = false;
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pending, state, session.phone]);

  useEffect(() => {
    const saved = saveSocialState(state);
    if (!saved && !warnedRef.current) {
      warnedRef.current = true;
      showToast(message('network.pocoEspacioEnElTelefono'), 'warn');
    }
  }, [state, showToast]);

  const runAction = (action?: AssistantAction) => {
    if (action === 'new-alert') onNewAlert();
    else if (action === 'community') onOpenCommunity();
    else if (action === 'wall') setTab('wall');
    else if (action === 'match') setTab('match');
  };

  return (
    <div className="screen network">
      <header className="screen-head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-dot" /> {t('network.tuComunidadTambienSinSenal')}
          </p>
          <h1>{t('network.redManguare')}</h1>
          <p className="screen-lead">
            {t('network.comparteConectaYPregunta')}{' '}
            {online ? (pending ? t('network.enviandoCambios') : t('network.muroCompartidoYAlDia')) : t('network.sinConexionSeGuardaAqui')}
          </p>
        </div>
      </header>

      <div className="net-tabs" role="tablist" aria-label={t('network.seccionesDeLaRed')}>
        {(
          [
            ['wall', t('network.muro'), Users],
            ['match', t('network.match'), Heart],
            ['agent', t('network.asistente'), Bot],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`net-tab-${id}`}
            className={`net-tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {tab === 'wall' ? <WallView state={state} setState={setState} /> : null}
      {tab === 'match' ? <MatchView state={state} setState={setState} /> : null}
      {tab === 'agent' ? <AgentView onAction={runAction} onOpenVoice={onOpenVoice} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Muro                                                                */
/* ------------------------------------------------------------------ */

function Avatar({ name, hue }: { name: string; hue?: number }) {
  const color = hue ?? (name.length * 37) % 360;
  return (
    <span
      className="net-avatar"
      style={{ background: `hsl(${color} 45% 88%)`, color: `hsl(${color} 55% 25%)` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function PostCard({
  post,
  mine,
  onLike,
  onComment,
  onRemove,
}: {
  post: Post;
  mine: boolean;
  onLike: () => void;
  onComment: (text: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onComment(text);
    setText('');
  };

  return (
    <article className="card net-post" data-testid="net-post">
      <header className="net-post-head">
        <Avatar name={post.author} />
        <div className="net-post-who">
          <strong>{post.author}</strong>
          <span>
            {post.community} · {timeAgo(post.at)}
          </span>
        </div>
        {mine ? (
          <button
            type="button"
            className="icon-btn"
            aria-label={t('network.eliminarMiPublicacion')}
            onClick={onRemove}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {post.text ? <p className="net-post-text">{post.text}</p> : null}
      {post.photo ? (
        <img className="net-post-photo" src={post.photo} alt={t('network.fotoDeLaPublicacion')} loading="lazy" />
      ) : null}

      <div className="net-post-actions">
        <button
          type="button"
          className={`net-action ${post.likedByMe ? 'is-on' : ''}`}
          aria-pressed={post.likedByMe}
          data-testid="net-like"
          onClick={onLike}
        >
          <Heart size={18} aria-hidden="true" fill={post.likedByMe ? 'currentColor' : 'none'} />
          {post.likes}
        </button>
        <button
          type="button"
          className="net-action"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MessageCircle size={18} aria-hidden="true" />
          {post.comments.length}
        </button>
      </div>

      {open ? (
        <div className="net-comments">
          {post.comments.map((comment) => (
            <p key={comment.id} className="net-comment">
              <strong>{comment.author}</strong> {comment.text}
            </p>
          ))}
          <form className="net-inline-form" onSubmit={submit}>
            <input
              type="text"
              value={text}
              maxLength={MAX_COMMENT_CHARS}
              placeholder={t('network.escribeUnComentario')}
              aria-label={t('network.escribeUnComentario')}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className="icon-btn" aria-label={t('network.enviarComentario')}>
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

function WallView({
  state,
  setState,
}: {
  state: SocialState;
  setState: (updater: (previous: SocialState) => SocialState) => void;
}) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { showToast } = useApp();
  const [composeOpen, setComposeOpen] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setComposeOpen(false);
    setText('');
    setPhoto(undefined);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await compressImage(file, { maxSide: 900, maxChars: 160_000 }));
    } catch (error) {
      showToast(error instanceof InterfaceError ? message(error.key) : message('network.noSePudoUsarLaFoto'), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const publish = () => {
    if (!text.trim() && !photo) return;
    setState((previous) =>
      addPost(previous, {
        author: session.name,
        community: session.community ?? t('network.miComunidad'),
        text,
        photo,
      }),
    );
    close();
    showToast(message('network.publicadoSeGuardaEnTuTelefono'), 'ok');
  };

  return (
    <section aria-label={t('network.muroDeLaComunidad')}>
      <button
        type="button"
        className="btn btn-primary btn-block net-compose-btn"
        data-testid="net-compose"
        onClick={() => setComposeOpen(true)}
      >
        <Plus size={18} aria-hidden="true" /> {t('network.compartirConMiComunidad')}
      </button>

      {state.posts.length === 0 ? (
        <EmptyState icon={Users} title={t('network.aunNoHayPublicaciones')}>
          {t('network.seLaPrimeraPersonaEnCompartir')}
        </EmptyState>
      ) : (
        <div className="net-feed">
          {state.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              mine={post.author === session.name}
              onLike={() => setState((previous) => toggleLike(previous, post.id))}
              onComment={(value) =>
                setState((previous) => addComment(previous, post.id, session.name, value))
              }
              onRemove={() => setState((previous) => removePost(previous, post.id))}
            />
          ))}
        </div>
      )}

      <Sheet
        open={composeOpen}
        title={t('network.nuevaPublicacion')}
        onClose={close}
        footer={
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || (!text.trim() && !photo)}
            data-testid="net-publish"
            onClick={publish}
          >
            {t('community.publicar')}
          </button>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="net-text">
            {t('network.queQuieresCompartir')}
          </label>
          <textarea
            id="net-text"
            rows={4}
            maxLength={MAX_POST_CHARS}
            value={text}
            placeholder={t('network.unAvisoUnaCosechaUnaNovedad')}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="field-help">
            {text.length}/{MAX_POST_CHARS}
          </p>
        </div>

        {photo ? (
          <div className="net-photo-preview">
            <img src={photo} alt={t('network.vistaPreviaDeLaFoto')} />
            <button
              type="button"
              className="icon-btn"
              aria-label={t('network.quitarFoto')}
              onClick={() => setPhoto(undefined)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="net-photo-input"
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Camera size={18} aria-hidden="true" />
              ) : (
                <ImagePlus size={18} aria-hidden="true" />
              )}{' '}
              {busy ? t('network.procesando') : t('network.agregarFoto')}
            </button>
          </>
        )}
        <p className="field-help">
          {t('network.lasPublicacionesDeEstaDemostracionSe')}
        </p>
      </Sheet>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Match                                                               */
/* ------------------------------------------------------------------ */

function ProfileCard({ profile }: { profile: MatchProfile }) {
  const { t } = useTranslation();
  return (
    <article className="card net-profile" data-testid="net-profile">
      <div
        className="net-profile-cover"
        style={{
          background: `linear-gradient(135deg, hsl(${profile.hue} 55% 82%), hsl(${(profile.hue + 40) % 360} 50% 70%))`,
        }}
      >
        <span className="net-profile-initials">{initials(profile.name)}</span>
        <span className="net-role">{ROLE_LABEL[profile.role]}</span>
      </div>
      <div className="net-profile-body">
        <h2>{profile.name}</h2>
        <p className="net-profile-where">{profile.community}</p>
        <p className="net-profile-headline">{profile.headline}</p>
        <p>{profile.about}</p>
        <ul className="net-tags" aria-label={t('network.etiquetas')}>
          {profile.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function MatchView({
  state,
  setState,
}: {
  state: SocialState;
  setState: (updater: (previous: SocialState) => SocialState) => void;
}) {
  const { t } = useTranslation();
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const queue = useMemo(() => pendingProfiles(state), [state]);
  const current = queue[0];
  const matched = MATCH_PROFILES.filter((profile) => state.matches.includes(profile.id));
  const matchedProfile = MATCH_PROFILES.find((profile) => profile.id === matchedId);
  const chatProfile = MATCH_PROFILES.find((profile) => profile.id === chatId);

  const decide = (direction: 'like' | 'pass') => {
    if (!current) return;
    const result = swipe(state, current.id, direction);
    setState(() => result.state);
    if (result.matched) setMatchedId(current.id);
  };

  return (
    <section aria-label={t('network.matchDeProductoresYCompradores')}>
      {current ? (
        <>
          <ProfileCard profile={current} />
          <div className="net-swipe-actions">
            <button
              type="button"
              className="btn btn-secondary net-pass"
              data-testid="net-pass"
              onClick={() => decide('pass')}
            >
              <X size={20} aria-hidden="true" /> {t('network.pasar')}
            </button>
            <button
              type="button"
              className="btn btn-primary net-like"
              data-testid="net-interest"
              onClick={() => decide('like')}
            >
              <Heart size={20} aria-hidden="true" /> {t('network.meInteresa')}
            </button>
          </div>
          <p className="field-help net-count">
            {queue.length} {queue.length === 1 ? t('network.perfilPorVer') : t('network.perfilesPorVer')}
          </p>
        </>
      ) : (
        <EmptyState icon={Sparkles} title={t('network.visteTodosLosPerfiles')}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setState((previous) => resetSwipes(previous))}
          >
            <RotateCcw size={16} aria-hidden="true" /> {t('network.volverAVerLosDescartados')}
          </button>
        </EmptyState>
      )}

      <section className="community-section" aria-labelledby="net-matches">
        <h2 id="net-matches">{t('network.tusMatches', { count: matched.length })}</h2>
        {matched.length === 0 ? (
          <p className="field-help">{t('network.aunNoTienesMatches')}</p>
        ) : (
          <ul className="net-match-list">
            {matched.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  className="card net-match-item"
                  onClick={() => setChatId(profile.id)}
                >
                  <Avatar name={profile.name} hue={profile.hue} />
                  <span className="net-post-who">
                    <strong>{profile.name}</strong>
                    <span>{profile.headline}</span>
                  </span>
                  <MessageCircle size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={Boolean(matchedProfile)} title={t('network.hicieronMatch')} onClose={() => setMatchedId(null)}>
        {matchedProfile ? (
          <div className="net-match-modal">
            <Avatar name={matchedProfile.name} hue={matchedProfile.hue} />
            <p>
              <strong>{matchedProfile.name}</strong> {t('network.tambienSeInteresoPorTuPerfil')}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                setChatId(matchedProfile.id);
                setMatchedId(null);
              }}
            >
              <MessageCircle size={18} aria-hidden="true" /> {t('network.enviarMensaje')}
            </button>
          </div>
        ) : null}
      </Sheet>

      {chatProfile ? (
        <ChatSheet
          profile={chatProfile}
          state={state}
          setState={setState}
          onClose={() => setChatId(null)}
        />
      ) : null}
    </section>
  );
}

function ChatSheet({
  profile,
  state,
  setState,
  onClose,
}: {
  profile: MatchProfile;
  state: SocialState;
  setState: (updater: (previous: SocialState) => SocialState) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const messages = state.chats[profile.id] ?? [];

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setState((previous) => sendMessage(previous, profile.id, 'me', text));
    setText('');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState((previous) => sendMessage(previous, profile.id, 'them', demoReply(profile)));
    }, 900);
  };

  return (
    <Sheet open title={profile.name} onClose={onClose}>
      <p className="field-help">{t('network.chatDeDemostracionLasRespuestasSon')}</p>
      <div className="net-chat" aria-live="polite">
        {messages.length === 0 ? (
          <p className="field-help">{t('network.escribeElPrimerMensajeParaCoordinar')}</p>
        ) : (
          messages.map((message) => (
            <p key={message.id} className={`net-bubble ${message.from === 'me' ? 'is-me' : ''}`}>
              {message.text}
            </p>
          ))
        )}
      </div>
      <form className="net-inline-form" onSubmit={submit}>
        <input
          type="text"
          value={text}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={t('network.escribeUnMensaje')}
          aria-label={t('network.escribeUnMensaje')}
          data-testid="net-chat-input"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="icon-btn" aria-label={t('network.enviarMensaje')}>
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Asistente                                                           */
/* ------------------------------------------------------------------ */

interface AgentMessage {
  id: number;
  from: 'me' | 'bot';
  text: string;
  action?: AssistantAction;
}

const ACTION_LABEL: Partial<Record<AssistantAction, MessageKey>> = {
  'new-alert': 'network.action.crearAlerta',
  community: 'network.action.irAComunidad',
  wall: 'network.action.irAlMuro',
  match: 'network.action.irAMatch',
};

function AgentView({
  onAction,
  onOpenVoice,
}: {
  onAction: (action?: AssistantAction) => void;
  onOpenVoice: () => void;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 0,
      from: 'bot',
      text: t('network.holaSoyElAsistenteDeManguare'),
    },
  ]);
  const [text, setText] = useState('');
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages]);

  const ask = (value: string) => {
    const question = value.trim();
    if (!question) return;
    const reply = assistantReply(question);
    setMessages((previous) => [
      ...previous,
      { id: nextId.current++, from: 'me', text: question },
      { id: nextId.current++, from: 'bot', text: reply.text, action: reply.action },
    ]);
    setText('');
  };

  return (
    <section aria-label={t('network.asistente')}>
      <button
        type="button"
        className="btn btn-primary"
        data-testid="net-open-voice"
        onClick={onOpenVoice}
      >
        <Mic size={18} />
        {t('network.hablarConManguare')}
      </button>
      <p className="field-help">
        {t('network.asistenteLocalConReglasNoUn')}
      </p>
      <div className="net-chat net-agent-chat" aria-live="polite" data-testid="net-agent-chat">
        {messages.map((message) => (
          <div key={message.id} className={`net-agent-row ${message.from === 'me' ? 'is-me' : ''}`}>
            <p className={`net-bubble ${message.from === 'me' ? 'is-me' : ''}`}>{message.text}</p>
            {message.action && ACTION_LABEL[message.action] ? (
              <button
                type="button"
                className="btn btn-secondary net-bubble-action"
                onClick={() => onAction(message.action)}
              >
                {t(ACTION_LABEL[message.action]!)}
              </button>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="net-suggestions">
        {ASSISTANT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="community-chip"
            onClick={() => ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="net-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={200}
          placeholder={t('network.preguntameAlgo')}
          aria-label={t('network.preguntaleAlAsistente')}
          data-testid="net-agent-input"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="icon-btn" aria-label={t('network.enviarPregunta')}>
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
