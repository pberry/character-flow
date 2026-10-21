// The color swatches offered for boxes, lanes, tracker items, and badges.

export const COLORS = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Red", value: "#fecaca" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Purple", value: "#ddd6fe" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Teal", value: "#99f6e4" },
  { name: "Indigo", value: "#a5b4fc" },
  { name: "Gray", value: "#e5e7eb" },
  { name: "White", value: "#ffffff" },
];

// A stored color: a six-digit hex value.
export const isColor = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
