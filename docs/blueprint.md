# VideoGrabber — Bot specification

**Archetype:** content

**Voice:** warm and encouraging — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that lets users select a social platform (YouTube, TikTok, Instagram, Facebook), paste a video URL, and receive a best-effort downloadable/clean video URL. The bot validates input, attempts internal extraction, returns a direct media link with a Download button, logs requests for 30 days for troubleshooting/abuse monitoring, and notifies the owner on errors or repeated failures.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- General Telegram users who want a direct video/download URL
- People sharing/capturing social media videos quickly
- Non-technical users needing an easy extraction flow

## Success criteria

- User receives a direct or best-effort downloadable video URL within 10s for supported links
- Clear validation error when URL is invalid or unsupported
- Admin (ADMIN_CHAT_ID) receives compact notifications for extraction errors and abuse alerts
- Request logs persist for 30 days and are automatically pruned

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu with platform buttons and Help
- **YouTube** (button, actor: user, callback: platform:youtube) — Choose YouTube as the source platform; bot asks for the video URL via ForceReply
  - inputs: none at selection time (button tap), ForceReply for user to paste the URL
  - outputs: Prompt message: 'أرسل رابط الفيديو من YouTube' (ForceReply), On success: downloadable URL + 'Download' inline button, On failure: validation/error message with retry buttons
- **TikTok** (button, actor: user, callback: platform:tiktok) — Choose TikTok; bot requests the video URL via ForceReply
  - inputs: ForceReply: user-pasted URL
  - outputs: Prompt, validation result, download link or error
- **Instagram** (button, actor: user, callback: platform:instagram) — Choose Instagram; bot requests the video URL via ForceReply
  - inputs: ForceReply: user-pasted URL
  - outputs: Prompt, validation result, download link or error
- **Facebook** (button, actor: user, callback: platform:facebook) — Choose Facebook; bot requests the video URL via ForceReply
  - inputs: ForceReply: user-pasted URL
  - outputs: Prompt, validation result, download link or error
- **Help** (button, actor: user, callback: help:open) — Show short usage instructions and a privacy note
  - outputs: Help text message and a quick link to start over

## Flows

### Platform selection and URL submission
_Trigger:_ button callback (platform:<name>)

1. Bot sends a localized prompt: 'Send the video link from <platform>' (ForceReply)
2. User pastes URL as a reply
3. Bot performs platform-specific pattern validation
4. If validation fails: send error message and offer Retry and Change platform buttons
5. If validation succeeds: proceed to extraction flow

_Data touched:_ PlatformChoice, RequestLog, User

### Extraction and response
_Trigger:_ valid URL received

1. Bot fetches/inspects the URL or uses internal parsing to find a direct media URL
2. If extraction succeeds: bot replies with the direct/downloadable URL and an inline 'Download' button (deep link to the file)
3. Save a RequestLog entry (user id, platform, input URL, output link, timestamp)
4. If extraction fails: send user-friendly error, log error, and consider notifying admin

_Data touched:_ RequestLog

### Help and privacy
_Trigger:_ Help button or /help command

1. Bot shows concise instructions for each supported platform
2. Include privacy note: only minimal metadata logged; no upload of videos to the bot
3. Buttons: Back to main menu

### Admin notification and abuse alerting
_Trigger:_ error event or repeated failures/abuse detection

1. If extraction error or repeated failures from same user/IP/telegram id: send compact notification to ADMIN_CHAT_ID with summary (user id, platform, sample URL, error type, timestamp)
2. Owner can review logs via admin-only command or channel
3. Optional automatic rate-limit enforcement for offending user

_Data touched:_ RequestLog

### Log retention/pruning
_Trigger:_ daily cron or scheduled job

1. Prune RequestLog entries older than retention window (default 30 days)
2. Audit-runable report generation for owner on request

_Data touched:_ RequestLog

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Chat id where new extraction errors and abuse alerts are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: none)_ — Telegram user identity as seen in messages; used only as an identifier in logs
  - fields: telegram_id, display_name (optional)
- **PlatformChoice** _(retention: session)_ — The platform chosen by the user during the session
  - fields: platform (youtube|tiktok|instagram|facebook), selection_timestamp
- **RequestLog** _(retention: persistent)_ — Minimal record of each extraction attempt for debugging and abuse monitoring
  - fields: request_id, telegram_id, platform, input_url, output_url_or_error, status (success|error), timestamp, error_code (optional)
- **RateLimitRecord** _(retention: session)_ — Transient counters for abuse detection
  - fields: telegram_id, window_start, request_count

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, callbacks, ForceReply
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set or update ADMIN_CHAT_ID (owner chat id receiving notifications)
- View recent RequestLog entries (admin-only command)
- Set log retention window (default 30 days) via an owner-only command
- Enable/disable platform buttons (e.g., temporarily disable Facebook extraction)
- Clear logs (admin-only command)

## Notifications

- Admin notification for extraction errors (compact summary)
- Admin alert for repeated failures or abuse patterns
- Optional admin notification for critical system errors (e.g., fetch blocked)

## Permissions & privacy

- Store only minimal metadata: telegram_id, platform, input URL, output link or error, and timestamp
- Logs retained for default 30 days then pruned automatically
- Bot does NOT permanently host or store video files; it returns links only
- Do not send user-submitted URLs or video content to third-party services unless owner explicitly configures such an integration
- Admin-only access to logs via owner controls; users can request that their logs be deleted

## Edge cases

- Shortened or redirected URLs that require follow redirects to extract a final target
- Private, paywalled, geo-restricted, or deleted videos where extraction is impossible
- Platform layout/endpoint changes that break internal parsers
- Large-scale abuse or flood of requests from one or more users (rate limiting required)
- Extraction returning ephemeral CDN links that expire quickly
- User pastes non-video links or posts (validation and helpful error messages needed)
- Telegram message size/format issues (long URLs, malformed replies)

## Required tests

- Dialog-level acceptance: user selects platform, submits a valid URL, receives a direct/downloadable URL and Download button
- Validation test: user submits invalid or unsupported URL and receives helpful error with Retry/Change platform options
- Extraction failure path: simulated extraction error triggers correct user message, logs the error, and notifies ADMIN_CHAT_ID
- Admin notification test: repeated failures produce an abuse alert to ADMIN_CHAT_ID
- Log retention test: entries older than 30 days are pruned by scheduled job
- Concurrency test: simultaneous requests from multiple users are handled without data mix-up
- Platform disablement test: owner disables a platform and it no longer appears in the menu

## Assumptions

- Bot has outbound HTTP(S) capability to fetch target pages for extraction
- Extraction will be implemented internally (HTML parsing, pattern matching, following redirects) and does not require third-party API keys
- Default log retention is 30 days unless owner changes via owner controls
- Owner will provide ADMIN_CHAT_ID at setup time
- Primary user-facing prompt example in the brief used Arabic text; bot must support the owner's preferred localization but English defaults are acceptable until clarified
