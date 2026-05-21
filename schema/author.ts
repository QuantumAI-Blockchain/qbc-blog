// Author profile schema.

import { z } from "zod";

export const AuthorSchema = z.object({
    handle: z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9_-]+$/, "handle must be lowercase alphanumeric with - or _"),
    name: z.string().min(2).max(80),
    role: z.string().max(80).optional(),
    bio: z.string().min(20).max(280).optional(),
    avatar: z.string().regex(/^\/blog\/img\/authors\/[a-z0-9_-]+\.(png|jpg|jpeg|webp|avif)$/i).optional(),
    github: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
    x: z.string().regex(/^[A-Za-z0-9_]+$/).optional(),
    qbc_address: z.string().regex(/^[0-9a-f]{40}$/i).optional(),
});

export type Author = z.infer<typeof AuthorSchema>;
