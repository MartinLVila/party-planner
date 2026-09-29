import { z } from "zod";
import { iconPathFromUrl } from "../game-assets";

const trimmedText = z.string().trim().min(1).max(200);

const iconPath = z.string().transform((url, context) => {
  const path = iconPathFromUrl(url);
  if (path === null) {
    context.addIssue({ code: "custom", message: "icon is not a game CDN file" });
    return z.NEVER;
  }
  return path;
});

export const classListSchema = z.object({
  classList: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: trimmedText,
        text: trimmedText,
      }),
    )
    .min(1),
});

export const gradeListSchema = z
  .array(
    z.object({
      id: trimmedText,
      name: trimmedText,
    }),
  )
  .min(1);

export const categoryListSchema = z
  .array(
    z.object({
      id: trimmedText,
      name: trimmedText,
      child: z
        .array(
          z.object({
            id: trimmedText,
            name: trimmedText,
          }),
        )
        .default([]),
    }),
  )
  .min(1);

export const itemSchema = z.object({
  id: z.number().int().positive(),
  name: trimmedText,
  image: iconPath,
  grade: trimmedText,
  options: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
  description: z.string().max(4000).optional(),
  tradable: z.boolean(),
  categoryName: trimmedText,
});

export type UpstreamItem = z.infer<typeof itemSchema>;

export const itemPageSchema = z.object({
  contents: z.array(itemSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    size: z.number().int().positive(),
    lastPage: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  }),
});

export type ItemPage = z.infer<typeof itemPageSchema>;
