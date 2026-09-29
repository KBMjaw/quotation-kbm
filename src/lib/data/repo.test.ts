import { beforeEach, describe, expect, it } from "vitest";
import { emptyCustomer } from "../defaults";
import type { QuotationInput } from "../types";
import { ValidationError } from "../validation";
import { LocalBackend, type KV } from "./local";
import { InUseError, Repo } from "./repo";

class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

let kv: MemKV;
let repo: Repo;
beforeEach(() => {
  kv = new MemKV();
  repo = new Repo(new LocalBackend(kv));
});

async function draft(companyName = "Kannan Blue Metals"): Promise<QuotationInput> {
  const [companies, materials, units] = await Promise.all([repo.listCompanies(), repo.listMaterials(), repo.listUnits()]);
  const c = companies.find((x) => x.company_name === companyName)!;
  const flyash = materials.find((m) => m.name === "Flyash")!;
  const psand = materials.find((m) => m.name === "P Sand Dry")!;
  const mt = units.find((u) => u.code === "MT")!;
  const m3 = units.find((u) => u.code === "M3")!;
  const base = { description: "", hsn_code: "", discount_pct: 0, gst_rate: 5, gst_overridden: false };
  return {
    company_id: c.id, company_snapshot: null, quotation_date: "2026-09-29", valid_until: null, reference: "", subject: "",
    customer: { ...emptyCustomer(), name: "ABC Constructions" },
    items: [
      { ...base, id: "", material_id: flyash.id, material_name: "Flyash", quantity: 20, unit_id: mt.id, unit_code: "MT", unit_name: mt.name, rate: 2500 },
      { ...base, id: "", material_id: psand.id, material_name: "P Sand Dry", quantity: 10, unit_id: m3.id, unit_code: "M3", unit_name: m3.name, rate: 1200 },
    ],
    tax_mode: "CGST_SGST", terms_conditions: "", notes: "", status: "draft",
  };
}

describe("seed data", () => {
  it("creates companies, units and materials once", async () => {
    expect((await repo.listCompanies()).map((c) => c.quotation_prefix)).toEqual(["KBM", "KRMC", "KIPIPL"]);
    expect((await repo.listUnits()).map((u) => u.code).sort()).toEqual(["M3", "MT", "PCS", "UNIT"]);
    expect((await repo.listMaterials()).map((m) => m.name)).toEqual(["Flyash", "P Sand Dry"]);
    // Reloading from storage must not duplicate anything.
    const again = new Repo(new LocalBackend(kv));
    expect(await again.listCompanies()).toHaveLength(3);
    expect(await again.listUnits()).toHaveLength(4);
  });
  it("stores the supplied GSTINs and leaves Kannan Ready Mix Concrete blank", async () => {
    const byName = Object.fromEntries((await repo.listCompanies()).map((c) => [c.company_name, c.gstin]));
    expect(byName["Kannan Blue Metals"]).toBe("33ACCPC2634C1ZI");
    expect(byName["Kannan Infra Projects India Private Limited"]).toBe("33AAJCK1677M1Z4");
    expect(byName["Kannan Ready Mix Concrete"]).toBe("");
  });
  it("seeds GST rates on materials", async () => {
    expect((await repo.listMaterials()).map((m) => [m.name, m.gst_rate, m.tax_type])).toEqual([
      ["Flyash", 5, "GST"],
      ["P Sand Dry", 5, "GST"],
    ]);
  });
  it("gives materials their default units", async () => {
    const units = await repo.listUnits();
    const code = (id: string | null) => units.find((u) => u.id === id)?.code;
    const [flyash, psand] = await repo.listMaterials();
    expect(code(flyash.default_unit_id)).toBe("MT");
    expect(code(psand.default_unit_id)).toBe("M3");
  });
});

