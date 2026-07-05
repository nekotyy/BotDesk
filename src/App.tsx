import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Bot as BotIcon, Check, ChevronRight, CircleHelp,
  Eye, EyeOff, File, Hash, Image, Inbox, LoaderCircle, MessageCircleMore, Mic, Plus,
  Radio, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, Video,
  UserRoundSearch, Wifi, WifiOff, X,
} from 'lucide-react';
import type { AppState, Bot, Chat, MediaPayload, Message } from './types';
import './App.css';

const emptyState: AppState = { bots: [], selectedBotId: null, chatsByBot: {}, messagesByBot: {} };
const avatarCache = new Map<string, string>();
const demoBot: Bot = { id: 'demo-bot', name: 'Support Bot', username: 'support_demo_bot', telegramId: 100001, createdAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), status: 'online' };
const demoChat: Chat = { id: 'demo-chat', telegramId: 6605474392, type: 'private', title: 'РђРЅРЅР° Р’РѕР»РєРѕРІР°', firstName: 'РђРЅРЅР°', lastName: 'Р’РѕР»РєРѕРІР°', username: 'anna_volkova', lastMessage: 'Р”Р°, С‚РµРїРµСЂСЊ РІСЃС‘ СЂР°Р±РѕС‚Р°РµС‚. РЎРїР°СЃРёР±Рѕ!', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
const demoState: AppState = {
  bots: [demoBot], selectedBotId: demoBot.id,
  chatsByBot: { [demoBot.id]: [demoChat] },
  messagesByBot: { [demoBot.id]: { [demoChat.id]: [
    { id: 'demo-1', chatId: demoChat.id, text: 'Р—РґСЂР°РІСЃС‚РІСѓР№С‚Рµ! РџРѕРґСЃРєР°Р¶РёС‚Рµ, РєР°Рє РїРѕРґРєР»СЋС‡РёС‚СЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ?', direction: 'incoming', senderName: 'РђРЅРЅР° Р’РѕР»РєРѕРІР°', sentAt: new Date(Date.now() - 180_000).toISOString(), status: 'sent' },
    { id: 'demo-2', chatId: demoChat.id, text: 'РћС‚РєСЂРѕР№С‚Рµ РЅР°СЃС‚СЂРѕР№РєРё Р±РѕС‚Р° Рё РІРєР»СЋС‡РёС‚Рµ РїСѓРЅРєС‚ В«РќРѕРІС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏВ».', direction: 'outgoing', senderName: demoBot.name, sentAt: new Date(Date.now() - 120_000).toISOString(), status: 'sent' },
    { id: 'demo-3', chatId: demoChat.id, text: 'Р”Р°, С‚РµРїРµСЂСЊ РІСЃС‘ СЂР°Р±РѕС‚Р°РµС‚. РЎРїР°СЃРёР±Рѕ!', direction: 'incoming', senderName: 'РђРЅРЅР° Р’РѕР»РєРѕРІР°', sentAt: new Date().toISOString(), status: 'sent' },
  ] } },
};

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TG';
}

