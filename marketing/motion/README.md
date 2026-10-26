# Motion

Video productions for MIHWAR, built with the `motion-studio` skill (`.claude/skills/motion-studio/SKILL.md`).

Each folder is one film: `story.md` (copy + sources, written first), `music.json`, `production.js`, `style.css`.
Renders go to `<film>/out/` and are not committed; rebuild them with:

```bash
node .claude/skills/motion-studio/engine/make.mjs marketing/motion/<film>
```

| Film | Length | Format | Purpose |
|---|---|---|---|
| `coming-soon` | 28 s · 120 BPM | 1920×1080 | Announcement teaser: محور قريبًا |
