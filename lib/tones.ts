export const tones = [
  { label: "Natural", value: "" },
  {
    label: "Casual",
    value: "Use a casual, conversational tone with simple everyday language.",
  },
  {
    label: "Professional",
    value: "Use a professional, serious and clear tone without slang.",
  },
  {
    label: "Bold",
    value:
      "Use a bold, direct and confident tone without exaggerating factual claims.",
  },
  { label: "Friendly", value: "Use a warm, friendly and approachable tone." },
];

export function toneLabel(angle: string) {
  return tones.find((t) => t.value === angle)?.label || "Custom";
}
