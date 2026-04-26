# Spinative Editor — UX & User Journey Critique

---

## The Core Problem: Wrong Entry Point

The first thing a user sees is **Project Settings** — a form with seven configuration tabs, most of them empty. It's the worst possible first impression. Configuration is a tax, not a reward. The editor's actual superpower — watching your game come alive in the canvas — is hidden three clicks away behind a nav item called "Flow."

The fix is structural: **make Flow the default landing workspace**. Users open a project and immediately see their game rendered, their assets composited into a real slot layout, the Sim button ready to press. That's the moment they understand what Spinative is. Everything else becomes setup that enables *more* of that moment.

---

## 1. Navigation Order — Rethink the Hierarchy

Current order: `Project · Features · Art · Typography · Flow · Logic · Marketing`

This is configuration-first, canvas-last. It maps to how the *tool was built*, not how a *user thinks*. A game designer thinks about what their game looks, feels, and plays like — then fills in the details. Proposed order:

**`Flow · Art · Features · Logic · Project · Marketing`**

Typography disappears from the top nav entirely (addressed below). Flow is first because it's the emotional anchor. Art second because generating assets is the primary creative act. Features and Logic follow as mechanics. Project (settings) is the admin layer — it should feel like a gear icon or a sub-section, not a peer. Marketing is the final-stage deliverable.

This also solves the crowding problem. Seven items with overflow (`...`) is too many. Six works cleanly. Five is ideal.

---

## 2. Merge Typography Into Art

Typography is a sub-tool of the Art workflow. It takes screenshots of generated art and derives a font spec from them. That's a step in the art direction process, not a peer workspace. It belongs as a **third tab inside Art**, alongside "Assets" and "Inputs" — perhaps called "Type Spec" or sitting behind a button in the Inputs panel ("Generate Typography Spec from this art →"). Moving it out of the top nav frees up a slot and makes the relationship between art generation and font selection explicit rather than orphaned.

---

## 3. Gamify and Simplify Project Settings

Currently Project Settings is seven flat tabs of form fields. This needs to feel like setup, not paperwork.

**Completion progress:** Add a horizontal progress bar at the top of the Project workspace — "Game spec: 4/7 sections complete" with a visual fill. Each tab gets a checkmark when its required fields are filled. Users feel momentum.

**Theme picker:** The Theme field is a free-text input. Replace it with a visual grid — thumbnail cards for "Western," "Egyptian," "Fantasy," "Sci-Fi," "Mythology," etc. The user clicks an aesthetic direction and the field populates. This is the single highest-leverage change in the whole settings section because it's the first creative decision users make, and right now it's a blank text box staring at them.

**Colour palette:** The mood/colour inputs need swatches, not hex values. Show a palette of named tones (warm gold, deep indigo, soft peach, etc.) as clickable chips. Three can be selected. This maps directly to how art directors think.

