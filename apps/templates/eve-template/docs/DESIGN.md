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
6. **One scroll owner.** The app shell stays `h-dvh overflow-hidden`. Only the active content region or conversation scrolls.
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
- **shadcn/Radix provide interaction primitives.** Use Dialog for dialogs, Command for global search, DropdownMenu for action menus and the existing form primitives instead of hand-rolling focus, keyboard or overlay behavior. For mobile navigation, reuse the repo's existing drawer/sheet primitive when one exists; otherwise keep the current Radix Dialog and isolate swipe behavior in a small tested adapter rather than adding a second component stack.
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

- One obvious sign-in action.
- No simultaneous "Log in" / "Sign up" split for password-protected self-hosted deployments.
- Password auth UI must look like part of the product shell, not a generic auth starter.

## Interaction details

- Composer is the highest-priority control and should feel visually elevated but not decorative.
- Mobile primary controls should target approximately 40-44px hit areas even when desktop controls are denser.
- The top bar carries a New chat control whenever the sidebar is not visible (phones, or a collapsed desktop sidebar), except on a fresh chat where it would do nothing.
- The sidebar highlights the most specific page containing the current route, so every Settings section keeps **Settings** (or **Connections**) selected.
- Keep drawers mounted when practical so opening/closing feels continuous rather than janky.
- Respect safe-area insets for top chrome and bottom composers.
- A stop control must actually cancel generation; never render a fake disabled stop icon.
- Skeletons must mirror the current production layout closely enough that hydration does not visually jump.
- Prefer short, calm product copy: "Message Ægentica", "Sign in", "No session loaded", "Runtime live".
- Avoid exposing internal route names, implementation jargon, registry mechanics or framework concepts unless the surface is specifically for advanced inspection.

- On coarse pointers, important tap targets are approximately 44px; desktop may remain denser.
- Mobile navigation supports the obvious menu button plus a right swipe anywhere on the page to open and a left swipe on the drawer to close. The open swipe is not edge-only because Android's system back gesture owns the screen edge. Swipes that start in text fields or horizontally scrolling rows stay with those elements. Gestures use touch events (browsers cancel pointer events once a finger pans) and are verified with real emulated touch. Gestures are additive: no essential action is swipe-only.
- Dialogs, menus and the drawer use shadcn's standard `tw-animate-css` enter/exit animations; the drawer slides from the left. `prefers-reduced-motion` reduces all motion except loading spinners.
- Do not hide destructive or important actions behind long-press. Long-press remains available for normal browser behavior on links and media.
- Horizontal rows that intentionally scroll use contained overscroll/snap behavior; vertical surfaces have one clear scroll owner.
- Drag/drop may enhance desktop file workflows, but mobile file selection always has an explicit attachment control.

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

Capability UI labels are **Live / Built in / Explore**, backed by the internal runtime / included / directory scopes. Live means a runtime declaration, never a successful credential test. Category tabs are All, Tools, Skills, Agents, Connections, Channels and System. Details show known access policy and maintainer instructions without fake install buttons.

The main composer groups agent, intent mode and attachments above the text area and keeps model, voice and send/stop controls discoverable. During an active eve turn the composer remains available for a documented `turnPolicy: "steer"` correction while Stop still cancels the durable turn. Modal and drawer surfaces reuse shadcn/Radix primitives, with accessible titles/descriptions and bounded viewport scrolling. Errors retain drafts and indicate recovery. No decorative dashboards, capability removal, invented images, hidden native selects or misleading success toasts.
