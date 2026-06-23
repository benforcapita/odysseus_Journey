# Projects Tab — Sidebar-Native Folder-Scoped Agent Workspace

**Status:** Approved design
**Date:** 2026-06-23
**Platform:** macOS desktop app (`.app` bundle via `desktop_main.py`)
**Depends on:** existing `active_workspace` primitive (`src/tool_execution.py`),
existing `stream_agent_loop` (`src/agent_loop.py`), existing `agent_runs`
detached-run manager, existing pending-approval pattern (email tool).

## Goal

Add a **Projects** tab to the Odysseus macOS desktop app that works like the
Chat tab but is tied to a user-chosen folder on disk. The agent has Codex-style
access to the folder — read/write files and run shell commands — and operates
inside a project-scoped policy with an approval flow for mutating operations. Project
conversations are persisted separately from the Chats list.

The feature is **Mac-desktop-only**. It requires a native bridge to obtain a
real filesystem path (browsers expose only folder contents, not paths, and
cannot run shells). In browser-served mode the Projects entry point is hidden.

V1 uses the built-in Odysseus agent and existing model providers. External
Codex, Claude Code, or Agents integration is a later adapter over the same
Project, message stream, file tree, and changes pane.

## Non-Goals (v1)

- Browser-served degraded mode (no path, no shell).
- Launching or embedding external Codex, Claude Code, or other agent runtimes.
- Network-egress sandboxing for shell commands (documented as a known gap).
- Cross-project search, shared linked paths, or project templates.
- Multi-window projects (one active run per project; one project active at a
  time in the main view).
- Syncing projects across machines.

## Architecture

A **Project** is a first-class persisted entity owned by the current Odysseus
user and tied to exactly one folder on disk. Conversation history lives in a
separate `ProjectMessage` table — not in `Session` — so Projects and Chats
never interleave and their lifecycles stay independent.

```
Native bridge (desktop_main.py)
  -> /api/projects/* routes (routes/project_routes.py)
     -> Project + ProjectMessage models (core/models.py)
        -> stream_agent_loop(..., project_policy=...) [reused]
           -> set_active_workspace(project_root) [existing contextvar]
              -> project_sandbox.resolve_and_check [new]
                 -> filesystem_tools / subprocess_tools [existing, wrapped]
                    -> pending approval (auto_approve off OR non-static)
                       -> /api/projects/<id>/approve/<pending_id>
```

### Data model

New tables in `core/models.py` (SQLAlchemy, owner-scoped):

```python
class Project:
    id              str, pk
    owner           str   # existing owner scoping (invariant 4)
    name            str   # defaults to folder basename
    folder_path     str   # absolute, real path from native picker
    linked_paths    JSON  # [{path, kind: "file"|"folder", mode: "ro"|"rw"}]
    model           str   # per-project model; defaults to user's last-used
    auto_approve    bool  # default false
    created_at, last_opened_at, updated_at  timestamps

class ProjectMessage:
    id              str, pk
    project_id      str, fk -> Project.id
    owner           str
    role            str   # user | assistant | tool | system
    content         str
    metadata        JSON  # tool calls, approvals, unified diffs (operation records,
                          # not full file snapshots or raw tool inputs — invariant 3)
    created_at      timestamp
```

**Invariant 3 preserved:** `ProjectMessage.metadata` stores paths, sizes, approval decisions, and
unified diffs (the operation record, like git). It does **not** store full file
snapshots or raw tool *inputs* (the source text a user pasted into a tool).
A test pins this distinction.

### Native bridge

`desktop_main.py` gains a `NativeBridge` class passed to
`webview.create_window(..., js_api=NativeBridge())` exposing:

- `pick_folder() -> {path, cancelled}` — invokes the native macOS folder
  picker; returns the real absolute path.
- `pick_file() -> {path, cancelled}` — for linking external files.
- `reveal_in_finder(path) -> None` — opens Finder at the path.

The frontend detects `window.pywebview.api` on load. If absent (browser
mode), `#rail-projects` is hidden and the `/api/projects/*` routes return
`503 Service Unavailable` with a `{"error": "projects_requires_desktop_app"}`
body so an accidental request can't partially succeed.

### Agent execution

`stream_agent_loop` gains an optional `project_policy: ProjectPolicy | None`
parameter. When set, the loop:

