import "server-only";
import { sb } from "./supabase";
import { createCompany } from "./company";
import { addDays, fyOf, todayISO } from "./format";

export const DEMO_PHONE = "+910000000000";

/** Creates (once) a demo company full of realistic interior-design data. Returns the owner user. */
export async function ensureDemo() {
  const db = sb();
  const { data: existing } = await db.from("companies").select("id").eq("is_demo", true).limit(1).maybeSingle();
  if (existing) {
    const { data: u } = await db.from("app_users").select("*").eq("company_id", existing.id).eq("role", "owner").limit(1).single();
    return u;
  }
  const { company, user } = await createCompany({
    name: "Demo Interiors", legal_name: "Demo Interiors Pvt Ltd", brand_color: "#b45309",
    address: "Plot 21, Sector 44", city: "Gurugram", state: "Haryana", state_code: "06", pincode: "122003",
    phone: "+919999999999", email: "accounts@demo-interiors.in", gstin: "06ABCDE1234F1Z5", pan: "ABCDE1234F",
    bank_name: "HDFC Bank", bank_account_no: "50200012345678", bank_ifsc: "HDFC0001234", upi_id: "demointeriors@hdfcbank",
  }, { phone: DEMO_PHONE, name: "Demo Owner" }, { is_demo: true });
  const cid = company.id;

  const { data: cats } = await db.from("categories").select("id,name").eq("company_id", cid);
  const C = (name: string) => cats!.find((c) => c.name === name)!.id;
  const { data: accs } = await db.from("accounts").select("id,type").eq("company_id", cid);
  const cash = accs!.find((a) => a.type === "cash")!.id;
  const bank = accs!.find((a) => a.type === "bank")!.id;
  await db.from("accounts").update({ opening_balance: 220000 }).eq("id", cash);
  await db.from("accounts").update({ opening_balance: 350000 }).eq("id", bank);

  const mk = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ company_id: cid, name, type, ...extra });
  const { data: parties } = await db.from("parties").insert([
    mk("Rohit Sharma", "client", { phone: "9810000001", address: "Sector 56, Gurugram" }),
    mk("Neha Gupta", "client", { phone: "9810000002", address: "DLF Phase 3" }),
    mk("Arjun Mehta", "client", { phone: "9810000003", address: "Golf Course Road", gstin: "06AAACM1234K1Z2" }),
    mk("Kapoor Family", "client", { phone: "9810000004", address: "South City 1" }),
    mk("Shree Balaji Plywood", "vendor", { phone: "9811000001", gstin: "06BBBPL5678Q1Z9" }),
    mk("Jindal Hardware", "vendor", { phone: "9811000002" }),
    mk("Asian Paints Dealer – Sohna Rd", "vendor", { phone: "9811000003" }),
    mk("Kajaria Tiles Gallery", "vendor", { phone: "9811000004" }),
    mk("Ramesh (Carpenter)", "labour", { trade: "carpenter", phone: "9812000001" }),
    mk("Sunil (Painter)", "labour", { trade: "painter", phone: "9812000002" }),
    mk("Vikas (Electrician)", "labour", { trade: "electrician", phone: "9812000003" }),
    mk("Mohan POP Works", "labour", { trade: "pop", phone: "9812000004" }),
  ]).select("id,name");
  const P = (name: string) => parties!.find((p) => p.name === name)!.id;

  const t = todayISO();
  const d = (back: number) => addDays(t, -back);
  const { data: projects } = await db.from("projects").insert([
    { company_id: cid, name: "Sharma – Sector 56 3BHK", client_id: P("Rohit Sharma"), site_address: "Tower B-1203, Sector 56", quoted_value: 1450000, start_date: d(150), status: "active",
      budget: { [C("Plywood / MDF")]: 260000, [C("Carpenter")]: 180000, [C("Paint")]: 60000, [C("Hardware & fittings")]: 90000 } },
    { company_id: cid, name: "Gupta – DLF Ph3 Kitchen & Wardrobes", client_id: P("Neha Gupta"), site_address: "U-14, DLF Phase 3", quoted_value: 680000, start_date: d(100), status: "active",
      budget: { [C("Modular kitchen")]: 220000, [C("Carpenter")]: 70000 } },
    { company_id: cid, name: "Mehta – Golf Course Rd Office", client_id: P("Arjun Mehta"), site_address: "9th floor, Golf Course Rd", quoted_value: 2200000, start_date: d(60), status: "active",
      budget: { [C("False ceiling / POP material")]: 150000, [C("Electrical & lighting")]: 260000 } },
    { company_id: cid, name: "Kapoor – South City Villa Painting", client_id: P("Kapoor Family"), site_address: "S-45, South City 1", quoted_value: 240000, start_date: d(175), end_date: d(120), status: "completed",
      budget: { [C("Paint")]: 70000, [C("Painter")]: 60000 } },
  ]).select("id,name");
  const J = (prefix: string) => projects!.find((p) => p.name.startsWith(prefix))!.id;
  const sharma = J("Sharma"), gupta = J("Gupta"), mehta = J("Mehta"), kapoor = J("Kapoor");

  await db.from("project_stages").insert([
    { company_id: cid, project_id: sharma, name: "Booking advance (20%)", amount: 290000, due_date: d(150), status: "paid", sort: 1 },
    { company_id: cid, project_id: sharma, name: "Carcass complete (40%)", amount: 580000, due_date: d(70), status: "invoiced", sort: 2 },
    { company_id: cid, project_id: sharma, name: "Shutters & finishing (30%)", amount: 435000, due_date: d(10), status: "pending", sort: 3 },
    { company_id: cid, project_id: sharma, name: "Handover (10%)", amount: 145000, due_date: addDays(t, 30), status: "pending", sort: 4 },
    { company_id: cid, project_id: sharma, name: "Extra: study table + TV unit", amount: 85000, due_date: d(20), status: "pending", sort: 5, is_extra: true },
    { company_id: cid, project_id: gupta, name: "Booking advance (30%)", amount: 204000, due_date: d(100), status: "paid", sort: 1 },
    { company_id: cid, project_id: gupta, name: "Material delivery (40%)", amount: 272000, due_date: d(45), status: "invoiced", sort: 2 },
    { company_id: cid, project_id: gupta, name: "Installation (30%)", amount: 204000, due_date: addDays(t, 15), status: "pending", sort: 3 },
    { company_id: cid, project_id: mehta, name: "Booking advance (25%)", amount: 550000, due_date: d(60), status: "paid", sort: 1 },
    { company_id: cid, project_id: mehta, name: "Civil & ceiling (35%)", amount: 770000, due_date: d(5), status: "invoiced", sort: 2 },
    { company_id: cid, project_id: kapoor, name: "Full payment", amount: 240000, due_date: d(120), status: "paid", sort: 1 },
  ]);

  type Row = [number, number, "in" | "out", string, string | null, string | null, string, string?, Record<string, unknown>?];
  // [daysAgo, amount, dir, category, party, project, mode, notes, extra]
  const rows: Row[] = [
    [150, 290000, "in", "Booking advance", "Rohit Sharma", sharma, "bank", "NEFT booking advance"],
    [148, 120000, "out", "Plywood / MDF", "Shree Balaji Plywood", sharma, "bank", "18mm BWP ply 60 sheets", { gst_amount: 18305, gst_rate: 18, bill_no: "SBP/2231" }],
    [145, 20000, "out", "Carpenter", "Ramesh (Carpenter)", sharma, "cash", "Advance to Ramesh"],
    [140, 3500, "out", "Transport / loading", null, sharma, "cash", "Tempo for ply"],
    [130, 35000, "out", "Carpenter", "Ramesh (Carpenter)", sharma, "upi", "Weekly payment"],
    [125, 42000, "out", "Hardware & fittings", "Jindal Hardware", sharma, "upi", "Hettich channels & hinges", { gst_amount: 6407, gst_rate: 18 }],
    [175, 120000, "in", "Booking advance", "Kapoor Family", kapoor, "bank", "Advance"],
    [170, 38000, "out", "Paint", "Asian Paints Dealer – Sohna Rd", kapoor, "upi", "Royale emulsion", { gst_amount: 5797, gst_rate: 18 }],
    [165, 25000, "out", "Painter", "Sunil (Painter)", kapoor, "cash", "Painter advance"],
    [140, 30000, "out", "Painter", "Sunil (Painter)", kapoor, "cash", "Painter final"],
    [122, 120000, "in", "Final payment", "Kapoor Family", kapoor, "bank", "Final payment"],
    [100, 204000, "in", "Booking advance", "Neha Gupta", gupta, "upi", "Advance via UPI"],
    [95, 160000, "out", "Modular kitchen", null, gupta, "bank", "Kitchen carcass + shutters (Hafele)", { gst_amount: 24407, gst_rate: 18 }],
    [90, 15000, "out", "Carpenter", "Ramesh (Carpenter)", gupta, "cash", "Ramesh advance – Gupta site"],
    [75, 290000, "in", "Milestone payment", "Rohit Sharma", sharma, "bank", "Part payment stage 2"],
    [72, 85000, "out", "Plywood / MDF", "Shree Balaji Plywood", sharma, "bank", "Ply + laminates", { gst_amount: 12966, gst_rate: 18, settles_bill: true }],
    [70, 40000, "out", "Carpenter", "Ramesh (Carpenter)", sharma, "cash", "Ramesh weekly"],
    [60, 550000, "in", "Booking advance", "Arjun Mehta", mehta, "bank", "RTGS advance"],
    [58, 95000, "out", "False ceiling / POP material", null, mehta, "bank", "Gyproc boards & channels", { gst_amount: 14491, gst_rate: 18 }],
    [55, 30000, "out", "POP / false-ceiling labour", "Mohan POP Works", mehta, "cash", "POP labour advance"],
    [50, 140000, "out", "Electrical & lighting", null, mehta, "bank", "Havells wires, Philips panels", { gst_amount: 21356, gst_rate: 18 }],
    [48, 25000, "out", "Electrician", "Vikas (Electrician)", mehta, "upi", "Electrician payment"],
    [45, 136000, "in", "Milestone payment", "Neha Gupta", gupta, "upi", "Half of delivery stage"],
    [40, 45000, "out", "Carpenter", "Ramesh (Carpenter)", sharma, "upi", "Ramesh payment"],
    [35, 60000, "out", "Tiles / stone", "Kajaria Tiles Gallery", mehta, "bank", "Vitrified tiles", { gst_amount: 9153, gst_rate: 18 }],
    [30, 30000, "out", "Carpenter", "Ramesh (Carpenter)", gupta, "cash", "Installation labour"],
    [25, 1800, "out", "Tea & food", null, sharma, "cash", "Site tea for a week"],
    [22, 28000, "out", "POP / false-ceiling labour", "Mohan POP Works", mehta, "cash", "POP labour"],
    [20, 50000, "out", "Plywood / MDF", "Shree Balaji Plywood", sharma, "bank", "Extra ply for TV unit", { settles_bill: true }],
    [15, 35000, "out", "Carpenter", "Ramesh (Carpenter)", sharma, "cash", "Ramesh weekly"],
    [12, 2500, "out", "Debris removal", null, mehta, "cash", "Malba removal"],
    [8, 22000, "out", "Electrician", "Vikas (Electrician)", mehta, "cash", "Electrician"],
    [5, 300000, "in", "Milestone payment", "Arjun Mehta", mehta, "bank", "Part of stage 2"],
    [3, 4200, "out", "Tools / consumables", null, sharma, "cash", "Fevicol, screws, blades"],
  ];
  // Overheads every month
  for (let m = 0; m < 6; m++) {
    const back = m * 30 + 2;
    rows.push([back, 45000, "out", "Rent", null, null, "bank", "Office rent"]);
    rows.push([back, 55000, "out", "Salaries", null, null, "bank", "Staff salaries"]);
    rows.push([back + 5, 6000, "out", "Fuel / vehicle", null, null, "cash", "Petrol"]);
    rows.push([back + 7, 2400, "out", "Utilities / electricity", null, null, "upi", "Office electricity"]);
    rows.push([back + 9, 1500, "out", "Phone / internet", null, null, "upi", "Airtel broadband"]);
    if (m % 2 === 0) rows.push([back + 11, 15000, "out", "Marketing", null, null, "card", "Instagram / Meta ads"]);
  }
  // Credit purchases (vendor bills) & labour work booked
  const bills = [
    { txn_date: d(80), amount: 135000, party: "Shree Balaji Plywood", project: sharma, cat: "Plywood / MDF", bill_no: "SBP/2390", due_date: d(50), gst_amount: 20593, gst_rate: 18 },
    { txn_date: d(18), amount: 68000, party: "Jindal Hardware", project: sharma, cat: "Hardware & fittings", bill_no: "JH-881", due_date: addDays(t, 5), gst_amount: 10373, gst_rate: 18 },
  ];
  const work = [
    { txn_date: d(60), amount: 150000, party: "Ramesh (Carpenter)", project: sharma, cat: "Carpenter", notes: "Carcass work done – Sharma" },
    { txn_date: d(30), amount: 70000, party: "Ramesh (Carpenter)", project: gupta, cat: "Carpenter", notes: "Kitchen installation – Gupta" },
    { txn_date: d(20), amount: 65000, party: "Mohan POP Works", project: mehta, cat: "POP / false-ceiling labour", notes: "Ceiling 1800 sq ft" },
  ];
  const txns = [
    ...rows.map(([back, amount, direction, cat, party, project, mode, notes, extra]) => ({
      company_id: cid, txn_date: d(back), amount, direction, entry_type: "money", mode,
      account_id: mode === "cash" ? cash : bank, category_id: C(cat), party_id: party ? P(party) : null, project_id: project,
      notes, source: "manual", status: "confirmed", created_by: user.id, ...(extra ?? {}),
    })),
    ...bills.map((b) => ({ company_id: cid, txn_date: b.txn_date, amount: b.amount, direction: "out", entry_type: "vendor_bill", category_id: C(b.cat), party_id: P(b.party), project_id: b.project, bill_no: b.bill_no, due_date: b.due_date, gst_amount: b.gst_amount, gst_rate: b.gst_rate, source: "manual", status: "confirmed", created_by: user.id })),
    ...work.map((w) => ({ company_id: cid, txn_date: w.txn_date, amount: w.amount, direction: "out", entry_type: "labour_work", category_id: C(w.cat), party_id: P(w.party), project_id: w.project, notes: w.notes, source: "manual", status: "confirmed", created_by: user.id })),
    // Pending review examples
    { company_id: cid, txn_date: d(6), amount: 8000, direction: "out", entry_type: "money", mode: "cash", account_id: cash, category_id: C("Electrician"), party_id: P("Vikas (Electrician)"), project_id: mehta, notes: "I think I paid the electrician around 8k last week", source: "voice", status: "needs_review", is_approximate: true, ai_confidence: 0.55, created_by: user.id },
    { company_id: cid, txn_date: d(2), amount: 3450, direction: "out", entry_type: "money", mode: "upi", account_id: bank, category_id: C("Hardware & fittings"), project_id: sharma, notes: "GPay screenshot – Jindal? unclear", source: "photo", status: "needs_review", ai_confidence: 0.62, created_by: user.id },
  ];
  // Cash withdrawal (transfer)
  const g = crypto.randomUUID();
  const tCat = cats!.find((c) => c.name === "Transfer between cash and bank")!.id;
  txns.push({ company_id: cid, txn_date: d(33), amount: 150000, direction: "out", entry_type: "money", mode: "bank", account_id: bank, category_id: tCat, notes: "ATM / cash withdrawal", source: "manual", status: "confirmed", created_by: user.id, transfer_group: g } as any);
  txns.push({ company_id: cid, txn_date: d(33), amount: 150000, direction: "in", entry_type: "money", mode: "cash", account_id: cash, category_id: tCat, notes: "ATM / cash withdrawal", source: "manual", status: "confirmed", created_by: user.id, transfer_group: g } as any);
  const { error } = await db.from("transactions").insert(txns);
  if (error) throw error;

  // One GST invoice for the Mehta stage-2
  const fy = fyOf(t, 4);
  const { data: no } = await db.rpc("next_doc_no", { p_company: cid, p_type: "invoice", p_fy: fy });
  const { data: st } = await db.from("project_stages").select("id").eq("project_id", mehta).eq("sort", 2).single();
  const sub = 652542.37, tax = 117457.63;
  await db.from("invoices").insert({
    company_id: cid, doc_type: "invoice", number: `INV/${fy}/${String(no).padStart(3, "0")}`, doc_date: d(5), due_date: addDays(t, 10),
    party_id: P("Arjun Mehta"), project_id: mehta, stage_id: st?.id, place_of_supply: "06",
    items: [{ description: "Civil, false ceiling & electrical works – Stage 2 (35%)", hsn_sac: "995432", qty: 1, unit: "job", rate: sub, gst_rate: 18 }],
    subtotal: sub, cgst: tax / 2, sgst: tax / 2, igst: 0, total: 770000, status: "sent", created_by: user.id,
  });
  return user;
}
