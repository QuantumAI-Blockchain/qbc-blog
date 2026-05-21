// Emit dist/posts.index.json — a flat list of published posts in
// newest-first order for the frontend's /blog index to consume.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { PostFrontmatterSchema } from "../schema/post.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const POSTS_DIR = join(ROOT, "posts");
const DIST_DIR = join(ROOT, "dist");

interface IndexEntry {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    author: string;
    tags: string[];
    cover_image?: string;
    series?: string;
    read_time_min: number;
    word_count: number;
}

function wordCount(s: string): number {
    return s.split(/\s+/).filter(Boolean).length;
}

function readTimeMin(words: number): number {
    return Math.max(1, Math.round(words / 220));
}

function main(): void {
    if (!existsSync(POSTS_DIR)) {
        console.log("[build-index] no posts/ directory");
        process.exit(0);
    }
    mkdirSync(DIST_DIR, { recursive: true });
    const out: IndexEntry[] = [];
    for (const f of readdirSync(POSTS_DIR).sort()) {
        if (!f.endsWith(".md") && !f.endsWith(".mdx")) continue;
        const raw = readFileSync(join(POSTS_DIR, f), "utf8");
        const parsed = matter(raw);
        const fm = PostFrontmatterSchema.parse(parsed.data);
        if (fm.status !== "published") continue;
        const wc = wordCount(parsed.content);
        out.push({
            slug: fm.slug,
            title: fm.title,
            excerpt: fm.excerpt,
            date: fm.date,
            author: fm.author,
            tags: fm.tags,
            cover_image: fm.cover_image,
            series: fm.series,
            read_time_min: fm.read_time_min ?? readTimeMin(wc),
            word_count: wc,
        });
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    const indexPath = join(DIST_DIR, "posts.index.json");
    writeFileSync(indexPath, JSON.stringify({ generated_at: new Date().toISOString(), posts: out }, null, 2));
    console.log(`[build-index] wrote ${indexPath} (${out.length} published posts)`);
}

main();
