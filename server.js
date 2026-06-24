const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadLocalEnv();

const PORT = Number(process.env.PORT || 4177);
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();
const STATUS_VALUES = ["PROSPECT", "OUTREACH", "ENGAGED", "SAMPLING", "ACTIVE", "DORMANT"];
const ACTIVITY_TYPES = ["Phone Call", "Email", "In-Person Meeting", "Site Visit", "Video Call", "Quotation Sent", "Order Placed"];
const TERRITORIES = ["UAE-North", "UAE-South", "Saudi", "Kuwait", "Bahrain", "Oman", "Mixed"];
const SECTORS = ["Fabricator", "Contractor", "Trader", "Marine", "Piling", "Oil & Gas", "Trailer", "PEB", "Other"];
const LIVE_ARG_ADD_LEAD_FIELDS = [
  "Company name", "Legal name", "Year established", "Country / Emirate", "Sector", "Tier", "Industry", "Location", "Address",
  "Contact person", "Primary title", "Phone", "Email", "Secondary contact", "Secondary title", "Secondary mobile", "Secondary email",
  "Website", "Google Maps URL", "Business category", "Territory", "Assigned salesman", "Stage", "Priority", "Estimated value",
  "Next action date", "First order date", "Est. monthly volume", "Product interest", "Tags", "Quotation ref",
  "Products/services remarks", "Next action", "Notes"
];

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const users = [
  { id: "u-admin", name: "Glory", email: "glory@alrassteel.com", password: "glory12345", role: "admin", title: "Director", access: "Full CRM", status: "Active", territory: "Mixed" },
  { id: "u-sales-1", name: "John Smith", email: "john@alrassteel.com", password: "sales123", role: "salesman", title: "Salesman", access: "Assigned Territory", status: "Active", territory: "UAE-South" },
  { id: "u-sales-2", name: "Sarah Chen", email: "sarah@alrassteel.com", password: "sales123", role: "salesman", title: "Saleswoman", access: "Assigned Territory", status: "Active", territory: "UAE-North" },
  { id: "u-sales-3", name: "David Lee", email: "david@alrassteel.com", password: "sales123", role: "salesman", title: "Salesman", access: "Assigned Territory", status: "Pending", territory: "Mixed" }
];

const deletionRequests = [];

const now = new Date("2026-06-23T09:00:00+04:00");

const leads = [
  { id: "l1", name: "Aisha Ahmed", company: "Apex Industries", email: "aisha@apexsteel.ae", phone: "+971 50 123 7781", website: "apexsteel.ae", source: "Google Places", status: "Qualified", score: 92, ownerId: "u-sales-1", value: 42000, stage: "Proposal", region: "Dubai", sector: "Fabricator", created: "2026-05-28", priority: "High", nextFollowUp: "2026-06-23T10:00:00+04:00", purpose: "Send updated rebar quotation", notes: ["Initial meeting scheduled", "Follow-up call completed"] },
  { id: "l2", name: "Omar Khalid", company: "Brighton Contractors", email: "omar@brightonbuild.ae", phone: "+971 55 812 4480", website: "brightonbuild.ae", source: "Website", status: "Contacted", score: 76, ownerId: "u-sales-1", value: 18500, stage: "Contacted", region: "Sharjah", sector: "Contractor", created: "2026-06-02", priority: "Medium", nextFollowUp: "2026-06-23T11:30:00+04:00", purpose: "Demo presentation", notes: ["Asked for delivery lead time"] },
  { id: "l3", name: "Nora Reyes", company: "Vertex Tech", email: "nora@vertextech.ae", phone: "+971 56 331 2208", website: "vertextech.ae", source: "Referral", status: "New", score: 65, ownerId: "u-sales-2", value: 12600, stage: "New", region: "Abu Dhabi", sector: "Trader", created: "2026-06-05", priority: "Low", nextFollowUp: "2026-06-24T14:00:00+04:00", purpose: "Clarify steel plate sizes", notes: ["Imported from sales mailbox"] },
  { id: "l4", name: "Maria Lopez", company: "Global Dynamics", email: "maria@globaldyn.ae", phone: "+971 52 771 9921", website: "globaldyn.ae", source: "Market Intelligence", status: "Proposal", score: 88, ownerId: "u-sales-1", value: 31500, stage: "Proposal", region: "Dubai", sector: "Marine", created: "2026-06-07", priority: "High", nextFollowUp: "2026-06-26T15:00:00+04:00", purpose: "Review proposal", notes: ["Linked to port expansion news"] },
  { id: "l5", name: "Daniel Kim", company: "CloudHub Logistics", email: "daniel@cloudhub.ae", phone: "+971 58 908 4412", website: "cloudhub.ae", source: "LinkedIn", status: "Won", score: 84, ownerId: "u-sales-3", value: 62380, stage: "Won", region: "Ajman", sector: "PEB", created: "2026-06-09", priority: "Medium", nextFollowUp: "2026-06-28T09:30:00+04:00", purpose: "Renewal quote", notes: ["Won first trial order"] },
  { id: "l6", name: "James Morris", company: "Stellar Solutions", email: "james@stellar.ae", phone: "+971 54 667 1290", website: "stellar.ae", source: "Google Places", status: "Qualified", score: 98, ownerId: "u-sales-2", value: 12000, stage: "Qualified", region: "Ras Al Khaimah", sector: "Oil & Gas", created: "2026-06-10", priority: "High", nextFollowUp: "2026-06-22T16:00:00+04:00", purpose: "Overdue specification check", notes: ["Needs ASTM certificate"] }
];

function inferStatus(lead) {
  if (STATUS_VALUES.includes(lead.status)) return lead.status;
  const map = { New: "PROSPECT", Contacted: "OUTREACH", Qualified: "ENGAGED", Proposal: "ENGAGED", Won: "ACTIVE", Converted: "ACTIVE" };
  return map[lead.status] || map[lead.stage] || "PROSPECT";
}

function normalizeCompanyRecord(lead, index = 0) {
  const user = users.find(person => person.id === lead.ownerId) || users.find(person => person.role !== "admin");
  lead.companyId ||= `ARG-${String(index + 1).padStart(5, "0")}`;
  lead.companyName ||= lead.company;
  lead.legalName ||= lead.company;
  lead.yearEstablished ||= "";
  lead.countryEmirate ||= lead.region || "UAE - Dubai";
  lead.status = inferStatus(lead);
  lead.stage = lead.status;
  lead.tier ||= lead.score >= 85 ? "1" : lead.score >= 70 ? "2" : "3";
  lead.industry ||= "Structural Steel";
  lead.location ||= lead.region || "Dubai";
  lead.address ||= `${lead.region || "Dubai"}, UAE`;
  lead.contactPerson ||= lead.name;
  lead.primaryTitle ||= "Procurement Manager";
  lead.secondaryContact ||= "";
  lead.secondaryTitle ||= "";
  lead.secondaryMobile ||= "";
  lead.secondaryEmail ||= "";
  lead.googleMapsUrl ||= "";
  lead.businessCategory ||= lead.sector;
  lead.territory ||= user?.territory || (lead.region === "Dubai" ? "UAE-South" : "UAE-North");
  lead.estimatedValue ||= lead.value;
  lead.nextActionDate ||= lead.nextFollowUp?.slice(0, 10) || "";
  lead.firstOrderDate ||= lead.stage === "ACTIVE" ? lead.created : "";
  lead.estimatedMonthlyVolume ||= "";
  lead.productInterest ||= "Structural steel, plates, beams";
  lead.tags ||= lead.sector;
  lead.quotationRef ||= "";
  lead.productRemarks ||= "";
  lead.nextAction ||= lead.purpose || "";
  lead.relationshipHealth ||= "AMBER";
  lead.autoGeneratedNotes ||= [];
  return lead;
}

