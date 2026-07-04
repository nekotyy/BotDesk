import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bot as BotIcon, Check, ChevronRight, CircleHelp, Eye, EyeOff,
  Hash, Inbox, LoaderCircle, MessageCircleMore, MoreHorizontal, Plus,
  RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, UserRoundSearch, X,
} from 'lucide-react';
import type { AppState, Bot, Chat, Message } from './types';
import './App.css';

const emptyState: AppState = { bots: [], selectedBotId: null, chatsByBot: {}, messagesByBot: {} };
const avatarCache = new Map<string, string>();

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TG';
}

function Avatar({ title, botId, fileId, size = 'md', online = false }: { title: string; botId?: string; fileId?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; online?: boolean }) {
  const cacheKey = botId && fileId ? `${botId}:${fileId}` : '';
  const [src, setSrc] = useState(cacheKey ? avatarCache.get(cacheKey) : undefined);
  useEffect(() => {
    if (!botId || !fileId || avatarCache.has(`${botId}:${fileId}`)) return;
    let live = true;
    window.tgManager.getAvatar(botId, fileId).then((data) => {
      if (data) { avatarCache.set(`${botId}:${fileId}`, data); if (live) setSrc(data); }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [botId, fileId]);
  return (
    <span className={`avatar avatar--${size}`} aria-label={`Аватар: ${title}`}>
      {src ? <img src={src} alt="" /> : <span>{initials(title)}</span>}
      {online && <i className="avatar__status" title="Бот доступен" />}
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
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
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
      if (!window.tgManager) throw new Error('Откройте BotDesk как desktop-приложение, а не как страницу в браузере.');
      onDone(await window.tgManager.addBot({ name, token }));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось добавить бота'); }
    finally { setBusy(false); }
  };
  return (
    <form className={`add-form ${onboarding ? 'add-form--onboarding' : ''}`} onSubmit={submit}>
      <div className="field">
        <label htmlFor="bot-name">Название в BotDesk</label>
        <input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Бот поддержки" maxLength={40} autoFocus />
        <small>Его увидите только вы — можно переименовать как удобно.</small>
      </div>
      <div className="field">
        <label htmlFor="bot-token">Токен BotFather</label>
        <div className="input-with-action">
          <input id="bot-token" type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" autoComplete="off" spellCheck={false} />
          <button type="button" className="icon-button icon-button--inside" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}>{showToken ? <EyeOff /> : <Eye />}</button>
        </div>
        <small className="secure-note"><ShieldCheck /> Токен хранится локально и шифруется средствами Windows.</small>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="button button--quiet" onClick={onCancel}>Отмена</button>}
        <button className="button button--primary" disabled={busy || !name.trim() || !token.trim()}>{busy ? <><LoaderCircle className="spin" /> Проверяю…</> : <>{onboarding ? 'Начать работу' : 'Добавить бота'} <ChevronRight /></>}</button>
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
          <span className="eyebrow"><Sparkles /> Все диалоги в одном окне</span>
          <h1>Ваши Telegram-боты.<br />Спокойно и по полочкам.</h1>
          <p>Отвечайте пользователям от имени бота, находите нужный чат по ID и не теряйте историю переписки.</p>
          <div className="feature-row"><span><Check /> До 15 ботов</span><span><Check /> Локальная история</span><span><Check /> Без облака</span></div>
        </div>
        <div className="onboarding__visual" aria-hidden="true">
          <div className="visual-card visual-card--one"><Avatar title="Анна Волкова" size="md" /><span><b>Анна Волкова</b><small>Спасибо! Всё получилось</small></span></div>
          <div className="visual-card visual-card--two"><span className="mini-bot"><BotIcon /></span><span><b>Support Bot</b><small>Отвечает сейчас</small></span></div>
          <div className="visual-bubble">Рад помочь! Если что — я рядом.</div>
        </div>
        <small className="onboarding__foot">BotDesk не передаёт токены и переписку третьим лицам</small>
      </section>
      <section className="onboarding__setup">
        <div className="setup-card">
          <span className="step-pill">Шаг 1 из 1</span>
          <h2>Подключите первого бота</h2>
          <p className="muted">Возьмите токен у <b>@BotFather</b>. Мы проверим его перед сохранением.</p>
          <AddBotForm onboarding onDone={onDone} />
          <a className="help-link" href="https://t.me/BotFather" target="_blank" rel="noreferrer"><CircleHelp /> Где найти токен?</a>
        </div>
      </section>
    </main>
  );
}

function BotRail({ bots, activeId, onHome, onOpen, onAdd }: { bots: Bot[]; activeId?: string; onHome: () => void; onOpen: (bot: Bot) => void; onAdd: () => void }) {
  return <aside className="bot-rail" aria-label="Боты"><button className="rail-brand" onClick={onHome} aria-label="Все боты"><BotIcon /></button><div className="rail-divider" />
    <div className="rail-bots">{bots.map((bot) => <button key={bot.id} className={`rail-avatar ${activeId === bot.id ? 'is-active' : ''}`} onClick={() => onOpen(bot)} aria-label={`Открыть ${bot.name}`} title={bot.name}><Avatar title={bot.name} size="sm" online={bot.status === 'online'} /></button>)}</div>
    {bots.length < 15 && <button className="rail-add" onClick={onAdd} aria-label="Добавить бота"><Plus /></button>}
  </aside>;
}

function BotHub({ state, onOpen, onAdd, onRemove }: { state: AppState; onOpen: (bot: Bot) => void; onAdd: () => void; onRemove: (bot: Bot) => void }) {
  return <div className="app-shell"><BotRail bots={state.bots} onHome={() => undefined} onOpen={onOpen} onAdd={onAdd} /><main className="hub">
    <header className="hub__header"><div><span className="eyebrow eyebrow--blue">Рабочее пространство</span><h1>Выберите бота</h1><p>Откройте входящие и отвечайте пользователям от его имени.</p></div><button className="button button--primary" onClick={onAdd} disabled={state.bots.length >= 15}><Plus /> Добавить бота</button></header>
    <div className="hub__summary"><div><BotIcon /><span><b>{state.bots.length}</b><small>подключено из 15</small></span></div><div><MessageCircleMore /><span><b>{Object.values(state.chatsByBot).reduce((sum, chats) => sum + chats.length, 0)}</b><small>диалогов сохранено</small></span></div></div>
    <section className="bot-grid" aria-label="Подключённые боты">{state.bots.map((bot) => {
      const chats = state.chatsByBot[bot.id] || []; const unread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
      return <article className="bot-card" key={bot.id}><div className="bot-card__top"><Avatar title={bot.name} botId={bot.id} fileId={bot.avatarFileId} size="lg" online={bot.status === 'online'} /><button className="icon-button danger-on-hover" onClick={() => onRemove(bot)} aria-label={`Удалить ${bot.name}`}><Trash2 /></button></div><h2>{bot.name}</h2><p>@{bot.username || 'без username'}</p><div className="bot-card__meta"><span><MessageCircleMore /> {chats.length} чатов</span>{unread > 0 && <span className="unread-label">{unread} новых</span>}</div><button className="button button--card" onClick={() => onOpen(bot)}>Открыть диалоги <ChevronRight /></button></article>;
    })}{state.bots.length < 15 && <button className="bot-card bot-card--add" onClick={onAdd}><span><Plus /></span><b>Подключить ещё бота</b><small>Осталось мест: {15 - state.bots.length}</small></button>}</section>
  </main></div>;
}

function ChatRow({ chat, botId, active, onClick }: { chat: Chat; botId: string; active: boolean; onClick: () => void }) {
  return <button className={`chat-row ${active ? 'is-active' : ''}`} onClick={onClick}><Avatar title={chat.title} botId={botId} fileId={chat.avatarFileId} size="md" /><span className="chat-row__body"><span className="chat-row__line"><b>{chat.title}</b><time>{timeLabel(chat.lastMessageAt)}</time></span><span className="chat-row__line"><small>{chat.lastMessage || (chat.username ? `@${chat.username}` : `ID ${chat.telegramId}`)}</small>{chat.unreadCount > 0 && <i>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</i>}</span></span></button>;
}

function Conversation({ bot, chat, messages, onSend }: { bot: Bot; chat?: Chat; messages: Message[]; onSend: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState(''); const [sending, setSending] = useState(false); const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, chat?.id]);
  if (!chat) return <section className="conversation conversation--empty"><div className="empty-conversation"><span><MessageCircleMore /></span><h2>Выберите диалог</h2><p>Сообщения и информация о пользователе появятся здесь.</p></div></section>;
  const send = async () => { const text = draft.trim(); if (!text || sending) return; setSending(true); try { await onSend(text); setDraft(''); } finally { setSending(false); } };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  let previousDay = '';
  return <section className="conversation"><header className="conversation__header"><Avatar title={chat.title} botId={bot.id} fileId={chat.avatarFileId} size="sm" /><div><b>{chat.title}</b><small>{chat.username ? `@${chat.username} · ` : ''}ID {chat.telegramId}</small></div><button className="icon-button" aria-label="Дополнительные действия"><MoreHorizontal /></button></header>
    <div className="messages" aria-live="polite">{messages.length === 0 && <div className="history-start"><ShieldCheck /><span><b>Начало локальной истории</b><small>Bot API не отдаёт старую переписку. Новые сообщения сохранятся здесь.</small></span></div>}{messages.map((message) => { const day = dayLabel(message.sentAt); const showDay = day !== previousDay; previousDay = day; return <div key={message.id}>{showDay && <div className="day-divider"><span>{day}</span></div>}<div className={`message-line message-line--${message.direction}`}><div className="message-bubble"><p>{message.text}</p><span>{timeLabel(message.sentAt)} {message.direction === 'outgoing' && <Check aria-label="Отправлено" />}</span></div></div></div>; })}<div ref={endRef} /></div>
    <footer className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={keyDown} placeholder={`Сообщение для ${chat.firstName || chat.title}`} rows={1} maxLength={4096} aria-label="Текст сообщения" /><span className="composer__count">{draft.length > 3800 ? `${draft.length}/4096` : ''}</span><button onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="Отправить сообщение">{sending ? <LoaderCircle className="spin" /> : <Send />}</button></footer>
  </section>;
}

