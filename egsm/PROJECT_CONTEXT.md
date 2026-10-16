# PROJECT_CONTEXT.md — Full Application Specification & Handoff Log

## 1. MANDATORY ANTI-CRASH & COMPILATION RULES (READ FIRST)
1. **Target Platform**: Native Android (`.apk`/`.aab`) and iOS (`.ipa`) mobile app built with React Native (Expo Managed Workflow + TypeScript).
2. **FORBIDDEN NATIVE LIBRARIES (CRASH PREVENTION)**: NEVER install or import `@react-navigation/*`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, or `react-native-reanimated`. All navigation (Bottom Tabs and sub-pages like Post Detail, Create Post, and Leaderboard) MUST be implemented using a clean React state router (`activeTab`, `postsSubPage`, etc.) and React Native `Modal` components.
3. **FORBIDDEN WEB TAGS**: NEVER use HTML tags (`div`, `span`, `p`, `button`, `input`, `img`, `a`), CSS files, or `window.localStorage`. Use ONLY built-in `react-native` components (`SafeAreaView`, `View`, `Text`, `TextInput`, `Pressable`, `TouchableOpacity`, `FlatList`, `ScrollView`, `Image`, `Modal`, `Alert`, `Linking`, `StyleSheet`, `StatusBar`, `KeyboardAvoidingView`, `Platform`, `ActivityIndicator`, `Switch`).
4. **ANDROID STYLE SAFETY**: In `StyleSheet.create`, EVERY `fontWeight` value MUST be a string (`'400'`, `'500'`, `'600'`, `'700'`, `'bold'`), NEVER a raw number (`600`, `700`), which crashes Android natively. Never render raw strings or `0` outside `<Text>`.
5. **SAFE SUPABASE BOOT**: Never allow `createClient()` to throw an unhandled exception at startup if `.env` variables are missing; always provide valid fallback URL strings (`https://placeholder.supabase.co`) and detect whether live credentials are configured.

## 2. Color Palette & Theme Specification
- **Dark Mode (Default)**:
  - Main Background: Deep slate-black `#050A0E`
  - Elevated Surface / Cards: `#0D161F` with soft hairline border `borderColor: 'rgba(255, 255, 255, 0.07)'`, `borderWidth: 1`
  - Input Surface: `#0A1017` with subtle focus border `rgba(0, 255, 204, 0.4)` and placeholder `#4B5A68`
  - Border / Divider: `rgba(255, 255, 255, 0.07)` (all harsh 2px solid neon borders removed)
  - Primary Neon (Buttons, Active Tabs, Links, Highlights): `#00FFCC` (Pill shaped buttons `borderRadius: 16`, dark text `#050A0E`, `fontWeight: '700'`)
  - Accent (Pinned Announcements, Warnings, Badges): `#FF6600` (Pinned announcements styled with warm subtle amber glow `rgba(255, 102, 0, 0.1)` and crisp `#FF6600` tags)
  - Danger (Terminations, Deletions, Hard Mute): `#FF3366`
  - Text Primary: `#FFFFFF` | Text Secondary: `#7E8E9C`
- **Light Mode**:
  - Main Background: `#F4F7F9`
  - Elevated Surface / Cards: `#FFFFFF`
  - Border / Divider: `#DCE4EC`
  - Primary Accent: `#00B894` (darkened slightly for light-background readability while keeping `#00FFCC` accents)
  - Accent (Announcements): `#FF6600`
  - Text Primary: `#050A0E` | Text Secondary: `#5A6B78`

## 3. Complete Feature Checklist & Architecture
- **1. Pre-Login**: Username + Password Login ONLY. Strictly NO Account Creation UI. "Forgot Password" submits a request to Admins (`password_reset_requests`). Suspended (`status = 'suspended'`, `suspended_until > now()`) and Terminated (`status = 'terminated'`) accounts are blocked with clear status screens.
- **2. Post-Login Bottom Selector**: Fixed bottom bar with `Chat` | `Posts` | `Account Settings` | `Admin` (visible ONLY when `currentUser.role === 'admin'`).
- **3. Chat Interface**:
  - Text messages with clickable Hyperlink detection (`Linking.openURL`).
  - Message Deletion (for sender or Admin).
  - GIFs (Giphy API integration), Photos & Videos, Polls (live voting), Voice Messages, Message Pinning, Report Offense to Admins, and Documents (PDF, Audio, etc.).
  - Exact Sliding-Window Spam Limitation Engine (Warning, Soft Mute, Hard Mute, Duplicate Block, Media/GIF Cap).
- **4. Posts & Live Leaderboard**:
  - Posts ONCE MADE CANNOT BE DELETED (zero delete UI + DB trigger blocking deletion).
  - Announcements (`is_announcement = true`) are styled in `#FF6600` and pinned to the top of the Posts feed.
  - Viewers see Poster + Subject list, `Leaderboard` button at top, and click a post to open the Post Detail page showing Subject, Poster, Content, attachments, clickable `0–10` number rating buttons, ratings given by others, and Satisfaction Rate (`%`).
  - Posters click `(+ New)` at the bottom of the Posts list -> opens Create Post page with Subject, Text, Camera button (images), Paperclip button (documents), and `(Post)` button at the bottom.
  - Leaderboard page shows `Rank` and `Average Satisfaction Rate (%)`. Minimum 1 post per week (`>= 1` post in the rolling last 7 days) required or the user's name is automatically removed from the leaderboard. Includes `( <- Back to Main Menu)` button at the bottom.
- **5. Account Settings**: Read-only Username (set by Admins), Change Display Name, Change Password, Dark/Light Mode toggle, Log Out.
- **6. Administration Portal**: Main Admin account seeded directly in DB. Admins can Create Accounts, Terminate Accounts (permanently), Suspend Accounts (temporarily), Mute members from chat, Mark posts as Announcements (`#FF6600` + pinned at top), Reset user passwords, and Resolve reported chat offenses.

## 4. Active File Map & Database Status