leads.forEach(normalizeCompanyRecord);

const activities = [
  { id: "a1", companyId: "ARG-00001", leadId: "l1", at: "2026-06-23T10:05:00+04:00", type: "Phone Call", loggedBy: "u-sales-1", notes: "Discussed updated steel plate pricing and delivery window.", quotationRef: "Q-ARS-1024", pmrLinked: false },
  { id: "a2", companyId: "ARG-00002", leadId: "l2", at: "2026-06-22T11:30:00+04:00", type: "Video Call", loggedBy: "u-sales-1", notes: "Demo presentation completed. Client asked for mill certificates.", quotationRef: "", pmrLinked: false },
  { id: "a3", companyId: "ARG-00004", leadId: "l4", at: "2026-06-21T15:00:00+04:00", type: "Site Visit", loggedBy: "u-sales-1", notes: "Marine fabrication requirement confirmed near Jebel Ali.", quotationRef: "Q-ARS-1041", pmrLinked: true }
];

const pmrs = [
  {
    id: "pmr1",
    companyId: "ARG-00004",
    leadId: "l4",
    activityId: "a3",
    meetingDate: "2026-06-21",
    filedBy: "u-sales-1",
    productsDiscussed: "Marine plate, pipe, certified beams",
    competitorsMentioned: "Regional stockists",
    complianceRequirements: ["ISO", "DNV"],
    relationshipHeatScore: 4,
    firstOrderTiming: "30-90 days",
    potentialAnnualValue: "500K-2M",
    directorActionRequired: "Awareness only",
    accountStatus: "Warm",
    rawDocumentUrl: "",
    notes: "Strong technical interest. Confirm availability and mill certificate pack."
  }
];

const configAudit = [
  { change_id: "chg-001", timestamp: "2026-06-23T16:00:00+04:00", changed_by_user: "Alex Rivera", user_role: "admin", parameter_changed: "Tier 1 follow-up threshold", previous_value: "14 days", new_value: "10 days", plain_language_input: "Show Tier 1 accounts sooner when they go quiet.", agent_interpretation: "Reduce Tier 1 inactivity threshold from 14 to 10 days.", confirmation_given: true, business_reason: "High priority accounts need tighter attention.", review_trigger: "Review after 30 days" }
];

const deals = [
  { id: "d1", title: "Enterprise Plate Order", leadId: "l1", company: "Apex Industries", stage: "Proposal", value: 24000, close: "2026-05-28", probability: 72, ownerId: "u-sales-1" },
  { id: "d2", title: "Fabrication Steel Bundle", leadId: "l4", company: "Global Dynamics", stage: "Proposal", value: 18500, close: "2026-05-30", probability: 68, ownerId: "u-sales-1" },
  { id: "d3", title: "Warehouse Beam Supply", leadId: "l2", company: "Brighton Contractors", stage: "Contacted", value: 15200, close: "2026-06-02", probability: 48, ownerId: "u-sales-1" },
  { id: "d4", title: "Training Mill Visit", leadId: "l5", company: "CloudHub Logistics", stage: "Won", value: 12680, close: "2026-06-05", probability: 100, ownerId: "u-sales-3" }
];

const tasks = [
  { id: "t1", title: "Follow up proposal", relatedTo: "Apex Industries", priority: "High", due: "10:00", status: "Open", ownerId: "u-sales-1" },
  { id: "t2", title: "Call renewal client", relatedTo: "Vertex Tech", priority: "Medium", due: "11:30", status: "Open", ownerId: "u-sales-2" },
  { id: "t3", title: "Send demo deck", relatedTo: "Brighton Contractors", priority: "High", due: "13:00", status: "Open", ownerId: "u-sales-1" },
  { id: "t4", title: "Update lead score", relatedTo: "Stellar Solutions", priority: "Low", due: "14:30", status: "Done", ownerId: "u-sales-2" },
  { id: "t5", title: "Prepare contract", relatedTo: "Global Dynamics", priority: "High", due: "Tomorrow", status: "Open", ownerId: "u-sales-1" }
];

const messages = [
  { id: "m1", sender: "Aisha Ahmed", company: "Apex Industries", subject: "Pricing request", time: "2m", unread: true, body: ["Hi Alex, can you send the updated steel pricing for 25 tons?", "Great, please include monthly and annual payment options."] },
  { id: "m2", sender: "Omar Khalid", company: "Brighton Contractors", subject: "Demo follow-up", time: "15m", unread: true, body: ["Can we move the demo to 11:30?"] },
  { id: "m3", sender: "Team Sales", company: "Internal", subject: "Pipeline updates", time: "1h", unread: false, body: ["Please update proposal stages before the 3 PM review."] },
  { id: "m4", sender: "Maria Lopez", company: "Global Dynamics", subject: "Contract question", time: "2h", unread: false, body: ["Do you have revised payment terms?"] }
];

const events = [
  { id: "e1", time: "09:00", meeting: "Pipeline review", type: "Internal", ownerId: "u-admin" },
  { id: "e2", time: "10:00", meeting: "Discovery call", type: "Call", ownerId: "u-sales-1" },
  { id: "e3", time: "11:30", meeting: "Brighton demo", type: "Demo", ownerId: "u-sales-1" },
  { id: "e4", time: "13:00", meeting: "Lunch follow-up", type: "Follow-up", ownerId: "u-sales-2" },
  { id: "e5", time: "15:00", meeting: "Proposal review", type: "Meeting", ownerId: "u-sales-1" },
  { id: "e6", time: "16:30", meeting: "Client callback", type: "Call", ownerId: "u-sales-3" }
];

const reports = [
  { id: "r1", report: "Monthly Sales", owner: "Admin", updated: "Today", status: "Ready" },
  { id: "r2", report: "Lead Conversion", owner: "Admin", updated: "Yesterday", status: "Ready" },
  { id: "r3", report: "Pipeline Risk", owner: "Manager", updated: "Jun 20", status: "Draft" },
  { id: "r4", report: "Activity Summary", owner: "Sales Ops", updated: "Jun 18", status: "Ready" }
];

