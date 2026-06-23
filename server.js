const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4177);
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();

const users = [
  { id: "u-admin", name: "Alex Rivera", email: "admin@alrassteel.com", password: "admin123", role: "admin", title: "Sales Manager", access: "Full CRM", status: "Active" },
  { id: "u-sales-1", name: "John Smith", email: "john@alrassteel.com", password: "sales123", role: "salesman", title: "Salesman", access: "Assigned Leads", status: "Active" },
  { id: "u-sales-2", name: "Sarah Chen", email: "sarah@alrassteel.com", password: "sales123", role: "salesman", title: "Saleswoman", access: "Assigned Leads", status: "Active" },
  { id: "u-sales-3", name: "David Lee", email: "david@alrassteel.com", password: "sales123", role: "salesman", title: "Salesman", access: "Assigned Leads", status: "Pending" }
];

const now = new Date("2026-06-23T09:00:00+04:00");

const leads = [
  { id: "l1", name: "Aisha Ahmed", company: "Apex Industries", email: "aisha@apexsteel.ae", phone: "+971 50 123 7781", website: "apexsteel.ae", source: "Google Places", status: "Qualified", score: 92, ownerId: "u-sales-1", value: 42000, stage: "Proposal", region: "Dubai", sector: "Fabricator", created: "2026-05-28", priority: "High", nextFollowUp: "2026-06-23T10:00:00+04:00", purpose: "Send updated rebar quotation", notes: ["Initial meeting scheduled", "Follow-up call completed"] },
  { id: "l2", name: "Omar Khalid", company: "Brighton Contractors", email: "omar@brightonbuild.ae", phone: "+971 55 812 4480", website: "brightonbuild.ae", source: "Website", status: "Contacted", score: 76, ownerId: "u-sales-1", value: 18500, stage: "Contacted", region: "Sharjah", sector: "Contractor", created: "2026-06-02", priority: "Medium", nextFollowUp: "2026-06-23T11:30:00+04:00", purpose: "Demo presentation", notes: ["Asked for delivery lead time"] },
  { id: "l3", name: "Nora Reyes", company: "Vertex Tech", email: "nora@vertextech.ae", phone: "+971 56 331 2208", website: "vertextech.ae", source: "Referral", status: "New", score: 65, ownerId: "u-sales-2", value: 12600, stage: "New", region: "Abu Dhabi", sector: "Trader", created: "2026-06-05", priority: "Low", nextFollowUp: "2026-06-24T14:00:00+04:00", purpose: "Clarify steel plate sizes", notes: ["Imported from sales mailbox"] },
  { id: "l4", name: "Maria Lopez", company: "Global Dynamics", email: "maria@globaldyn.ae", phone: "+971 52 771 9921", website: "globaldyn.ae", source: "Market Intelligence", status: "Proposal", score: 88, ownerId: "u-sales-1", value: 31500, stage: "Proposal", region: "Dubai", sector: "Marine", created: "2026-06-07", priority: "High", nextFollowUp: "2026-06-26T15:00:00+04:00", purpose: "Review proposal", notes: ["Linked to port expansion news"] },
  { id: "l5", name: "Daniel Kim", company: "CloudHub Logistics", email: "daniel@cloudhub.ae", phone: "+971 58 908 4412", website: "cloudhub.ae", source: "LinkedIn", status: "Won", score: 84, ownerId: "u-sales-3", value: 62380, stage: "Won", region: "Ajman", sector: "PEB", created: "2026-06-09", priority: "Medium", nextFollowUp: "2026-06-28T09:30:00+04:00", purpose: "Renewal quote", notes: ["Won first trial order"] },
  { id: "l6", name: "James Morris", company: "Stellar Solutions", email: "james@stellar.ae", phone: "+971 54 667 1290", website: "stellar.ae", source: "Google Places", status: "Qualified", score: 98, ownerId: "u-sales-2", value: 12000, stage: "Qualified", region: "Ras Al Khaimah", sector: "Oil & Gas", created: "2026-06-10", priority: "High", nextFollowUp: "2026-06-22T16:00:00+04:00", purpose: "Overdue specification check", notes: ["Needs ASTM certificate"] }
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

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
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

function currentUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return sessions.get(token) || null;
}