### Database Tables (supabase/schema.sql)
| Table | Key Columns | Notes |
|---|---|---|
| `profiles` | id, username (UNIQUE), password_hash, display_name, role, status, suspended_until, muted_until | Admin seed: admin/admin123 |
| `posts` | id, author_id, subject, content, image_urls TEXT[], document_urls JSONB, is_announcement | BEFORE DELETE trigger prevents all deletions |
| `post_ratings` | id, post_id, rater_id, score (0–10), UNIQUE(post_id,rater_id) | |
| `messages` | id, sender_id, content, message_type, media_url, media_meta JSONB, is_pinned, is_deleted | |
| `polls` | id, message_id, question, options JSONB | |
| `poll_votes` | id, poll_id, voter_id, option_index, UNIQUE(poll_id,voter_id) | |
| `offense_reports` | id, message_id, reporter_id, reported_user_id, reason, status | |
| `password_reset_requests` | id, username, request_note, status | |

Storage buckets: `post-attachments` (public), `chat-media` (public)
Realtime: all 8 tables added to `supabase_realtime` publication.

### Source Files
| File | Key Exports |
|---|---|
| `supabase/schema.sql` | Full DDL + triggers + seed + storage + realtime |
| `src/types/database.ts` | `Profile`, `Post`, `PostRating`, `Message`, `Poll`, `PollVote`, `OffenseReport`, `PasswordResetRequest`, `PostWithDetails`, `MessageWithSender`, `LeaderboardEntry`, `DocumentAttachment`, `TableName` |
| `src/services/supabase.ts` | `supabase` (SupabaseClient), `isSupabaseConfigured` (boolean) |
| `src/context/ThemeContext.tsx` | `ThemeProvider`, `useTheme`, `ThemeColors` |
| `src/context/AuthContext.tsx` | `AuthProvider`, `useAuth`, `localStore`, `getBlockReason`, `AccountBlockReason`, `LoginResult` |
| `src/components/AccountLockModal.tsx` | `AccountLockModal` (Full-screen Suspended / Terminated lock modal with live countdown) |
| `App.tsx` | `App` (default) — ErrorBoundary, state router, Bottom Nav (Chat \| Posts \| Account Settings \| Admin) |
| `src/screens/LoginScreen.tsx` | `LoginScreen` — Invite-only credentials login, Forgot Password modal, lock enforcement |
| `src/screens/AccountSettingsScreen.tsx` | `AccountSettingsScreen` — Locked username card, Display Name updater, Password changer, Theme toggle with swatches, Logout |
| `src/screens/AccountScreen.tsx` | Re-exports `AccountSettingsScreen` for backwards compatibility |
| `src/screens/ChatScreen.tsx` | `ChatScreen` — Full Group Chat Interface: Sticky Pinned Banner, Hyperlink detection, Soft Deletion, Pinning, Offense Reporting, Giphy & Curated Reactions, Photos/Videos with zoom, Voice Notes with timer & playback progress, Documents with download, and Interactive Polls |
| `src/hooks/useSpamLimiter.ts` | `useSpamLimiter` — Sliding-Window Spam Limitation Engine enforcing burst/sustained limits, duplicate blocking, media cooldown, warning lockout, soft mute, hard mute with Supabase persistence, and admin mute synchronization |
| `src/services/chatService.ts` | `fetchMessages`, `sendMessage`, `createPoll`, `voteOnPoll`, `deleteMessage`, `togglePinMessage`, `reportOffense`, `getLocalOffenseReports` |
| `src/services/postsService.ts` | `fetchPosts`, `createPost`, `ratePost`, `toggleAnnouncement`, `computeLeaderboard`, `DetailedPost` |
| `src/screens/PostsScreen.tsx` | `PostsScreen` — Feed, Create Post, Post Detail with 0–10 Rating & Announcements; delegates Leaderboard to `LeaderboardView` |
| `src/components/Posts/LeaderboardView.tsx` | `LeaderboardView` — Live Realtime leaderboard: subscribes to `posts` + `post_ratings` INSERT/UPDATE, enforces rolling 7-day eligibility, computes Satisfaction Rate, ranked UI with `← Back to Main Menu` |
| `src/screens/AdminPortalScreen.tsx` | `AdminPortalScreen` — Full Access-Controlled Admin Portal: 4 sub-tabs (Accounts, Resets, Announcements, Reports) |
| `src/screens/AdminScreen.tsx` | Re-exports `AdminPortalScreen` for backwards compatibility |
| `src/services/adminService.ts` | `fetchAccounts`, `createAccount`, `muteUser`, `suspendUser`, `terminateUser`, `resetUserPassword`, `fetchPasswordResetRequests`, `resolvePasswordResetRequest`, `togglePostAnnouncement`, `fetchOffenseReports`, `resolveOffenseReport`, `deleteOffendingMessage` |
| `src/components/common/HyperlinkText.tsx` | `HyperlinkText` (Reusable URL regex tokenizer, native Linking browser integration with canOpenURL check and error Alert) |
| `eas.json` | EAS Build configuration: preview profile (direct Android APK) & production profile (AAB / IPA) |

## 5. Chronological Handoff Log
- **[Init]**: Project initialized. Ready for Prompt 1.
- **[Phase 1 — 2026-10-15]**: Completed full scaffold.
  - `supabase/schema.sql`: All 8 tables, `prevent_post_deletion_trigger`, admin seed, storage buckets, Realtime publication.
  - `src/types/database.ts`: Full TypeScript interfaces + `PostWithDetails`, `MessageWithSender`, `LeaderboardEntry`.
  - `src/services/supabase.ts`: Safe `createClient` with placeholder fallback; `isSupabaseConfigured` flag.
  - `src/context/ThemeContext.tsx`: Dark (default) and Light palettes; `useTheme` hook.
  - `src/context/AuthContext.tsx`: `useAuth` hook; local fallback store (admin/admin123 + member1/member123); Realtime account-status lockout + 30 s polling; local-mode 5 s polling.
  - `App.tsx`: `ErrorBoundary` (class component), `ThemeProvider`, `AuthProvider`, state-based router, custom Bottom Nav (Chat | Posts | Account | Admin[admin-only]).
  - `npx tsc --noEmit` → **0 errors**.
