import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import './App.css';
import type { AppState, BotSummary, ChatMessage, ChatSummary } from './types';

const emptyState: AppState = {
  bots: [],
  selectedBotId: null,
  chatsByBot: {},
  messagesByBot: {},
};

function formatPersonTitle(chat: ChatSummary): string {
  const fullName = `${chat.firstName} ${chat.lastName}`.trim();
  if (chat.username) {
    return `${fullName || 'Пользователь'} • @${chat.username}`;
  }
  return fullName || `ID ${chat.userId}`;
}

function getInitials(chat: ChatSummary): string {
  const a = chat.firstName?.slice(0, 1) || '';
  const b = chat.lastName?.slice(0, 1) || '';
  const combined = `${a}${b}`.trim();
  if (combined) {
    return combined.toUpperCase();
  }
  if (chat.username) {
    return chat.username.slice(0, 2).toUpperCase();
  }
  return 'TG';
}

function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBotName, setNewBotName] = useState('');
  const [newBotToken, setNewBotToken] = useState('');
  const [chatByUserId, setChatByUserId] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  useEffect(() => {
    window.tgManager
      .getState()
      .then((fresh) => {
        setState(fresh);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить состояние');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const selectedBot: BotSummary | null = useMemo(() => {
    if (!state.selectedBotId) {
      return null;
    }
    return state.bots.find((bot) => bot.id === state.selectedBotId) || null;
  }, [state.bots, state.selectedBotId]);

  const chats = useMemo(() => {
    if (!selectedBot) {
      return [];
    }
    return state.chatsByBot[selectedBot.id] || [];
  }, [selectedBot, state.chatsByBot]);
  const messages: ChatMessage[] = useMemo(() => {
    if (!selectedBot || !activeChatId) {
      return [];
    }
    return state.messagesByBot[selectedBot.id]?.[activeChatId] || [];
  }, [state.messagesByBot, selectedBot, activeChatId]);

  const activeChat = useMemo(() => {
    if (!activeChatId) {
      return null;
    }
    return chats.find((chat) => chat.id === activeChatId) || null;
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  async function refreshSelectedBot() {
    if (!selectedBot) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fresh = await window.tgManager.syncBot(selectedBot.id);
      setState(fresh);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка синхронизации');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBot() {
    setSaving(true);
    setError(null);
    try {
      const fresh = await window.tgManager.addBot({
        name: newBotName,
        token: newBotToken,
      });
      setState(fresh);
      setNewBotName('');
      setNewBotToken('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить бота');
    } finally {
      setSaving(false);
    }
  }

  async function selectBot(botId: string) {
    setSaving(true);
    setError(null);
    try {
      const fresh = await window.tgManager.selectBot(botId);
      setState(fresh);
      setActiveChatId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось выбрать бота');
    } finally {
      setSaving(false);
    }
  }

  async function openByUserId() {
    if (!selectedBot) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await window.tgManager.openChatByUserId({
        botId: selectedBot.id,
        userId: chatByUserId,
      });
      setState(result.state);
      if (result.chatId) {
        setActiveChatId(result.chatId);
      }
      setChatByUserId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть чат по ID');
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage() {
    if (!selectedBot || !activeChatId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fresh = await window.tgManager.sendMessage({
        botId: selectedBot.id,
        chatId: activeChatId,
        text: messageDraft,
      });
      setState(fresh);
      setMessageDraft('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="app-shell loading">Запускаю TG Bot Manager...</div>;
  }

  const needOnboarding = state.bots.length === 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Desktop Control Center</p>
          <h1>TG Bot Manager</h1>
        </div>
        <button type="button" onClick={refreshSelectedBot} disabled={saving || !selectedBot}>
          Обновить чаты
        </button>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {needOnboarding ? (
        <section className="panel onboard">
          <h2>Добро пожаловать</h2>
          <p>
            Добавь первого бота: укажи название и токен. В приложении можно хранить до 15
            ботов.
          </p>
          <div className="form-grid">
            <label>
              Название бота
              <input
                value={newBotName}
                onChange={(event) => setNewBotName(event.target.value)}
                placeholder="Например, Sales Assistant"
              />
            </label>
            <label>
              Токен бота
              <input
                value={newBotToken}
                onChange={(event) => setNewBotToken(event.target.value)}
                placeholder="123456:ABCDEF..."
              />
            </label>
          </div>
          <button
            type="button"
            className="primary"
            onClick={handleAddBot}
            disabled={saving || !newBotName.trim() || !newBotToken.trim()}
          >
            Добавить бота
          </button>
        </section>
      ) : (
        <main className="workspace">
          <aside className="left-column panel">
            <h2>Экран 2. Боты</h2>
            <p>Выбери бота и переключайся между рабочими аккаунтами.</p>
            <div className="bot-list">
              {state.bots.map((bot) => {
                const active = bot.id === state.selectedBotId;
                return (
                  <button
                    type="button"
                    key={bot.id}
                    onClick={() => selectBot(bot.id)}
                    className={active ? 'bot-item active' : 'bot-item'}
                  >
                    <strong>{bot.name}</strong>
                    <span>{bot.username}</span>
                    <small>{format(new Date(bot.createdAt), 'dd.MM.yyyy HH:mm')}</small>
                  </button>
                );
              })}
            </div>

            <div className="mini-add">
              <label>
                Название
                <input
                  value={newBotName}
                  onChange={(event) => setNewBotName(event.target.value)}
                  placeholder="Название"
                />
              </label>
              <label>
                Токен
                <input
                  value={newBotToken}
                  onChange={(event) => setNewBotToken(event.target.value)}
                  placeholder="Токен"
                />
              </label>
              <button
                type="button"
                className="primary"
                onClick={handleAddBot}
                disabled={
                  saving || !newBotName.trim() || !newBotToken.trim() || state.bots.length >= 15
                }
              >
                Добавить ({state.bots.length}/15)
              </button>
            </div>
          </aside>

          <section className="chat-list panel">
            <h2>Экран 3. Чаты</h2>
            <p>Выбор диалога с визуалом в стиле мессенджера: аватар, юзернейм, история.</p>

            <div className="open-by-id">
              <input
                value={chatByUserId}
                onChange={(event) => setChatByUserId(event.target.value)}
                placeholder="Открыть чат по user ID"
              />
              <button type="button" onClick={openByUserId} disabled={saving || !chatByUserId.trim()}>
                Открыть
              </button>
            </div>

            <div className="chat-items">
              {chats.length === 0 ? (
                <p className="muted">Нет чатов. Нажми "Обновить чаты" или открой чат по user ID.</p>
              ) : (
                chats.map((chat) => {
                  const active = chat.id === activeChatId;
                  return (
                    <button
                      type="button"
                      key={chat.id}
                      onClick={() => setActiveChatId(chat.id)}
                      className={active ? 'chat-item active' : 'chat-item'}
                    >
                      <div className="avatar">{getInitials(chat)}</div>
                      <div className="chat-main">
                        <strong>{formatPersonTitle(chat)}</strong>
                        <span>{chat.lastMessageText || 'Сообщений пока нет'}</span>
                      </div>
                      <time>{chat.lastMessageAt ? format(new Date(chat.lastMessageAt), 'HH:mm') : ''}</time>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="dialog panel">
            <h2>{activeChat ? formatPersonTitle(activeChat) : 'Выбери чат'}</h2>
            <div className="messages">
              {activeChat ? (
                messages.length > 0 ? (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={message.from === 'bot' ? 'bubble bot' : 'bubble user'}
                    >
                      <p>{message.text}</p>
                      <time>{format(new Date(message.createdAt), 'dd.MM HH:mm')}</time>
                    </article>
                  ))
                ) : (
                  <p className="muted">История пуста. Отправь первое сообщение от бота.</p>
                )
              ) : (
                <p className="muted">Выбери чат слева, чтобы открыть историю.</p>
              )}
            </div>

            <div className="composer">
              <input
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder="Введите сообщение"
                disabled={!activeChat}
              />
              <button
                type="button"
                className="primary"
                onClick={sendMessage}
                disabled={saving || !activeChat || !messageDraft.trim()}
              >
                Отправить
              </button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
