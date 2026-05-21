// Strict frontmatter schema for qbc-blog posts.
// Imported by scripts/validate.ts; the same shape is mirrored by the
// frontend's TypeScript types in frontend/src/lib/blog/types.ts.

import { z } from "zod";

export const PostStatusSchema = z.enum(["draft", "published", "archived"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const PostFrontmatterSchema = z.object({
    title: z.string().min(5).max(120),
    slug: z
        .string()
        .min(3)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/, "date must be ISO YYYY-MM-DD or full ISO 8601"),
    author: z.string().min(2).max(40),
    excerpt: z.string().min(50).max(280),
    tags: z.array(z.string().min(1).max(40)).min(1).max(8),
    cover_image: z.string().regex(/^\/blog\/img\/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|avif)$/i).optional(),
    canonical: z.string().url().optional(),
    series: z.string().max(80).optional(),
    read_time_min: z.number().int().positive().max(180).optional(),
    status: PostStatusSchema.default("draft"),
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;