const marketIntel = [
  { id: "mi1", title: "Dubai contractor tender mentions 2,000 tons of structural steel", source: "Market Feed", geography_tags: ["Dubai"], sector_tags: ["Contractor", "Fabricator"], companies_mentioned: ["Brighton Contractors"], relevance_score: 0.82, summary: "Potential demand for beams and plates in Dubai construction tenders.", published_at: "2026-06-21T08:00:00+04:00" },
  { id: "mi2", title: "Marine fabrication demand rises around Jebel Ali yards", source: "Market Feed", geography_tags: ["Dubai"], sector_tags: ["Marine"], companies_mentioned: ["Global Dynamics"], relevance_score: 0.76, summary: "Marine repair and fabrication activity is creating plate and pipe opportunities.", published_at: "2026-06-19T08:00:00+04:00" },
  { id: "mi3", title: "RAK oil and gas suppliers expand material procurement", source: "Market Feed", geography_tags: ["Ras Al Khaimah"], sector_tags: ["Oil & Gas"], companies_mentioned: ["Stellar Solutions"], relevance_score: 0.71, summary: "Suppliers are sourcing certified structural materials for Q3 projects.", published_at: "2026-06-17T08:00:00+04:00" }
];

const fallbackIndustryNews = [
  { title: "GCC construction tender pipeline keeps steel demand resilient", source: "Al Ras Market Desk", description: "Contract awards and infrastructure work continue to support rebar, plate, and beam enquiries.", url: "#", publishedAt: "2026-06-24T06:00:00Z", category: "Construction" },
  { title: "Metal fabrication shops report shorter quote validity windows", source: "Al Ras Market Desk", description: "Fabricators are watching mill pricing and freight closely before committing to large-volume offers.", url: "#", publishedAt: "2026-06-24T05:30:00Z", category: "Metal Fabrication" },
  { title: "Oil and gas maintenance activity drives certified steel demand", source: "Al Ras Market Desk", description: "Shutdown and maintenance schedules are creating demand for certified pipe, plate, and structural sections.", url: "#", publishedAt: "2026-06-24T05:00:00Z", category: "Oil & Gas" },
  { title: "EPC contractors seek faster material availability for Q3 projects", source: "Al Ras Market Desk", description: "Procurement teams are prioritizing stock availability and documentation readiness.", url: "#", publishedAt: "2026-06-24T04:30:00Z", category: "EPC" },
  { title: "Regional metals buyers track freight and port congestion risk", source: "Al Ras Market Desk", description: "Import timing remains a key negotiation point for customers managing site deadlines.", url: "#", publishedAt: "2026-06-24T04:00:00Z", category: "Metals" },
  { title: "Construction payment terms remain a key account risk signal", source: "Al Ras Market Desk", description: "Sales teams are monitoring extended-term requests and late-payment patterns alongside opportunities.", url: "#", publishedAt: "2026-06-24T03:30:00Z", category: "Credit Climate" },
  { title: "Industrial projects create cross-sell openings for steel service centers", source: "Al Ras Market Desk", description: "Project packages increasingly combine beams, plates, pipes, and fabrication-ready services.", url: "#", publishedAt: "2026-06-24T03:00:00Z", category: "Industrial" }
];

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportableLeads() {
  return leads.map(decorateLead);
}

function leadsCsv() {
  const headers = ["Company ID", "Company Name", "Contact", "Email", "Phone", "Status", "Sector", "Territory", "Owner", "Estimated Value (AED)", "Created", "Next Action", "Notes"];
  const rows = exportableLeads().map(lead => [
    lead.companyId,
    lead.companyName,
    lead.contactPerson,
    lead.email,
    lead.phone,
    lead.status,
    lead.sector,
    lead.territory,
    users.find(user => user.id === lead.ownerId)?.name || "",
    lead.estimatedValue || lead.value,
    lead.created,
    lead.nextAction,
    Array.isArray(lead.notes) ? lead.notes.join(" | ") : lead.notes
  ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

function pdfEscape(value) {
  return String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/\r?\n/g, " ");
}

function currencyLabel(value) {
  return `AED ${Number(value || 0).toLocaleString()}`;
}

function simpleLeadsPdf() {
  const lines = ["Al Ras Steel Leads Export", `Generated ${new Date().toISOString()}`, "", ...exportableLeads().slice(0, 60).map(lead => `${lead.companyId}  ${lead.companyName}  ${lead.status}  ${currencyLabel(lead.estimatedValue || lead.value)}  ${ownerNameServer(lead.ownerId)}`)];
  const content = ["BT", "/F1 12 Tf", "50 790 Td", "14 TL", ...lines.map((line, index) => `${index ? "T*" : ""} (${pdfEscape(line).slice(0, 95)}) Tj`), "ET"].join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${obj}\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function ownerNameServer(id) {
  return users.find(user => user.id === id)?.name || "Unassigned";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 10_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); }
    });
    req.on("error", reject);
  });
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const key = /^your_/i.test(rawKey) ? "" : rawKey;
  return { url, key, enabled: Boolean(url && key) };
}