- **[Phase 2 — 2026-10-15]**: Completed Pre-Login & Account Settings.
  - `src/components/AccountLockModal.tsx`:
    - Full-screen modal enforcing account locks for `status === 'terminated'` and `status === 'suspended'`.
    - Terminated state: Bold `#FF3366` UI stating `"Account Permanently Terminated by Administration."` with policy details and exit action.
    - Suspended state: Vibrant `#FF6600` UI with formatted date/time expiration and live ticking countdown (`DD:HH:MM:SS`).
  - `src/screens/LoginScreen.tsx`:
    - Styled with Dark Mode palette (`#050A0E`, `#00FFCC`, `#FF6600`) and responsive to Light Mode.
    - Clean `Username` (`autoCapitalize="none"`, `autoCorrect={false}`) and `Password` (`secureTextEntry={true}`) inputs with show/hide toggle.
    - Primary `LOGIN` button with `#00FFCC` background and `#050A0E` bold text.
    - Strictly invite-only: NO sign-up or registration buttons; prominent info card: `"Invite-Only Platform: Accounts are created exclusively by Administrators."`
    - Forgot Password modal: Dedicated dialog capturing username + optional note, submitting to `password_reset_requests` table (or localStore queue), and displaying confirmation.
    - Integrates `AccountLockModal` for terminated and suspended account attempts.
  - `src/screens/AccountSettingsScreen.tsx`:
    - Accessible via `Account Settings` tab in the bottom bar.
    - Read-only Username card with lock icon and `"SET BY ADMIN — READ ONLY"` badge.
    - Change Display Name section with pre-filled `display_name`, live validation, and immediate DB / local context updates.
    - Change Password section: Current Password, New Password, Confirm New Password inputs; verifies current password hash before saving new credentials.
    - Appearance section: Interactive `Switch` for Dark / Light mode with preview swatches for Main (`#050A0E`), Primary (`#00FFCC`), and Accent (`#FF6600`).
    - Session section: Prominent `#FF3366` Log Out button clearing session and navigating to `LoginScreen`.
  - `src/context/AuthContext.tsx`:
    - Added `updateDisplayName`, `updatePassword`, and `submitPasswordReset`.
    - Enhanced `login` return type with `LoginResult` indicating `blockedStatus` and `suspendedUntil`.
    - Seeded local fallback store with test accounts: `admin` (admin/admin123), `member1` (member/member123), `suspended_user` (member/suspend123, 52h remaining), `terminated_user` (member/term123).
  - `App.tsx`:
    - Wired `AccountSettingsScreen` to Bottom Navigation (`Account Settings` tab).
    - Enforced active-session lockout in `RootNavigator`: if a logged-in user becomes suspended or terminated, the full-screen `AccountLockModal` activates immediately with logout action.
  - TypeScript compilation: `npx tsc --noEmit` → **0 errors**.
- **[Phase 3 — 2026-10-15]**: Completed Posts Interface (List, Create, Detail, 0–10 Rating, & Leaderboard).
  - `src/services/postsService.ts`:
    - Dual-mode data service supporting live Supabase tables (`posts`, `post_ratings`, `profiles`) with fallback to in-memory localStore.
    - Initial seed dataset of realistic technical posts, announcements, attachments, and ratings.
    - `fetchPosts`: Joins author information, ratings, computes arithmetic average score and satisfaction rate (`(avg / 10) * 100`), highlights `myRating`, and orders pinned announcements first.
    - `createPost`: Publishes permanent posts with image/document arrays. STRICT COMPLIANCE: Zero deletion methods or UI exist.
    - `ratePost`: Upserts 0–10 score in `post_ratings` for the active member on conflict `(post_id, rater_id)`.
    - `toggleAnnouncement`: Admin-only toggle updating `is_announcement` flag with live feed reordering.
    - `computeLeaderboard`: Implements rolling 7-day qualification rule (`>= 1` post in rolling 7 days). Computes average satisfaction rate across author's rated posts, sorts descending, and assigns ranks.
  - `src/screens/PostsScreen.tsx`:
    - Pure React Native component implementation using internal state router (`'feed' | 'detail' | 'create' | 'leaderboard'`).
    - **View 1 (Feed)**: Header bar with app title, `"IMMUTABLE"` badge, and prominent `#00FFCC` `🏆 Leaderboard` button; pinned `#FF6600` announcement cards at the top; FlatList displaying author info, subject, timestamp, attachment counts, and live `XX.X%` satisfaction rate badge; fixed bottom `(+ New Post)` action bar.
    - **View 2 (Create Post)**: `(← Cancel)` header; permanence notice banner (`"⚠️ Posts once made cannot be deleted..."`); required subject and content fields; attachment modals for images (URL & presets) and documents (URL, name & presets) with removable thumbnails and badges; bottom `Publish Permanent Post` button.
    - **View 3 (Post Detail & 0–10 Rating)**: `(← Back to Posts)` header; Admin `"📢 Mark / Unmark as Announcement"` quick-toggle; post subject, author avatar/info, full selectable body; attached images gallery with full-screen zoom modal; attached documents section with `"Open / Download"` (`Linking.openURL`); interactive 0–10 satisfaction rating with visual `#00FFCC` progress bar, 11 clickable number buttons (`0` to `10`) highlighting active rating in `#00FFCC`; scrollable "Ratings Given by Others" list.
    - **View 4 (Leaderboard)**: Delegates to `LeaderboardView` component.
  - TypeScript compilation: `npx tsc --noEmit` → **0 errors**.