describe("quotations", () => {
  it("numbers per company and computes totals", async () => {
    const a = await repo.saveQuotation(await draft());
    const b = await repo.saveQuotation(await draft());
    const c = await repo.saveQuotation(await draft("Kannan Ready Mix Concrete"));
    expect([a.quotation_no, b.quotation_no, c.quotation_no]).toEqual(["KBM-QTN-0001", "KBM-QTN-0002", "KRMC-QTN-0001"]);
    // Flyash and P Sand Dry are configured at 5%: 62,000 + 3,100
    expect(a.totals.grand_total).toBe(65100);
    expect(a.company_snapshot?.company_name).toBe("Kannan Blue Metals");
  });

  it("keeps its number on edit, renumbers when moved to another company", async () => {
    const a = await repo.saveQuotation(await draft());
    const edited = await repo.saveQuotation({ ...a, customer: { ...a.customer, name: "XYZ" } });
    expect(edited.quotation_no).toBe("KBM-QTN-0001");
    const moved = await repo.saveQuotation({ ...edited, company_id: (await repo.listCompanies())[2].id });
    expect(moved.quotation_no).toBe("KIPIPL-QTN-0001");
  });

  it("validates required fields and positive quantities", async () => {
    const d = await draft();
    d.customer.name = "";
    d.items[0].quantity = 0;
    await expect(repo.saveQuotation(d)).rejects.toMatchObject({ errors: { "customer.name": expect.any(String), "items.0.quantity": expect.any(String) } });
  });

  it("blocks inactive materials on new quotations but keeps old ones editable", async () => {
    const saved = await repo.saveQuotation(await draft());
    const flyash = (await repo.listMaterials()).find((m) => m.name === "Flyash")!;
    await repo.saveMaterial({ ...flyash, is_active: false });
    await expect(repo.saveQuotation(await draft())).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.saveQuotation({ ...saved, notes: "still fine" })).resolves.toMatchObject({ notes: "still fine" });
  });
});

