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

export const pcDataSchema = z.object({
  pcDataList: z
    .array(
      z.object({
        id: z.number().int().positive(),
        className: trimmedText,
        raceName: trimmedText,
      }),
    )
    .min(1),
});

export const characterSearchSchema = z.object({
  list: z.array(
    z.object({
      characterId: z.string().min(1).max(200),
      level: z.number().int().nonnegative(),
      pcId: z.number().int().positive(),
      serverId: z.number().int().positive(),
    }),
  ),
});

export type CharacterSearchResult = z.infer<typeof characterSearchSchema>["list"][number];

export const UPSTREAM_SKILL_LEVEL = { min: 0, max: 99 } as const;

export const characterEquipmentSchema = z.object({
  equipment: z.object({
    equipmentList: z.array(
      z.object({
        slotPos: z.number().int().positive().max(100),
        slotPosName: trimmedText,
      }),
    ),
  }),
  skill: z.object({
    skillList: z.array(
      z.object({
        id: z.number().int().positive(),
        name: trimmedText,
        category: z.enum(["Active", "Passive", "Dp"]),
        skillLevel: z.number().int().min(UPSTREAM_SKILL_LEVEL.min).max(UPSTREAM_SKILL_LEVEL.max),
        needLevel: z.number().int().nonnegative().max(100),
        acquired: z.union([z.literal(0), z.literal(1)]),
        icon: iconPath,
      }),
    ),
  }),
});

export type CharacterEquipment = z.infer<typeof characterEquipmentSchema>;