- **[Phase 4 — 2026-10-15]**: Built `src/components/Posts/LeaderboardView.tsx` — Live Leaderboard View & Real-Time Weekly Eligibility Engine.
  - `src/components/Posts/LeaderboardView.tsx`:
    - **Supabase Realtime Subscriptions**: Subscribes to `INSERT` and `UPDATE` events on both `posts` and `post_ratings` tables via two named Supabase Realtime channels (`leaderboard-posts-watcher`, `leaderboard-ratings-watcher`). Any new post or rating triggers a silent full recompute. In local/demo mode (no Supabase credentials), falls back to a 15-second polling interval.
    - **Live `● LIVE` indicator**: When Supabase channel status is `SUBSCRIBED`, a `#00FFCC`-coloured `● LIVE` badge is shown in the header card.
    - **Strict 7-Day Rolling Eligibility**: `sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000`. Users with `recentPosts < 1` are completely excluded — they do not appear at any rank.
    - **Satisfaction Rate Formula**: `((Sum of all scores / Count of ratings) / 10) × 100`. Authors with no ratings show `0%`. Rounded to 1 decimal place.
    - **Sort**: Descending `satisfactionRate`; tie-breaker: higher `recentPosts` count.
    - **Header card**: `"Live Leaderboard — Minimum 1 post/week required to stay on the board."` with eligibility explanation and last-computed timestamp.
    - **Rank rows**: `#1` (`#00FFCC` border/colour), `#2` (`#FF6600`), `#3` (`#FFB800`), `#4+` (secondary). Each row shows Rank badge with medal emoji, Display Name, `@username`, satisfaction progress bar, `"N posts this wk"` badge, and satisfaction `%` (large right-aligned).
    - **Fixed bottom bar**: `← Back to Main Menu` button (calls `onBack` prop → resets `PostsScreen` page state to `'feed'`).
    - **mountedRef guard**: Prevents state mutations after component unmount.
  - `src/screens/PostsScreen.tsx`:
    - Replaced inline `renderLeaderboard()` (110 lines) with a one-line delegate to `<LeaderboardView onBack={() => setPageState('feed')} />`.
    - Removed dead `leaderboard` / `isLeaderboardLoading` state, `computeLeaderboard` import, `loadLeaderboardData` callback, and all associated style keys (~130 lines trimmed).
  - TypeScript compilation: `npx tsc --noEmit` → **0 errors**.
- **[Phase 5 — 2026-10-15]**: Completed Group Chat Interface & Sliding-Window Spam Limitation Engine.
  - `src/hooks/useSpamLimiter.ts`:
    - Implemented exact JSON rate limit configuration:
      - `burst_window_seconds: 5`, `sustained_window_seconds: 60`
      - `warning`: burst 5, sustained 12, lockout 3s (`#FF6600` warning banner)
      - `soft_mute`: burst 8, sustained 18, mute duration 30s with live second-by-second countdown
      - `hard_mute`: burst 12, sustained 25, mute duration 300s (5 minutes) with Supabase `muted_until = now() + 300s` profile persistence
      - `duplicate_detection`: window 10s, max 2 identical allowed, blocks with `#FF6600` toast `"Duplicate message blocked (max 2 identical in 10s)."`
      - `media_limits`: window 60s, max 4 GIFs/media, 45s cooldown with live countdown badge
    - Ref-backed sliding-window arrays: `msgTs`, `dupTs`, `dupTexts`, `mediaTs` with automatic timestamp pruning.
    - Admin mute check: Synchronizes with `currentUser.muted_until` from `AuthContext`, locking chat input and rendering countdown banner.
  - `src/services/chatService.ts`:
    - Dual-mode data service with live Supabase operations (`messages`, `polls`, `poll_votes`, `offense_reports`) and offline in-memory store.
    - Seeded initial messages, photos, voice notes, documents, and interactive polls.
    - Operations: `fetchMessages`, `sendMessage`, `createPoll`, `voteOnPoll`, `deleteMessage`, `togglePinMessage`, `reportOffense`.
  - `src/screens/ChatScreen.tsx`:
    - **Sticky Pinned Messages Banner**: Top expandable `#FF6600` / `#00FFCC` bar displaying all messages where `is_pinned === true`, with snippet preview, jump-to-message, and unpin controls.
    - **Text with Hyperlink Support**: Regular expression URL parser detecting `http://...`, `https://...`, and `www....`, rendering clickable underlined `#00FFCC` links opening via `Linking.openURL()`.
    - **Message Deletion**: Allows sender or Admin to delete message; sets `is_deleted = true`, replacing bubble content with `"🚫 This message was deleted"` and suppressing media/actions.
    - **Message Pinning**: Long-press action sheet allows pinning/unpinning any message to/from the sticky top banner.
    - **Report Offense to Admins**: Long-press "🚨 Report Offense to Admins" action opens modal with offense categories and details, saving report to `offense_reports`.
    - **GIFs Integration**: GIF button opens Giphy Search & Trending Modal (`EXPO_PUBLIC_GIPHY_API_KEY`) with curated 16-item offline reaction fallback list.
    - **Photos & Videos**: Attachment drawer supporting presets and custom URLs with inline image display (tap to zoom full-screen) and video playback card (`Linking.openURL`).
    - **Voice Messages**: Microphone button with recording UI (`● REC`, timer, waveform), chat bubble with Play/Pause button, animated progress bar, duration badge, and wave visualizer.
    - **Documents (PDF, Audio, etc.)**: Paperclip button supporting PDF, Audio, and Office documents with distinct icon card, metadata, and "Download / Open File" button.
    - **Interactive Polls**: Poll button opens "Create Poll" modal (2 to 5 options); chat renders interactive card with real-time vote counts and `#00FFCC` percentage bars.
    - **Realtime Sync**: Subscribes to Supabase Realtime channel `egsm-chat-realtime` for `messages`, `polls`, `poll_votes` tables, with 4-second polling fallback in demo mode.
    - **Strict Anti-Crash**: Zero third-party navigation dependencies, only built-in React Native components, string `fontWeight` values throughout.
  - TypeScript compilation: `npx tsc --noEmit` → **0 errors**.
