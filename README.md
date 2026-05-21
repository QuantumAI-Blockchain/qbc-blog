# qbc-blog

The content repository for **qbc.network/blog** — engineering notes, release
reports, and protocol-level writing about the QuantumAI Blockchain.

Posts are **Markdown with YAML front matter**. The
[`QuantumAI-Blockchain/qubitcoin-frontend`](https://github.com/QuantumAI-Blockchain/qubitcoin-frontend)
repository consumes this repo at build time and renders the posts at
[qbc.network/blog](https://qbc.network/blog).

---

## Why a separate repo

- **Content lifecycle ≠ code lifecycle.** Posts ship daily; the frontend ships
  weekly. They should not block each other.
- **Anyone can contribute** via PR without touching frontend code, deploy
  pipelines, or the JS/TS toolchain.
- **Validation is independent.** This repo has its own CI that checks
  frontmatter, image paths, and slug uniqueness — green before the frontend
  pulls anything.
- **Provenance is on-chain-grade.** Every post's commit hash is recorded
  alongside the rendered article on qbc.network. Mutations are auditable in
  the git log.

---

## Anatomy

```
qbc-blog/
├── README.md              ← this file
├── CONTRIBUTING.md        ← how to add a post (read this first)
├── package.json           ← validator + RSS-gen tooling (TypeScript)
├── tsconfig.json
├── schema/
│   ├── post.ts            ← strict frontmatter schema
│   └── author.ts
├── authors/
│   └── *.json             ← one file per author
├── tags.json              ← canonical tag list (any tag in a post must be here)
├── posts/
│   └── YYYY-MM-DD-slug.md ← naming convention (date prefix, kebab-case)
├── scripts/
│   ├── validate.ts        ← runs all checks
│   └── build-index.ts     ← emits posts.index.json for frontend consumers
└── .github/workflows/
    └── validate.yml       ← runs on every PR + push to main
```

---

## Front-matter schema

Every post starts with a YAML block that **must** match `schema/post.ts`:

```yaml
---
title: "Permissionless launch: runtime upgrade landed"
slug: "permissionless-launch-runtime-upgrade"   # url path under /blog/<slug>
date: "2026-05-21"                              # ISO 8601 (date or datetime)
author: "blockartica"                           # must match an `authors/*.json` file
excerpt: >
  Substrate runtime v120 landed in one block on chain 3303. Four new
  permissionless pallets are now queryable on the live mainnet.
tags: ["engineering", "consensus", "phase-3"]   # must all be in `tags.json`
cover_image: "/blog/img/permissionless-launch-cover.png"   # public/blog/img/...
canonical: "https://qbc.network/blog/permissionless-launch-runtime-upgrade"
status: "published"                             # "draft" | "published" | "archived"
---
```

Required: `title`, `slug`, `date`, `author`, `excerpt`, `tags`, `status`.
Optional: `cover_image`, `canonical`, `series`, `read_time_min` (auto-computed if absent).

Drafts (`status: "draft"`) are ignored by the build but kept in git for review.

---

## Local validation

```bash
pnpm install      # one-time
pnpm validate     # runs scripts/validate.ts; exits non-zero on any issue
pnpm build-index  # emits dist/posts.index.json
```

`pnpm validate` checks:

- Every `posts/*.md` parses as YAML + Markdown.
- Frontmatter conforms to `schema/post.ts`.
- `author` exists in `authors/`.
- All `tags` are in `tags.json`.
- `slug` is unique across the repo + matches the filename convention.
- Image paths starting with `/blog/img/` resolve under `public/blog/img/` in the frontend.
- Date is not in the future (unless `status: "draft"`).
- Excerpt is 50–280 characters.

---

## Contributing a post

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

TL;DR: branch → write `posts/YYYY-MM-DD-slug.md` → `pnpm validate` →
open PR. Validation runs on PR; merge to `main` triggers a frontend
rebuild via the consumer repo's `sync-blog` workflow.

---

## License

All blog content is dual-licensed:

- **Code blocks**: MIT (matches the rest of the project).
- **Prose, diagrams, images**: CC BY 4.0 unless a post explicitly overrides.
