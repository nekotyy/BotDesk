<p align="center">
  <img src="media/banner.png" alt="BotDesk banner" width="100%" />
</p>

<h1 align="center">BotDesk</h1>

<p align="center">
  Open-source desktop-приложение для управления Telegram-ботами, входящими диалогами и ответами из одного интерфейса.
</p>

<p align="center">
  <a href="https://github.com/nekotyy/tg-bot-manager/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/nekotyy/tg-bot-manager/ci.yml?branch=main&label=CI&style=for-the-badge" />
  </a>
  <a href="https://github.com/nekotyy/tg-bot-manager/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/nekotyy/tg-bot-manager?style=for-the-badge&label=Release" />
  </a>
  <a href="LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" />
  </a>
</p>

## О проекте

BotDesk нужен для простой работы с сообщениями Telegram-ботов без отдельной админки, backend-сервера и сторонних панелей. Приложение запускается на компьютере, принимает входящие через Telegram Bot API, сохраняет полученную историю локально и позволяет отвечать пользователям от имени выбранного бота.

Основная идея: все боты, диалоги и ответы находятся в одном desktop-интерфейсе. Можно подключить несколько токенов BotFather, быстро переключаться между ботами, искать нужный чат и отвечать без Telegram-клиента администратора.

## Что умеет

- Подключать до 15 Telegram-ботов по токенам BotFather.
- Получать входящие сообщения в фоне через `getUpdates`.
- Дочитывать накопившуюся очередь updates пачками, чтобы не терять сообщения при большом потоке.
- Сохранять локальную историю входящих и исходящих сообщений.
- Показывать текст, фото, видео, кружки, голосовые сообщения и стикеры.
- Кэшировать медиафайлы локально после первой загрузки.
- Отправлять текстовые сообщения от имени выбранного бота.
- Показывать список диалогов с аватарками, последним сообщением и непрочитанными.
- Искать диалоги по имени, username и Telegram ID.
- Открывать доступный чат по user ID, если пользователь уже писал боту.
- Хранить токены локально и шифровать их через Electron `safeStorage`, когда это доступно.
- Собираться в Windows portable и Windows installer.

## Стек

| Слой | Технологии |
| --- | --- |
| Desktop runtime | Electron |
| UI | React, TypeScript |
| Сборка фронта | Vite |
| Иконки | lucide-react |
| Локальное состояние | electron-store |
| Безопасное хранение токенов | Electron `safeStorage` |
| Telegram API | Bot API: `getMe`, `getUpdates`, `sendMessage`, `getFile`, `getUserProfilePhotos` |
| Packaging | electron-builder |
| CI/CD | GitHub Actions |

## Как пользоваться

1. Скачай последний релиз: [GitHub Releases](https://github.com/nekotyy/tg-bot-manager/releases/latest).
2. Выбери один из файлов:

| Файл | Когда использовать |
| --- | --- |
| `BotDesk-Portable-<version>-x64.exe` | Portable для 64-bit Windows |
| `BotDesk-Portable-<version>-ia32.exe` | Portable для 32-bit Windows |
| `BotDesk-Setup-<version>-x64.exe` | Установщик для 64-bit Windows |
| `BotDesk-Setup-<version>-ia32.exe` | Установщик для 32-bit Windows |

3. Запусти BotDesk.
4. Создай нового бота или возьми токен существующего в [@BotFather](https://t.me/BotFather).
5. Нажми добавление бота и вставь токен.
6. Открой карточку бота, дождись входящих сообщений и отвечай из диалога.

## Важные ограничения Telegram Bot API

BotDesk работает через официальный Telegram Bot API, поэтому у него есть ограничения самой платформы:

- Бот не может первым написать пользователю. Пользователь должен сначала начать диалог с ботом.
- Bot API не отдаёт полную старую историю сообщений. Приложение сохраняет только то, что получило после подключения и синхронизации.
- Если у бота включён webhook в другом сервисе, `getUpdates` не сможет работать одновременно с ним. Для BotDesk webhook нужно отключить или делать отдельный мост доставки updates.
- Некоторые анимированные `.tgs`-стикеры Telegram являются Lottie-файлами. Они сохраняются в истории как стикеры, но для полноценной отрисовки нужен отдельный Lottie-renderer.

## Где хранятся данные

Все данные остаются локально на компьютере:

| Данные | Где хранятся |
| --- | --- |
| Состояние приложения | Electron `userData`, файл `botdesk-state.json` |
| Загруженные медиа | Electron `userData/media` |
| Токены ботов | В локальном store, с `safeStorage`-шифрованием при доступности |

BotDesk не отправляет токены и переписку на промежуточные серверы. Desktop-процесс напрямую обращается к Telegram Bot API.

## Разработка

Требования:

- Node.js 20+
- Windows 10/11
- npm

Установка зависимостей:

```powershell
npm install
```

Запуск в dev-режиме:

```powershell
npm run dev
```

Проверки:

```powershell
npm run typecheck
npm run lint
npm run build:web
```

Полная Windows-сборка:

```powershell
npm run build
```

После сборки файлы появятся в `release/`:

- `BotDesk-Portable-<version>-x64.exe`
- `BotDesk-Portable-<version>-ia32.exe`
- `BotDesk-Setup-<version>-x64.exe`
- `BotDesk-Setup-<version>-ia32.exe`

## CI/CD и релизы

В репозитории настроены два workflow:

| Workflow | Что делает |
| --- | --- |
| `CI` | На `push` в `main` и на pull request запускает `npm ci`, typecheck, lint и web build |
| `Release` | Собирает Windows installer и portable, загружает Actions artifact и публикует GitHub Release |

Автопубликация работает так:

| Событие | Что публикуется |
| --- | --- |
| Push в `dev` | Pre-release `dev-latest` |
| Push в `main` | Release `latest` |
| Push тега `v*` | Версионный release, например `v1.1.0` |
| Ручной запуск `Release` | Версионный release по введённой версии |

В каждом GitHub Release лежит четыре файла:

- `BotDesk-Portable-<version>-x64.exe`
- `BotDesk-Portable-<version>-ia32.exe`
- `BotDesk-Setup-<version>-x64.exe`
- `BotDesk-Setup-<version>-ia32.exe`

То есть не нужно создавать отдельные релизы для portable, installer или архитектур. Это четыре артефакта одного релиза.

### Автоматический релиз через ветку

Для dev-сборки достаточно запушить изменения в `dev`:

```powershell
git push origin dev
```

GitHub Actions сам обновит pre-release `dev-latest`.

Для latest-сборки достаточно запушить изменения в `main`:

```powershell
git push origin main
```

GitHub Actions сам обновит release `latest`.

### Версионный релиз через тег

```powershell
git tag v1.1.0
git push origin v1.1.0
```

После push тега GitHub Actions сам:

1. скачает репозиторий;
2. установит зависимости через `npm ci`;
3. запустит typecheck и lint;
4. выполнит `npm run build`;
5. создаст GitHub Release;
6. прикрепит installer и portable.

### Ручной релиз через GitHub Actions

Можно открыть `Actions` -> `Release` -> `Run workflow`, ввести версию без `v`, например `1.1.0`, и запустить сборку. Workflow сам создаст релиз `v1.1.0` и прикрепит оба `.exe`.

## Структура проекта

```text
electron/              Electron main process и preload bridge
src/                   React-интерфейс
assets/                Иконка и логотип приложения
media/banner.png       Баннер для README
scripts/               Вспомогательные скрипты
.github/workflows/     CI/CD workflows
```

## Лицензия

BotDesk распространяется под лицензией [MIT](LICENSE).
