# The Platform Design Playbook — what the best infra/PaaS companies do

Research synthesis (Vercel, Linear, Stripe, Railway class — Mantlr, Pixeldarts,
OpenDesigner teardowns, 2026) mapped to CineFolio. This is the standing reference
for every UI decision.

## 1. The laws they all share

| Law | What it means | CineFolio application |
|---|---|---|
| **Interaction density > pixel density** | Sparse visuals, but EVERY element responds to hover/focus/keyboard/context. Density lives in behavior, not widgets. | Console stays sparse; every card, chip, frame gets full microstates. |
| **Six microstates or it isn't done** | default / hover / focus / active / disabled / loading — designed, not stubbed. | Audit pass across .btn, .stock, .frame, .kcard, inputs. |
| **One type family** | Stripe=Söhne, Linear=Inter, Vercel=Geist. Single family + mono for data/IDs. No decorative mixing. | We run a deliberate two-voice system (Bricolage display + Instrument serif accent) — our cinematic signature. The DISCIPLINE transfers: mono for every ID/status/data, tabular numbers, no third face ever. |
| **Accent as a highlighter you use once** | Monochrome-ish base; accent appears once per viewport — heads OR CTA OR active state, never all three. | Gold = active/selected only. Crimson = primary CTA only. Green = live/success only. Never decorative. |
| **Deliberate motion** | Defined curves + durations, reused. No browser defaults. Motion = feedback. | Tokens: `--ease: cubic-bezier(.22,1,.36,1)`, 150–250ms interactions, 500ms+ only for scene changes. |
| **Skeletons match layout** | Loading states mirror the exact shape they replace; staggered, intentional. | Skeleton components already match card shapes — keep parity as layouts evolve. |
| **Spacing is procedural** | 4px multiples; 8/12/16/24 inside, 64/96 between sections. (Linear famously bans 32.) | Adopted for console spacing. |
| **Full-bleed heroes, content held to center columns** | Vercel's signature: generous side margins, 96px hero type, skipped type ramp (no in-between sizes). | Landing already complies; console pageheads follow the skipped-ramp rule. |

## 2. The two hallmark features of 2030-grade platforms

1. **⌘K command palette** — Linear/Vercel/Raycast made keyboard-first navigation the
   tell of serious software. Every navigation and action reachable in two keystrokes.
   → Shipped: global CmdK in the console (navigate, act, jump to live sites).
2. **The bento platform section** — Stripe/Vercel marketing shows the REAL system in
   a grid of live tiles, not screenshots of it. Proof over promises.
   → Shipped: landing "The platform" bento — live guest-list counter, pointer-flip
   diagram, pipeline states, deterministic-engine tile, edge network — wired to the
   real API.

## 3. Feature placement + wiring conventions (where things live)

- **Marketing → product in one surface**: the demo IS the product (our Studio demo
  already obeys this — Vercel's deploy-preview trick).
- **Status is ambient**: live region/latency/version in the footer, not a page.
  → Shipped: console footer pings /health and shows `EDGE OK · 38MS · EU-CENTRAL-1`.
- **Dangerous actions**: always behind confirm + always reversible (we have
  takedown/relight, rollback — keep the pattern for everything destructive).
- **Empty states sell the next action** (never blank): each has voice + one CTA.
- **IDs and data are mono + copyable**; timestamps humanized in UI, ISO in tooltips.

## 4. Anti-patterns (banned)

Gradient soup, >8px radii on data surfaces, drop shadows on cards (glow ≠ shadow),
body text under 14px, more than one accent per viewport, spinners where skeletons
belong, "powered by AI" badges, browser-default transitions, dead ends after errors.

## 5. Our differentiated position

The Vercel/Linear school is monochrome restraint. CineFolio deliberately keeps ONE
cinematic signature (jersey palette + film metaphors) on top of their *discipline*:
their laws for spacing, microstates, motion and accent-budgeting — our voice for
color and story. Restraint in the system, drama in the moments (premiere, filming,
posters). That combination is the brand.