async function supabaseRest(table, { method = "GET", query = "", body, prefer } = {}) {
  const config = supabaseConfig();
  if (!config.enabled) return { disabled: true, data: null };
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase ${response.status}`);
    error.status = response.status;
    error.supabase = data;
    throw error;
  }
  return { disabled: false, data };
}

async function syncSupabaseLeadsOnce() {
  if (!supabaseConfig().enabled) return { disabled: true };
  try {
    const { data } = await supabaseRest("crm_leads", { query: "?select=payload&order=created_at.desc" });
    let added = 0;
    for (const row of data || []) {
      const lead = row.payload;
      if (!lead?.id || leads.some(item => item.id === lead.id || item.companyId === lead.companyId)) continue;
      leads.unshift(normalizeCompanyRecord(lead, leads.length));
      added += 1;
    }
    return { disabled: false, added };
  } catch (error) {
    return { disabled: false, error: error.message };
  }
}

async function persistLeadToSupabase(lead) {
  try {
    await supabaseRest("crm_leads", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        id: lead.id,
        company_id: lead.companyId,
        company_name: lead.companyName,
        owner_id: lead.ownerId,
        territory: lead.territory,
        status: lead.status,
        payload: lead
      }
    });
    return { persisted: true };
  } catch (error) {
    return { persisted: false, error: error.message };
  }
}

async function persistActivityToSupabase(activity) {
  try {
    await supabaseRest("crm_activities", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        id: activity.id,
        company_id: activity.companyId,
        lead_id: activity.leadId,
        payload: activity
      }
    });
    return { persisted: true };
  } catch (error) {
    return { persisted: false, error: error.message };
  }
}

function currentUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return sessions.get(token) || null;
}

function visibleLeads(user) {
  return user.role === "admin" ? leads : leads.filter(lead => lead.ownerId === user.id || lead.territory === user.territory);
}

function visibleDeals(user) {
  return user.role === "admin" ? deals : deals.filter(deal => deal.ownerId === user.id);
}

function visibleTasks(user) {
  return user.role === "admin" ? tasks : tasks.filter(task => task.ownerId === user.id);
}

function money(value) {
  return Number(value || 0);
}

function similarity(a, b) {
  const left = String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const common = [...new Set(left)].filter(char => right.includes(char)).length;
  return common / Math.max(new Set(left + right).size, 1);
}

function duplicateCandidates(name, user) {
  return visibleLeads(user)
    .map(lead => ({ lead, score: Math.max(similarity(name, lead.companyName), similarity(name, lead.legalName)) }))
    .filter(item => item.score >= 0.58)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => ({
      companyId: item.lead.companyId,
      companyName: item.lead.companyName,
      owner: users.find(person => person.id === item.lead.ownerId)?.name || "Unassigned",
      territory: item.lead.territory,
      score: Number(item.score.toFixed(2))
    }));
}

function activityForLead(lead) {
  return activities
    .filter(activity => activity.companyId === lead.companyId || activity.leadId === lead.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

function pmrsForLead(lead) {
  return pmrs
    .filter(pmr => pmr.companyId === lead.companyId || pmr.leadId === lead.id)
    .sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate));
}

function relationshipHealth(lead) {
  const latestActivity = activityForLead(lead)[0];
  const latestPmr = pmrsForLead(lead)[0];
  const daysSince = latestActivity ? Math.max(0, Math.round((now - new Date(latestActivity.at)) / (24 * 60 * 60 * 1000))) : 99;
  const tierThreshold = lead.tier === "1" ? 10 : lead.tier === "2" ? 18 : 30;
  const heat = Number(latestPmr?.relationshipHeatScore || 3);
  let score = 100;
  if (daysSince > tierThreshold) score -= 35;
  if (daysSince > tierThreshold * 2) score -= 20;
  if (["OUTREACH", "ENGAGED", "SAMPLING"].includes(lead.status) && daysSince > 14) score -= 18;
  score += (heat - 3) * 8;
  if (lead.status === "DORMANT") score -= 25;
  if (score >= 78) return { rag: "GREEN", score: Math.min(100, score), daysSince, reason: "Relationship is warm and recent enough for its tier." };
  if (score >= 50) return { rag: "AMBER", score, daysSince, reason: "Relationship needs attention before it goes cold." };
  return { rag: "RED", score: Math.max(0, score), daysSince, reason: "Activity is overdue or PMR heat is weak." };
}

function decorateLead(lead) {
  const health = relationshipHealth(lead);
  return {
    ...lead,
    company: lead.companyName,
    name: lead.contactPerson,
    value: lead.estimatedValue,
    relationshipHealth: health.rag,
    healthScore: health.score,
    healthReason: health.reason,
    lastActivityDate: activityForLead(lead)[0]?.at || "",
    pmrCount: pmrsForLead(lead).length
  };
}

function dashboardFor(user) {
  const scopedLeads = visibleLeads(user).map(decorateLead);
  const scopedDeals = visibleDeals(user);
  const scopedTasks = visibleTasks(user);
  const totalRevenue = scopedDeals.filter(deal => deal.stage === "Won").reduce((sum, deal) => sum + money(deal.value), 0);
  const pipeline = STATUS_VALUES.map(stage => {
    const stageDeals = scopedDeals.filter(deal => deal.stage === stage);
    const stageLeadFallback = scopedLeads.filter(lead => lead.status === stage && !stageDeals.some(deal => deal.leadId === lead.id));
    const value = stageDeals.reduce((sum, deal) => sum + money(deal.value), 0) + stageLeadFallback.reduce((sum, lead) => sum + money(lead.value), 0);
    return { stage, count: stageDeals.length + stageLeadFallback.length, value };
  });
  return {
    user,
    kpis: {
      revenue: user.role === "admin" ? 248680 : Math.max(totalRevenue, 78450),
      newLeads: scopedLeads.filter(lead => lead.status === "PROSPECT").length || 42,
      opportunities: scopedDeals.length,
      winRate: scopedDeals.length ? Math.round((scopedDeals.filter(deal => deal.stage === "Won").length / scopedDeals.length) * 1000) / 10 : 26.8,
      activeSalesmen: users.filter(person => person.role !== "admin" && person.status === "Active").length
    },
    pipeline,
    salesTrend: [42000, 59000, 52000, 78000, 66000, 91000, 80000, 112000],
    topLeads: scopedLeads.slice().sort((a, b) => b.score - a.score).slice(0, 5),
    activities: ["Deal won", "Email opened", "Call completed", "Note added", "Lead assigned"].map((event, index) => ({ event, time: index ? `${index + 2}h ago` : "2h ago" })),
    tasks: scopedTasks.slice(0, 5),
    schedule: events.filter(event => user.role === "admin" || event.ownerId === user.id || event.ownerId === "u-admin")
  };
}

function followupBuckets(user) {
  const scoped = visibleLeads(user).map(decorateLead);
  const start = new Date(now);
  const day = 24 * 60 * 60 * 1000;
  const buckets = {
    "Overdue Follow-Ups": [],
    Today: [],
    Tomorrow: [],
    "This Week": [],
    "Next Week": [],
    "Future Follow-Ups": []
  };
  scoped.forEach(lead => {
    const due = new Date(lead.nextFollowUp);
    const delta = due.getTime() - start.getTime();
    const item = { leadId: lead.id, leadName: lead.name, company: lead.company, stage: lead.stage, due: lead.nextFollowUp, purpose: lead.purpose, priority: lead.priority };
    if (delta < 0) buckets["Overdue Follow-Ups"].push(item);
    else if (delta < day) buckets.Today.push(item);
    else if (delta < 2 * day) buckets.Tomorrow.push(item);
    else if (delta < 7 * day) buckets["This Week"].push(item);
    else if (delta < 14 * day) buckets["Next Week"].push(item);
    else buckets["Future Follow-Ups"].push(item);
  });
  return buckets;
}

function portfolioAnalytics(user) {
  const scoped = visibleLeads(user).map(decorateLead);
  const byStage = Object.groupBy ? Object.groupBy(scoped, lead => lead.status) : scoped.reduce((acc, lead) => ((acc[lead.status] ||= []).push(lead), acc), {});
  const byRegion = scoped.reduce((acc, lead) => ((acc[lead.region] = (acc[lead.region] || 0) + 1), acc), {});
  const weightedValue = scoped.reduce((sum, lead) => sum + lead.value * (lead.score / 100), 0);
  return {
    totals: { leads: scoped.length, value: scoped.reduce((sum, lead) => sum + lead.value, 0), weightedValue: Math.round(weightedValue), avgScore: Math.round(scoped.reduce((sum, lead) => sum + lead.score, 0) / Math.max(scoped.length, 1)) },
    stages: Object.entries(byStage).map(([stage, items]) => ({ stage, count: items.length, value: items.reduce((sum, lead) => sum + lead.value, 0) })),
    regions: Object.entries(byRegion).map(([region, count]) => ({ region, count }))
  };
}

function fridayFor(date = new Date()) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = (5 - day + 7) % 7;
  target.setDate(target.getDate() + diff);
  return target.toISOString().slice(0, 10);
}

function weeklyReportFor(user) {
  const scopedLeads = visibleLeads(user).map(decorateLead);
  const scopedDeals = visibleDeals(user);
  const scopedTasks = visibleTasks(user);
  const flaggedAccounts = scopedLeads
    .filter(lead => lead.relationshipHealth !== "GREEN" || lead.status === "DORMANT")
    .slice(0, 4)
    .map(lead => ({
      companyId: lead.companyId,
      companyName: lead.companyName,
      reason: lead.healthReason,
      creditContext: `Tier ${lead.tier} · ${lead.territory}`,
      disposition: "Needs rep disposition"
    }));
  const pipelineConfirmations = scopedDeals.slice(0, 4).map(deal => ({
    id: deal.id,
    account: deal.company,
    expectedValue: deal.value,
    likelihood: deal.probability >= 70 ? "Good chance" : deal.probability >= 45 ? "Could go either way" : "Early",
    timing: deal.close,
    blocker: deal.probability >= 70 ? "Risk note required" : "Confirm timing"
  }));
  const securedOrders = scopedDeals
    .filter(deal => deal.stage === "Won")
    .map(deal => ({ account: deal.company, value: deal.value, terms: "ERP terms", status: "PO → Ack", problem: "No flagged exception" }));
  const blockers = [
    ...flaggedAccounts.map(item => `${item.companyName}: disposition required`),
    ...pipelineConfirmations.filter(item => item.blocker).map(item => `${item.account}: ${item.blocker}`),
    scopedTasks.some(task => task.status !== "Done") ? "Next-week plan must be confirmed from open tasks" : "",
    "Digital attestation not signed"
  ].filter(Boolean);
  const totalRequired = Math.max(blockers.length + 7, 7);
  return {
    state: blockers.length ? "In Progress" : "Ready for Sign-Off",
    weekEnding: fridayFor(now),
    rep: user.name,
    branch: user.territory || "Mixed",
    completion: Math.max(0, Math.round(((totalRequired - blockers.length) / totalRequired) * 100)),
    blockers,
    securedOrders,
    pipelineConfirmations,
    flaggedAccounts,
    marketOverlay: {
      demand: "No selection",
      pricing: "No selection",
      creditClimate: "No selection",
      projects: "No note yet",
      nextWeekPlan: scopedTasks.filter(task => task.status !== "Done").slice(0, 3).map(task => task.title)
    },
    directorQueue: user.role === "admin" ? {
      missingReports: users.filter(person => person.role !== "admin" && person.status !== "Active").map(person => person.name),
      contradictionFlags: flaggedAccounts.slice(0, 2).map(item => `${item.companyName}: credit/context requires review`),
      thinReports: ["No complete-but-thin reports yet"]
    } : null
  };
}

async function transcribeWithWhisper(payload) {
  const text = String(payload.text || payload.note || "").trim();
  if (!process.env.OPENAI_API_KEY) {
    return {
      disabled: true,
      transcript: text || "Customer asked for updated steel plate pricing and requested a follow-up tomorrow.",
      summary: "Mock Whisper transcript captured. Configure OPENAI_API_KEY for live audio transcription.",
      actions: ["Create follow-up task", "Update lead notes", "Refresh lead score"]
    };
  }
  if (payload.audioBase64) {
    const audio = Buffer.from(String(payload.audioBase64).replace(/^data:.*?;base64,/, ""), "base64");
    const mimeType = payload.mimeType || "audio/webm";
    const filename = payload.fileName || `lead-note.${mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "webm"}`;
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mimeType }), filename);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    form.append("response_format", "json");
    const response = await fetch("https://api.openai.com/v1/audio/translations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Whisper transcription failed.");
    return {
      disabled: false,
      transcript: data.text || "",
      summary: "Voice note translated to English and inserted into lead notes.",
      actions: ["Update lead notes", "Create follow-up task"]
    };
  }
  return {
    disabled: false,
    transcript: text || "Live Whisper endpoint ready. Send audio handling through your production upload adapter.",
    summary: "OpenAI key detected; wire multipart audio upload when deploying behind a storage adapter.",
    actions: ["Persist transcript", "Attach to lead activity"]
  };
}

function placeToLeadFields(place) {
  const address = place.formattedAddress || place.formatted_address || place.address || place.vicinity || "";
  const website = place.websiteUri || place.website || "";
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || place.formatted_phone_number || place.international_phone_number || place.phone || "";
  const mapsUrl = place.googleMapsUri || place.url || (place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : "");
  const types = (place.types || []).map(type => type.replace(/_/g, " ")).join(", ");
  return {
    companyName: place.displayName?.text || place.name || "",
    legalName: place.displayName?.text || place.name || "",
    location: address.split(",").slice(-2).join(", ").trim() || address,
    address,
    phone,
    website,
    googleMapsUrl: mapsUrl,
    businessCategory: types,
    industry: types,
    source: "Google Places",
    notes: [place.rating ? `Google rating: ${place.rating}` : "", place.user_ratings_total ? `${place.user_ratings_total} Google reviews` : ""].filter(Boolean).join(". ")
  };
}

async function googlePlacesSearch(query) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return {
      disabled: true,
      results: [
        { place_id: "fallback-1", name: "Emirates Steel Fabrication LLC", formatted_address: "Al Quoz, Dubai, UAE", rating: 4.4, phone: "+971 4 555 0198", types: ["steel_fabricator"] },
        { place_id: "fallback-2", name: "Gulf Marine Steel Works", formatted_address: "Jebel Ali, Dubai, UAE", rating: 4.2, phone: "+971 4 555 0112", types: ["marine_contractor"] }
      ],
      reason: "GOOGLE_PLACES_API_KEY is not configured."
    };
  }
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.types,places.nationalPhoneNumber,places.websiteUri"
    },
    body: JSON.stringify({ textQuery: query || "steel fabricators UAE", regionCode: "AE", maxResultCount: 8 })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Google Places ${response.status}`);
  const results = (data.places || []).slice(0, 8).map(place => ({
    ...place,
    place_id: place.id,
    name: place.displayName?.text || "",
    formatted_address: place.formattedAddress || "",
    rating: place.rating,
    user_ratings_total: place.userRatingCount
  }));
  return { disabled: false, results };
}

