// Validate every post under posts/ + author + tag references.
//
// Exit codes:
//   0   all green
//   1   schema or content failure (see stderr for details)
//   2   tooling / IO failure

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { PostFrontmatterSchema } from "../schema/post.ts";
import { AuthorSchema } from "../schema/author.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const AUTHORS_DIR = join(ROOT, "authors");
const TAGS_PATH = join(ROOT, "tags.json");

interface ValidationError {
    file: string;
    message: string;
}

function loadAuthors(): Map<string, z.infer<typeof AuthorSchema>> {
    const map = new Map<string, z.infer<typeof AuthorSchema>>();
    if (!existsSync(AUTHORS_DIR)) return map;
    for (const f of readdirSync(AUTHORS_DIR)) {
        if (!f.endsWith(".json")) continue;
        const raw = JSON.parse(readFileSync(join(AUTHORS_DIR, f), "utf8"));
        const parsed = AuthorSchema.safeParse(raw);
        if (!parsed.success) {
            console.error(`[validate] authors/${f}: ${parsed.error.message}`);
            process.exit(1);
        }
        if (parsed.data.handle !== f.replace(/\.json$/, "")) {
            console.error(`[validate] authors/${f}: handle "${parsed.data.handle}" must match filename`);
            process.exit(1);
        }
        map.set(parsed.data.handle, parsed.data);
    }
    return map;
}

function loadTags(): Set<string> {
    if (!existsSync(TAGS_PATH)) {
        console.error(`[validate] missing tags.json`);
        process.exit(2);
    }
    const raw = JSON.parse(readFileSync(TAGS_PATH, "utf8"));
    return new Set(Object.keys(raw.tags ?? {}));
}

function main(): void {
    if (!existsSync(POSTS_DIR)) {
        console.log("[validate] no posts/ directory; skipping");
        process.exit(0);
    }

    const authors = loadAuthors();
    const tags = loadTags();
    const errors: ValidationError[] = [];
    const seenSlugs = new Set<string>();
    let publishedCount = 0;

    for (const f of readdirSync(POSTS_DIR).sort()) {
        if (!f.endsWith(".md") && !f.endsWith(".mdx")) continue;
        const file = `posts/${f}`;
        const filePath = join(POSTS_DIR, f);
        const stats = statSync(filePath);
        if (stats.size === 0) {
            errors.push({ file, message: "empty file" });
            continue;
        }
        const raw = readFileSync(filePath, "utf8");
        const parsed = matter(raw);
        const fmResult = PostFrontmatterSchema.safeParse(parsed.data);
        if (!fmResult.success) {
            errors.push({
                file,
                message: `frontmatter: ${fmResult.error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ")}`,
            });
            continue;
        }
        const fm = fmResult.data;

        // filename must encode date prefix + slug
        const filenameMatch = f.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.mdx?$/);
        if (!filenameMatch) {
            errors.push({
                file,
                message: `filename must match YYYY-MM-DD-<slug>.md(x)`,
            });
            continue;
        }
        const [, fileDate, fileSlug] = filenameMatch as [string, string, string];
        if (!fm.date.startsWith(fileDate)) {
            errors.push({
                file,
                message: `frontmatter date (${fm.date}) does not match filename date (${fileDate})`,
            });
        }
        if (fileSlug !== fm.slug) {
            errors.push({
                file,
                message: `frontmatter slug (${fm.slug}) does not match filename slug (${fileSlug})`,
            });
        }

        if (seenSlugs.has(fm.slug)) {
            errors.push({ file, message: `duplicate slug "${fm.slug}"` });
        } else {
            seenSlugs.add(fm.slug);
        }

        if (!authors.has(fm.author)) {
            errors.push({
                file,
                message: `unknown author "${fm.author}"; add authors/${fm.author}.json or fix the post`,
            });
        }
        for (const t of fm.tags) {
            if (!tags.has(t)) {
                errors.push({ file, message: `unknown tag "${t}"; add to tags.json` });
            }
        }

        // date can't be in the future for published posts
        if (fm.status === "published") {
            const today = new Date();
            const postDate = new Date(fm.date);
            if (postDate.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
                errors.push({
                    file,
                    message: `published post date ${fm.date} is in the future`,
                });
            }
            publishedCount += 1;
        }

        if (parsed.content.trim().length < 200) {
            errors.push({
                file,
                message: `body is shorter than 200 characters; flesh it out before publishing`,
            });
        }
    }

    if (errors.length > 0) {
        console.error(`[validate] ${errors.length} error(s):`);
        for (const e of errors) {
            console.error(`  ${e.file}: ${e.message}`);
        }
        process.exit(1);
    }
    console.log(`[validate] OK — ${seenSlugs.size} post(s), ${publishedCount} published`);
}

main();
