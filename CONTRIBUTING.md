# Contributing to qbc-blog

## Quick start

```bash
git clone git@github.com:QuantumAI-Blockchain/qbc-blog.git
cd qbc-blog
pnpm install
git checkout -b post/your-post-slug
# write posts/2026-MM-DD-your-post-slug.md
pnpm validate
git commit -m "post: your post title"
git push origin post/your-post-slug
# open PR
```

## Writing standards

Match the existing project voice. Concrete, technical, honest about gaps. No
hype where evidence is missing. If a number's in a post, link the on-chain
artifact, the HF model card, or the commit that produced it.

### Structure

1. **Headline (≤ 80 characters).** What landed, not what you're hoping.
2. **One-paragraph lede.** Restate the headline as a sentence, then add the
   single most important specific number / address / hash from the work.
3. **Body.** Sub-sections for: what shipped, how it works, what's next.
   Cite file paths with the `file_path:line` pattern. Cite contract
   addresses by their full 42-char hex.
4. **Footer.** A "verify yourself" callout linking to
   [`docs/REPRODUCIBILITY.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/REPRODUCIBILITY.md).

### What not to write

- "We're building the future of AI". Concrete claims only.
- "AGSI" / "consciousness" / "SUSY database". See the
  [physics rename pass](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/PERMISSIONLESS_RESOLUTION_2026-05-21.md).
- Anything you can't link to a commit, a deploy receipt, or a model card.

### Tone

Imagine the reader is a senior engineer who just clicked through from
Hacker News. They want to know: (a) what's actually live, (b) how to verify
it themselves, (c) what's deferred and why. Don't hide the limitations —
the project's incident docs (`docs/ops/*.md`) are public for a reason.

## Image assets

Place images in the **frontend** repo under
`frontend/public/blog/img/<slug>/` so they ship with the build. Reference
them in markdown as `/blog/img/<slug>/<file>.png`. Image PRs go to
`qubitcoin-frontend`, content PRs go to `qbc-blog` — keep them separate
so a typo fix doesn't drag a binary delta through the content repo.

## Tags

Use existing tags from [`tags.json`](./tags.json). To add a new tag, edit
that file in the same PR as the post that introduces it. Tags are
lowercase, hyphen-separated, single-word where possible.

## Authors

If you're a new author, add a JSON file under `authors/` matching
`schema/author.ts`. Use a stable handle (your GitHub username).

## Review

Posts go through the same review bar as the codebase:

- At least one reviewer outside the author.
- CI green (validation + link check).
- No unresolved review comments.
- Squash-merge with a message that's a useful commit log entry.

## Embargo policy

Posts about security incidents follow the same 90-day embargo as the
[`SECURITY.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/SECURITY.md)
disclosure policy. Draft with `status: "draft"`; flip to `published`
after the embargo lifts.