describe("master data rules", () => {
  it("prevents duplicate names and codes", async () => {
    await expect(repo.saveCompany({ ...(await repo.listCompanies())[0], id: undefined, company_name: "kannan blue metals" })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.saveUnit({ name: "Tonne", code: "mt", is_active: true })).rejects.toMatchObject({ errors: { code: expect.any(String) } });
    await expect(repo.saveMaterial({ name: "FLYASH", code: "", description: "", hsn_code: "", default_unit_id: null, unit_ids: [], default_rate: null, gst_rate: 5, tax_type: "GST", is_active: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it("adds a new unit and material that includes it", async () => {
    const bag = await repo.saveUnit({ name: "Bag", code: "bag", is_active: true });
    expect(bag.code).toBe("BAG");
    const cement = await repo.saveMaterial({ name: "Cement", code: "", description: "", hsn_code: "2523", default_unit_id: bag.id, unit_ids: [], default_rate: 380, gst_rate: 18, tax_type: "GST", is_active: true });
    expect(cement.default_unit_id).toBe(bag.id);
    await expect(repo.deleteUnit(bag.id)).rejects.toBeInstanceOf(InUseError);
  });

  it("refuses to delete units, materials and companies used by quotations", async () => {
    const q = await repo.saveQuotation(await draft());
    await expect(repo.deleteCompany(q.company_id)).rejects.toBeInstanceOf(InUseError);
    await expect(repo.deleteMaterial(q.items[0].material_id!)).rejects.toBeInstanceOf(InUseError);
    const pcs = (await repo.listUnits()).find((u) => u.code === "PCS")!;
    await repo.deleteUnit(pcs.id);
    expect((await repo.listUnits()).some((u) => u.code === "PCS")).toBe(false);
  });
});

describe("upgrading data saved before GST", () => {
  it("adds GST rates to materials and GSTINs to blank seeded companies without overwriting", async () => {
    const old = new MemKV();
    const legacy = new Repo(new LocalBackend(old));
    await legacy.listCompanies(); // creates the stored data
    const raw = JSON.parse(old.getItem("kipipl-quotation-maker:v1")!);
    for (const m of raw.materials) { delete m.gst_rate; delete m.tax_type; m.default_unit_id = null; }
    raw.companies[0].gstin = ""; // blank → filled
    raw.companies[2].gstin = "33ABCDE1234F1Z5"; // admin-entered → kept
    old.setItem("kipipl-quotation-maker:v1", JSON.stringify(raw));
    const upgraded = new Repo(new LocalBackend(old));
    expect((await upgraded.listMaterials()).every((m) => m.gst_rate === 5 && m.tax_type === "GST")).toBe(true);
    const units = await upgraded.listUnits();
    const defaults = (await upgraded.listMaterials()).map((m) => [m.name, units.find((u) => u.id === m.default_unit_id)?.code]);
    expect(defaults).toEqual([["Flyash", "MT"], ["P Sand Dry", "M3"]]);
    const after = await upgraded.listCompanies();
    expect(after[0].gstin).toBe("33ACCPC2634C1ZI");
    expect(after[2].gstin).toBe("33ABCDE1234F1Z5");
  });
});

describe("product-level GST on quotations", () => {
  async function cementAndSand() {
    const units = await repo.listUnits();
    const pcs = units.find((u) => u.code === "PCS")!;
    const m3 = units.find((u) => u.code === "M3")!;
    const cement = await repo.saveMaterial({ name: "Cement", code: "", description: "", hsn_code: "2523", default_unit_id: pcs.id, unit_ids: [], default_rate: null, gst_rate: 18, tax_type: "GST", is_active: true });
    const sand = (await repo.listMaterials()).find((m) => m.name === "P Sand Dry")!;
    const d = await draft();
    const base = { description: "", hsn_code: "", discount_pct: 0, gst_overridden: false };
    d.items = [
      { ...base, id: "", material_id: cement.id, material_name: "Cement", quantity: 10, unit_id: pcs.id, unit_code: "PCS", unit_name: "Piece", rate: 500, gst_rate: 0 },
      { ...base, id: "", material_id: sand.id, material_name: "P Sand Dry", quantity: 10, unit_id: m3.id, unit_code: "M3", unit_name: "Cubic Meter", rate: 1200, gst_rate: 0 },
    ];
    return { d, cement, sand };
  }

  it("takes each line's GST from the material configuration (acceptance: 17,000 + 1,500 = 18,500)", async () => {
    const { d } = await cementAndSand();
    const q = await repo.saveQuotation(d); // form sent 0%, configuration wins
    expect(q.items.map((i) => i.gst_rate)).toEqual([18, 5]);
    expect(q.totals).toMatchObject({ taxable_total: 17000, tax_total: 1500, grand_total: 18500 });
    expect(q.totals.gst_summary.map((r) => [r.rate, r.taxable, r.tax])).toEqual([[5, 12000, 600], [18, 5000, 900]]);
  });

  it("keeps the GST saved on old quotations after the material rate changes", async () => {
    const { d, cement } = await cementAndSand();
    const q = await repo.saveQuotation(d);
    await repo.saveMaterial({ ...cement, gst_rate: 28 });
    const reopened = (await repo.getQuotation(q.id))!;
    expect(reopened.items[0].gst_rate).toBe(18);
    const resaved = await repo.saveQuotation({ ...reopened, notes: "edited" });
    expect(resaved.items[0].gst_rate).toBe(18);
    // Explicitly applying the new rate is allowed
    const updated = await repo.saveQuotation({ ...resaved, items: resaved.items.map((i, n) => (n === 0 ? { ...i, gst_rate: 28 } : i)) });
    expect(updated.items[0].gst_rate).toBe(28);
    // A new quotation uses the new rate
    const fresh = await repo.saveQuotation((await cementAndSandAgain()).d);
    expect(fresh.items[0].gst_rate).toBe(28);
  });

  it("allows GST overrides only for authorised users", async () => {
    const { d } = await cementAndSand();
    d.items[0] = { ...d.items[0], gst_rate: 12, gst_overridden: true };
    await expect(repo.saveQuotation(d)).rejects.toMatchObject({ errors: { "items.0.gst": expect.any(String) } });
    const q = await repo.saveQuotation(d, { canOverrideGst: true });
    expect(q.items[0]).toMatchObject({ gst_rate: 12, gst_overridden: true });
    // A normal user can still edit other fields of that quotation…
    await expect(repo.saveQuotation({ ...q, notes: "ok" })).resolves.toMatchObject({ notes: "ok" });
    // …but cannot change the overridden rate.
    await expect(repo.saveQuotation({ ...q, items: q.items.map((i, n) => (n === 0 ? { ...i, gst_rate: 0 } : i)) })).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires every active material to have a default unit", async () => {
    const base = { code: "", description: "", hsn_code: "", unit_ids: [], default_rate: null, gst_rate: 5, tax_type: "GST" as const };
    await expect(repo.saveMaterial({ ...base, name: "Blue Metal", default_unit_id: null, is_active: true })).rejects.toMatchObject({
      errors: { default_unit_id: expect.any(String) },
    });
    // Inactive drafts may be saved without one
    await expect(repo.saveMaterial({ ...base, name: "Blue Metal", default_unit_id: null, is_active: false })).resolves.toBeTruthy();
    // Picking available units without a default uses the first one
    const mt = (await repo.listUnits()).find((u) => u.code === "MT")!;
    const rmc = await repo.saveMaterial({ ...base, name: "RMC", default_unit_id: null, unit_ids: [mt.id], is_active: true });
    expect(rmc.default_unit_id).toBe(mt.id);
  });

  it("validates the material GST rate", async () => {
    const f = (await repo.listMaterials())[0];
    await expect(repo.saveMaterial({ ...f, gst_rate: 150 })).rejects.toMatchObject({ errors: { gst_rate: expect.any(String) } });
    const exempt = await repo.saveMaterial({ ...f, tax_type: "EXEMPT", gst_rate: 18 });
    expect(exempt.gst_rate).toBe(0);
  });

  async function cementAndSandAgain() {
    const cement = (await repo.listMaterials()).find((m) => m.name === "Cement")!;
    const d = await draft();
    d.items = [{ ...d.items[0], id: "", material_id: cement.id, material_name: "Cement", gst_rate: 18 }];
    return { d };
  }
});