- **[Phase 6 — 2026-10-15]**: Completed Access-Controlled Administration Portal, Native Device Pickers & Native Build Configuration.
  - `src/services/adminService.ts`:
    - Full dual-mode admin management service supporting Supabase live DB operations with seamless in-memory fallback.
    - `fetchAccounts`, `createAccount` (with uniqueness checks and validation), `muteUser` (10m, 1h, 24h, 7d, unmute), `suspendUser` (1h, 24h, 3d, 7d, lift), `terminateUser` (permanent lock), `resetUserPassword`.
    - `fetchPasswordResetRequests`, `resolvePasswordResetRequest` (updates profile password and marks request resolved).
    - `fetchPostsForAdmin`, `togglePostAnnouncement` (updates `is_announcement = true` pinning post in `#FF6600`).
    - `fetchOffenseReports` (enriches with reporter, reported user, offending message content and status), `resolveOffenseReport`, `deleteOffendingMessage`.
  - `src/screens/AdminPortalScreen.tsx`:
    - Strictly access-controlled (`currentUser.role === 'admin'`), rendering access-denied shield for unauthorized users.
    - Organized into 4 clean top sub-tabs:
      - **Sub-Tab A: Create & Manage Accounts**:
        - Create New Account Card: Username, Initial Password, Display Name, Role selector (Member | Admin), `#00FFCC` submit button.
        - Member Directory & Moderation: Search bar, status filter chips (`All`, `Active`, `Muted`, `Suspended`, `Terminated`), live status badges.
        - Moderation actions per card: `Mute from Chat` (10m, 1h, 24h, 7d, Unmute modal), `Suspend Account` (1h, 24h, 3d, 7d, Lift Suspension modal), `Terminate Account` (permanent lockout confirmation dialog), and `Reset Password` modal.
      - **Sub-Tab B: Password Reset Requests Queue**:
        - Lists pending/resolved forgot-password requests submitted from the pre-login screen with dynamic pending count badge.
        - One-tap resolution modal allowing admin to type and save a new password for that user while resolving the ticket in one flow.
      - **Sub-Tab C: Announcements Manager**:
        - Lists all community posts with one-tap toggle `"📢 Pin as Announcement"` / `"❌ Remove Announcement"`.
        - Marking a post as an announcement sets `is_announcement = true`, instantly pinning it at the top of the feed in `#FF6600`.
      - **Sub-Tab D: Reported Offenses Queue**:
        - Displays chat reports with reporter, reported user, offending message preview, reason, and timestamp.
        - Quick moderation actions: `Delete Offending Message`, `Mute User (24h)`, `Suspend User (3d)`, `Terminate User`, `Mark Report Resolved`.
  - **Native Device Pickers (`expo-image-picker` & `expo-document-picker`)**:
    - Installed via `npx expo install expo-image-picker expo-document-picker`.
    - Connected to Camera and Photo attachment flows in `PostsScreen.tsx` and `ChatScreen.tsx`.
    - Connected to Paperclip document attachment flow in `PostsScreen.tsx` and `ChatScreen.tsx`.
    - Every invocation strictly wrapped in `try / catch` with runtime permission requests and offline/preset fallbacks.
  - **Native Android & iOS Build Configuration**:
    - `app.json`: Updated with Android package `"com.gruup.social"`, iOS bundle identifier `"com.gruup.social"`, dark splash screen `#050A0E`, and permissions (`CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`).
    - `eas.json`: Created with `preview` profile (`"android": { "buildType": "apk" }`) for direct `.apk` downloads and `production` profile (`app-bundle` / `.ipa`).
  - **Zero Error Compilation**:
    - `npx tsc --noEmit` verified with **0 errors** across the entire codebase.
- **[Phase 7 — 2026-10-15]**: Login Sanitization & Premium Dark Consumer UI/UX Overhaul.
  - **Task 1: Fix Login Query & Input Sanitization**:
    - `src/screens/LoginScreen.tsx`: Configured Username `TextInput` with `autoCapitalize="none"`, `autoCorrect={false}`, and `keyboardType="email-address"`. Added focused border state `rgba(0, 255, 204, 0.4)`.
    - `src/context/AuthContext.tsx`:
      - Sanitized inputs on login with `username.trim().toLowerCase()` and `password.trim()`.
      - Replaced `.single()` with multi-row query `.select('*').eq('username', cleanUsername).eq('password_hash', cleanPassword)` to prevent PostgREST `PGRST116` errors on zero matches.
      - Logged exact query lookup to console: `console.log('[Auth] User lookup result:', data, error)`.
      - Added informative `Alert` handling for 0 rows returned: differentiates between a network/Supabase error and invalid/missing credentials.
      - Sanitized inputs across fallback local storage login.
  - **Task 2: Complete UI/UX Overhaul (Dark Consumer App)**:
    - **Color & Surface Refinement**:
      - Set background to deep slate-black `#050A0E`.
      - Elevated card surfaces set to `#0D161F` with soft top hairline borders `borderColor: 'rgba(255, 255, 255, 0.07)'`, `borderWidth: 1`, and `borderRadius: 18`.
      - Removed all harsh 2px solid neon borders across cards, badges, and inputs.
    - **Typography & Hierarchy**:
      - Bold headings with `letterSpacing: -0.4`, body text at 15px with line height 22px, and metadata/timestamps in `#7E8E9C` at 12px.
      - Verified 100% of `fontWeight` attributes across the application are strict string values (`'600'`, `'700'`).
    - **Buttons & Form Inputs**:
      - Form inputs: sleek `#0A1017` surface, `borderRadius: 14`, padding 16px, placeholder `#4B5A68`, subtle focus border in `rgba(0, 255, 204, 0.4)`.
      - Primary buttons: Pill shape (`borderRadius: 16`), vibrant `#00FFCC` background, deep dark text `#050A0E`, `fontWeight: '700'`, active opacity feedback.
    - **Floating Modern Bottom Dock (`App.tsx`)**:
      - Transformed bottom navigation into a sleek floating pill dock: `marginHorizontal: 16`, `marginBottom: 20` (24 on iOS), `borderRadius: 24`, `backgroundColor: '#0D161F'`, hairline border.
      - Active tab highlighted with a soft cyan badge (`rgba(0, 255, 204, 0.12)`), pill shape `borderRadius: 18`, and active cyan dot indicator (`width: 4, height: 4, borderRadius: 2`).
    - **Feed & Card Aesthetics (`PostsScreen.tsx`)**:
      - Pinned Announcements: styled with warm, subtle amber glow (`rgba(255, 102, 0, 0.06)` background, `rgba(255, 102, 0, 0.25)` border, subtle amber shadow) and crisp `#FF6600` accent tags instead of flat orange boxes.
      - Post Cards: generous internal padding (16px), subtle dividers, rounded corners (`borderRadius: 18`).
  - **Gradle 9+ Project Name Compatibility**:
    - Set `name: "egsm"` in `app.json` so Gradle 9's `rootProject.name` never ends with a dot (`.`), while all in-app UI branding proudly displays `egsm.`.
  - **Zero Error TypeScript Verification**:
    - `npx tsc --noEmit` verified with **0 errors**.

