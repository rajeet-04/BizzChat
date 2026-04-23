/**
 * Normalize unit strings to canonical forms.
 * Maps colloquial/regional/Hindi terms → standard inventory units.
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase();

  // Weight — English + Hindi + common misspellings
  if (["kilo", "kilogram", "kilograms", "kg", "kgs", "kilo gram", "kilo grams",
       "किलो", "किलोग्राम", "killo", "killos"].includes(u)) return "kg";
  if (["gram", "grams", "gm", "gms", "grm", "g",
       "ग्राम", "grms", "gr"].includes(u)) return "g";
  if (["500g", "500gm", "500 g", "500 gm", "half kg", "half kilo", "आधा किलो"].includes(u)) return "500g";
  if (["250g", "250gm", "250 g", "pav", "paav", "पाव"].includes(u)) return "250g";
  if (["quintal", "quintals", "100kg"].includes(u)) return "quintal";
  if (["tonne", "tons", "ton"].includes(u)) return "tonne";

  // Volume — English + Hindi
  if (["litre", "liter", "liters", "litres", "ltr", "ltrs", "lt", "l",
       "लीटर", "liter"].includes(u)) return "litre";
  if (["millilitre", "milliliter", "ml", "mls"].includes(u)) return "ml";

  // Count/piece
  if (["piece", "pieces", "pcs", "pc", "pce", "piece(s)",
       "नग", "nag", "piec"].includes(u)) return "piece";
  if (["dozen", "doz", "darjan", "darjan(s)", "12"].includes(u)) return "dozen";
  if (["packet", "packets", "pack", "packs", "pkt", "pkts", "pouch", "pouches",
       "पैकेट", "packet(s)", "sachet", "sachets"].includes(u)) return "packet";
  if (["bottle", "bottles", "btl", "btls", "बोतल"].includes(u)) return "bottle";
  if (["box", "boxes", "carton", "cartons", "डब्बा", "dabba"].includes(u)) return "box";
  if (["roll", "rolls"].includes(u)) return "roll";
  if (["bag", "bags", "bori", "boris", "बोरी", "bora", "theli", "थैली"].includes(u)) return "bag";
  if (["tin", "tins"].includes(u)) return "tin";
  if (["set", "sets"].includes(u)) return "set";
  if (["pair", "pairs", "jodi", "jodis", "जोड़ी"].includes(u)) return "pair";
  if (["metre", "meter", "meters", "metres", "mtr"].includes(u)) return "metre";

  // Return as-is (already normalized or unknown)
  return u;
}

/**
 * Normalize product names — lowercase and trim for deduplication.
 */
export function normalizeProductName(name: string | null | undefined): string {
  if (!name) return "Unknown";
  return name.trim().toLowerCase();
}
