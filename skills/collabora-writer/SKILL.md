# Collabora Writer browser editing

Use this skill when an agent must edit a Word-compatible document through the Collabora UI.

## Preconditions

- The document is already open in the session; there is nothing to open or choose.
- Confirm with `observe` that the editor rendered before the first edit.
- Work only in the document assigned to the current task.

## Working method

- Read before writing: `observe` for layout, `read_document` when the wording matters.
- Move the caret with `press_keys` before `write_text`; typing always lands at the caret.
  - `Control+Home` / `Control+End` — start or end of the document
  - `Shift+ArrowDown`, `Shift+End`, `Control+A` — build a selection to replace
  - `Delete` — remove the current selection
  - `Control+B` / `Control+I` / `Control+U` — formatting for the selection
- To reach text that is not next to the caret — a heading on a later page, a phrase to correct —
  call `find_text`; it selects the match. Do **not** open the editor's Find bar and drive it with
  `press_keys`: those keys go to the document, and `Enter` while text is selected replaces it.
- Select the text, then call `format_text` for anything the keyboard cannot do: `fontName`,
  `fontSize`, `color` (`#RRGGBB`) and `paragraphStyle` (`Heading 1`, `Normal`, …). It drives the
  editor directly, so it does not depend on finding a toolbar control — and it applies to the
  selection, which a click into the toolbar would otherwise have collapsed.
- For menus and dialogs (tables, page setup), call `inspect_editor_ui` first and use a
  selector it actually returned, then `click_editor_ui` or `fill_editor_ui`.
- After every edit, `observe` and confirm the change is visible.

## Safety

- Say what you are about to change before changing it.
- Prefer keyboard shortcuts and stable accessible controls over screen coordinates.
- Do not use download, share, print, macro, or external-link actions unless explicitly requested.
- Stop and request approval before deleting substantial content that the request did not mention.

## Completion

- Call `save_document`. It reports success only when the WOPI host stored a new document version.
- If the version did not change, `observe` and report what the editor is showing instead of retrying blindly.
- Post a short summary of the visible changes with `say`.