**Merge tabs:** Jackpots should fold into Features (a jackpot is a feature). Symbols should fold into Art (it's art configuration). That reduces Project's tabs from seven to four: **Theme · Reels · GDD · Import**. Leaner.

**Inline art preview in Theme:** When the user has set a theme and colour palette, show a small live preview in the corner using generated backgrounds or symbols — the art already rendered. Connect the settings form to the visual output so users can see the effect of their choices.

---

## 4. Flow Workspace — Promote It, and Redesign the Screen Navigation

The Flow canvas is the best thing in the product. It needs to work harder.

**As the landing page:** When a project has assets, this is what the user should open to. The opening shot of Jim Boom Boom — a full western slot with real symbols, real background, the character on the left, jackpot bar, reel frame, all composited — is remarkable. Show it first.

### 4a. Replace Horizontal Screen Tabs with a Vertical Thumbnail Panel

The current horizontal tab strip (Splash · Base Game · Win Sequence · Free Spins · Wild) should be replaced with a **vertical panel on the left side of the canvas**, styled like the slide panel in PowerPoint or Keynote. Each screen becomes a thumbnail — a miniature render of that screen state — stacked vertically, scrollable, and selectable by clicking.

This panel should support **two hierarchical levels**. Top-level screens (Splash, Base Game, Win Sequence, Free Spins, Wild) are shown as labelled section headers with a full-width thumbnail. Sub-screens nest underneath with a slight indent and smaller thumbnails — for example, Win Sequence expands to show Small Win, Big Win, Mega Win, Epic Win, Jackpot Win as individual child entries. This mirrors how feature-specific screens (free spins intro, outro, hold frames) relate to their parent feature.

The result is that users can see the full game flow at a glance, scroll through screens like presentation slides, and immediately understand the scope of what they're building. It also makes the panel more useful as a navigation tool when projects grow to 10–20+ screens.

The current left toolbar (select, zoom, fit, etc.) can remain on the far left edge. The thumbnail panel sits between the toolbar and the canvas, collapsible with a toggle so power users can maximise canvas space.

**Screen tab indicators:** Each thumbnail should show a status chip — a green dot if all required assets for that screen are generated, amber if partial, grey if not started. This gives a visual health check of the whole game at a glance.

**Sim mode:** Give the Sim button more weight in Flow — a pulsing or glowing state when active. When simulation is running, the top bar could subtly shift to indicate "live mode."

**Layers vs Assets panel:** The right panel split between Layers and Assets is clean. One improvement: show a small thumbnail on each layer row (the actual asset image) so users can recognise layers visually rather than by name alone.

---

## 5. Features Workspace — Surface the "Active" State Better

The feature list has a useful Active/All/Warnings filter, but the "Disabled — toggle to enable" greyed-out rows make the list feel 80% empty. Consider defaulting the list to **Active Only**, with a prominent `+ Add Feature` call to action at the top. Disabled features live behind a collapsed "Available to add" section. This transforms the workspace from "a list of things you haven't done" to "the features your game has, with room to grow."

The **System Impact** right panel currently says "Select a feature to see its impact" when nothing is selected. This is wasted prime real estate. Default-populate it with an aggregate summary: total active features, total unique screens, estimated combination complexity. Give users something to look at before they click.

---

## 6. Art Workspace — Already Strong, Small Improvements

This is the most polished workspace. A few refinements:

The **style picker** reads as "No style / change in Inputs ×" — this is subtle for such a decisive setting. Give it a visual treatment: a small style thumbnail or labelled badge (e.g., a pill that says "Cartoon 3D" in the art style's own visual register). When style changes, the whole generation pipeline shifts — it deserves prominence.

The **progress ring/bar** (43% · 20/47) is motivating — keep it. Consider colour-coding it: amber below 50%, yellow 50–80%, green 80%+, gold at 100%.

The **Art Bible** section in Inputs is a genuinely powerful concept. "Generate art bible" generates the cross-asset coherence contract. This deserves a better explanation and more visual treatment — right now it's a text area and a button. Show what the output looks like: a small formatted card showing the lighting direction, material language, colour temperature — not just a raw text blob.

---

## 7. Logic Workspace — Discoverable Depth

The node graph is impressive and technically sophisticated. The main UX risk is abandonment — a new user opening Logic and seeing a wall of connected nodes might back out immediately. Consider two modes:

**Guided mode** — A simplified view that shows only the high-level flow (Splash → Base Game → Feature Trigger → Win States) with the ability to click into each node.

**Expert mode** — The current view, with all node types accessible.

The **Auto-fill** button is underexplained. A tooltip or inline description ("Automatically generate a logic graph from your configured features") would dramatically improve its discoverability.

---

## 8. Marketing Workspace — Good Structure

The deliverable grid (Square Lobby Tile, Portrait Lobby Tile, Hero Banner, etc.) is well organised. The **Customise/Render** CTA pairing per card is clear. Two improvements:

Show rendered previews inline once a render is complete — it should replace the empty card automatically without a page refresh.

The **Export all kit** dropdown in the header is powerful. Consider adding a visual format indicator on each card (PNG tag, JPG tag) so users can plan export needs at a glance before rendering.

---

## 9. Global Polish

**Status bar:** The bottom bar (Screen · Layer · Grid · Orientation · Balance · Bet) contains runtime game info that only makes sense in Flow. Make it contextual — show it only in Flow and Logic.

**Onboarding:** New projects open to a blank form. A first-time user has no idea what to do. A single-step modal on project creation — "Give your game a name and pick a theme" — would unblock the biggest early drop-off point.

**Keyboard shortcuts:** The `Save ⌘S` button advertises keyboard literacy. Expose more shortcuts — `G` to generate, `S` to sim, number keys to switch workspaces. An overlay (shown on `?` or `⌘/`) listing all shortcuts would reward power users.

**Version notes:** The "Add version note..." input in the header is a useful habit to build. Surface a gentle nudge — perhaps a tooltip or a count of saves without a note ("5 saves without a note. Add context?").

**Left global sidebar:** The three icon-only buttons (dashboard, projects, settings) have no labels. These should at minimum have hover tooltips. Labels below the icons would not add visual noise and would help new users orient.

---

## Priority Order

If forced to sequence these, the highest-leverage changes are:

1. **Make Flow the landing workspace** — one routing change, maximum emotional impact
2. **Vertical thumbnail screen panel in Flow** — replaces horizontal tabs, adds hierarchy, elevates the workspace
3. **Theme visual picker** — biggest improvement to the new-project experience
4. **Fold Typography into Art** — cleans up the nav, clarifies relationships
5. **Project Settings completion progress bar** — makes configuration feel achievable
6. **Features list defaults to Active Only** — reduces empty-state anxiety
7. **Flow toolbar tooltips** — low-cost, high-clarity
8. **Art style picker visual treatment** — promotes the most important generation variable
9. **Logic guided/expert mode toggle** — unlocks the workspace for less technical users
