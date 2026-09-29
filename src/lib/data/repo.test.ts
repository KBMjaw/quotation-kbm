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
  const base = { description: "", hsn_code: "", discount_pct: 0, gst_rate: 18 };
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
    expect(a.totals.grand_total).toBe(73160);
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
    await expect(repo.saveMaterial({ name: "FLYASH", code: "", description: "", hsn_code: "", default_unit_id: null, unit_ids: [], default_rate: null, is_active: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it("adds a new unit and material that includes it", async () => {
    const bag = await repo.saveUnit({ name: "Bag", code: "bag", is_active: true });
    expect(bag.code).toBe("BAG");
    const cement = await repo.saveMaterial({ name: "Cement", code: "", description: "", hsn_code: "2523", default_unit_id: bag.id, unit_ids: [], default_rate: 380, is_active: true });
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
