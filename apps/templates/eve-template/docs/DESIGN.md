# Design contract

This file is the visual and product-UX contract for Ægentica on the HostUp / Dokploy deployment. Read it before changing any user-facing UI.

## Brand

The product name is **Ægentica**.

- Never show **eve** as the product name in user-facing UI.
- The underlying eve framework may still appear in code, package imports, internal diagnostics, developer documentation, and implementation-specific advanced details where technically necessary.
- Use `/aegentica.svg` as the primary product mark.
- Use the black square + white Æ monogram for app icons, Apple icons and social previews.
- Do not reintroduce the old eve logo, Vercel logo, or generic framework branding into the product shell.
- Product copy uses **Ægentica**: e.g. “Message Ægentica”, “Ægentica is responding”, “Sign in to Ægentica”.
- Preserve the supplied monogram geometry; do not reinterpret, round, decorate, gradient-fill, or add text inside the mark.
- The visual identity remains monochrome, restrained and consistent with the existing Vercel-style product shell.

## North star

The product must look and behave like a first-party Vercel product built from the official `eve-chat-template`, not like a dashboard layered on top of it.

When extending the template, preserve the original visual language and add capability without replacing, restyling, or hiding working upstream behavior.

## Non-negotiables

1. **Never remove a feature to solve a design problem.** Restyle or reorganize it.
2. **Upstream first.** Reuse the official template's spacing, typography, controls, borders, radii, colors, responsive behavior, and interaction patterns before introducing new ones.
3. **Quiet UI.** White/light neutral surfaces, restrained borders, no beige tint, decorative gradients, oversized cards, dashboard chrome, marketing copy, or gratuitous headings.
4. **Chat is primary.** The conversation and composer remain the visual center. Secondary capabilities must not make the app feel like an admin panel.
5. **Mobile first.** Every primary action must be comfortably tappable. Drawers, dialogs, composer controls, and menus must fit the viewport and never create accidental page scrolling.
6. **One scroll owner.** The app shell is pinned to the viewport (`fixed inset-0 overflow-hidden`), so the page itself never scrolls; only the active content region or conversation scrolls. Do not size full-screen surfaces in `dvh`: in Chrome's edge-to-edge installed-app mode it can exceed the screen.
7. **Native controls.** Prefer existing shadcn/Radix primitives from this repo. Avoid browser-native selects when an existing product control exists.
8. **No demo terminology in primary IA.** Navigation names describe the user's object or goal, not the implementation mechanism.
9. **Do not invent capability claims.** UI must distinguish what is active now, what this repo includes, and what eve can install.
10. **Accessibility is part of polish.** Keyboard focus, labels, contrast, reduced-motion compatibility, hit targets, and screen-reader text must remain intact.

## Product IA

Chat is the home surface. The sidebar exposes the user's durable objects first:

- **New chat** — starts the primary persisted conversation.
- **Agents** — saved instructions, context and model preferences.
- **Tasks** — scheduled and recurring work.
- **Images** — generated media kept on the server.
- **Memory** — durable operator preferences and facts.
- **Capabilities** — live runtime truth, built-in scaffolds and the official eve ecosystem.
- **Connections** — accounts and external services.
- **Activity** — advanced session/run inspection.
- **Explore** — user-oriented examples grounded in capabilities already present.
- **Settings** — models, voice, notifications, connections and security.

The AI Elements-based **Live session** route remains available through command search as an advanced eve-client surface, but it is not a second primary chat in the sidebar.

Do not use labels such as "eve capabilities", "Native Web Chat", "Session lifecycle", "Web channel", "demo", "lab", or similarly implementation-oriented names in primary navigation.

## Capability truth

The Capabilities surface must keep three scopes visibly separate:

### Live (internal scope: Runtime)

Capabilities reported by the live compiled agent/runtime. Source of truth: eve Client `info()`.

Examples: tools, skills, instructions, connections, channels, memory, schedules, hooks, subagents, sandbox, workspace and composition metadata.

### Built in (internal scope: Included)

Scaffolds and examples physically present in this repository even if they are not active for the current caller/session.

Current included areas include tools, packaged/dynamic skills, workflows/background tasks, subagents, connections, channels, profile memory, schedules, hooks, sandbox workspace and evals.

### Explore (internal scope: Directory)

The broader official eve registry and package surface that can be added/configured. This must never be presented as already active.

## Visual grammar