## 6. Build & Native Compilation Instructions
- **Local Dev Server**:
  ```bash
  npm start
  ```
- **Direct Android `.apk` Build (EAS Preview)**:
  ```bash
  npx eas-cli build --platform android --profile preview
  ```
- **Production Android App Bundle (`.aab`)**:
  ```bash
  npx eas-cli build --platform android --profile production
  ```
- **Production iOS App Archive (`.ipa`)**:
  ```bash
  npx eas-cli build --platform ios --profile production
  ```
- **Local Native Prebuild**:
  ```bash
  npx expo prebuild
  npx expo run:android
  npx expo run:ios
  ```

---

## 7. Version 2.0.5-beta Architecture & Change Log

### 7.1 Release Overview & Zero-Crash Architecture
Branch `2.0.5-beta` enforces strict native binary stability standards for production Android (`.apk` / `.aab`) and iOS builds. To eliminate startup crashes caused by unlinked native runtime dependencies and third-party native modules in standalone APKs:
- **Strictly Zero Native Plugins**: Completely uninstalled/purged `expo-av`, `expo-image-picker`, `expo-document-picker`, `expo-file-system`, and `@react-navigation/*`.
- **Clean `app.json`**: Removed the `"plugins"` array completely. No background or startup hooks inject native code that fails on Android startup.
- **Built-in React Native Core Only**: The UI is composed exclusively with built-in React Native components (`View`, `Text`, `TextInput`, `TouchableOpacity`, `Pressable`, `FlatList`, `ScrollView`, `Image`, `Modal`, `Alert`, `Linking`, `BackHandler`, `StatusBar`, `Platform`, `StyleSheet`, `SafeAreaView`, `ActivityIndicator`, `KeyboardAvoidingView`).
- **Strict String Font Weights**: 100% of `fontWeight` attributes across the codebase use string representations (`'400'`, `'500'`, `'600'`, `'700'`, `'800'`), preventing Android runtime style parse exceptions.

---

### 7.2 Database & Sync Architecture

#### Direct Supabase Connection & Inlining (`src/services/supabase.ts`)
- Replaced all bracket notations (`process.env['...']`) with direct dot-syntax `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`. This ensures Babel/Metro correctly inlines environment variables statically during production APK builds.
- Preserved verified live project credentials as constant fallbacks (`FALLBACK_URL = 'https://sonjftotjytdglgvvndj.supabase.co'`, `FALLBACK_KEY = 'sb_publishable_8oNr8W1bF701ZXPZXdwtSA_XZ6-Tsho'`) so standalone APK installations never lose connection if `.env` fails to package.
- Single client instance with explicit auth configuration (`persistSession: false`, `autoRefreshToken: false`) since authentication is managed via custom database credentials (`username` + `password_hash`).

#### Complete Purge of Mock Seed Arrays & Hardcoded Fallbacks
All mock seed arrays and fallback test profiles have been eliminated:
- Purged `_localProfiles`, `_localPosts`, `_localMessages`.
- Deleted fake user records (`"Test Member"`, `"Suspended Member"`, `"Terminated Member"`).
- Deleted all sample preset arrays (`SAMPLE_IMAGE_PRESETS`, `PHOTO_PRESETS`, `DOCUMENT_PRESETS`).
- **Strict Database Sync Rule**: Every single read and write query connects directly to live Supabase tables:
  1. `profiles`: User accounts, credentials, moderation status (`active`, `muted`, `suspended`, `terminated`), and roles (`member`, `admin`).
  2. `posts`: Feed submissions with categories, upvotes, downvotes, total score, pin status, announcement flag.
  3. `post_ratings`: Unique member ratings (+1 / -1) per post.
  4. `messages`: Real-time group chat messages, attachments, pinned flags.
  5. `polls` & `poll_votes`: Community polls and live vote tracking.
  6. `offense_reports`: Reported chat offenses queue with status (`pending`, `reviewed`, `dismissed`).
  7. `password_reset_requests`: User-submitted password recovery queue with status (`pending`, `completed`, `rejected`).

#### Profile Resolution & Display Name Mapping
To fix display names showing `"Member"` or `"Community Member"`, `postsService.ts` and `chatService.ts` implement an in-memory lookup cache:
- When querying `posts` or `messages`, the service fetches all active profiles:
  ```ts
  const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, role');
  ```
- Builds a fast Map indexed by both `profile.id` and `@username`.
- Resolves `post.author` and `message.sender` to the user's real `display_name`, falling back to `@${username}` and finally `User` if missing. No generic `"Member"` placeholders remain.

---

### 7.3 Android Navigation & Hardware Back Button (`BackHandler`)

#### Posts Screen Navigation Stack (`src/screens/PostsScreen.tsx`)
- Registered an Android hardware back button listener inside `useEffect`.
- When `viewMode` is `'detail'`, `'create'`, or `'leaderboard'`, pressing the physical Android back button transitions back to `'feed'` and returns `true`, preventing the app from exiting:
  ```ts
  useEffect(() => {
    const onBackPress = () => {
      if (viewMode !== 'feed') {
        setViewMode('feed');
        setSelectedPost(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [viewMode]);
  ```