function visibleLeads(user) {
  return user.role === "admin" ? leads : leads.filter(lead => lead.ownerId === user.id);
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

function dashboardFor(user) {
  const scopedLeads = visibleLeads(user);
  const scopedDeals = visibleDeals(user);
  const scopedTasks = visibleTasks(user);
  const totalRevenue = scopedDeals.filter(deal => deal.stage === "Won").reduce((sum, deal) => sum + money(deal.value), 0);
  const pipeline = ["New", "Contacted", "Proposal", "Won"].map(stage => {
    const stageDeals = scopedDeals.filter(deal => deal.stage === stage);
    const stageLeadFallback = scopedLeads.filter(lead => lead.stage === stage && !stageDeals.some(deal => deal.leadId === lead.id));
    const value = stageDeals.reduce((sum, deal) => sum + money(deal.value), 0) + stageLeadFallback.reduce((sum, lead) => sum + money(lead.value), 0);
    return { stage, count: stageDeals.length + stageLeadFallback.length, value };
  });
  return {
    user,
    kpis: {
      revenue: user.role === "admin" ? 248680 : Math.max(totalRevenue, 78450),
      newLeads: scopedLeads.filter(lead => lead.status === "New").length || 42,
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
  const scoped = visibleLeads(user);
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
  const scoped = visibleLeads(user);
  const byStage = Object.groupBy ? Object.groupBy(scoped, lead => lead.stage) : scoped.reduce((acc, lead) => ((acc[lead.stage] ||= []).push(lead), acc), {});
  const byRegion = scoped.reduce((acc, lead) => ((acc[lead.region] = (acc[lead.region] || 0) + 1), acc), {});
  const weightedValue = scoped.reduce((sum, lead) => sum + lead.value * (lead.score / 100), 0);
  return {
    totals: { leads: scoped.length, value: scoped.reduce((sum, lead) => sum + lead.value, 0), weightedValue: Math.round(weightedValue), avgScore: Math.round(scoped.reduce((sum, lead) => sum + lead.score, 0) / Math.max(scoped.length, 1)) },
    stages: Object.entries(byStage).map(([stage, items]) => ({ stage, count: items.length, value: items.reduce((sum, lead) => sum + lead.value, 0) })),
    regions: Object.entries(byRegion).map(([region, count]) => ({ region, count }))
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
  return {
    disabled: false,
    transcript: text || "Live Whisper endpoint ready. Send audio handling through your production upload adapter.",
    summary: "OpenAI key detected; wire multipart audio upload when deploying behind a storage adapter.",
    actions: ["Persist transcript", "Attach to lead activity"]
  };
}

async function googlePlacesSearch(query) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return {
      disabled: true,
      results: [
        { name: "Emirates Steel Fabrication LLC", address: "Al Quoz, Dubai", rating: 4.4, phone: "+971 4 555 0198", sector: "Fabricator" },
        { name: "Gulf Marine Steel Works", address: "Jebel Ali, Dubai", rating: 4.2, phone: "+971 4 555 0112", sector: "Marine" }
      ],
      reason: "GOOGLE_PLACES_API_KEY is not configured."
    };
  }
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query || "steel fabricators UAE");
  url.searchParams.set("key", key);
  const response = await fetch(url);
  const data = await response.json();
  return { disabled: false, results: (data.results || []).slice(0, 8) };
}

async function marketFeed() {
  const apiUrl = process.env.MARKET_INTELLIGENCE_API_URL;
  const key = process.env.MARKET_INTELLIGENCE_API_KEY;
  if (!apiUrl || !key) return { disabled: true, items: marketIntel, reason: "Market Intelligence API is not configured." };
  const response = await fetch(apiUrl, { headers: { Authorization: `Bearer ${key}` } });
  const data = await response.json();
  return { disabled: false, items: Array.isArray(data.items) ? data.items : data };
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
        marketIntelligence: Boolean(process.env.MARKET_INTELLIGENCE_API_URL && process.env.MARKET_INTELLIGENCE_API_KEY)
      }
    });
  }
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Authentication required." });

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    return send(res, 200, {
      user,
      users: user.role === "admin" ? users.map(({ password, ...safe }) => safe) : [],
      dashboard: dashboardFor(user),
      leads: visibleLeads(user),
      deals: visibleDeals(user),
      tasks: visibleTasks(user),
      messages,
      events: events.filter(event => user.role === "admin" || event.ownerId === user.id || event.ownerId === "u-admin"),
      reports,
      followups: followupBuckets(user),
      portfolio: portfolioAnalytics(user),
      marketIntel
    });
  }
  if (req.method === "POST" && url.pathname === "/api/leads") {
    const body = await readBody(req);
    const lead = {
      id: `l${leads.length + 1}`,
      name: body.name || "New Lead",
      company: body.company || "Unassigned Company",
      email: body.email || "",
      phone: body.phone || "",
      website: body.website || "",
      source: body.source || "Manual",
      status: body.status || "New",
      score: Number(body.score || 55),
      ownerId: user.role === "admin" ? body.ownerId || "u-sales-1" : user.id,
      value: Number(body.value || 0),
      stage: body.stage || "New",
      region: body.region || "Dubai",
      sector: body.sector || "Steel",
      created: new Date().toISOString().slice(0, 10),
      priority: body.priority || "Medium",
      nextFollowUp: body.nextFollowUp || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      purpose: body.purpose || "Initial qualification",
      notes: []
    };
    leads.unshift(lead);
    return send(res, 201, { lead });
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
  if (req.method === "GET" && url.pathname === "/api/integrations/places/search") {
    return send(res, 200, await googlePlacesSearch(url.searchParams.get("q")));
  }
  if (req.method === "GET" && url.pathname === "/api/market-intelligence") {
    const feed = await marketFeed();
    return send(res, 200, { ...feed, matchedLeadIds: visibleLeads(user).map(lead => lead.id) });
  }
  return send(res, 404, { error: "API route not found." });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => send(res, error.status || 500, { error: error.message || "Server error" }));
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Al Ras Steel Leads Tracker CRM running at http://localhost:${PORT}`);
});
