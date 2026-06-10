# Native Tools Platform Design

**Date:** 2026-06-10
**Status:** Approved for implementation planning

## Summary

Odysseus will absorb a balanced first set of 25 BrowseryTools utilities as native, offline-first features. Users can open and operate every tool directly from a search-first Tools Hub without involving AI. The Odysseus agent can optionally discover and invoke the same operations, combine compatible tools into workflows, and route outputs into existing Odysseus destinations.

The integration will establish a manifest-driven tools platform before porting the full BrowseryTools catalog. This avoids one-off UI and agent integrations and creates a stable path for later batches, including heavier AI and media tools.

## Goals

- Add a native, search-first Tools Hub to Odysseus.
- Port 25 balanced, high-value BrowseryTools utilities into Odysseus's existing UI.
- Keep every tool fully usable without chat or agent mode.
- Give manual and agent execution the same typed operation contract.
- Default to offline browser execution and use configured models only when needed.
- Support automatic multi-tool workflows with typed intermediate artifacts.
- Route persisted outputs to the Library or Gallery according to artifact type.
- Keep per-user history for metadata and saved outputs while expiring temporary inputs.
- Preserve privacy, explicit capabilities, and confirmation for risky operations.
- Make later BrowseryTools migration incremental and predictable.

## Non-Goals

- Porting all 137 BrowseryTools utilities in the first release.
- Loading every tool schema into the agent prompt at once.
- Requiring the agent to use a tool.
- Preserving BrowseryTools's existing page layouts or running it as an iframe or separate service.
- Adding the first batch of heavyweight transcription, translation, image-generation, or video-model runtimes.
- Automatically indexing temporary tool inputs or outputs into memory or RAG.

## Architecture

The platform has five layers with explicit boundaries.

### Tool Registry

The registry is the source of truth for installed tools. Each tool supplies a versioned manifest containing:

- Stable tool ID, name, description, category, keywords, and icon.
- UI module entry point and lazy-load metadata.
- Typed input and output definitions.
- Supported execution modes: `browser`, `backend`, or `adaptive-ai`.
- Capability declarations for files, network, AI transmission, camera, microphone, clipboard, and overwrite behavior.
- Risk classification and confirmation requirements.
- Accepted and produced artifact types.
- Default persistence and output-routing behavior.
- Agent availability, concise discovery text, and invocation schema.

Registry validation runs at startup or build time. Invalid or unavailable tools are excluded from launch and agent discovery with a visible diagnostic instead of failing the entire Tools Hub.

### Tools Hub

The Tools Hub is a native Odysseus workspace led by a search-first command palette. It provides:

- Search across names, descriptions, categories, and keywords.
- Category filters, favorites, and recent tools.
- Keyboard navigation and direct tool launching.
- Lazy-loaded native tool workspaces.
- Inputs from uploads, clipboard, Gallery, Library, and compatible prior outputs.
- Explicit `Ask Agent` and `Use in workflow` actions.
- Context-aware save, export, and download controls.

The Hub is fully functional when no model endpoint is configured. AI entry points are enhancements, not prerequisites.

### Tool Runtime

The runtime exposes one operation interface to both a tool's UI controller and the agent bridge. An invocation includes the tool ID, operation, typed inputs, settings, user identity, execution context, and requested persistence policy.

Execution modes are:

- `browser`: transformation runs locally in the user's browser. This is the default for the initial 25 tools.
- `backend`: execution uses a constrained Odysseus service when browser execution is unsuitable.
- `adaptive-ai`: execution prefers an available on-device model and otherwise uses a configured Odysseus local or API model, subject to capability checks and user overrides.

Browser operations must not silently fall back to server or network execution. A fallback that changes privacy characteristics requires a visible explanation and, when data would leave the device, confirmation.

Foreground agent requests may execute a `browser` operation through the connected Odysseus client: the backend issues a validated execution request, the client runs the registered operation, and the client returns the typed result. If no eligible client is connected, the operation reports that it requires an active browser instead of switching executors. Scheduled or background workflows may use only tools with a declared `backend` executor; browser-only steps are rejected during planning.

