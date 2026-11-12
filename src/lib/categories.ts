// Seeded categories for interior design / home improvement companies.
// counts_in_pl=false → never counted as income or expense (drawings, capital, loans, assets, refunds, transfers)

type Seed = { name: string; group: string; kind: "income" | "expense" | "other"; pl?: boolean; transfer?: boolean };

export const GROUPS = ["Income", "Project materials", "Project labour", "Site expenses", "Overheads", "Other"] as const;

const S = (group: string, kind: Seed["kind"], names: string[], extra: Partial<Seed> = {}): Seed[] =>
  names.map((name) => ({ name, group, kind, ...extra }));

export const SEED_CATEGORIES: Seed[] = [
  ...S("Income", "income", ["Booking advance", "Design fee", "Milestone payment", "Final payment", "Extra / change-order work", "Other income"]),
  ...S("Project materials", "expense", [
    "Plywood / MDF", "Laminate / veneer", "Hardware & fittings", "Glass / mirror", "Paint", "Tiles / stone",
    "Electrical & lighting", "Plumbing & sanitary", "False ceiling / POP material", "Modular kitchen", "Furniture",
    "Fabrics / curtains / upholstery", "Wallpaper", "Decor",
  ]),
  ...S("Project labour", "expense", ["Carpenter", "Painter", "Electrician", "Plumber", "POP / false-ceiling labour", "Mason", "Helper / daily wages", "Subcontractor"]),
  ...S("Site expenses", "expense", ["Transport / loading", "Debris removal", "Tools / consumables", "Tea & food", "Site misc"]),
  ...S("Overheads", "expense", ["Rent", "Salaries", "Utilities / electricity", "Fuel / vehicle", "Phone / internet", "Marketing", "Software", "Professional / CA fees", "Bank charges", "Office supplies"]),
  ...S("Other", "other", ["Owner drawings", "Capital introduced", "Loans", "Asset purchase", "Refunds"], { pl: false }),
  { name: "Transfer between cash and bank", group: "Other", kind: "other", pl: false, transfer: true },
];

export function seedRows(companyId: string) {
  return SEED_CATEGORIES.map((c, i) => ({
    company_id: companyId,
    name: c.name,
    group_name: c.group,
    kind: c.kind,
    counts_in_pl: c.pl ?? true,
    is_transfer: c.transfer ?? false,
    sort: i,
  }));
}

/** Labour trade → category name */
export const TRADE_CATEGORY: Record<string, string> = {
  carpenter: "Carpenter",
  painter: "Painter",
  electrician: "Electrician",
  plumber: "Plumber",
  pop: "POP / false-ceiling labour",
  mason: "Mason",
  helper: "Helper / daily wages",
  subcontractor: "Subcontractor",
};
export const TRADES = Object.keys(TRADE_CATEGORY);