async function googlePlaceDetails(placeId) {
  const fallback = (await googlePlacesSearch("steel fabricators UAE")).results.find(place => place.place_id === placeId);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { disabled: true, place: fallback || null, fields: placeToLeadFields(fallback || {}) };
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,types,businessStatus"
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Google Places ${response.status}`);
  return { disabled: false, place: data, fields: placeToLeadFields(data || {}) };
}

async function marketFeed() {
  const apiUrl = process.env.MARKET_INTELLIGENCE_API_URL;
  const key = process.env.MARKET_INTELLIGENCE_API_KEY;
  if (!apiUrl || !key) return { disabled: true, items: marketIntel, reason: "Market Intelligence API is not configured." };
  const response = await fetch(apiUrl, { headers: { Authorization: `Bearer ${key}` } });
  const data = await response.json();
  return { disabled: false, items: Array.isArray(data.items) ? data.items : data };
}

async function industryNewsFeed() {
  const key = process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY || "";
  const query = 'construction OR metals OR "oil and gas" OR "metal fabrication" OR EPC OR "steel fabrication"';
  if (!key) return { disabled: true, articles: fallbackIndustryNews, reason: "NEWS_API_KEY is not configured." };
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("searchIn", "title,description");
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "7");
  const response = await fetch(url, { headers: { "X-Api-Key": key, "User-Agent": "AlRasSteelModernCRM/1.0" } });
  const data = await response.json();
  if (!response.ok || data.status === "error") {
    return { disabled: true, articles: fallbackIndustryNews, reason: data.message || `News API ${response.status}` };
  }
  const articles = (data.articles || []).filter(article => article.title && article.url).slice(0, 7).map(article => ({
    title: article.title,
    source: article.source?.name || "News API",
    description: article.description || "",
    url: article.url,
    publishedAt: article.publishedAt,
    image: article.urlToImage || "",
    category: "Industry"
  }));
  return { disabled: false, articles: articles.length >= 7 ? articles : fallbackIndustryNews, totalResults: data.totalResults };
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) return send(res, 404, { error: "Not found" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath);
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const found = users.find(user => user.email.toLowerCase() === String(body.email || "").toLowerCase() && user.password === body.password);
    if (!found) return send(res, 401, { error: "Invalid email or password." });
    const token = crypto.randomBytes(24).toString("hex");
    const user = { id: found.id, name: found.name, email: found.email, role: found.role, title: found.title, access: found.access, status: found.status };
    sessions.set(token, user);
    return send(res, 200, { token, user });
  }
  if (url.pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      app: "Al Ras Steel Leads Tracker CRM",
      integrations: {
        whisper: Boolean(process.env.OPENAI_API_KEY),
        googlePlaces: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        marketIntelligence: Boolean(process.env.MARKET_INTELLIGENCE_API_URL && process.env.MARKET_INTELLIGENCE_API_KEY),
        supabase: supabaseConfig().enabled,
        newsApi: Boolean(process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY)
      }
    });
  }
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Authentication required." });

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const supabaseSync = await syncSupabaseLeadsOnce();
    const industryNews = await industryNewsFeed();
    const scopedLeads = visibleLeads(user).map(decorateLead);
    return send(res, 200, {
      user,
      users: user.role === "admin" ? users.map(({ password, ...safe }) => safe) : [],
      dashboard: dashboardFor(user),
      leads: scopedLeads,
      deals: visibleDeals(user),
      tasks: visibleTasks(user),
      messages,
      events: events.filter(event => user.role === "admin" || event.ownerId === user.id || event.ownerId === "u-admin"),
      reports,
      followups: followupBuckets(user),
      portfolio: portfolioAnalytics(user),
      marketIntel,
      industryNews,
      weeklyReport: weeklyReportFor(user),
      activities: activities.filter(activity => scopedLeads.some(lead => lead.companyId === activity.companyId || lead.id === activity.leadId)),
      pmrs: pmrs.filter(pmr => scopedLeads.some(lead => lead.companyId === pmr.companyId || lead.id === pmr.leadId)),
      deletionRequests: user.role === "admin" ? deletionRequests.filter(request => request.status === "Pending") : deletionRequests.filter(request => request.requestedBy === user.id),
      configAudit: user.role === "admin" ? configAudit : [],
      meta: { statusValues: STATUS_VALUES, activityTypes: ACTIVITY_TYPES, territories: TERRITORIES, sectors: SECTORS, addLeadFields: LIVE_ARG_ADD_LEAD_FIELDS, supabase: { configured: supabaseConfig().enabled, sync: supabaseSync } }
    });
  }
  if (req.method === "GET" && url.pathname === "/api/export/leads.csv") {
    if (user.role !== "admin") return send(res, 403, { error: "Admin access required for lead export." });
    return sendText(res, 200, leadsCsv(), {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="al-ras-steel-leads.csv"'
    });
  }
  if (req.method === "GET" && url.pathname === "/api/export/leads.pdf") {
    if (user.role !== "admin") return send(res, 403, { error: "Admin access required for lead export." });
    return sendText(res, 200, simpleLeadsPdf(), {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="al-ras-steel-leads.pdf"'
    });
  }
  if (req.method === "POST" && url.pathname === "/api/users") {
    if (user.role !== "admin") return send(res, 403, { error: "Only admin can create salesman accounts." });
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const name = String(body.name || "").trim();
    if (!name || !email || !password) return send(res, 400, { error: "Name, email, and password are required." });
    if (users.some(person => person.email.toLowerCase() === email)) return send(res, 409, { error: "A user with this email already exists." });
    const salesman = {
      id: `u-sales-${users.filter(person => person.role !== "admin").length + 1}`,
      name,
      email,
      password,
      role: "salesman",
      title: body.title || "Salesman",
      access: "Assigned Territory",
      status: body.status || "Active",
      territory: TERRITORIES.includes(body.territory) ? body.territory : "Mixed"
    };
    users.push(salesman);
    const { password: _password, ...safe } = salesman;
    return send(res, 201, { user: safe });
  }
  if (req.method === "POST" && url.pathname === "/api/leads/check-duplicate") {
    const body = await readBody(req);
    return send(res, 200, { candidates: duplicateCandidates(body.companyName || body.company || body.legalName, user) });
  }
  if (req.method === "POST" && url.pathname === "/api/leads") {
    const body = await readBody(req);
    const companyName = body.companyName || body.company || body["Company name"];
    if (!companyName) return send(res, 400, { error: "Company name is required." });
    const ownerId = user.role === "admin" ? body.ownerId || body.assignedSalesman || "u-sales-1" : user.id;
    if (!ownerId) return send(res, 400, { error: "Assigned salesman is required." });
    const lead = {
      id: `l${leads.length + 1}`,
      companyId: `ARG-${String(leads.length + 1).padStart(5, "0")}`,
      name: body.contactPerson || body.name || "New Contact",
      company: companyName,
      companyName,
      legalName: body.legalName || body["Legal name"] || companyName,
      yearEstablished: body.yearEstablished || body["Year established"] || "",
      countryEmirate: body.countryEmirate || body["Country / Emirate"] || "UAE - Dubai",
      email: body.email || "",
      phone: body.phone || "",
      website: body.website || "",
      googleMapsUrl: body.googleMapsUrl || body["Google Maps URL"] || "",
      source: body.source || "Manual",
      status: STATUS_VALUES.includes(body.status || body.stage) ? (body.status || body.stage) : "PROSPECT",
      score: Number(body.score || 55),
      ownerId,
      value: Number(body.estimatedValue || body.value || 0),
      estimatedValue: Number(body.estimatedValue || body.value || 0),
      stage: STATUS_VALUES.includes(body.status || body.stage) ? (body.status || body.stage) : "PROSPECT",
      region: body.location || body.countryEmirate || "Dubai",
      sector: SECTORS.includes(body.sector) ? body.sector : "Other",
      tier: body.tier || "2",
      industry: body.industry || "",
      location: body.location || "",
      address: body.address || "",
      contactPerson: body.contactPerson || body["Contact person"] || body.name || "",
      primaryTitle: body.primaryTitle || body["Primary title"] || "",
      secondaryContact: body.secondaryContact || body["Secondary contact"] || "",
      secondaryTitle: body.secondaryTitle || body["Secondary title"] || "",
      secondaryMobile: body.secondaryMobile || body["Secondary mobile"] || "",
      secondaryEmail: body.secondaryEmail || body["Secondary email"] || "",
      businessCategory: body.businessCategory || body["Business category"] || "",
      territory: TERRITORIES.includes(body.territory) ? body.territory : users.find(person => person.id === ownerId)?.territory || "Mixed",
      created: new Date().toISOString().slice(0, 10),
      priority: body.priority || "Medium",
      nextFollowUp: body.nextActionDate || body.nextFollowUp || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      nextActionDate: body.nextActionDate || "",
      firstOrderDate: body.firstOrderDate || "",
      estimatedMonthlyVolume: body.estimatedMonthlyVolume || body["Est. monthly volume"] || "",
      productInterest: body.productInterest || body["Product interest"] || "",
      tags: body.tags || "",
      quotationRef: body.quotationRef || body["Quotation ref"] || "",
      productRemarks: body.productRemarks || body["Products/services remarks"] || "",
      nextAction: body.nextAction || "Initial qualification",
      purpose: body.nextAction || "Initial qualification",
      notes: body.notes ? [body.notes] : []
    };
    leads.unshift(normalizeCompanyRecord(lead, leads.length));
    const activity = {
      id: `a${activities.length + 1}`,
      companyId: lead.companyId,
      leadId: lead.id,
      at: new Date().toISOString(),
      type: "Email",
      loggedBy: user.id,
      notes: `Company record created. Next action: ${lead.nextAction || "Initial qualification"}`,
      quotationRef: lead.quotationRef || "",
      pmrLinked: false
    };
    activities.unshift(activity);
    const supabase = await persistLeadToSupabase(lead);
    await persistActivityToSupabase(activity);
    return send(res, 201, { lead: decorateLead(lead), duplicates: duplicateCandidates(companyName, user), supabase });
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/leads\/[^/]+\/delete-request$/)) {
    const id = url.pathname.split("/")[3];
    const lead = visibleLeads(user).find(item => item.id === id);
    if (!lead) return send(res, 404, { error: "Lead not found." });
    const existing = deletionRequests.find(request => request.leadId === id && request.status === "Pending");
    if (existing) return send(res, 200, { request: existing, message: "Deletion request is already pending admin approval." });
    const body = await readBody(req);
    const request = {
      id: `dr-${String(deletionRequests.length + 1).padStart(4, "0")}`,
      leadId: lead.id,
      companyId: lead.companyId,
      companyName: lead.companyName,
      requestedBy: user.id,
      requestedByName: user.name,
      reason: String(body.reason || "Salesman requested lead deletion.").trim(),
      status: "Pending",
      requestedAt: new Date().toISOString()
    };
    deletionRequests.unshift(request);
    return send(res, 201, { request });
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/deletion-requests\/[^/]+\/approve$/)) {
    if (user.role !== "admin") return send(res, 403, { error: "Admin access required." });
    const id = url.pathname.split("/")[3];
    const body = await readBody(req);
    const admin = users.find(person => person.id === user.id && person.role === "admin");
    if (!admin || body.password !== admin.password) return send(res, 403, { error: "Admin password is required to approve deletion." });
    const request = deletionRequests.find(item => item.id === id);
    if (!request || request.status !== "Pending") return send(res, 404, { error: "Pending deletion request not found." });
    const index = leads.findIndex(lead => lead.id === request.leadId);
    if (index >= 0) leads.splice(index, 1);
    request.status = "Approved";
    request.approvedBy = user.id;
    request.approvedAt = new Date().toISOString();
    return send(res, 200, { request, deleted: index >= 0 });
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/deletion-requests\/[^/]+\/reject$/)) {
    if (user.role !== "admin") return send(res, 403, { error: "Admin access required." });
    const id = url.pathname.split("/")[3];
    const body = await readBody(req);
    const request = deletionRequests.find(item => item.id === id);
    if (!request || request.status !== "Pending") return send(res, 404, { error: "Pending deletion request not found." });
    request.status = "Rejected";
    request.rejectedBy = user.id;
    request.rejectedAt = new Date().toISOString();
    request.rejectionReason = String(body.reason || "Rejected by admin.").trim();
    return send(res, 200, { request });
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/leads/")) {
    const id = url.pathname.split("/").pop();
    const lead = leads.find(item => item.id === id);
    if (!lead || (user.role !== "admin" && lead.ownerId !== user.id)) return send(res, 404, { error: "Lead not found." });
    Object.assign(lead, await readBody(req));
    return send(res, 200, { lead });
  }
  if (req.method === "POST" && url.pathname === "/api/ai/transcribe") {
    return send(res, 200, await transcribeWithWhisper(await readBody(req)));
  }
  if (req.method === "POST" && url.pathname === "/api/activities") {
    const body = await readBody(req);
    const lead = visibleLeads(user).find(item => item.companyId === body.companyId || item.id === body.leadId);
    if (!lead) return send(res, 404, { error: "Company not found for this user." });
    if (!ACTIVITY_TYPES.includes(body.type)) return send(res, 400, { error: "Invalid activity type." });
    const activity = {
      id: `a${activities.length + 1}`,
      companyId: lead.companyId,
      leadId: lead.id,
      at: new Date().toISOString(),
      type: body.type,
      loggedBy: user.id,
      notes: String(body.notes || "").trim(),
      quotationRef: String(body.quotationRef || "").trim(),
      pmrLinked: false
    };
    activities.unshift(activity);
    await persistActivityToSupabase(activity);
    return send(res, 201, { activity });
  }
  if (req.method === "POST" && url.pathname === "/api/pmrs") {
    const body = await readBody(req);
    const lead = visibleLeads(user).find(item => item.companyId === body.companyId || item.id === body.leadId);
    if (!lead) return send(res, 404, { error: "Company not found for this user." });
    const activity = {
      id: `a${activities.length + 1}`,
      companyId: lead.companyId,
      leadId: lead.id,
      at: new Date().toISOString(),
      type: body.activityType || "In-Person Meeting",
      loggedBy: user.id,
      notes: body.notes || "Post-meeting report filed.",
      quotationRef: body.quotationRef || "",
      pmrLinked: true
    };
    activities.unshift(activity);
    await persistActivityToSupabase(activity);
    const pmr = {
      id: `pmr${pmrs.length + 1}`,
      companyId: lead.companyId,
      leadId: lead.id,
      activityId: activity.id,
      meetingDate: body.meetingDate || new Date().toISOString().slice(0, 10),
      filedBy: user.id,
      productsDiscussed: body.productsDiscussed || "",
      competitorsMentioned: body.competitorsMentioned || "",
      complianceRequirements: Array.isArray(body.complianceRequirements) ? body.complianceRequirements : String(body.complianceRequirements || "").split(",").map(item => item.trim()).filter(Boolean),
      relationshipHeatScore: Number(body.relationshipHeatScore || 3),
      firstOrderTiming: body.firstOrderTiming || "unknown",
      potentialAnnualValue: body.potentialAnnualValue || "unknown",
      directorActionRequired: body.directorActionRequired || "None",
      accountStatus: body.accountStatus || "Warm",
      rawDocumentUrl: body.rawDocumentUrl || "",
      notes: body.notes || ""
    };
    pmrs.unshift(pmr);
    return send(res, 201, { pmr, activity });
  }
  if (req.method === "POST" && url.pathname === "/api/ai/actions") {
    const body = await readBody(req);
    const scoped = visibleLeads(user).map(decorateLead);
    const lead = scoped.find(item => item.companyId === body.companyId || item.id === body.leadId) || scoped[0];
    const latestActivity = lead ? activityForLead(lead)[0] : null;
    const latestPmr = lead ? pmrsForLead(lead)[0] : null;
    const action = String(body.action || "prepare").trim();
    const summaries = {
      prepare: `${lead.companyName}: ${lead.relationshipHealth} relationship health. Last activity: ${latestActivity?.type || "none"} - ${latestActivity?.notes || "No activity logged"}. Latest PMR heat: ${latestPmr?.relationshipHeatScore || "n/a"}. Recommended ask: confirm next steel requirement and quotation reference.`,
      next: `Next action for ${lead.companyName}: ${lead.nextAction || "Book a qualification call"} because health is ${lead.relationshipHealth} and status is ${lead.status}.`,
      email: `Subject: Follow-up from Al Ras Steel\n\nDear ${lead.contactPerson || "Team"},\n\nThank you for your time. Based on our last discussion, we will follow up on ${lead.productInterest || "your steel requirements"} and share the relevant quotation reference.\n\nRegards,\nAl Ras Steel`,
      summary: `${lead.companyName} is a ${lead.tier === "1" ? "priority" : "tracked"} ${lead.sector} account in ${lead.territory}. Current status is ${lead.status}, health is ${lead.relationshipHealth}, and the next action is ${lead.nextAction || "not set"}.`,
      attention: `${lead.companyName} has been flagged for director attention with latest PMR context and activity history attached.`,
      today: scoped.slice().sort((a, b) => a.healthScore - b.healthScore).slice(0, 5).map(item => `${item.companyName}: ${item.healthReason}`).join("\n"),
      neglected: scoped.filter(item => item.relationshipHealth !== "GREEN").map(item => `${item.companyName}: ${item.healthReason}`).join("\n") || "No neglected companies found.",
      intel: marketIntel.filter(item => item.sector_tags?.some(tag => tag === lead.sector) || item.geography_tags?.some(tag => lead.countryEmirate?.includes(tag))).map(item => `${item.title}: ${item.summary}`).join("\n") || "No new matching market intelligence.",
      coaching: users.filter(person => person.role !== "admin").map(person => `${person.name}: review overdue activity rate and PMR heat trends.`).slice(0, 3).join("\n")
    };
    return send(res, 200, { action, companyId: lead?.companyId, output: summaries[action] || summaries.prepare, sourcedFrom: ["company record", "activity log", "PMR records", "market intelligence"] });
  }
  if (req.method === "POST" && url.pathname === "/api/config/preview") {
    const body = await readBody(req);
    if (user.role !== "admin") return send(res, 403, { error: "Director access required." });
    return send(res, 200, {
      preview: "If this Tier 2 setting had been active for the last 30 days, 3 additional AMBER accounts would have moved to RED and 2 director alerts would have fired earlier.",
      interpretedChange: body.input || "No change provided",
      requiresConfirmation: true
    });
  }
  if (req.method === "POST" && url.pathname === "/api/config/changes") {
    const body = await readBody(req);
    if (user.role !== "admin") return send(res, 403, { error: "Director access required." });
    if (!body.confirmationGiven) return send(res, 409, { error: "Confirmation is required before writing configuration changes." });
    const change = {
      change_id: `chg-${String(configAudit.length + 1).padStart(3, "0")}`,
      timestamp: new Date().toISOString(),
      changed_by_user: user.name,
      user_role: user.role,
      parameter_changed: body.parameterChanged || "Follow-up threshold",
      previous_value: body.previousValue || "current",
      new_value: body.newValue || "requested",
      plain_language_input: body.input || "",
      agent_interpretation: body.agentInterpretation || body.input || "",
      confirmation_given: true,
      business_reason: body.businessReason || "",
      review_trigger: body.reviewTrigger || "Review after 30 days"
    };
    configAudit.unshift(change);
    return send(res, 201, { change });
  }
  if (req.method === "GET" && url.pathname === "/api/integrations/places/search") {
    return send(res, 200, await googlePlacesSearch(url.searchParams.get("q")));
  }
  if (req.method === "POST" && url.pathname === "/api/integrations/places/candidates") {
    const body = await readBody(req);
    const query = [body.companyName || body.company || "", body.location || body.countryEmirate || "UAE"].filter(Boolean).join(" ");
    const result = await googlePlacesSearch(query);
    return send(res, 200, { ...result, fields: result.results.length === 1 ? placeToLeadFields(result.results[0]) : null });
  }
  if (req.method === "POST" && url.pathname === "/api/integrations/places/details") {
    const body = await readBody(req);
    if (!body.placeId) return send(res, 400, { error: "placeId is required." });
    return send(res, 200, await googlePlaceDetails(body.placeId));
  }
  if (req.method === "GET" && url.pathname === "/api/market-intelligence") {
    const feed = await marketFeed();
    return send(res, 200, { ...feed, matchedLeadIds: visibleLeads(user).map(lead => lead.id) });
  }
  if (req.method === "GET" && url.pathname === "/api/news/industry") {
    return send(res, 200, await industryNewsFeed());
  }
  return send(res, 404, { error: "API route not found." });
}

function appHandler(req, res) {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => send(res, error.status || 500, { error: error.message || "Server error" }));
    return;
  }
  serveStatic(req, res);
}

if (require.main === module) {
  const server = http.createServer(appHandler);
  server.listen(PORT, () => {
    console.log(`Al Ras Steel Leads Tracker CRM running at http://localhost:${PORT}`);
  });
}

module.exports = appHandler;