### Agent Bridge

The agent does not receive all tool schemas. It searches the registry using the existing tool-selection/indexing approach, then loads schemas only for relevant candidate tools. This protects smaller local models from prompt and schema bloat.

The bridge:

- Resolves a user request to candidate manifests.
- Validates typed inputs before execution.
- Applies the same permission and risk policy used by manual execution.
- Invokes the shared runtime operation.
- Returns structured artifacts and a concise execution result to the agent.
- Supports single operations and multi-step workflow plans.

Safe read-only and generative operations may run automatically. Destructive changes, overwrites, external transmission, or elevated capabilities require confirmation. A local-only sensitive-data transformation such as PII redaction does not require confirmation, but sending its input to a backend or external provider does.

### Artifact and History Layer

Tool inputs and outputs use typed artifacts rather than unstructured text. Initial artifact kinds include text, structured data, table, document, image, archive, and file.

Default routing is context-aware:

- Images persist to Gallery.
- Documents, text, tables, and structured data persist to Library.
- Temporary previews remain in the tool workspace.
- Files that do not map cleanly to an Odysseus collection remain downloadable and may be explicitly saved.

Per-user history stores tool identity, operation, settings, timestamps, workflow relationships, statuses, provenance, and references to saved outputs. Temporary raw inputs expire after 24 hours by default, with an administrator-configurable retention period, and are not added to memory or RAG unless the user explicitly saves or indexes them. Saved outputs remain until the user deletes them.

## Initial 25 Tools

The first batch favors offline execution, common workflows, and representative contract types.

### Image

1. Image Resizer
2. Image Compression
3. Image Converter
4. EXIF Remover
5. EXIF Viewer
6. Image Color Picker

### Files and Documents

7. PDF Toolkit
8. ZIP Tool
9. Spreadsheet Viewer
10. File Converter

### Text

11. Text Case Converter
12. Text Diff Viewer
13. Word Frequency Analyzer
14. PII Redactor

### Data

15. JSON Formatter
16. JSON/CSV Converter
17. YAML/JSON Converter

### Developer

18. Regex Tester
19. Base64 Converter
20. URL Encoder/Decoder
21. Hash Generator
22. UUID Generator

### Productivity

23. Calculator
24. Unit Converter
25. QR Code Generator

Each port receives an Odysseus-native presentation and uses shared controls for inputs, execution state, errors, persistence, and exports. BrowseryTools logic may be adapted where useful, but its existing React page shell is not embedded.

## Workflow Model

A workflow is a directed sequence of typed tool invocations. An output can feed a later input only when artifact types are compatible or an explicit converter exists.

Each workflow step records:

- Tool and operation versions.
- Validated inputs and settings.
- Capability decisions and confirmations.
- Start, completion, and failure timestamps.
- Produced artifacts and provenance.
- Dependency relationships.

The agent may plan and execute complete safe workflows automatically. A risky step pauses only at the point where confirmation is needed. If a step fails, dependent steps stop, independent completed outputs remain available, and the user can retry the failed step, change its settings, or select a declared fallback without restarting the workflow.

The initial batch should prove workflows such as:

- Resize image -> compress image -> save to Gallery.
- Remove EXIF -> inspect remaining metadata -> download or save.
- Parse spreadsheet -> convert selected data to CSV -> save to Library.
- Redact PII -> compare original and redacted text -> save as a document.
- Format JSON -> validate with a regex-derived extraction -> convert to CSV.

## Adaptive AI Strategy

The first 25 tools do not require AI to provide their core behavior. AI may assist by:

- Selecting the appropriate tool and settings.
- Explaining output or validation errors.
- Preparing batch operations.
- Building compatible workflows.
- Summarizing or transforming persisted results through existing Odysseus model capabilities.

Later `adaptive-ai` tools will declare both on-device and Odysseus-model executors. The runtime chooses according to availability, privacy policy, model capability, file size, and user preference. Users can force browser-only, local-model, or configured-API behavior where the tool supports it.

## Permissions and Safety

Every tool declares capabilities in its manifest. Undeclared capabilities are denied. The runtime enforces policy independently of the UI and agent so a crafted invocation cannot bypass controls.