- Content width: use the template's established `max-w-2xl` chat rhythm; supporting reference pages may use `max-w-4xl` only when dense data genuinely needs it.
- Body text: `text-sm`, muted supporting copy, short line lengths.
- Headings: restrained; generally `text-2xl font-semibold tracking-tight` maximum on utility pages.
- Navigation rows: same dimensions and state treatment as `New session`.
- Cards: `rounded-lg border bg-card`; use them only for meaningful grouping, not every datum.
- Buttons: existing Button variants and sizes; no bespoke pill styles unless upstream already uses them.
- Icons: Lucide, usually `size-4`; icons support labels rather than replace understandable labels.
- Motion: subtle state transition only; never decorative motion that competes with chat.

## Component convergence

- **eve chat-template is canonical for the persisted chat.** A generic AI Elements component is not automatically a reason to replace an eve chat component. The current official template still owns its chat conversation, markdown, message and composer patterns.
- **AI Elements are canonical where already used.** The advanced Live session uses AI Elements `Conversation`, `Message`, `PromptInput`, `Reasoning`, `Question` and `Tool` primitives instead of recreating them.
- **shadcn/Radix provide interaction primitives.** Use Dialog for dialogs, Command for global search, DropdownMenu for action menus and the existing form primitives instead of hand-rolling focus, keyboard or overlay behavior. For mobile navigation, `components/chat/mobile-drawer.tsx` is the one exception: a drawer that follows the finger must exist before it opens, which a Radix Dialog (mounted on open) cannot do, so it is a small always-mounted modal with its gesture math isolated and tested in `lib/chat/drawer-gesture.ts`. Do not add a second drawer stack.
- **Divergence must pay for itself.** Keep differences that implement persistence, self-hosting, saved agents, multimodality, mobile quality or another documented product requirement. Remove duplicated keyboard handlers, duplicate scroll owners, stale labels and alternate UI paths that do not add capability.
- Do not copy a registry component into a second local implementation just to restyle it. Extend the existing component with class names or a thin product wrapper.

## Authentication

Self-hosted production must present the authentication mode that actually works for that deployment. If `EVE_CHAT_PASSWORD` is configured, password auth takes precedence over optional Vercel OAuth configuration. Custom-domain/proxy deployments must not render a sign-in path that points to an invalid origin.

The logged-out state must be testable before a deploy is considered complete.

## Change checklist

Before shipping a user-facing UI change:

1. Compare the changed surface with the current official `vercel/eve` chat template.
2. Verify no existing capability or route disappeared.
3. Verify Active / Included / Available claims are correctly scoped.
4. Test desktop and narrow mobile layouts.
5. Test sidebar open/close, dialog focus, composer focus, and internal scrolling.
6. Test logged-out -> sign-in -> logged-in flow for the actual deployment auth mode.
7. Run the production build.
8. Deploy and inspect runtime logs.
9. Verify every capability that existed before the change is still discoverable after the change.
10. Do not call the work complete if the live deployment differs from the committed UI.

## Surface patterns

Every secondary surface must feel like a first-party extension of chat, not a separate admin app.

### Agent

- Use three scopes only: **Runtime**, **Included**, **Directory**.
- Runtime prioritizes live runtime truth and compact capability rows.
- Included explains repository scaffolds without pretending they are active.
- Directory is a searchable registry list, not a marketplace card grid.
- Prefer rows, compact metrics and grouped lists over dashboard tiles.

### Channels

- Present channels as delivery surfaces for the same agent identity.
- The current web implementation is one channel, not a second product or second agent.
- Match the primary composer, conversation width, message rhythm and mobile safe-area behavior.

### Sessions

- Treat session controls as an advanced utility.
- Keep destructive lifecycle actions visually secondary and explicit.
- Empty states should explain the next action rather than show raw developer terminology.

### Authentication

- One obvious sign-in action. A signed-out page that shows its own Sign in prompt (Settings, Agents, Tasks, Images, Memory, Capabilities) keeps that button and the top bar hides its own there (`app/_components/page-sign-in.tsx`); elsewhere the top bar's button is the action. The sidebar's account row stays as the quiet account slot.
- In password mode the sign-in error page (`/auth/error`) speaks of the operator's username and password only, with no OAuth wording or links.
- No simultaneous "Log in" / "Sign up" split for password-protected self-hosted deployments.
- Password auth UI must look like part of the product shell, not a generic auth starter.

## Interaction details