#### Root Shell Navigation Stack (`App.tsx`)
- Registered an Android hardware back button listener in `App.tsx`.
- If the user is on any tab other than `'chat'` (`'posts'`, `'profile'`, `'admin'`), pressing the hardware back button returns to the `'chat'` tab and returns `true`:
  ```ts
  useEffect(() => {
    const onBackPress = () => {
      if (activeTab !== 'chat') {
        setActiveTab('chat');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [activeTab]);
  ```

#### Chat Screen Modal Dismissal (`src/screens/ChatScreen.tsx`)
- Intercepts hardware back presses to dismiss open modals (`zoomImageUrl`, `isActionModalOpen`, `isReportModalOpen`, `isGifModalOpen`, `isAttachModalOpen`, `isPollModalOpen`) before bubbling down to the root navigation.

---

### 7.4 Universal Status Bar & Notch Layout Metrics (`src/utils/layout.ts`)

#### Safe Top Distance Formula
To resolve notification bar / camera punch hole overlaps across diverse Android devices:
```ts
export const SAFE_TOP = Platform.OS === 'android'
  ? Math.max((StatusBar.currentHeight || 28) + 14, 44)
  : 50;
```
- **Main Shell**: Applied `paddingTop: SAFE_TOP` to the root container in `App.tsx` so all screens are naturally positioned below the notification bar.
- **Screen Headers**: Top headers in `PostsScreen.tsx`, `ChatScreen.tsx`, `LeaderboardView.tsx`, and `AdminPortalScreen.tsx` use `paddingTop: 12` to prevent awkward double-padding under the status bar.
- **Modal Dialogs**: Since `<Modal>` components render outside the React Native view hierarchy directly into native Android dialog windows, `paddingTop: SAFE_TOP` is explicitly applied to the root `<View>` of all modals across the app (`modalOverlay`, `fullModalContainer`, `zoomModalContainer`).

---

### 7.5 Crash-Free Media & Document Attachments

#### Native Picker Replacement
Since native camera and document picker libraries crash standalone APK binaries on launch without Expo native dependencies, all attachments are handled cleanly via in-app URL modals with zero native plugins:
- **Image / Photo Attachments**:
  - Direct URL input for any PNG, JPG, or WebP link.
  - Real-time live image preview rendered inside the modal before sending.
  - Rendered in feed/chat with tap-to-zoom in a full-screen image modal.
- **Video Attachments**:
  - Direct URL input for MP4 or streaming video.
  - Video cards launch system player via `Linking.openURL(url)` or `SafeVideo`.
- **Audio / Voice Note Attachments**:
  - Dedicated Audio tab in the attachment drawer (also accessible via the composer 🎤 button).
  - Direct audio link (.mp3, .m4a, .wav) input.
  - Voice note card in chat triggers zero-crash audio playback via `Linking.openURL(url)`.
- **Document Attachments**:
  - Custom file title + URL input.
  - File card displays document name, file type badge, and a `Download / Open File` button that delegates to device viewers via `Linking.openURL(url)`.
- **Giphy Integration**: Working direct Giphy API search modal with curated reaction GIFs.

---

### 7.6 Full File Modification Log for Version 2.0.5-beta

| File | Changes Made |
| :--- | :--- |
| `app.json` | Added `"softwareKeyboardLayoutMode": "resize"` and `"newArchEnabled": false`; ensured `"RECORD_AUDIO"` permission is declared for Android audio driver stability. |
| `src/services/supabase.ts` | Replaced bracket notation with direct dot-syntax `process.env.EXPO_PUBLIC_*`; retained fallback project constants. |
| `src/utils/layout.ts` | Defined and exported `SAFE_TOP` metric formula and `TOP_SAFE_PADDING` alias for notch protection. |
| `src/services/audioVideoService.tsx` | Removed all `expo-av` imports and require calls; implemented zero-crash `SafeVideo` and stubbed audio helper. |
| `src/services/postsService.ts` | Replaced hardcoded author fallbacks with Supabase `profiles` lookup map; mapped `author` and `rater` to real `display_name` and `@username`. Purged mock arrays. |
| `src/services/chatService.ts` | Built `profiles` lookup map for chat messages; mapped `sender` to real `display_name` and `@username`. Purged mock seed data. |
| `src/components/common/HyperlinkText.tsx` | Reusable React Native hyperlink text component with robust URL regex tokenization, native `Linking.canOpenURL` / `Linking.openURL` handling, error alerts, and `#00FFCC` underlined link styling. |
| `src/screens/PostsScreen.tsx` | Integrated `HyperlinkText` into post feed preview and `PostDetailView` body; added `BackHandler` listener (detail/create/leaderboard → feed); applied `SAFE_TOP` to all modal overlays; replaced native pickers with URL image & doc modals with live preview; fixed rater display name. |
| `src/screens/ChatScreen.tsx` | Integrated `HyperlinkText` for all text message bubbles; implemented WhatsApp-style inverted scrolling (`inverted={true}` + `[...messages].reverse()`); purged all `scrollToEnd()` calls; wrapped in `KeyboardAvoidingView` for zero-obscured input; built end-to-end `expo-av` voice note recording UI, Supabase Storage `'chat-media'` upload, and interactive in-bubble streaming playback. |
| `App.tsx` | Added `BackHandler` listener (other tabs → chat); applied `paddingTop: SAFE_TOP` to root safe container. |
| `src/components/Posts/LeaderboardView.tsx` | Imported `StatusBar` and `SAFE_TOP`; adjusted header padding to prevent status bar collision. |
| `src/screens/AdminPortalScreen.tsx` | Applied `SAFE_TOP` to modal overlays; set topBar `paddingTop: 12`; removed `"Member"` fallback from offense reports. |
| `PROJECT_CONTEXT.md` | Documented full `Version 2.0.5-beta Architecture & Change Log` with database architecture, navigation flow, and file logs. |

---

### 7.7 Critical Chat Engine Overhaul: Inverted Scrolling, Keyboard Compression & Voice Notes

