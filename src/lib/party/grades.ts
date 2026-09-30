const GRADE_COLORS: Record<string, string> = {
  Common: "oklch(0.80 0.01 250)",
  Rare: "oklch(0.76 0.12 150)",
  Legend: "oklch(0.74 0.12 245)",
  Unique: "oklch(0.82 0.12 88)",
  Epic: "oklch(0.72 0.15 45)",
};

export const gradeColor = (gradeId: string): string | undefined => GRADE_COLORS[gradeId];