- Composer is the highest-priority control and should feel visually elevated but not decorative.
- Mobile primary controls should target approximately 40-44px hit areas even when desktop controls are denser.
- The top bar carries a New chat control whenever the sidebar is not visible (phones, or a collapsed desktop sidebar), except on a fresh chat where it would do nothing.
- The sidebar highlights the most specific page containing the current route, so every Settings section keeps **Settings** (or **Connections**) selected.
- Keep drawers mounted when practical so opening/closing feels continuous rather than janky.
- Respect safe-area insets for top chrome and bottom composers. The shell starts its content below `env(safe-area-inset-top)`, so pages keep their own top spacing when Android draws the installed app under the status bar; pinned rows offset from that content edge.
- A stop control must actually cancel generation; never render a fake disabled stop icon.
- Error toasts sit below the top bar so navigation stays tappable while one is shown; an error that names Settings links there. A toast carries the message itself, with no generic "Request failed" title (the same toast reports limits and validation).
- A page whose data fails to load says so in plain words with **Retry** (`app/_components/load-error.tsx`), never a raw server message. Empty states ("Create your first agent", "No conversations yet") appear only after a load that worked, and a loading line never shows beside an error. An action that fails inside a dialog (renaming or deleting a chat) keeps the dialog open with the reason.
- Results of low-level actions read as sentences with a matching icon (an error icon for a failure), never raw JSON.
- One search control per layout: the top bar shows Search only when the sidebar (which has its own Search row) is hidden.
- Skeletons must mirror the current production layout closely enough that hydration does not visually jump. The first paint of a hard load is the layout's skeleton, so it copies the home page and chat control for control (voice buttons included) and shows the model name the device last displayed; a refresh looks like nothing happened.
- Times and dates that depend on the viewer's time zone or locale render after hydration; the server cannot know either, and a mismatch makes React rebuild the whole region.
- Prefer short, calm product copy: "Message Ægentica", "Sign in", "No session loaded", "Runtime live".
- Avoid exposing internal route names, implementation jargon, registry mechanics or framework concepts unless the surface is specifically for advanced inspection.