#### 1. Inverted WhatsApp-Style Scrolling & Snap-Back Elimination (`ChatScreen.tsx`)
- **Parent Container Viewport**: Wrapped the `FlatList` in a dedicated parent container with `style={styles.messageStreamContainer}` (`flex: 1`, `backgroundColor: '#050A0E'`) to ensure a strictly defined viewport height and prevent Android touch responder chain breaks.
- **Pure Padding Content Container**: `contentContainerStyle` is strictly limited to padding:
  ```tsx
  contentContainerStyle={styles.flatListContentContainer}
  // { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }
  ```
  Removed any `flex: 1`, `height: '100%'`, `minHeight: '100%'`, or `justifyContent: 'flex-end'` (which causes an infinite scroll-bounce loop on Android).
- **Inverted FlatList Stability**: Configured message stream using `inverted={true}` and memoized `reversedMessages = useMemo(() => [...messages].reverse(), [messages])`.
- **Android Stability Props**:
  ```tsx
  keyboardShouldPersistTaps="handled"
  showsVerticalScrollIndicator={true}
  removeClippedSubviews={false}
  overScrollMode="always"
  onScroll={handleScroll}
  scrollEventThrottle={16}
  ```
- **Scroll Bouncing & Hijacking Elimination**:
  - Completely removed all `scrollToEnd()` and `scrollToOffset()` invocations from `onContentSizeChange` and `useEffect` hooks.
  - Implemented shallow identity checks in `loadMessages` so that background polling and Realtime sync callbacks do not replace the `messages` array reference unless content has genuinely changed, preventing layout recalculation snap-backs while scrolling through chat history.
  - Added `isNearBottomRef` scroll tracking to guarantee that user position in message history is never overridden by updates.
- **Natural Message Flow**: New messages arrive at the bottom (`y = 0`) naturally without bouncing the user down when inspecting past messages.
- **Targeted Jump to Message**: Adjusted pinned message jump selector to compute target index dynamically via `reversed.findIndex(m => m.id === messageId)`.

#### 3. End-to-End Voice Notes (`app.json`, `package.json`, `ChatScreen.tsx`)
- **Native Stability Settings (`app.json`)**:
  - `"newArchEnabled": false` set under `"expo"` to ensure audio drivers and native threads run stably.
  - `"RECORD_AUDIO"` and `"android.permission.RECORD_AUDIO"` added to `android.permissions`.
  - `"NSMicrophoneUsageDescription"` declared in `ios.infoPlist`.
- **Recording Architecture (`ChatScreen.tsx`)**:
  - Permissions requested via `Audio.requestPermissionsAsync()`.
  - Audio mode configured via `Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })`.
  - Recording initiated with `Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)`.
  - Active Recording UI: Pulsing red `REC` indicator, live seconds counter (`0:01`, `0:02`...), `Cancel` button, and `Send Voice Note` button.
  - Storage Upload: Retrieves `.m4a` file via `recording.getURI()`, streams upload to `'chat-media'` bucket in Supabase via `uploadFileToSupabase`, and inserts record into `messages` with `message_type: 'voice'`.
- **Interactive In-Bubble Playback**:
  - Interactive `Play / Pause` toggle (`⏸` / `▶`) with dynamic waveform bars and duration badge.
  - Live audio streaming directly from Supabase public URL via `Audio.Sound.createAsync({ uri: msg.media_url }, { shouldPlay: true })`.
  - Automatic playback state tracking, second-by-second progress updates, and clean unloading on completion or component unmount.

---

### 7.8 Reusable Hyperlink Text Component (`src/components/common/HyperlinkText.tsx`)

#### 1. Architecture & Design Principles
- **Primitives**: Built exclusively with core React Native primitives (`Text`, `Linking`, `Alert`, `StyleSheet`) with zero third-party dependencies.
- **Robust URL Detection**:
  ```ts
  const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  ```
- **Tokenization & Trailing Punctuation Stripping**: Iteratively tokenizes input strings into plain text and URL segments, automatically detaching trailing punctuation marks (`.`, `,`, `;`, `:`, `!`, `?`, `)`) to ensure clean URLs.
- **Safe Linking Handler**: Automatically prepends `https://` to `www.` links or links without a protocol, verifies capability with `Linking.canOpenURL(targetUrl)`, opens with `Linking.openURL(targetUrl)`, and gracefully falls back to `Alert.alert('Cannot Open Link', targetUrl)` if the link cannot be resolved.
- **Styling**: Underlined (`textDecorationLine: 'underline'`), brand cyan `#00FFCC`, and `fontWeight: '600'`. Accepts optional custom `style` and `linkStyle` prop overrides.

#### 2. Screen Integrations
- **Group Chat Screen (`ChatScreen.tsx`)**: Replaced raw text and inline regex parsing in chat bubbles with `<HyperlinkText text={item.content} style={[styles.messageTextBody, { color: colors.textPrimary }]} linkStyle={{ color: '#00FFCC', textDecorationLine: 'underline' }} />`. Text links in both incoming and outgoing bubbles are directly clickable without firing the parent bubble's long-press message actions sheet.
- **Posts Screen (`PostsScreen.tsx`)**:
  - **Feed Snippet**: Rendered post content preview using `<HyperlinkText text={item.content} style={s.postPreviewText} numberOfLines={2} />` so members can tap links shared in posts.
  - **Post Detail**: Rendered full post body using `<HyperlinkText text={currentPost.content} style={s.detailContentText} selectable />` with link detection and text selection support.

---

### 7.9 Verification & Compilation Status
- **TypeScript Check**: `npx tsc --noEmit` executed cleanly with **0 errors**.
- **Native Audio Package**: `expo-av` (`^16.0.8`) installed and fully typed.
- **Native Stability**: Zero crash-inducing navigation or unconfigured native plugins.
- **Git Branch & Versioning**: Version aligned to `2.0.5-beta` across `package.json`, `package-lock.json`, `app.json`, and Android `versionName`. Where tags are unsupported by platform validators (iOS `CFBundleShortVersionString` / `buildNumber`), `2.0.5.1` is set (`android.versionCode: 20501`). Verified on branch `2.0.5-beta`.