1. Sets `active_workspace(project_root)` via the existing contextvar for the
   duration of the request (existing primitive in `src/tool_execution.py`).
2. Routes every filesystem and subprocess tool call through
   `src/project_sandbox.resolve_and_check()` before execution.
3. For mutating operations, applies the approval flow described below.

A new `src/project_policy.py` builds the per-project `ProjectPolicy` from the
`Project` row (`project_root`, `linked_paths`, `auto_approve`). The agent
system prompt is augmented with a Projects-specific section: the project root,
the linked paths (read-only vs read-write), the sandbox rules, and the
instruction to call `ask_user` when a needed path isn't linked.

External-agent integrations are deliberately behind this boundary. A future
adapter may provide another run engine, but it must emit the same project
message events, approval requests, tool summaries, and diffs that the native
Odysseus agent emits.

## Security model

### File tools (read / write / list / grep)

Existing `active_workspace` confinement is tightened by a new
`src/project_sandbox.py` exposing:

```python
def resolve_and_check(
    path: str,
    project_root: str,
    linked_paths: list[dict],
    mode: str,  # "read" | "write"
) -> tuple[str | None, str | None]:
    """Return (resolved_path, error). On error, resolved_path is None."""
```

Steps, in order:

1. Expand `~`, make absolute relative to `project_root`.
2. `os.path.realpath` the result and the `project_root` (collapses symlinks).
3. If resolved path is under `project_root` → allow (read or write per mode).
4. Otherwise walk `linked_paths`: if resolved path is under a linked folder
   (or equals a linked file), allow per the item's `mode` (`ro` rejects writes).
5. Otherwise → deny with structured error the agent can read:
   `"Path '<x>' is outside the project sandbox. Ask the user to link it."`
   Denials are logged to run metadata (settings + status only — invariant 3).

Symlink escapes are blocked because step 2 `realpath`s both sides before
comparison. The agent cannot create a symlink inside the project pointing
outside and then write through it — the write resolves the target first.

### Shell tools

Today the shell starts in the workspace cwd but is explicitly **not** sandboxed
(see `GetWorkspaceTool` docstring in `src/agent_tools/filesystem_tools.py`).
For Projects we change that:

- Commands run with `cwd=project_root` and an explicit `env` that does **not**
  inherit the user's real `HOME`. We set `HOME` to a per-project scratch dir
  at `project_root/.odysseus-home` so tools like `git` find a config there,
  not the user's real `~/.gitconfig`.
- Before execution, the command string is parsed with the existing
  `shlex`-based parser in `src/agent_tools/subprocess_tools.py`. Every token
  that looks like a path is run through `resolve_and_check`. Redirects (`>`,
  `>>`, `<`) and here-doc targets are checked against write/read mode.
- Commands the parser cannot statically resolve are flagged **non-static** and
  **must go through approval even when `auto_approve` is on** — the one case
  where the user always sees the command. Non-static patterns include: `eval`,
  backticks, `source` / `.`, `exec`, `env VAR=$(...)`, here-docs with command
  substitution, complex pipes with variable expansion.
- The agent is told it must use simple, parseable commands; non-static commands
  require explicit approval.

### Approval flow

The existing email tool's `{pending: true, pending_id, ...}` pattern is
generalized to every mutating operation — file write, file delete, shell
command.

- When `auto_approve` is off, mutating operations return
  `{pending: true, pending_id, operation, summary, diff?}` instead of
  executing. The agent loop pauses its turn naturally (same mechanism as the
  email tool).
- The UI renders an approval card with the operation, affected paths, a
  unified diff for file edits, and `Approve` / `Reject` / `Approve & continue`
  buttons. Approve executes one op; Approve & continue flips `auto_approve`
  on for the rest of the turn. Rejecting returns the tool result
  `"User rejected: <op>"`.
- When `auto_approve` is on, statically-resolved writes and shell commands
  execute directly; **non-static commands still surface an approval card**.

Pending ops live in an in-memory dict keyed by `pending_id` with a 10-minute
TTL. If the user doesn't decide within 10 minutes, the agent loop is unblocked
with `"User did not respond within 10 minutes; operation cancelled"` and the
run continues or finishes. Server restart drops all pendings (the agent loop
is in-memory via `agent_runs`); a reconnecting SSE client sees the run as
stopped.

### Linked items (the escape valve)