- On coarse pointers, important tap targets are approximately 44px; desktop may remain denser. Menu, select and search rows get this from one `pointer: coarse` rule in `globals.css`, so the shadcn primitives stay upstream.
- Density follows the pointer, not the screen width: a touch tablet or a landscape phone is wider than `md` but still under a finger. Write the finger size as the base class and the dense size under `pointer-fine:md:` (`h-11 pointer-fine:md:h-8`, `size-10 pointer-fine:md:size-7`), never under plain `md:`. The same goes for controls revealed on hover (a chat row's ⋯, reply actions): they are hidden until hover only under `pointer-fine:md:`, so a finger always sees them. A control that must stay small (a dialog's close ×) widens its hit area under `pointer-coarse:` instead.
- The floating top bar fades to the background like the composer's bottom edge, so scrolled content never collides with its buttons.
- Unknown addresses and missing chats show the product's own Not found state (mark, one line, New chat), never the framework default. A page that fails shows the same layout with Reload (inside the chat shell when only the page failed), and an app left open across a deploy says "Ægentica was updated" and reloads itself once, never mid-reply or over typed text.
- Capability details render their model-facing text as paragraphs, lists and inline code, as JSX text only.
- Mobile navigation supports the obvious menu button plus direct manipulation: the drawer stays mounted and tracks the finger from the first pixel, a right swipe anywhere on the page pulls it open, a left swipe on the drawer or the dimmed page pushes it closed, and a tap on the dimmed page closes it. On release it settles the way the thumb was last moving (or to the nearer side after a still release). The open swipe is not edge-only because Android's system back gesture owns the screen edge. Swipes that start in text fields or horizontally scrolling rows stay with those elements, and vertical drags scroll the drawer's own list. Gestures use touch events (browsers cancel pointer events once a finger pans) and are verified with real emulated touch. The drawer is a modal dialog while open (page behind inert, focus trapped, Escape closes). Gestures are additive: no essential action is swipe-only; the gesture math lives in `lib/chat/drawer-gesture.ts` with unit tests.
- The installed app behaves like an app, not a page: no pull-to-refresh or rubber-band overscroll, no tap highlight or double-tap zoom, and a long press never selects a control's label or the sidebar's text. Android's back gesture closes whatever is open before it leaves the page: the drawer, search and model picker through a history entry (`lib/pwa/back-layer.ts`), and every other dialog, menu or picker through a `CloseWatcher` that closes the top layer as Escape would (`lib/pwa/close-layers.ts`). New overlays built on the shadcn Dialog, AlertDialog, DropdownMenu or Select get this without extra code.
- Nothing raises the phone keyboard on its own: on touch devices dialogs focus themselves rather than their first field, and fields focus only when tapped (`lib/pwa/keyboard.ts`). Desktop keeps autofocus.
- Menus open on tap under a finger (not touch-down), so a scroll or swipe that starts on a menu button never pops its menu.
- Tab and filter rows on long pages (Settings, Capabilities, Tasks) pin under the top bar while the page scrolls and gain the top bar's mist once pinned (`components/chat/sticky-bar.tsx`).
- The home page keeps the greeting, the message box and the `/` and `@` hint in the upper part of the page (`HomeStage` in `app/_components/home-chat-page.tsx`), where the eye lands, on every screen size; no suggestion chips. Send turns the page into the chat in one motion: the greeting fades, the box glides to the bottom (a FLIP move over 340 ms), the sent message and "Thinking…" settle above it, and the chat route opens on an identical frame (`components/chat/pending-turn.tsx` is shared by the home page, the chat page and the route's loading state). The greeting and the hint hide when the keyboard leaves too little room (under 520px of height), and the message box grows to at most a quarter of the screen before it scrolls inside, so the page never scrolls and Send stays in view.
- Streaming replies read at a steady pace, whole words fading in, never in network bursts; a reply that has started never shows a second "Thinking…" under it. Reasoning is one muted line ("Thinking…" while it streams, with its newest lines in a short fading preview; "Thought for 12s" after) that a tap folds and unfolds with an animated height; it folds by itself when the answer starts unless the reader opened it.
- Replies wrap long words and links. Only code blocks and tables scroll sideways; the conversation itself never does, so a swipe that starts on a reply still pulls the drawer open.
- Dialogs, menus and the drawer use shadcn's standard `tw-animate-css` enter/exit animations; the drawer slides from the left. `prefers-reduced-motion` reduces all motion except loading spinners.
- Do not hide destructive or important actions behind long-press. A long press on a chat in the sidebar (or a right click in the installed app) opens that chat's own menu, the same one its ⋯ button opens, with a haptic tick. In the installed app on a phone, in-app links drop Chrome's link menu (open in new tab, preview), which would leave the app; links to other sites and media keep the browser's menu for copy and save (`lib/pwa/touch.ts`).
- Horizontal rows that intentionally scroll use the `scroll-row` utility (contained overscroll, snap, hidden scrollbar, edge fade) and bleed to the screen edge on phones; vertical surfaces have one clear scroll owner.
- Files dragged anywhere onto a chat window attach to the message, with a quiet "Drop to attach" overlay; desktop "Open with Ægentica" files land in a new chat the same way. Mobile file selection always has an explicit attachment control.
- Desktop keyboard shortcuts follow native chat apps: Ctrl/⌘+K search, Ctrl/⌘+Shift+O new chat, Ctrl/⌘+B sidebar, Ctrl/⌘+, Settings (the Mac preferences convention) and Escape to stop a streaming reply (an Escape that closed a menu or dialog stops nothing). The modifier is ⌘ on Apple devices and Ctrl elsewhere, never both: on a Mac, Ctrl+B and Ctrl+K are text-editing keys. The sidebar rows and Search list them only for a mouse or trackpad on a wide screen (`pointer-fine:md:`), and the controls carry `aria-keyshortcuts`.
- Keyboard focus never falls to the page body. The first Tab offers **Skip to content**, which moves focus to the page (`main#content`) past the sidebar; until keyboard focus reaches it, it sits fully above the screen, also below a tall status bar in the installed app. A collapsed desktop sidebar is `inert` (out of the tab order and the accessibility tree); collapsing it moves focus to the top bar's Open sidebar button, reopening it to the sidebar's own toggle. Dialogs give focus back to whatever opened them, a menu item's menu button included, also when they have no Radix Trigger (`lib/pwa/return-focus.ts`); a refused sign-in returns focus to the password, which is marked invalid and described by the error.
- Screen readers can tell who said what: each message is an article named **You** or **Ægentica**, a reply that is still streaming is `aria-busy` (so the conversation log does not announce every tick), and a chat page carries a visually hidden `h1` with the chat's title. Controls that repeat name their object ("Actions for Trip to Rome", "Edit “Lives in Stockholm”", "eve documentation for Memory"); an On/Off button is a `switch` named by its row. The command palette divides its list with group headings, not separators, which a listbox may not contain.
- Escape and Tab inside a menu or dialog opened from the phone drawer belong to that layer: Escape closes the menu or dialog and the drawer stays open.
- Enter that confirms an input-method composition (`isComposing`, or keyCode 229 as Safari sends it) never submits a text field.
- The message box and the memory import keep a long paste whole and say what the limit is, instead of cutting it silently with `maxLength`.
- Placeholders that carry state ("Listening…", "Add a correction…") use `text-muted-foreground`, legible in both themes.
- Small text reads at 4.5:1 or better: section labels ("Workspace", "Recent", "Settings") and shortcut hints use plain `text-muted-foreground`, never a faded `/60` or `opacity-60`. The focus ring token (`--ring`) is `oklch(0.556 0 0)` in light and `oklch(0.708 0 0)` in dark; links without their own focus style take it as a 2px outline.
- Pictures open in a full-screen viewer (`components/chat/image-viewer.tsx`: black backdrop, pinch to zoom, Share with the picture itself, Save, back or Escape to close), never as a raw file in a browser tab. Ctrl/⌘-click still opens a tab on desktop.
- Without a connection the top bar shows a quiet Offline status instead of letting actions fail silently.
- A half-written message is a draft, as in a native app: its text and files survive the app being closed in the background, a reload or a crash, per chat, until sent; sign-out clears them.
- An installed app stays open for days without pull-to-refresh, so it syncs itself: the chat list refreshes when the app returns after a while, when the connection returns and when a task notification arrives. Never ask the user to restart the app to see new data.
- Sharing uses the device's share sheet on phones (`lib/pwa/share.ts`); desktops keep one-click copy. Reply actions (Copy, Share, Read aloud) are finger-sized on phones.
- Lists of runtime capabilities show readable names (Read file) and keep the code identifier (`read_file`) in the details.
- Third parties carry their real logo wherever they appear as an item (model makers in the model picker and composer, AI Gateway and OpenRouter, GitHub, Telegram, Linear, Notion and Sentry, registry channels and services, tool calls of a connected service), never inside running text. Logos are monochrome and drawn in the text colour (`components/brand-icon.tsx` masks `public/brands/*.svg`), so they follow light and dark and stay quiet; a service without a published logo shows its initial on a muted tile, never a look-alike. `pnpm brands:sync` regenerates the files from Simple Icons and LobeHub Icons (see NOTICE).

## Completion bar

A polish pass is incomplete if any of these remain:

- starter-template promotional UI in the primary product experience;
- inconsistent composer implementations;
- mismatched loading skeletons;
- mobile controls below comfortable touch size;
- capability pages that read like raw debug output;
- visible functionality whose label describes implementation instead of user intent;
- a runtime that builds successfully but is not healthy after deployment.

## Orchestration surface contract

The sidebar uses `lib/navigation.ts`: Agents, Tasks, Images and Memory are primary workspace objects; Capabilities, Connections, Activity, Explore and Settings are secondary system surfaces. The advanced AI Elements Live session remains searchable but does not compete with the persisted chat in primary navigation.

Capability UI labels are **Live / Built in / Explore**, backed by the internal runtime / included / directory scopes. Live means a runtime declaration, never a successful credential test. Entries the runtime reports as disabled or shadowed read as such ("Disabled in this build", "Replaced by an authored override"), with their badge visible on phones too, never like active capabilities. Category tabs are All, Tools, Skills, Agents, Connections, Channels and System. Details show known access policy and maintainer instructions without fake install buttons.

The main composer has no menus above the text area: `/` lists the skills and `@` the saved agents inline (arrow keys, Enter or Tab, Escape; a tap on phones), the pick shows as a chip with a remove button above the box, and attachments show as chips there too; the footer keeps attach, model, voice and send/stop controls discoverable. During an active eve turn the composer remains available for a documented `turnPolicy: "steer"` correction while Stop still cancels the durable turn. Modal and drawer surfaces reuse shadcn/Radix primitives, with accessible titles/descriptions and bounded viewport scrolling. Errors retain drafts and indicate recovery. No decorative dashboards, capability removal, invented images, hidden native selects or misleading success toasts.