function Avatar({ title, botId, fileId, size = 'md', online = false }: { title: string; botId?: string; fileId?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; online?: boolean }) {
  const cacheKey = botId && fileId ? `${botId}:${fileId}` : '';
  const [src, setSrc] = useState(cacheKey ? avatarCache.get(cacheKey) : undefined);
  useEffect(() => {
    if (!botId || !fileId) { setSrc(undefined); return; }
    const key = `${botId}:${fileId}`;
    if (avatarCache.has(key)) { setSrc(avatarCache.get(key)); return; }
    let live = true;
    setSrc(undefined);
    window.tgManager.getAvatar(botId, fileId).then((data) => {
      if (data) { avatarCache.set(key, data); if (live) setSrc(data); }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [botId, fileId]);
  return (
    <span className={`avatar avatar--${size}`} aria-label={`РђРІР°С‚Р°СЂ: ${title}`}>
      {src ? <img src={src} alt="" /> : <span>{initials(title)}</span>}
      {online && <i className="avatar__status" title="Р‘РѕС‚ РґРѕСЃС‚СѓРїРµРЅ" />}
    </span>
  );
}

function timeLabel(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso); const today = new Date();
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(date);
  return new Intl.DateTimeFormat('ru', { day: '2-digit', month: 'short' }).format(date);
}

function dayLabel(iso: string) {
  const date = new Date(iso); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'РЎРµРіРѕРґРЅСЏ';
  if (date.toDateString() === yesterday.toDateString()) return 'Р’С‡РµСЂР°';
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
}

function Modal({ children, onClose, labelledBy }: { children: React.ReactNode; onClose: () => void; labelledBy: string }) {
  useEffect(() => { const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</section></div>;
}

function AddBotForm({ onboarding = false, onDone, onCancel }: { onboarding?: boolean; onDone: (state: AppState) => void; onCancel?: () => void }) {
  const [name, setName] = useState(''); const [token, setToken] = useState(''); const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (!window.tgManager) throw new Error('РћС‚РєСЂРѕР№С‚Рµ BotDesk РєР°Рє desktop-РїСЂРёР»РѕР¶РµРЅРёРµ, Р° РЅРµ РєР°Рє СЃС‚СЂР°РЅРёС†Сѓ РІ Р±СЂР°СѓР·РµСЂРµ.');
      onDone(await window.tgManager.addBot({ name, token }));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ Р±РѕС‚Р°'); }
    finally { setBusy(false); }
  };
  return (
    <form className={`add-form ${onboarding ? 'add-form--onboarding' : ''}`} onSubmit={submit}>
      <div className="field">
        <label htmlFor="bot-name">РќР°Р·РІР°РЅРёРµ РІ BotDesk</label>
        <input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="РќР°РїСЂРёРјРµСЂ, Р‘РѕС‚ РїРѕРґРґРµСЂР¶РєРё" maxLength={40} autoFocus />
        <small>Р•РіРѕ СѓРІРёРґРёС‚Рµ С‚РѕР»СЊРєРѕ РІС‹ вЂ” РјРѕР¶РЅРѕ РїРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ РєР°Рє СѓРґРѕР±РЅРѕ.</small>
      </div>
      <div className="field">
        <label htmlFor="bot-token">РўРѕРєРµРЅ BotFather</label>
        <div className="input-with-action">
          <input id="bot-token" type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAвЂ¦" autoComplete="off" spellCheck={false} />
          <button type="button" className="icon-button icon-button--inside" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? 'РЎРєСЂС‹С‚СЊ С‚РѕРєРµРЅ' : 'РџРѕРєР°Р·Р°С‚СЊ С‚РѕРєРµРЅ'}>{showToken ? <EyeOff /> : <Eye />}</button>
        </div>
        <small className="secure-note"><ShieldCheck /> РўРѕРєРµРЅ С…СЂР°РЅРёС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ Рё С€РёС„СЂСѓРµС‚СЃСЏ СЃСЂРµРґСЃС‚РІР°РјРё Windows.</small>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="button button--quiet" onClick={onCancel}>РћС‚РјРµРЅР°</button>}
        <button className="button button--primary" disabled={busy || !name.trim() || !token.trim()}>{busy ? <><LoaderCircle className="spin" /> РџСЂРѕРІРµСЂСЏСЋвЂ¦</> : <>{onboarding ? 'РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ' : 'Р”РѕР±Р°РІРёС‚СЊ Р±РѕС‚Р°'} <ChevronRight /></>}</button>
      </div>
    </form>
  );
}

function Onboarding({ onDone }: { onDone: (state: AppState) => void }) {
  return (
    <main className="onboarding">
      <section className="onboarding__story">
        <div className="brand brand--light"><span className="brand__mark"><BotIcon /></span><span>BotDesk</span></div>
        <div className="onboarding__copy">
          <span className="eyebrow"><Sparkles /> Р’СЃРµ РґРёР°Р»РѕРіРё РІ РѕРґРЅРѕРј РѕРєРЅРµ</span>
          <h1>Р’Р°С€Рё Telegram-Р±РѕС‚С‹.<br />РЎРїРѕРєРѕР№РЅРѕ Рё РїРѕ РїРѕР»РѕС‡РєР°Рј.</h1>
          <p>РћС‚РІРµС‡Р°Р№С‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј РѕС‚ РёРјРµРЅРё Р±РѕС‚Р°, РЅР°С…РѕРґРёС‚Рµ РЅСѓР¶РЅС‹Р№ С‡Р°С‚ РїРѕ ID Рё РЅРµ С‚РµСЂСЏР№С‚Рµ РёСЃС‚РѕСЂРёСЋ РїРµСЂРµРїРёСЃРєРё.</p>
          <div className="feature-row"><span><Check /> Р”Рѕ 15 Р±РѕС‚РѕРІ</span><span><Check /> Р›РѕРєР°Р»СЊРЅР°СЏ РёСЃС‚РѕСЂРёСЏ</span><span><Check /> Р‘РµР· РѕР±Р»Р°РєР°</span></div>
        </div>
        <div className="onboarding__visual" aria-hidden="true">
          <div className="visual-card visual-card--one"><Avatar title="РђРЅРЅР° Р’РѕР»РєРѕРІР°" size="md" /><span><b>РђРЅРЅР° Р’РѕР»РєРѕРІР°</b><small>РЎРїР°СЃРёР±Рѕ! Р’СЃС‘ РїРѕР»СѓС‡РёР»РѕСЃСЊ</small></span></div>
          <div className="visual-card visual-card--two"><span className="mini-bot"><BotIcon /></span><span><b>Support Bot</b><small>РћС‚РІРµС‡Р°РµС‚ СЃРµР№С‡Р°СЃ</small></span></div>
          <div className="visual-bubble">Р Р°Рґ РїРѕРјРѕС‡СЊ! Р•СЃР»Рё С‡С‚Рѕ вЂ” СЏ СЂСЏРґРѕРј.</div>
        </div>
        <small className="onboarding__foot">BotDesk РЅРµ РїРµСЂРµРґР°С‘С‚ С‚РѕРєРµРЅС‹ Рё РїРµСЂРµРїРёСЃРєСѓ С‚СЂРµС‚СЊРёРј Р»РёС†Р°Рј</small>
      </section>
      <section className="onboarding__setup">
        <div className="setup-card">
          <span className="step-pill">РЁР°Рі 1 РёР· 1</span>
          <h2>РџРѕРґРєР»СЋС‡РёС‚Рµ РїРµСЂРІРѕРіРѕ Р±РѕС‚Р°</h2>
          <p className="muted">Р’РѕР·СЊРјРёС‚Рµ С‚РѕРєРµРЅ Сѓ <b>@BotFather</b>. РњС‹ РїСЂРѕРІРµСЂРёРј РµРіРѕ РїРµСЂРµРґ СЃРѕС…СЂР°РЅРµРЅРёРµРј.</p>
          <AddBotForm onboarding onDone={onDone} />
          <a className="help-link" href="https://t.me/BotFather" target="_blank" rel="noreferrer"><CircleHelp /> Р“РґРµ РЅР°Р№С‚Рё С‚РѕРєРµРЅ?</a>
        </div>
      </section>
    </main>
  );
}

function BotRail({ bots, activeId, onHome, onOpen, onAdd }: { bots: Bot[]; activeId?: string; onHome: () => void; onOpen: (bot: Bot) => void; onAdd: () => void }) {
  return <aside className="bot-rail" aria-label="Р‘РѕС‚С‹"><button className="rail-brand" onClick={onHome} aria-label="Р’СЃРµ Р±РѕС‚С‹"><BotIcon /></button><div className="rail-divider" />
    <div className="rail-bots">{bots.map((bot) => <button key={bot.id} className={`rail-avatar ${activeId === bot.id ? 'is-active' : ''}`} onClick={() => onOpen(bot)} aria-label={`РћС‚РєСЂС‹С‚СЊ ${bot.name}`} title={bot.name}><Avatar title={bot.name} botId={bot.id} fileId={bot.avatarFileId} size="sm" online={bot.status === 'online'} /></button>)}</div>
    {bots.length < 15 && <button className="rail-add" onClick={onAdd} aria-label="Р”РѕР±Р°РІРёС‚СЊ Р±РѕС‚Р°"><Plus /></button>}
  </aside>;
}

function BotHub({ state, onOpen, onAdd, onRemove }: { state: AppState; onOpen: (bot: Bot) => void; onAdd: () => void; onRemove: (bot: Bot) => void }) {
  return <div className="app-shell"><BotRail bots={state.bots} onHome={() => undefined} onOpen={onOpen} onAdd={onAdd} /><main className="hub">
    <header className="hub__header"><div><span className="eyebrow eyebrow--blue">Р Р°Р±РѕС‡РµРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ</span><h1>Р’С‹Р±РµСЂРёС‚Рµ Р±РѕС‚Р°</h1><p>РћС‚РєСЂРѕР№С‚Рµ РІС…РѕРґСЏС‰РёРµ Рё РѕС‚РІРµС‡Р°Р№С‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј РѕС‚ РµРіРѕ РёРјРµРЅРё.</p></div><button className="button button--primary" onClick={onAdd} disabled={state.bots.length >= 15}><Plus /> Р”РѕР±Р°РІРёС‚СЊ Р±РѕС‚Р°</button></header>
    <div className="hub__summary"><div><BotIcon /><span><b>{state.bots.length}</b><small>РїРѕРґРєР»СЋС‡РµРЅРѕ РёР· 15</small></span></div><div><MessageCircleMore /><span><b>{Object.values(state.chatsByBot).reduce((sum, chats) => sum + chats.length, 0)}</b><small>РґРёР°Р»РѕРіРѕРІ СЃРѕС…СЂР°РЅРµРЅРѕ</small></span></div></div>
    <section className="bot-grid" aria-label="РџРѕРґРєР»СЋС‡С‘РЅРЅС‹Рµ Р±РѕС‚С‹">{state.bots.map((bot) => {
      const chats = state.chatsByBot[bot.id] || []; const unread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
      return <article className="bot-card" key={bot.id}><div className="bot-card__top"><Avatar title={bot.name} botId={bot.id} fileId={bot.avatarFileId} size="lg" online={bot.status === 'online'} /><div className="bot-card__actions"><span className={`status-chip status-chip--${bot.status}`}>{bot.status === 'online' ? <Wifi /> : bot.status === 'syncing' ? <RefreshCw className="spin" /> : <WifiOff />}{bot.status === 'online' ? 'РќР° СЃРІСЏР·Рё' : bot.status === 'syncing' ? 'РћР±РЅРѕРІР»РµРЅРёРµ' : 'РќРµС‚ РІС…РѕРґСЏС‰РёС…'}</span><button className="icon-button danger-on-hover" onClick={() => onRemove(bot)} aria-label={`РЈРґР°Р»РёС‚СЊ ${bot.name}`}><Trash2 /></button></div></div><h2>{bot.name}</h2><p>@{bot.username || 'Р±РµР· username'}</p>{bot.lastError && <div className="bot-card__warning"><AlertTriangle /> РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ</div>}<div className="bot-card__meta"><span><MessageCircleMore /> {chats.length} С‡Р°С‚РѕРІ</span>{unread > 0 && <span className="unread-label">{unread} РЅРѕРІС‹С…</span>}</div><button className="button button--card" onClick={() => onOpen(bot)}>РћС‚РєСЂС‹С‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ <ChevronRight /></button></article>;
    })}{state.bots.length < 15 && <button className="bot-card bot-card--add" onClick={onAdd}><span><Plus /></span><b>РџРѕРґРєР»СЋС‡РёС‚СЊ РµС‰С‘ Р±РѕС‚Р°</b><small>РћСЃС‚Р°Р»РѕСЃСЊ РјРµСЃС‚: {15 - state.bots.length}</small></button>}</section>
  </main></div>;
}

function ChatRow({ chat, botId, active, onClick }: { chat: Chat; botId: string; active: boolean; onClick: () => void }) {
  return <button className={`chat-row ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={`РћС‚РєСЂС‹С‚СЊ РґРёР°Р»РѕРі СЃ ${chat.title}`}><Avatar title={chat.title} botId={botId} fileId={chat.avatarFileId} size="md" /><span className="chat-row__body"><span className="chat-row__line"><b>{chat.title}</b><time>{timeLabel(chat.lastMessageAt)}</time></span><span className="chat-row__line"><small>{chat.lastMessage || (chat.username ? `@${chat.username}` : `ID ${chat.telegramId}`)}</small>{chat.unreadCount > 0 && <i>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</i>}</span></span></button>;
}

function mediaLabel(type: NonNullable<Message['media']>['type']) {
  const labels = { photo: 'Р¤РѕС‚Рѕ', sticker: 'РЎС‚РёРєРµСЂ', video: 'Р’РёРґРµРѕ', video_note: 'РљСЂСѓР¶РѕРє', voice: 'Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ' };
  return labels[type] || 'РњРµРґРёР°';
}

function mediaIcon(type: NonNullable<Message['media']>['type']) {
  if (type === 'photo') return <Image />;
  if (type === 'video' || type === 'video_note') return <Video />;
  if (type === 'voice') return <Mic />;
  return <File />;
}

function mediaPayloadUrl(payload?: MediaPayload | null) {
  if (!payload || payload.kind === 'lottie') return undefined;
  const [meta, base64 = ''] = payload.dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] || payload.mimeType;
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function LottieSticker({ animationData }: { animationData: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let destroyed = false;
    let animation: { destroy: () => void } | undefined;
    void import('lottie-web').then(({ default: lottie }) => {
      if (!ref.current || destroyed) return;
      animation = lottie.loadAnimation({
        container: ref.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData,
      });
    });
    return () => { destroyed = true; animation?.destroy(); };
  }, [animationData]);
  return <div className="message-lottie" ref={ref} aria-label="Анимированный стикер" />;
}

function MessageMediaView({ botId, message }: { botId: string; message: Message }) {
  const media = message.media;
  const [payload, setPayload] = useState<MediaPayload | null>();
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!media?.fileId) return;
    let live = true;
    setPayload(undefined);
    window.tgManager.getMedia(botId, media.fileId, media.mimeType).then((data) => {
      if (live) setPayload(data);
    }).catch(() => {
      if (live) setPayload(null);
    });
    return () => { live = false; };
  }, [botId, media?.fileId, media?.mimeType]);
  useEffect(() => {
    const url = mediaPayloadUrl(payload);
    setSrc(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [payload]);
  if (!media) return null;
  if (payload === undefined) return <div className="media-card media-card--loading">{mediaIcon(media.type)}<span>Загружаем {mediaLabel(media.type).toLowerCase()}</span></div>;
  if (!payload) return <div className="media-card media-card--placeholder">{mediaIcon(media.type)}<b>{mediaLabel(media.type)}</b><small>Не удалось загрузить файл</small></div>;
  if (payload.kind === 'lottie') return <LottieSticker animationData={payload.json} />;
  if (!src) return <div className="media-card media-card--loading">{mediaIcon(media.type)}<span>Готовим {mediaLabel(media.type).toLowerCase()}</span></div>;
  if (media.type === 'sticker' && payload.kind === 'video') return <video className="message-media message-media--sticker-video" src={src} autoPlay loop muted playsInline preload="auto" />;
  if (media.type === 'photo' || media.type === 'sticker') return <img className={`message-media message-media--${media.type}`} src={src} alt={mediaLabel(media.type)} loading="lazy" />;
  if (media.type === 'video' || media.type === 'video_note') return <video className={`message-media message-media--${media.type}`} src={src} controls playsInline preload="metadata" />;
  if (media.type === 'voice') return <audio className="message-audio" src={src} controls preload="auto" />;
  return null;
}

function Conversation({ bot, chat, messages, syncing, onRetry, onSend }: { bot: Bot; chat?: Chat; messages: Message[]; syncing: boolean; onRetry: () => void; onSend: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState(''); const [sending, setSending] = useState(false); const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const container = messagesRef.current; if (container) container.scrollTop = container.scrollHeight; }, [messages.length, chat?.id]);
  if (!chat) return <section className="conversation conversation--empty"><div className="empty-conversation"><span><MessageCircleMore /></span><h2>Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі</h2><p>РЎРѕРѕР±С‰РµРЅРёСЏ Рё РёРЅС„РѕСЂРјР°С†РёСЏ Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рµ РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.</p></div></section>;
  const send = async () => { const text = draft.trim(); if (!text || sending) return; setSending(true); try { await onSend(text); setDraft(''); } finally { setSending(false); } };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  let previousDay = '';
  return <section className="conversation"><header className="conversation__header"><Avatar title={chat.title} botId={bot.id} fileId={chat.avatarFileId} size="sm" /><div><b>{chat.title}</b><small>{chat.username ? `@${chat.username} В· ` : ''}ID {chat.telegramId}</small></div><span className={`live-state ${bot.status === 'online' ? 'is-online' : 'is-offline'}`}>{bot.status === 'online' ? <Radio /> : <WifiOff />}{bot.status === 'online' ? 'Р’С…РѕРґСЏС‰РёРµ РІРєР»СЋС‡РµРЅС‹' : 'РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ'}</span></header>
    {bot.lastError && <div className="connection-banner" role="alert"><AlertTriangle /><span><b>Р’С…РѕРґСЏС‰РёРµ СЃРѕРѕР±С‰РµРЅРёСЏ РІСЂРµРјРµРЅРЅРѕ РЅРµ РїРѕСЃС‚СѓРїР°СЋС‚</b><small>{bot.lastError}</small></span><button onClick={onRetry} disabled={syncing}>{syncing ? <LoaderCircle className="spin" /> : <RefreshCw />} РџРѕРІС‚РѕСЂРёС‚СЊ</button></div>}
    <div className="messages" ref={messagesRef} aria-live="polite">
      {messages.length === 0 && <div className="history-start"><ShieldCheck /><span><b>Р”РёР°Р»РѕРі РїРѕРґРєР»СЋС‡С‘РЅ</b><small>РћР¶РёРґР°РµРј РЅРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ. РЎС‚Р°СЂР°СЏ РёСЃС‚РѕСЂРёСЏ РЅРµРґРѕСЃС‚СѓРїРЅР° С‡РµСЂРµР· Bot API.</small></span></div>}
      {messages.map((message) => {
        const day = dayLabel(message.sentAt);
        const showDay = day !== previousDay;
        const showText = !message.media || message.text !== mediaLabel(message.media.type);
        previousDay = day;
        return <div key={message.id}>{showDay && <div className="day-divider"><span>{day}</span></div>}<div className={`message-line message-line--${message.direction}`}>{message.direction === 'incoming' && <Avatar title={message.senderName || chat.title} botId={bot.id} fileId={chat.avatarFileId} size="sm" />}<div className="message-stack">{message.direction === 'incoming' && <b className="message-sender">{message.senderName || chat.title}</b>}<div className={`message-bubble ${message.media ? 'message-bubble--media' : ''}`}><MessageMediaView botId={bot.id} message={message} />{showText && <p>{message.text}</p>}<span>{timeLabel(message.sentAt)} {message.direction === 'outgoing' && <Check aria-label="РћС‚РїСЂР°РІР»РµРЅРѕ" />}</span></div></div></div></div>;
      })}
    </div>
    <footer className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={keyDown} placeholder={`РЎРѕРѕР±С‰РµРЅРёРµ РґР»СЏ ${chat.firstName || chat.title}`} rows={1} maxLength={4096} aria-label="РўРµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ" /><span className="composer__count">{draft.length > 3800 ? `${draft.length}/4096` : ''}</span><button onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ">{sending ? <LoaderCircle className="spin" /> : <Send />}</button></footer>
  </section>;
}

function Workspace({ state, bot, onState, onHome, onAdd, notify }: { state: AppState; bot: Bot; onState: (state: AppState) => void; onHome: () => void; onAdd: () => void; notify: (text: string, type?: 'error' | 'success') => void }) {
  const [activeChatId, setActiveChatId] = useState<string>(); const [query, setQuery] = useState(''); const [syncing, setSyncing] = useState(false); const [showId, setShowId] = useState(false); const [userId, setUserId] = useState(''); const [finding, setFinding] = useState(false);
  const chats = state.chatsByBot[bot.id] || [];
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return q ? chats.filter((c) => `${c.title} ${c.username || ''} ${c.telegramId}`.toLowerCase().includes(q)) : chats; }, [chats, query]);
  const activeChat = chats.find((chat) => chat.id === activeChatId); const messages = activeChatId ? state.messagesByBot[bot.id]?.[activeChatId] || [] : [];
  const sync = async (quiet = false) => { if (syncing) return; setSyncing(true); try { onState(await window.tgManager.syncBot(bot.id)); if (!quiet) notify('Р”РёР°Р»РѕРіРё СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅС‹', 'success'); } catch (e) { if (!quiet) notify(e instanceof Error ? e.message : 'РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё', 'error'); } finally { setSyncing(false); } };
  const openChat = async (chat: Chat) => { setActiveChatId(chat.id); if (chat.unreadCount) { try { onState(await window.tgManager.markRead(bot.id, chat.id)); } catch { /* local UI remains usable */ } } };
  useEffect(() => { if (!activeChatId && chats[0]) void openChat(chats[0]); }, [bot.id, chats[0]?.id]);
  const find = async (event: FormEvent) => { event.preventDefault(); setFinding(true); try { const result = await window.tgManager.findChat(bot.id, userId); onState(result.state); setActiveChatId(result.chatId); setShowId(false); setUserId(''); notify('Р”РёР°Р»РѕРі РЅР°Р№РґРµРЅ', 'success'); } catch (e) { notify(e instanceof Error ? e.message : 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ', 'error'); } finally { setFinding(false); } };
  const send = async (text: string) => { if (!activeChatId) return; try { onState(await window.tgManager.sendMessage(bot.id, activeChatId, text)); } catch (e) { notify(e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ', 'error'); throw e; } };
  return <div className="app-shell"><BotRail bots={state.bots} activeId={bot.id} onHome={onHome} onOpen={async (next) => { onState(await window.tgManager.selectBot(next.id)); setActiveChatId(undefined); }} onAdd={onAdd} />
    <aside className="chat-panel"><header className="chat-panel__header"><button className="mobile-back" onClick={onHome} aria-label="РќР°Р·Р°Рґ Рє Р±РѕС‚Р°Рј"><ArrowLeft /></button><div className="bot-heading"><Avatar title={bot.name} botId={bot.id} fileId={bot.avatarFileId} size="sm" online={bot.status === 'online'} /><span><b>{bot.name}</b><small>@{bot.username}</small></span></div><button className="icon-button" onClick={() => void sync()} aria-label="РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ" disabled={syncing}><RefreshCw className={syncing ? 'spin' : ''} /></button></header>
      <div className={`sync-strip sync-strip--${bot.status}`}>{bot.status === 'online' ? <Wifi /> : bot.status === 'syncing' ? <LoaderCircle className="spin" /> : <WifiOff />}<span><b>{bot.status === 'online' ? 'Р’С…РѕРґСЏС‰РёРµ Р°РєС‚РёРІРЅС‹' : bot.status === 'syncing' ? 'РџРѕР»СѓС‡Р°РµРј СЃРѕРѕР±С‰РµРЅРёСЏвЂ¦' : 'Р’С…РѕРґСЏС‰РёРµ РѕСЃС‚Р°РЅРѕРІР»РµРЅС‹'}</b><small>{bot.lastSyncAt ? <>РџРѕСЃР»РµРґРЅСЏСЏ РїСЂРѕРІРµСЂРєР° {timeLabel(bot.lastSyncAt)}</> : 'РџСЂРѕРІРµСЂСЏРµРј СЃРѕРµРґРёРЅРµРЅРёРµ'}</small></span></div>
      <div className="chat-tools"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="РРјСЏ, username РёР»Рё ID" aria-label="РџРѕРёСЃРє РґРёР°Р»РѕРіРѕРІ" />{query && <button onClick={() => setQuery('')} aria-label="РћС‡РёСЃС‚РёС‚СЊ РїРѕРёСЃРє"><X /></button>}</div><button className="id-button" onClick={() => setShowId(true)}><UserRoundSearch /> РћС‚РєСЂС‹С‚СЊ РїРѕ ID</button></div>
      <div className="chat-list">{filtered.length ? filtered.map((chat) => <ChatRow key={chat.id} chat={chat} botId={bot.id} active={chat.id === activeChatId} onClick={() => void openChat(chat)} />) : <div className="empty-list"><span><Inbox /></span><b>{query ? 'РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ' : 'РџРѕРєР° РЅРµС‚ РґРёР°Р»РѕРіРѕРІ'}</b><p>{query ? 'РџРѕРїСЂРѕР±СѓР№С‚Рµ РґСЂСѓРіРѕР№ Р·Р°РїСЂРѕСЃ.' : 'РќР°Р¶РјРёС‚Рµ В«РћР±РЅРѕРІРёС‚СЊВ» РёР»Рё РѕС‚РєСЂРѕР№С‚Рµ С‡Р°С‚ РїРѕ ID.'}</p></div>}</div>
    </aside><Conversation bot={bot} chat={activeChat} messages={messages} syncing={syncing} onRetry={() => void sync()} onSend={send} />
    {showId && <Modal onClose={() => setShowId(false)} labelledBy="find-title"><button className="modal__close" onClick={() => setShowId(false)} aria-label="Р—Р°РєСЂС‹С‚СЊ"><X /></button><span className="modal__icon"><Hash /></span><h2 id="find-title">РћС‚РєСЂС‹С‚СЊ РґРёР°Р»РѕРі РїРѕ ID</h2><p>Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓР¶Рµ РѕР±С‰Р°Р»СЃСЏ СЃ Р±РѕС‚РѕРј, Telegram СЂР°Р·СЂРµС€РёС‚ РѕС‚РєСЂС‹С‚СЊ СЌС‚РѕС‚ С‡Р°С‚.</p><form onSubmit={find}><div className="field"><label htmlFor="user-id">Telegram user ID</label><input id="user-id" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value.replace(/[^\d-]/g, ''))} placeholder="РќР°РїСЂРёРјРµСЂ, 123456789" autoFocus /></div><div className="form-actions"><button type="button" className="button button--quiet" onClick={() => setShowId(false)}>РћС‚РјРµРЅР°</button><button className="button button--primary" disabled={!userId || finding}>{finding ? <><LoaderCircle className="spin" /> РС‰СѓвЂ¦</> : 'РќР°Р№С‚Рё РґРёР°Р»РѕРі'}</button></div></form><small className="modal__hint"><ShieldCheck /> Р‘РѕС‚ РЅРµ РјРѕР¶РµС‚ РїРµСЂРІС‹Рј РЅР°РїРёСЃР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ, РєРѕС‚РѕСЂС‹Р№ СЃ РЅРёРј РµС‰С‘ РЅРµ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРѕРІР°Р».</small></Modal>}
  </div>;
}

export default function App() {
  const demoMode = new URLSearchParams(window.location.search).get('demo');
  const [state, setState] = useState<AppState>(demoMode ? demoState : emptyState); const [loading, setLoading] = useState(true); const [screen, setScreen] = useState<'bots' | 'workspace'>(demoMode === 'workspace' ? 'workspace' : 'bots'); const [addOpen, setAddOpen] = useState(false); const [removeBot, setRemoveBot] = useState<Bot>(); const [toast, setToast] = useState<{ text: string; type: 'error' | 'success' }>();
  useEffect(() => {
    if (!window.tgManager) { setLoading(false); return; }
    window.tgManager.getState().then(setState).catch((e) => setToast({ text: e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґР°РЅРЅС‹Рµ', type: 'error' })).finally(() => setLoading(false));
    const stopState = window.tgManager.onStateChanged(setState);
    const stopSyncErrors = window.tgManager.onSyncError((payload) => {
      setToast({ text: payload.message || 'РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё', type: 'error' });
    });
    return () => {
      stopState();
      stopSyncErrors();
    };
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(undefined), 4200); return () => window.clearTimeout(timer); }, [toast]);
  const notify = (text: string, type: 'error' | 'success' = 'success') => setToast({ text, type });
  const openBot = async (bot: Bot) => { try { setState(await window.tgManager.selectBot(bot.id)); setScreen('workspace'); } catch (e) { notify(e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ Р±РѕС‚Р°', 'error'); } };
  const selectedBot = state.bots.find((bot) => bot.id === state.selectedBotId) || state.bots[0];
  if (loading) return <main className="loading-screen"><span className="loading-logo"><BotIcon /></span><LoaderCircle className="spin" /><b>РћС‚РєСЂС‹РІР°РµРј BotDesk</b></main>;
  const doneAdding = (next: AppState) => { setState(next); setAddOpen(false); setScreen('bots'); notify('Р‘РѕС‚ СѓСЃРїРµС€РЅРѕ РїРѕРґРєР»СЋС‡С‘РЅ'); };
  const remove = async () => { if (!removeBot) return; try { setState(await window.tgManager.removeBot(removeBot.id)); setRemoveBot(undefined); notify('Р‘РѕС‚ СѓРґР°Р»С‘РЅ'); } catch (e) { notify(e instanceof Error ? e.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р±РѕС‚Р°', 'error'); } };
  return <>{state.bots.length === 0 ? <Onboarding onDone={doneAdding} /> : screen === 'workspace' && selectedBot ? <Workspace state={state} bot={selectedBot} onState={setState} onHome={() => setScreen('bots')} onAdd={() => setAddOpen(true)} notify={notify} /> : <BotHub state={state} onOpen={(bot) => void openBot(bot)} onAdd={() => setAddOpen(true)} onRemove={setRemoveBot} />}
    {addOpen && <Modal onClose={() => setAddOpen(false)} labelledBy="add-title"><button className="modal__close" onClick={() => setAddOpen(false)} aria-label="Р—Р°РєСЂС‹С‚СЊ"><X /></button><span className="modal__icon"><BotIcon /></span><h2 id="add-title">РџРѕРґРєР»СЋС‡РёС‚СЊ Р±РѕС‚Р°</h2><p>Р”РѕР±Р°РІСЊС‚Рµ РЅР°Р·РІР°РЅРёРµ Рё С‚РѕРєРµРЅ РёР· BotFather.</p><AddBotForm onDone={doneAdding} onCancel={() => setAddOpen(false)} /></Modal>}
    {removeBot && <Modal onClose={() => setRemoveBot(undefined)} labelledBy="remove-title"><button className="modal__close" onClick={() => setRemoveBot(undefined)} aria-label="Р—Р°РєСЂС‹С‚СЊ"><X /></button><span className="modal__icon modal__icon--danger"><Trash2 /></span><h2 id="remove-title">РЈРґР°Р»РёС‚СЊ В«{removeBot.name}В»?</h2><p>Р›РѕРєР°Р»СЊРЅР°СЏ РёСЃС‚РѕСЂРёСЏ СЌС‚РѕРіРѕ Р±РѕС‚Р° С‚Р°РєР¶Рµ Р±СѓРґРµС‚ СѓРґР°Р»РµРЅР°. Р”РµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.</p><div className="form-actions"><button className="button button--quiet" onClick={() => setRemoveBot(undefined)}>РћС‚РјРµРЅР°</button><button className="button button--danger" onClick={() => void remove()}>РЈРґР°Р»РёС‚СЊ Р±РѕС‚Р°</button></div></Modal>}
    {toast && <div className={`toast toast--${toast.type}`} role="status">{toast.type === 'success' ? <Check /> : <CircleHelp />}<span>{toast.text}</span><button onClick={() => setToast(undefined)} aria-label="Р—Р°РєСЂС‹С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ"><X /></button></div>}
  </>;
}
