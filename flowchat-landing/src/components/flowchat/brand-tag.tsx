const BRAND_COLORS: Record<string, string> = {
  typeform: "#262627",
  sheets: "#0F9D58",
  slack: "#4A154B",
  calendly: "#006BFF",
  stripe: "#635BFF",
  airtable: "#2D7FF9",
  gmail: "#EA4335",
};

const BRAND_LABELS: Record<string, string> = {
  typeform: "Tf",
  sheets: "Sh",
  slack: "Sl",
  calendly: "Ca",
  stripe: "St",
  airtable: "At",
  gmail: "Gm",
};

export function BrandIcon({
  brand,
  size = 24,
}: {
  brand: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        backgroundColor: BRAND_COLORS[brand] ?? "#888",
        borderRadius: size * 0.25,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {BRAND_LABELS[brand] ?? brand[0].toUpperCase()}
    </span>
  );
}
