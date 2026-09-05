export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

export function confidenceTone(confidence: number): "green" | "amber" | "red" {
  if (confidence >= 0.75) return "green";
  if (confidence >= 0.55) return "amber";
  return "red";
}