The only way the agent reaches anything outside `project_root` is via linked
paths. Adding a linked path is a **user-initiated** action from the file-tree
pane ("Link to outside file/folder"). It calls the native bridge, then
`POST /api/projects/<id>/linked {path, kind, mode}`. The server validates the
path exists, resolves `realpath`, appends to `linked_paths`.

Linked items appear in the file tree under a visually distinct "Linked" group
with a link icon and a remove control. Removal is one click; the agent loses
access on its next tool call (no cached access). **The agent never gets to add
linked paths itself** — only the user.

### THREAT_MODEL.md additions

A new section covering: project sandbox scope and known gaps — network egress
from shell (deliberately unsandboxed in v1), non-static shell commands
(always-routed-to-approval mitigation), the linked-paths trust boundary, and
the fact that a malicious project folder could contain scripts the agent runs
(same threat as any code-exec agent, mitigated by approval flow).

## UI

### Rail and view switching

A new `#rail-projects` icon-rail button (folder-with-arrow SVG, monochrome
inline, matching the existing rail style) slots in right after `#rail-chats`.
Clicking it opens the Projects view — a peer of the chat view, switched the
same way existing rail buttons switch. Projects is integrated into the
existing sidebar and main app shell, not opened as a modal. The view splits
into:

- **Sidebar area:** project list (top) + file tree (below), using existing
  sidebar section/list styles.
- **Main column:** project conversation, using the familiar chat chrome.
- **Right changes pane:** latest diffs, shell output, selected file preview,
  and per-iteration status.

No new top-level window, no modal.

### Project list

Recent projects (name, folder basename, last-opened time), a `+ New Project`
button, and a context menu per item (rename, remove, reveal in Finder).
Selecting a project loads its file tree and conversation. Empty state: a
single centered `+ New Project` call-to-action. Separate sidebar section —
Projects and Chats never interleave.

The Projects rail/sidebar entry should look like a native peer of Chats and
Tools. It does not reuse the existing transient chat workspace pill as the
primary UI; that pill remains a chat-agent convenience.

### New project flow

1. `+ New Project` → `pick_folder()` native bridge.
2. POST `/api/projects {folder_path, name?}`.
3. Server validates path exists and is a directory, creates `Project`, runs a
   one-time shallow scan (capped 2000 entries — paths + sizes only, no
   contents).
4. Returns project + initial file tree.
5. Frontend switches to the split-panel view with the new project selected.

### File tree pane

Scrollable tree of the project folder using existing `.list-item` / `.section`
patterns, lazy-expanded per directory. In-folder files are plain; linked
external items appear under a visually distinct "Linked" group with a small
link icon and a remove-on-hover control.

Tree actions: open file (read-only viewer on the right, or inline if small),
link outside file/folder, create new file, delete (with confirm), reveal in
Finder. The agent's edits refresh the tree via a debounced file watcher on
`project_root` plus an explicit refresh after each approved operation.

### Conversation pane

Reuses the existing `chat-history` + `chat-input-bar` chrome, minus chat-
specific export menu. Replaced actions: rename project, reveal in Finder,
toggle auto-approve, switch model (existing model picker).

- Agent messages render with the existing markdown renderer.
- Tool calls render as compact cards: file-read shows a snippet, file-write
  shows a unified diff inline (Codex-style), shell-command shows command +
  exit code + truncated output.

### Changes pane

The right-side changes pane is visible on desktop widths and collapses below
the conversation on narrow screens. It shows the latest agent iteration in a
reviewable form:

- Changed files with `+added` / `-removed` counts and new-file markers.
- Selected unified diff using existing `.agent-tool-diff` / `.diff-pre`
  styling where possible.
- Shell command, exit code, and truncated output for the latest command.
- File preview for a selected tree item or changed file.
- Empty state when no changes have been made.

This pane is a read/review surface. Approvals still happen in the conversation
so the user can review the operation in context.

### Approval cards

When a pending operation arrives, the conversation inserts an approval card
(not a chat bubble) with the operation summary, affected paths, a collapsible
diff for writes, and `Approve` / `Reject` / `Approve & continue` buttons.
Once resolved, the card collapses to a one-line summary with a "show diff"
expander.

### Auto-approve toggle

A small switch in the conversation header, off by default. Turning it on
shows a one-time confirmation explaining the tradeoff. Per-project,
persisted.