Default policy:

- Pure local reads and transformations run without confirmation.
- Creating a new saved artifact may run automatically and remains undoable or deletable.
- Overwriting, deleting, bulk modification, or replacing an existing artifact requires confirmation.
- Sending content to an external API requires confirmation unless the user has explicitly trusted that tool/provider behavior.
- Camera and microphone access always use browser permission prompts and visible active-state indicators.
- Sensitive-data tools display where processing occurs and do not retain temporary inputs by default.

The execution record notes which executor ran and whether data remained in the browser, reached the Odysseus backend, or was sent to an external provider.

## Error Handling

- Manifest errors disable only the affected tool and surface an actionable diagnostic.
- Input validation errors are shown next to the relevant field and returned structurally to the agent.
- Runtime errors preserve inputs while allowed by retention policy and expose retryable versus terminal status.
- Adaptive executors may use only declared fallbacks; they never silently change privacy boundaries.
- Workflow failures preserve successful outputs and stop only dependent steps.
- Save or routing failures leave the generated output available for download and retry.
- Storage cleanup failures are logged and retried without blocking normal tool use.

## Testing

### Platform Tests

- Manifest schema and uniqueness validation.
- Registry search, filtering, lazy loading, favorites, and recents.
- Shared operation input/output validation.
- Capability denial and confirmation enforcement.
- Browser/backend/adaptive executor selection.
- Connected-client mediation and rejection of browser-only background steps.
- Artifact compatibility and context-aware routing.
- Per-user isolation and history retention cleanup.
- Agent retrieval that sends only relevant schemas.
- Workflow dependency, retry, fallback, and partial-failure behavior.

### Tool Tests

Each tool receives focused unit tests for its transformation logic and contract mapping. Representative browser tests cover direct manual operation, agent invocation, input sources, exports, and persistence.

### Release Gates

- All 25 tools work without an AI endpoint.
- Every agent-enabled tool uses the shared bridge rather than a bespoke schema path.
- No initial tool requires network access for its core operation.
- Permission tests demonstrate that agent calls cannot bypass manual-execution policy.
- Startup and agent context remain bounded through lazy UI loading and schema retrieval.

## Delivery Phases

### Phase 1: Platform Foundation

Build the manifest schema, registry, runtime interface, artifact model, permission policy, history model, and search-first Tools Hub.

### Phase 2: Five Representative Ports

Port one tool from each important contract shape to validate the platform before scaling: JSON Formatter, Image Resizer, PDF Toolkit, PII Redactor, and QR Code Generator.

### Phase 3: Remaining 20 Ports

Port the remaining tools in small category batches, reusing platform controls and adding only tool-specific transformation logic.

### Phase 4: Agent and Workflow Completion

Finish registry retrieval, typed agent invocation, workflow planning/execution, confirmation pauses, and history presentation. Manual UI operation remains independently testable throughout earlier phases.

### Phase 5: Later AI and Media Batches

Add transcription, translation, summarization, captioning, upscaling, background removal, audio, and video tools after the platform release gates pass.

## Licensing and Attribution

BrowseryTools is AGPL-3.0 and Odysseus is currently MIT. A public combined distribution will be released under AGPL-3.0 while retaining the original Odysseus MIT notices and BrowseryTools copyright and license notices. Adapted files and documentation will identify their source where practical. Public network deployments must provide corresponding source as required by AGPL-3.0.

The repository's top-level licensing, acknowledgments, source-offer links, and dependency notices must be updated as part of implementation before any public release.

## Success Criteria

The milestone is complete when:

- A user can find and launch all 25 tools from the native Tools Hub.
- Every tool performs its core operation offline without AI.
- The agent can discover and invoke relevant tools without receiving the full catalog schema.
- Safe tools can be chained automatically into typed workflows.
- Risky steps pause for confirmation and cannot bypass policy.
- Persisted outputs arrive in Gallery or Library according to type.
- History retains metadata and saved outputs while temporary inputs expire.
- The architecture supports additional tool batches without adding bespoke registry, permission, artifact, or agent plumbing.