function Workspace({ state, bot, onState, onHome, onAdd, notify }: { state: AppState; bot: Bot; onState: (state: AppState) => void; onHome: () => void; onAdd: () => void; notify: (text: string, type?: 'error' | 'success') => void }) {
  const [activeChatId, setActiveChatId] = useState<string>(); const [query, setQuery] = useState(''); const [syncing, setSyncing] = useState(false); const [showId, setShowId] = useState(false); const [userId, setUserId] = useState(''); const [finding, setFinding] = useState(false);
  const chats = state.chatsByBot[bot.id] || [];
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return q ? chats.filter((c) => `${c.title} ${c.username || ''} ${c.telegramId}`.toLowerCase().includes(q)) : chats; }, [chats, query]);
  const activeChat = chats.find((chat) => chat.id === activeChatId); const messages = activeChatId ? state.messagesByBot[bot.id]?.[activeChatId] || [] : [];
  const sync = async (quiet = false) => { if (syncing) return; setSyncing(true); try { onState(await window.tgManager.syncBot(bot.id)); if (!quiet) notify('Диалоги синхронизированы', 'success'); } catch (e) { if (!quiet) notify(e instanceof Error ? e.message : 'Ошибка синхронизации', 'error'); } finally { setSyncing(false); } };
  useEffect(() => { void sync(true); const timer = window.setInterval(() => void sync(true), 12_000); return () => window.clearInterval(timer); }, [bot.id]);
  const openChat = async (chat: Chat) => { setActiveChatId(chat.id); if (chat.unreadCount) { try { onState(await window.tgManager.markRead(bot.id, chat.id)); } catch { /* local UI remains usable */ } } };
  const find = async (event: FormEvent) => { event.preventDefault(); setFinding(true); try { const result = await window.tgManager.findChat(bot.id, userId); onState(result.state); setActiveChatId(result.chatId); setShowId(false); setUserId(''); notify('Диалог найден', 'success'); } catch (e) { notify(e instanceof Error ? e.message : 'Чат не найден', 'error'); } finally { setFinding(false); } };
  const send = async (text: string) => { if (!activeChatId) return; try { onState(await window.tgManager.sendMessage(bot.id, activeChatId, text)); } catch (e) { notify(e instanceof Error ? e.message : 'Не удалось отправить сообщение', 'error'); throw e; } };
  return <div className="app-shell"><BotRail bots={state.bots} activeId={bot.id} onHome={onHome} onOpen={async (next) => { onState(await window.tgManager.selectBot(next.id)); setActiveChatId(undefined); }} onAdd={onAdd} />
    <aside className="chat-panel"><header className="chat-panel__header"><button className="mobile-back" onClick={onHome} aria-label="Назад к ботам"><ArrowLeft /></button><div className="bot-heading"><Avatar title={bot.name} size="sm" online={bot.status === 'online'} /><span><b>{bot.name}</b><small>@{bot.username}</small></span></div><button className="icon-button" onClick={() => void sync()} aria-label="Синхронизировать" disabled={syncing}><RefreshCw className={syncing ? 'spin' : ''} /></button></header>
      <div className="chat-tools"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, username или ID" aria-label="Поиск диалогов" />{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X /></button>}</div><button className="id-button" onClick={() => setShowId(true)}><UserRoundSearch /> Открыть по ID</button></div>
      <div className="chat-list">{filtered.length ? filtered.map((chat) => <ChatRow key={chat.id} chat={chat} botId={bot.id} active={chat.id === activeChatId} onClick={() => void openChat(chat)} />) : <div className="empty-list"><span><Inbox /></span><b>{query ? 'Ничего не найдено' : 'Пока нет диалогов'}</b><p>{query ? 'Попробуйте другой запрос.' : 'Нажмите «Обновить» или откройте чат по ID.'}</p></div>}</div>
    </aside><Conversation bot={bot} chat={activeChat} messages={messages} onSend={send} />
    {showId && <Modal onClose={() => setShowId(false)} labelledBy="find-title"><button className="modal__close" onClick={() => setShowId(false)} aria-label="Закрыть"><X /></button><span className="modal__icon"><Hash /></span><h2 id="find-title">Открыть диалог по ID</h2><p>Если пользователь уже общался с ботом, Telegram разрешит открыть этот чат.</p><form onSubmit={find}><div className="field"><label htmlFor="user-id">Telegram user ID</label><input id="user-id" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value.replace(/[^\d-]/g, ''))} placeholder="Например, 123456789" autoFocus /></div><div className="form-actions"><button type="button" className="button button--quiet" onClick={() => setShowId(false)}>Отмена</button><button className="button button--primary" disabled={!userId || finding}>{finding ? <><LoaderCircle className="spin" /> Ищу…</> : 'Найти диалог'}</button></div></form><small className="modal__hint"><ShieldCheck /> Бот не может первым написать пользователю, который с ним ещё не взаимодействовал.</small></Modal>}
  </div>;
}