### Visual style

Reuses existing theme tokens (`--panel`, `--card`, `--border`, `--accent`,
`--red` for destructive), Fira Code typography, monochrome inline SVG icons,
no emoji. Dark-theme-first; light-theme flows through CSS variables.
Split-panel respects the existing responsive collapse below 760px (project
list/file tree, conversation, and changes pane stack in that order). Keyboard
navigation covers project list, file tree, conversation, changes pane, and
approval buttons; Escape follows the existing `escMenuStack` behavior.

## Data flow

### Creating a project

User → `+ New Project` → `pick_folder()` → POST `/api/projects
{folder_path, name?}` → server validates + creates `Project` + one-time scan
→ returns project + initial file tree → frontend opens split-panel view.

### Sending a prompt

User types → POST `/api/projects/<id>/messages {content}` → server loads
`Project` + history, sets `active_workspace(project_root)`, builds
`ProjectPolicy` → `agent_runs.start(project_id, stream_agent_loop(...,
project_policy=policy))` → SSE subscription streams events.

Each tool call routes through `project_sandbox.resolve_and_check()`:

- **Auto-approve on, static op, path inside sandbox** → executes → result
  streams back → agent continues.
- **Auto-approve off OR non-static command** → tool returns
  `{pending: true, pending_id, operation, summary, diff?}` → agent loop
  pauses → SSE emits `pending_approval` → UI renders card → user clicks →
  POST `/api/projects/<id>/approve/<pending_id> {decision,
  auto_approve_continue?}` → server resolves pending op, executes on
  approve, returns tool result → agent loop resumes.
- **Path outside sandbox, not in linked_paths** → structured deny error →
  agent adapts or calls `ask_user`.

On completion the final assistant message persists to `ProjectMessage` (with
metadata capturing tool calls and approval decisions; never raw file
contents).

### Resuming a project

Selecting a project → loads `Project` + `ProjectMessage` history → renders
conversation. If `agent_runs.is_active(project_id)`, subscribes to the live
SSE stream (replays buffered events, then live — same as chat reconnection).
File tree is re-scanned on open (cheap, capped) and refreshed by the file
watcher thereafter. The changes pane reconstructs its current view from
recent tool metadata and diffs in `ProjectMessage`.

### Linking an external item

User → "Link outside file/folder" → native picker → POST
`/api/projects/<id>/linked {path, kind, mode}` → server validates, resolves
realpath, appends to `linked_paths` → returns updated list → tree re-renders.
Removal deletes the entry; agent loses access on next tool call.

### Stopping a run

Stop button → POST `/api/projects/<id>/stop` → `agent_runs.stop(project_id)`
cancels the drain task → currently-executing tool interrupts at next await
point → partial assistant message saved with `status: stopped` metadata.
Matches existing chat stop behavior.

### Owner scoping invariant

Every `/api/projects/*` route resolves the project by `id AND owner ==
current_user`, returning 404 (not 403) on mismatch — consistent with the rest
of Odysseus and invariant 4.

## Error handling & edge cases

- **Folder deleted or moved out from under a project:** file watcher fires
  removal → tree shows "Folder unavailable" banner with `Reveal in Finder`
  and `Remove project` actions → agent tool calls return
  `"Project folder is unavailable: <path>"` → agent surfaces this to the
  user. Project row stays (dimmed) until user removes it; reopening with the
  same path restored re-resolves.
- **Linked item deleted or permission revoked:** next tool call returns OS
  error wrapped as `"Linked path '<x>' is no longer accessible: <reason>"`.
  Agent adapts or asks user. Entry stays dimmed with remove control.
- **Path validation failures:** symlink loops raise `OSError` during
  `realpath` → caught and returned as structured deny. Permission denied on
  a path inside the project returns the OS error verbatim.
- **Non-static command parsing failures:** command routes through approval
  with `Non-static command — review carefully` warning, even with
  auto-approve on. If the parser itself errors (malformed shell), the tool
  returns a parse error and the agent retries with a simpler form.
- **Orphaned pending approvals:** 10-minute TTL. After expiry, agent loop
  unblocked with `"User did not respond within 10 minutes; operation
  cancelled"`. Server restart drops all pendings; reconnecting SSE clients
  see the run as stopped.
- **Agent runaway:** existing `MAX_AGENT_ROUNDS` cap from `src/agent_tools`
  applies; hitting it ends the turn with a visible "Reached max tool rounds"
  notice.
