# pi-code-block-panel

A Pi extension that renders Markdown code blocks as a bordered panel with a language label and a subtle background, instead of Pi's default literal fences.

Pi 1.5.2 prints the fence characters themselves as the "border", so a code block reads like raw Markdown source:

````text
```typescript
  const x = 1;
```
````

This extension replaces only the `code` token, so the same block reads like a panel:

````text
╭─ typescript ──────────────────────╮
│ const x = 1;                      │
│ function f(): number { return 1; }│
╰───────────────────────────────────╯
````

Every line is filled to the full width and painted with the panel background, so it stands apart from the surrounding prose.

## Install

```bash
pi install npm:pi-code-block-panel      # after publishing
pi install git:github.com/<user>/pi-code-block-panel
pi install ./pi-code-block-panel        # local checkout
```

Run `/reload` afterwards. A prototype patch cannot be undone by `/reload`; restart Pi to fully unload it.

To remove:

```bash
pi remove npm:pi-code-block-panel
```

## Options

| Environment variable | Effect |
|---|---|
| `PI_CODE_BLOCK_BG` | Theme token used as the panel background. Default `toolPendingBg`. Any theme background token works, for example `toolSuccessBg`, `customMessageBg`, `selectedBg`. Set `none` for no background. |
| `PI_CODE_BLOCK_BOX=0` | Draw no border or language label; background only, with Pi's two-space indent. |

The label shows the fence's language, or `text` when the fence has none.

## Behavior

- Applies to every Markdown surface Pi renders: assistant messages, thinking, user messages, summaries.
- Syntax highlighting still comes from the active theme (`syntax*` tokens), and the border follows `mdCodeBlockBorder`, so colors follow `/settings` → Theme.
- Width aware: lines are padded or truncated to the terminal width, accounting for CJK and other double-width characters.
- Display only. Stored messages, model context, print/JSON/RPC output are untouched.

## Compatibility

The extension patches the TypeScript-private `Markdown.prototype.renderToken` from `@earendil-works/pi-tui`. That is not a public API. Before installing the patch it renders a probe block and verifies the expected shape; if the shape changes, it leaves rendering untouched and shows a warning instead of breaking the transcript.

Other extensions that patch the same method — for example `@lwlee2608/pi-code-blocks` or `pi-pretty-codeblocks` — conflict with this one. Use one at a time.

Tested with Pi 1.5.2 / pi-tui 1.5.2.

## License

MIT