export default function App() {
  const [state, setState] = useState<AppState>(emptyState); const [loading, setLoading] = useState(true); const [screen, setScreen] = useState<'bots' | 'workspace'>('bots'); const [addOpen, setAddOpen] = useState(false); const [removeBot, setRemoveBot] = useState<Bot>(); const [toast, setToast] = useState<{ text: string; type: 'error' | 'success' }>();
  useEffect(() => {
    if (!window.tgManager) { setLoading(false); return; }
    window.tgManager.getState().then(setState).catch((e) => setToast({ text: e instanceof Error ? e.message : 'Не удалось загрузить данные', type: 'error' })).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(undefined), 4200); return () => window.clearTimeout(timer); }, [toast]);
  const notify = (text: string, type: 'error' | 'success' = 'success') => setToast({ text, type });
  const openBot = async (bot: Bot) => { try { setState(await window.tgManager.selectBot(bot.id)); setScreen('workspace'); } catch (e) { notify(e instanceof Error ? e.message : 'Не удалось открыть бота', 'error'); } };
  const selectedBot = state.bots.find((bot) => bot.id === state.selectedBotId) || state.bots[0];
  if (loading) return <main className="loading-screen"><span className="loading-logo"><BotIcon /></span><LoaderCircle className="spin" /><b>Открываем BotDesk</b></main>;
  const doneAdding = (next: AppState) => { setState(next); setAddOpen(false); setScreen('bots'); notify('Бот успешно подключён'); };
  const remove = async () => { if (!removeBot) return; try { setState(await window.tgManager.removeBot(removeBot.id)); setRemoveBot(undefined); notify('Бот удалён'); } catch (e) { notify(e instanceof Error ? e.message : 'Не удалось удалить бота', 'error'); } };
  return <>{state.bots.length === 0 ? <Onboarding onDone={doneAdding} /> : screen === 'workspace' && selectedBot ? <Workspace state={state} bot={selectedBot} onState={setState} onHome={() => setScreen('bots')} onAdd={() => setAddOpen(true)} notify={notify} /> : <BotHub state={state} onOpen={(bot) => void openBot(bot)} onAdd={() => setAddOpen(true)} onRemove={setRemoveBot} />}
    {addOpen && <Modal onClose={() => setAddOpen(false)} labelledBy="add-title"><button className="modal__close" onClick={() => setAddOpen(false)} aria-label="Закрыть"><X /></button><span className="modal__icon"><BotIcon /></span><h2 id="add-title">Подключить бота</h2><p>Добавьте название и токен из BotFather.</p><AddBotForm onDone={doneAdding} onCancel={() => setAddOpen(false)} /></Modal>}
    {removeBot && <Modal onClose={() => setRemoveBot(undefined)} labelledBy="remove-title"><button className="modal__close" onClick={() => setRemoveBot(undefined)} aria-label="Закрыть"><X /></button><span className="modal__icon modal__icon--danger"><Trash2 /></span><h2 id="remove-title">Удалить «{removeBot.name}»?</h2><p>Локальная история этого бота также будет удалена. Действие нельзя отменить.</p><div className="form-actions"><button className="button button--quiet" onClick={() => setRemoveBot(undefined)}>Отмена</button><button className="button button--danger" onClick={() => void remove()}>Удалить бота</button></div></Modal>}
    {toast && <div className={`toast toast--${toast.type}`} role="status">{toast.type === 'success' ? <Check /> : <CircleHelp />}<span>{toast.text}</span><button onClick={() => setToast(undefined)} aria-label="Закрыть уведомление"><X /></button></div>}
  </>;
}