- **File watcher failure:** tree falls back to manual refresh after each
  approved operation; subtle "live updates off — manual refresh" indicator.
- **Native bridge missing:** frontend checks `window.pywebview.api` on load;
  if absent, `#rail-projects` is hidden. No crash, no broken UI.
- **Concurrent project activity:** one active agent run per project;
  starting a new prompt while active returns `409 Conflict` with "Stop the
  current run first" (matches existing chat guard). Multiple projects can be
  open in the list; only one runs at a time per project. Switching to a
  second project and starting a run there is allowed (different project_id).
- **Large file reads:** file-read results truncated by existing `_truncate`
  helper in `src/tool_utils.py`; agent sees `... [truncated]` and can request
  specific line ranges.
- **Network egress from shell (known gap):** v1 does not sandbox outbound
  network from shell commands. Documented in THREAT_MODEL.md; future v2 may
  add an egress toggle.
- **Approval of a destructive op that fails at execution time:** failure
  streams back as the tool result; approval card collapses to "failed:
  <reason>"; agent adapts.

## Testing

- **`tests/test_project_sandbox.py`** — `resolve_and_check` against a temp
  project dir: inside root (allow ro+rw), outside root (deny), `..` escape
  (deny), absolute path outside (deny), symlink inside root pointing outside
  (deny read+write after realpath), linked file ro (read allow, write deny),
  linked folder rw (read+write allow), linked folder ro (read allow, write
  deny), linked path removed mid-run (next call denies). Each deny asserts
  the structured error string and that nothing was written.
- **`tests/test_shell_classifier.py`** — table-driven static vs non-static:
  static (`ls`, `git status`, `npm test`, `cat file`, `echo "hi" > file.txt`)
  vs non-static (`eval`, backticks, `$(...)`, `source x.sh`,
  `env VAR=$(secret)`, here-doc with command substitution, complex pipe with
  var expansion). Asserts classification and that non-static forces approval
  regardless of `auto_approve`.
- **`tests/test_project_approval.py`** — TestClient posts a prompt, mocks
  `stream_agent_loop` to emit a pending write, asserts SSE emits
  `pending_approval`, POSTs approve, asserts the write executed via the
  sandbox and the result came back. Reject path tested separately.
  Auto-approve-on path tested with both a static command (executes silently)
  and a non-static command (still routes to approval).
- **`tests/test_project_routes.py`** — temp SQLite, two users. Each creates
  a project. Assert user A cannot list/read/modify user B's projects (404),
  cannot approve a pending in B's project, cannot add a linked path to B's
  project, cannot stop B's run. Assert project row is scoped to owner on
  every route.
- **`tests/test_project_agent_e2e.py`** — temp project folder with real
  files, a stubbed LLM emitting a known tool sequence (read, write, `git
  init && git status`, `..` escape, unlinked outside path). Asserts reads
  succeed, writes produce diffs in metadata, `git` runs in `project_root`
  with the per-project `HOME`, the `..` escape is denied, the unlinked path
  is denied, the final `ProjectMessage` is persisted with metadata and no
  raw file contents.
- **`tests/test_project_file_watcher.py`** — simulate watcher startup
  failure, assert tree falls back to manual refresh, assert refresh-after-op
  still works.
- **`tests/test_projects_ui_visibility.py`** — load `static/index.html`
  without `window.pywebview.api`, assert `#rail-projects` hidden; with the
  bridge stubbed, assert visible. (Node/jsdom or small Playwright check.)
- **`tests/test_projects_ui_layout.py`** — desktop smoke check renders the
  sidebar Projects entry, project list, file tree, project chat, approval
  card, and changes pane; narrow width stacks those surfaces without overlap.
- **Invariant check** — single test asserts that no
  `ProjectMessage.metadata` ever contains raw file contents — only paths,
  sizes, unified diffs (operation records), and statuses — never full file
  snapshots or raw tool inputs — preserving invariant 3.

## Open questions for v2

- External Codex, Claude Code, and Agents adapters over the same Project event
  contract.
- Network-egress sandbox for shell commands.
- Multi-window projects.
- Project templates (`.odysseus/project.json` in the folder describing
  linked paths, default model, allowlisted commands).
- Cross-project search over `ProjectMessage` history.
