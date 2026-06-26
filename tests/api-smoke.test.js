const assert = require("assert");
const { spawn } = require("child_process");

const PORT = 4188;
const base = `http://localhost:${PORT}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    ADMIN_FALLBACK_PASSWORD: "glory12345"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.text();
  return { response, body };
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

(async () => {
  try {
    await wait(600);

    const health = await request("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.integrations.supabase, false);

    const badLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "john@alrassteel.com", password: "sales123" })
    });
    assert.equal(badLogin.response.status, 401);

    const adminLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "glory@alrassteel.com", password: "glory12345" })
    });
    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.body.user.role, "admin");

    const adminBootstrap = await request("/api/bootstrap", { headers: auth(adminLogin.body.token) });
    assert.equal(adminBootstrap.response.status, 200);
    assert.deepEqual(adminBootstrap.body.leads, []);
    assert.equal(adminBootstrap.body.users.length, 1);
    assert.equal(adminBootstrap.body.dashboard.kpis.activeSalesmen, 0);

    const blockedLead = await request("/api/leads", {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({ companyName: "Unauthorized Assignment LLC", sector: "Fabricator", tier: "1", stage: "PROSPECT" })
    });
    assert.equal(blockedLead.response.status, 400);

    const salesmanCreate = await request("/api/users", {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({
        name: "Rep One",
        username: "rep.one",
        email: "rep.one@alrassteel.com",
        password: "repone123",
        territory: "UAE-South"
      })
    });
    assert.equal(salesmanCreate.response.status, 201);
    assert.equal(salesmanCreate.body.user.role, "salesman");
    assert.equal(salesmanCreate.body.user.username, "rep.one");
    assert.equal("password" in salesmanCreate.body.user, false);

    const duplicateUser = await request("/api/users", {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({
        name: "Rep Duplicate",
        username: "rep.one",
        email: "rep.one@alrassteel.com",
        password: "repone123",
        territory: "UAE-South"
      })
    });
    assert.equal(duplicateUser.response.status, 409);

    const salesmanLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "rep.one", password: "repone123" })
    });
    assert.equal(salesmanLogin.response.status, 200);
    assert.equal(salesmanLogin.body.user.role, "salesman");

    const forbiddenUserCreate = await request("/api/users", {
      method: "POST",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({ name: "Bad Rep", username: "bad.rep", email: "bad.rep@alrassteel.com", password: "badrep123" })
    });
    assert.equal(forbiddenUserCreate.response.status, 403);

    const forbiddenExport = await request("/api/export/leads.xls", { headers: auth(salesmanLogin.body.token) });
    assert.equal(forbiddenExport.response.status, 403);
    const forbiddenPdfExport = await request("/api/export/leads.pdf", { headers: auth(salesmanLogin.body.token) });
    assert.equal(forbiddenPdfExport.response.status, 403);

    const created = await request("/api/leads", {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({
        companyName: "Adversarial Review Steel",
        ownerId: salesmanCreate.body.user.id,
        sector: "Fabricator",
        tier: "1",
        territory: "UAE-South",
        stage: "PROSPECT",
        estimatedValue: 12600,
        nextActionType: "To Call",
        scopeOfAction: "Share Quotation",
        productInterest: "Beams, MS Angles, Steel Plates",
        nextAction: "Call procurement"
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.lead.ownerId, salesmanCreate.body.user.id);
    assert.equal(created.body.lead.productInterest, "Beams, MS Angles, Steel Plates");

    const salesmanBootstrap = await request("/api/bootstrap", { headers: auth(salesmanLogin.body.token) });
    assert.equal(salesmanBootstrap.response.status, 200);
    assert.equal(salesmanBootstrap.body.users.length, 0);
    assert.equal(salesmanBootstrap.body.leads.length, 1);
    assert.ok(salesmanBootstrap.body.leads.every(lead => lead.ownerId === salesmanCreate.body.user.id));

    const salesmanCreatedLead = await request("/api/leads", {
      method: "POST",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({
        companyName: "Salesman Owned Steel",
        sector: "Contractor",
        tier: "2",
        territory: "UAE-South",
        stage: "PROSPECT",
        estimatedValue: 8500,
        nextActionDate: "2026-06-30",
        nextActionType: "Online Meeting",
        scopeOfAction: "Meeting for New Requirements",
        productInterest: "GI Coils, Steel Bars"
      })
    });
    assert.equal(salesmanCreatedLead.response.status, 201);
    assert.equal(salesmanCreatedLead.body.lead.ownerId, salesmanCreate.body.user.id);
    assert.equal(salesmanCreatedLead.body.lead.nextActionType, "Online Meeting");
    assert.equal(salesmanCreatedLead.body.lead.scopeOfAction, "Meeting for New Requirements");
    assert.equal(salesmanCreatedLead.body.lead.nextAction, "Online Meeting - Meeting for New Requirements");

    const adminAfterSalesmanLead = await request("/api/bootstrap", { headers: auth(adminLogin.body.token) });
    assert.equal(adminAfterSalesmanLead.response.status, 200);
    assert.equal(adminAfterSalesmanLead.body.leads.length, 2);
    assert.ok(adminAfterSalesmanLead.body.leads.some(lead => lead.id === salesmanCreatedLead.body.lead.id));
    assert.equal(adminAfterSalesmanLead.body.dashboard.kpis.newLeads, 2);

    const currentReport = await request("/api/weekly-reports/current", { headers: auth(salesmanLogin.body.token) });
    assert.equal(currentReport.response.status, 200);
    assert.equal(currentReport.body.report.rep, "Rep One");
    assert.ok(Array.isArray(currentReport.body.report.blockers));

    const blockedReportSubmit = await request("/api/weekly-reports/current/submit", {
      method: "POST",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({ summary: "Short", attestationConfirmed: false })
    });
    assert.equal(blockedReportSubmit.response.status, 409);

    const reportSubmit = await request("/api/weekly-reports/current/submit", {
      method: "POST",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({
        summary: "This week I confirmed active follow-up requirements and updated the steel opportunity pipeline.",
        demand: "Busier",
        pricing: "Some complaints",
        creditClimate: "Some stress",
        projects: "Contractors are asking for faster plate and beam availability.",
        confirmFlagDispositions: true,
        attestationConfirmed: true
      })
    });
    assert.equal(reportSubmit.response.status, 201);
    assert.equal(reportSubmit.body.report.state, "Submitted");
    assert.ok(reportSubmit.body.report.attestation.confirmed);

    const adminReports = await request("/api/weekly-reports/current", { headers: auth(adminLogin.body.token) });
    assert.equal(adminReports.response.status, 200);
    assert.ok(adminReports.body.submittedReports.some(report => report.id === reportSubmit.body.report.id));

    const reviewReport = await request(`/api/weekly-reports/${encodeURIComponent(reportSubmit.body.report.id)}/review`, {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({ decision: "accepted", note: "Accepted after review." })
    });
    assert.equal(reviewReport.response.status, 200);
    assert.equal(reviewReport.body.report.state, "Accepted");

    const contactUpdate = await request(`/api/leads/${salesmanCreatedLead.body.lead.id}`, {
      method: "PATCH",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({
        contacts: [
          { id: "default", name: "Primary Buyer", title: "Procurement", phone: "050 111 2222", email: "primary@example.com", isDefault: true },
          { id: "c2", name: "Site Engineer", title: "Engineer", phone: "050 333 4444", email: "site@example.com", isDefault: false }
        ]
      })
    });
    assert.equal(contactUpdate.response.status, 200);
    assert.equal(contactUpdate.body.lead.contacts.length, 2);
    assert.equal(contactUpdate.body.lead.contactPerson, "Primary Buyer");

    const defaultContactChange = await request(`/api/leads/${salesmanCreatedLead.body.lead.id}`, {
      method: "PATCH",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({
        contacts: [
          { id: "default", name: "Primary Buyer", title: "Procurement", phone: "050 111 2222", email: "primary@example.com", isDefault: false },
          { id: "c2", name: "Site Engineer", title: "Engineer", phone: "050 333 4444", email: "site@example.com", isDefault: true }
        ]
      })
    });
    assert.equal(defaultContactChange.response.status, 200);
    assert.equal(defaultContactChange.body.lead.contactPerson, "Site Engineer");
    assert.equal(defaultContactChange.body.lead.email, "site@example.com");

    const deleteRequest = await request(`/api/leads/${created.body.lead.id}/delete-request`, {
      method: "POST",
      headers: auth(salesmanLogin.body.token),
      body: JSON.stringify({ reason: "Testing admin approval gate." })
    });
    assert.equal(deleteRequest.response.status, 201);

    const wrongApproval = await request(`/api/deletion-requests/${deleteRequest.body.request.id}/approve`, {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({ password: "wrong-password" })
    });
    assert.equal(wrongApproval.response.status, 403);

    const correctApproval = await request(`/api/deletion-requests/${deleteRequest.body.request.id}/approve`, {
      method: "POST",
      headers: auth(adminLogin.body.token),
      body: JSON.stringify({ password: "glory12345" })
    });
    assert.equal(correctApproval.response.status, 200);
    assert.equal(correctApproval.body.deleted, true);

    const adminExport = await request("/api/export/leads.xls", { headers: auth(adminLogin.body.token) });
    assert.equal(adminExport.response.status, 200);
    const exportText = String(adminExport.body);
    ["Company ID", "Company name", "Legal name", "Google Maps URL", "Scope of Action", "Product interest", "Products/services remarks", "Notes"].forEach(header => {
      assert.ok(exportText.includes(header), `Missing export field: ${header}`);
    });
    assert.ok(exportText.includes("GI Coils, Steel Bars"));

    const adminPdfExport = await request("/api/export/leads.pdf", { headers: auth(adminLogin.body.token) });
    assert.equal(adminPdfExport.response.status, 200);
    assert.ok(String(adminPdfExport.body).includes("Al Ras Steel Leads Export"));

    console.log("api-adversarial ok");
  } finally {
    child.kill();
  }
})().catch(error => {
  child.kill();
  console.error(error);
  process.exit(1);
});
