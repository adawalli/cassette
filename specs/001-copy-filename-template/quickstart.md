# Quickstart: Copy Filename Template

## Bug fix verification (stripDateFromStem)

No config changes needed. After the fix, files with underscore or hyphen separators will produce correct output names automatically.

**Before fix**: `2026-03-20_weekly-standup.vtt` with `copy_to` produces `2026-03-20 2026-03-20_weekly-standup.md`
**After fix**: Same file produces `2026-03-20 weekly-standup.md`

## Using copy_filename templates

Add `copy_filename` to the `output` section of your `config.yaml`:

```yaml
output:
  copy_to: ~/meeting-notes
  copy_filename: "{{date}} {{title}}"
```

This produces files like `2026-03-20 Weekly Standup.md` when the LLM output contains:

```markdown
---
title: Weekly Standup
---

## Summary

...
```

### Available variables

| Variable  | Example value    | Source                                                   |
| --------- | ---------------- | -------------------------------------------------------- |
| `{{date}}`  | `2026-03-20`     | Extracted from filename or file birthtime                |
| `{{stem}}`  | `weekly-standup` | Filename without extension and leading date              |
| `{{title}}` | `Weekly Standup` | YAML front matter `title` field (falls back to `{{stem}}`) |

### Example templates

| Template          | Output filename                                  |
| ----------------- | ------------------------------------------------ |
| `{{date}} {{title}}`  | `2026-03-20 Weekly Standup.md`                   |
| `{{date}} {{stem}}`   | `2026-03-20 weekly-standup.md` (same as default) |
| `{{title}}`         | `Weekly Standup.md`                              |
| `{{stem}} - {{date}}` | `weekly-standup - 2026-03-20.md`                 |

### Default behavior

When `copy_filename` is omitted, files are named `{{date}} {{stem}}.md` (unchanged from current behavior).

### Validation

Invalid templates are rejected at config load time:

```
Error: copy_filename contains unknown variable(s): {{foo}}. Allowed: {{date}}, {{stem}}, {{title}}
```
