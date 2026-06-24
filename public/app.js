const state = {
  token: localStorage.getItem("arscrm:token") || "",
  user: JSON.parse(localStorage.getItem("arscrm:user") || "null"),
  route: localStorage.getItem("arscrm:route") || "dashboard",
  data: null,
  selectedLeadId: null,
  selectedMessageId: "m1",
  search: "",
  notice: "",
  showLeadForm: false,
  showLeadDetails: false,
  duplicateCandidates: [],
  placeCandidates: [],
  placeAssistMessage: "",
  aiOutput: "",
  offlineQueue: JSON.parse(localStorage.getItem("arscrm:offlineQueue") || "[]")
};

let leadNoteRecorder = null;
let leadNoteChunks = [];

const ARG_ADD_LEAD_FIELDS = [
  ["companyName", "Company name", "text", true],
  ["legalName", "Legal name", "text"],
  ["yearEstablished", "Year established", "number"],
  ["countryEmirate", "Country / Emirate", "text"],
  ["sector", "Sector", "select", true, ["Fabricator", "Contractor", "Trader", "Marine", "Piling", "Oil & Gas", "Trailer", "PEB", "Other"]],
  ["tier", "Tier", "select", true, ["1", "2", "3"]],
  ["industry", "Industry", "text"],
  ["location", "Location", "text"],
  ["address", "Address", "textarea"],
  ["contactPerson", "Contact person", "text"],
  ["primaryTitle", "Primary title", "text"],
  ["phone", "Phone", "tel"],
  ["email", "Email", "email"],
  ["secondaryContact", "Secondary contact", "text"],
  ["secondaryTitle", "Secondary title", "text"],
  ["secondaryMobile", "Secondary mobile", "tel"],
  ["secondaryEmail", "Secondary email", "email"],
  ["website", "Website", "url"],
  ["googleMapsUrl", "Google Maps URL", "url"],
  ["businessCategory", "Business category", "text"],
  ["territory", "Territory", "select", true, ["UAE-North", "UAE-South", "Saudi", "Kuwait", "Bahrain", "Oman", "Mixed"]],
  ["ownerId", "Assigned salesman", "salesman", true],
  ["stage", "Stage", "select", true, ["PROSPECT", "OUTREACH", "ENGAGED", "SAMPLING", "ACTIVE", "DORMANT"]],
  ["priority", "Priority", "select", false, ["High", "Medium", "Low"]],
  ["estimatedValue", "Estimated value", "number"],
  ["nextActionDate", "Next action date", "date"],
  ["nextActionType", "Next Action", "select", false, ["To Call", "Send Email", "Visit", "Online Meeting"]],
  ["scopeOfAction", "Scope of Action", "select", false, ["Company Introductory", "Share Quotation", "Follow Up Quotation", "Meeting for New Requirements", "Others (Any Orders, Delivery Dispute, etc)"]],
  ["firstOrderDate", "First order date", "date"],
  ["estimatedMonthlyVolume", "Est. monthly volume", "text"],
  ["productInterest", "Product interest", "text"],
  ["tags", "Tags", "text"],
  ["quotationRef", "Quotation ref", "text"],
  ["productRemarks", "Products/services remarks", "textarea"],
  ["nextAction", "Next action", "textarea"],
  ["notes", "Notes", "textarea"]
];

const AI_ACTIONS = [
  ["prepare", "Prepare Me For This Meeting"],
  ["next", "What Should I Do Next?"],
  ["email", "Draft Follow-Up Email"],
  ["summary", "Summarise This Relationship"],
  ["attention", "Flag As Needs Attention"],
  ["today", "What Should I Focus On Today?"],
  ["neglected", "Who Have I Neglected?"],
  ["intel", "Any New Intel On My Prospects?"],
  ["coaching", "Who Needs Coaching?"]
];

const bootParams = new URLSearchParams(location.search);
if (bootParams.get("view")) {
  state.route = bootParams.get("view");
}

const nav = [
  ["dashboard", "Dashboard", "▣"],
  ["leads", "Leads", "◆"],
  ["contacts", "Contacts", "●"],
  ["deals", "Deals", "▤"],
  ["tasks", "Tasks", "✓"],
  ["calendar", "Calendar", "□"],
  ["reports", "Reports", "◫"],
  ["messages", "Messages", "✉"],
  ["settings", "Settings", "⚙"]
];

const money = value => `AED ${Number(value || 0).toLocaleString()}`;
const compactMoney = value => `AED ${Number(value || 0).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}`;
const pct = value => `${Number(value || 0).toLocaleString()}%`;
const el = selector => document.querySelector(selector);
const ownerName = id => state.data?.users?.find(user => user.id === id)?.name || (id === state.user?.id ? state.user.name : "Unassigned");
const displayValue = value => {
  const text = String(value ?? "").trim();
  return text || "&mdash;";
};

function statusMeta(status) {
  const key = String(status || "").toUpperCase();
  const map = {
    PROSPECT: { label: "Prospect", tone: "active" },
    OUTREACH: { label: "Negotiation", tone: "negotiation" },
    ENGAGED: { label: "Under review", tone: "review" },
    SAMPLING: { label: "Under review", tone: "review" },
    ACTIVE: { label: "Closed won", tone: "closed" },
    DORMANT: { label: "Lost", tone: "lost" },
    NEW: { label: "Prospect", tone: "active" },
    CONTACTED: { label: "Negotiation", tone: "negotiation" },
    WON: { label: "Closed won", tone: "closed" }
  };
  return map[key] || { label: status || "Prospect", tone: "active" };
}

function statusBadge(status) {
  const meta = statusMeta(status);
  return `<span class="status-badge ${meta.tone}"><i aria-hidden="true"></i>${meta.label}</span>`;
}

function daysAgo(dateValue) {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return "No activity";
  const diff = Math.max(0, Math.round((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function displayDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime())) return "&mdash;";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function latestLeadActivity(lead) {
  return (state.data.activities || [])
    .filter(activity => activity.companyId === lead.companyId || activity.leadId === lead.id)
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0] || null;
}

function leadTable(leads, selectedId) {
  const headings = [
    "DATE CREATED",
    "COMPANY NAME OF LEAD",
    "CONTACT PERSON",
    "CONTACT NUMBER",
    "SECTOR",
    "LOCATION",
    "LAST ACTIVITY DATE",
    "ACTIVITY DESCRIPTION",
    "NEXT ACTION"
  ];
  const emptyRow = `<tr><td colspan="${headings.length}" class="empty-cell">No registered leads yet.</td></tr>`;
  const rows = leads.length ? leads.map(lead => {
    const activity = latestLeadActivity(lead);
    return `<tr class="${selectedId === lead.id ? "selected" : ""}">
      <td>${displayDate(lead.created)}</td>
      <td class="company-cell"><button class="lead-link" data-open-lead="${lead.id}">${displayValue(lead.companyName || lead.company)}</button></td>
      <td>${displayValue(lead.contactPerson || lead.name)}</td>
      <td>${displayValue(lead.phone)}</td>
      <td>${displayValue(lead.sector)}</td>
      <td>${displayValue(lead.location || lead.territory || lead.countryEmirate)}</td>
      <td>${displayDate(activity?.at || lead.lastActivityDate)}</td>
      <td>${displayValue(activity?.notes || activity?.type)}</td>
      <td>${displayValue(lead.nextAction || lead.nextActionDate)}</td>
    </tr>`;
  }).join("") : emptyRow;
  return `<div class="lead-table-wrap"><table class="leads-table">
    <thead><tr>${headings.map(label => `<th>${label}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function leadCard(lead, selected) {
  return `<article class="lead-card ${selected ? "selected" : ""}" data-lead-id="${lead.id}">
    <div class="lead-card-header">
      <strong>${lead.companyName || lead.company}</strong>
      ${statusBadge(lead.status)}
    </div>
    <p class="lead-contact">Contact: ${lead.contactPerson || lead.name || "Not set"}</p>
    <p class="lead-product">${lead.productInterest || lead.sector || "Structural steel"}</p>
    <div class="lead-meta">
      <div><span>Last contact:</span><b>${daysAgo(lead.lastActivityDate)}</b></div>
      <div><span>Estimated value:</span><b>${money(lead.estimatedValue || lead.value)}</b></div>
      <div><span>Owner:</span><b>${ownerName(lead.ownerId)}</b></div>
    </div>
    <div class="lead-card-actions"><button>Call</button><button>Schedule</button></div>
  </article>`;
}

function activityTimeline(activities) {
  const items = (activities || []).slice(0, 6);
  if (!items.length) return `<p class="muted">No activity yet.</p>`;
  return `<div class="activity-timeline">${items.map(activity => {
    const type = String(activity.type || "note").toLowerCase();
    const tone = type.includes("email") ? "email" : type.includes("note") ? "note" : "call";
    return `<article class="timeline-item ${tone}">
      <span class="timeline-dot"></span>
      <time>${daysAgo(activity.at)} · ${new Date(activity.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      <strong>${activity.type}</strong>
      <p>${activity.notes || "No notes"}</p>
    </article>`;
  }).join("")}</div>`;
}

function leadDetailsContent(selected) {
  if (!selected) return "";
  return `<div class="profile-hero"><span class="big-avatar health-${String(selected.relationshipHealth || "AMBER").toLowerCase()}"></span><div><h2>${selected.companyName}</h2><p>${selected.companyId} Â· ${selected.sector} Â· ${selected.territory}</p>${statusBadge(selected.status)}</div></div>
    <div class="button-row"><button>Call</button><button>Email</button><button data-route="messages">Message</button><button>Schedule</button><button data-delete-lead="${selected.id}">Request Delete</button></div>
    <dl>${[["Primary Contact", selected.contactPerson], ["Title", selected.primaryTitle], ["Email", selected.email], ["Phone", selected.phone], ["Legal Name", selected.legalName], ["Country / Emirate", selected.countryEmirate], ["Tier", selected.tier], ["Website", selected.website], ["Owner", ownerName(selected.ownerId)]].map(([key, value]) => `<dt>${key}</dt><dd>${displayValue(value)}</dd>`).join("")}</dl>
    <div class="score"><span>Relationship Health</span><strong>${selected.relationshipHealth} Â· ${selected.healthScore}/100</strong><i style="width:${selected.healthScore}%"></i><p>${selected.healthReason}</p></div>
    <section class="ai-actions">${AI_ACTIONS.slice(0, state.user.role === "admin" ? 9 : 8).map(([id, label]) => `<button data-ai-action="${id}">${label}</button>`).join("")}</section>
    ${state.aiOutput ? `<div class="ai-output">${state.aiOutput.replace(/\n/g, "<br>")}</div>` : ""}
    <h3>Append-Only Activity</h3>
    <form id="activityForm" class="mini-form"><select name="type">${["Phone Call", "Email", "In-Person Meeting", "Site Visit", "Video Call", "Quotation Sent", "Order Placed"].map(type => `<option>${type}</option>`).join("")}</select><input name="quotationRef" placeholder="Quotation ref"><textarea name="notes" placeholder="Activity notes" required></textarea><button>Log Activity</button></form>
    <h3>Structured PMR</h3>
    <form id="pmrForm" class="mini-form"><input name="meetingDate" type="date" required><input name="productsDiscussed" placeholder="Products discussed"><input name="competitorsMentioned" placeholder="Competitors mentioned"><input name="complianceRequirements" placeholder="ISO, ICV, DNV..."><select name="relationshipHeatScore">${[1,2,3,4,5].map(n => `<option>${n}</option>`).join("")}</select><select name="directorActionRequired">${["None", "Awareness only", "Attend next visit", "Direct contact"].map(x => `<option>${x}</option>`).join("")}</select><textarea name="notes" placeholder="PMR notes"></textarea><button>Save PMR</button></form>
    <h3>Recent Activity</h3>${activityTimeline((state.data.activities || []).filter(activity => activity.companyId === selected.companyId))}`;
}

function renderLeadDetailsModal() {
  const selected = state.data.leads.find(lead => lead.id === state.selectedLeadId);
  if (!selected) return "";
  return `<div class="modal-backdrop lead-details-backdrop">
    <article class="modal lead-details-modal profile-card">
      <button class="modal-close" type="button" data-close-lead-details aria-label="Close lead details">&times;</button>
      ${leadDetailsContent(selected)}
    </article>
  </div>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function downloadExport(type) {
  const path = type === "pdf" ? "/api/export/leads.pdf" : "/api/export/leads.csv";
  const response = await fetch(path, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Export failed");
  }
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = type === "pdf" ? "al-ras-steel-leads.pdf" : "al-ras-steel-leads.csv";
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

async function login(email, password) {
  const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  state.token = result.token;
  state.user = result.user;
  localStorage.setItem("arscrm:token", state.token);
  localStorage.setItem("arscrm:user", JSON.stringify(state.user));
  await bootstrap();
}

async function bootstrap() {
  if (!state.token) return renderLogin();
  try {
    state.data = await api("/api/bootstrap");
    state.selectedLeadId ||= state.data.leads[0]?.id;
    render();
  } catch (error) {
    localStorage.removeItem("arscrm:token");
    localStorage.removeItem("arscrm:user");
    state.token = "";
    state.user = null;
    renderLogin(error.message);
  }
}

function setRoute(route) {
  state.route = route;
  localStorage.setItem("arscrm:route", route);
  render();
}

function filtered(items, fields) {
  const q = state.search.trim().toLowerCase();
  if (!q) return items;
  return items.filter(item => fields.some(field => String(item[field] || "").toLowerCase().includes(q)));
}

function renderLogin(error = "") {
  document.body.className = "login-body";
  el("#app").innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-row"><span class="brand-dot"></span><strong>Al Ras Steel CRM</strong></div>
        <h1>Leads Tracker</h1>
        <p>Full-stack CRM workspace for steel leads, deals, follow-ups, AI transcription, Google Places discovery, and market intelligence.</p>
        <form id="loginForm" class="login-form">
          <label>Email or username <input name="email" value="glory@alrassteel.com" autocomplete="username"></label>
          <label>Password <input name="password" type="password" value="glory12345" autocomplete="current-password"></label>
          ${error ? `<div class="error">${error}</div>` : ""}
          <button class="primary" type="submit">Sign In</button>
        </form>
        <div class="login-hints">
          <span>Admin: glory@alrassteel.com / glory12345</span>
          <span>Salesman accounts must be created by the admin first.</span>
        </div>
      </section>
    </main>
  `;
  el("#loginForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login(form.get("email"), form.get("password")).catch(err => renderLogin(err.message));
  });
}

function render() {
  document.body.className = "";
  const page = pages[state.route] || pages.dashboard;
  el("#app").innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="workspace">
        ${topbar(page.title, page.subtitle, page.action)}
        ${state.notice ? `<div class="notice">${state.notice}</div>` : ""}
        ${page.render()}
      </main>
    </div>
    ${state.showLeadForm ? renderLeadFormModal() : ""}
    ${state.showLeadDetails ? renderLeadDetailsModal() : ""}
  `;
  bindCommon();
  page.bind?.();
}

function sidebar() {
  return `
    <aside class="sidebar">
      <div class="logo"><span class="brand-dot"></span><strong>DealCRM</strong><small>${state.user.role}</small></div>
      <nav>
        ${nav.map(([id, label, icon]) => `
          <button class="${state.route === id ? "active" : ""}" data-route="${id}" title="${label}">
            <span class="nav-icon">${icon}</span><span>${label}</span>${id === "messages" ? `<b>${state.data.messages.filter(m => m.unread).length}</b>` : ""}
          </button>
        `).join("")}
      </nav>
      <div class="upgrade">
        <h3>AI CRM Suite</h3>
        <p>Whisper notes, lead scoring, reports, and market alerts.</p>
        <button data-ai-demo>Run AI Demo</button>
      </div>
    </aside>
  `;
}

function topbar(title, subtitle, action) {
  const alertCount = state.user.role === "admin" ? (state.data.deletionRequests || []).length : 4;
  return `
    <header class="topbar">
      <div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="top-actions">
        <input id="globalSearch" placeholder="Search leads, customers, deals..." value="${state.search}">
        ${state.user.role === "admin" ? `<div class="export-group"><span>Export Leads</span><button class="export-btn" data-export="csv">Excel</button><button class="export-btn" data-export="pdf">PDF</button></div>` : ""}
        <button class="icon-btn" title="Notifications">⌁<b>${alertCount}</b></button>
        <div class="profile"><span class="avatar"></span><strong>${state.user.name}</strong><small>${state.user.title}</small></div>
        ${action ? `<button class="primary" data-action="${action.id}">${action.label}</button>` : ""}
      </div>
    </header>
  `;
}

function bindCommon() {
  document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => setRoute(button.dataset.route)));
  el("#globalSearch")?.addEventListener("input", event => {
    state.search = event.target.value;
    render();
  });
  document.querySelector("[data-ai-demo]")?.addEventListener("click", runAiDemo);
  document.querySelector("[data-action='new-lead']")?.addEventListener("click", addLead);
  document.querySelectorAll("[data-export]").forEach(button => button.addEventListener("click", () => {
    downloadExport(button.dataset.export).catch(error => {
      state.notice = error.message;
      render();
    });
  }));
  document.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    state.showLeadForm = false;
    state.duplicateCandidates = [];
    state.placeCandidates = [];
    state.placeAssistMessage = "";
    render();
  });
  document.querySelector("[data-close-lead-details]")?.addEventListener("click", () => {
    state.showLeadDetails = false;
    state.aiOutput = "";
    render();
  });
  document.querySelector("#leadForm")?.addEventListener("submit", saveLeadForm);
  document.querySelector("#companyNameInput")?.addEventListener("input", debounce(checkDuplicateLead, 300));
  document.querySelectorAll("[data-ai-action]").forEach(button => button.addEventListener("click", () => runRelationshipAction(button.dataset.aiAction)));
  document.querySelector("#activityForm")?.addEventListener("submit", saveActivity);
  document.querySelector("#pmrForm")?.addEventListener("submit", savePmr);
  document.querySelector("#salesmanForm")?.addEventListener("submit", saveSalesmanForm);
  document.querySelector("[data-action='logout']")?.addEventListener("click", () => {
    localStorage.clear();
    location.reload();
  });
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function kpiCards(cards) {
  return `<section class="kpi-grid">${cards.map((card, index) => `
    <article class="kpi-card">
      <strong>${card.value}</strong>
      <small>${card.label}</small>
      <em>${card.delta ? `up ${card.delta}` : ""}</em>
    </article>
  `).join("")}</section>`;
}

function table(headers, rows, empty = "No records") {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(head => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">${empty}</td></tr>`}</tbody></table></div>`;
}

function lineChart(values, options = {}) {
  const showAxis = Boolean(options.xLabel || options.yLabel || options.xLabels);
  if (!showAxis) {
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => `${index * 58 + 14},${150 - (value / max) * 120}`).join(" ");
    return `<svg class="line-chart" viewBox="0 0 440 170" role="img" aria-label="Revenue trend">
      ${[30, 65, 100, 135].map(y => `<line x1="0" x2="440" y1="${y}" y2="${y}"></line>`).join("")}
      <polyline points="${points}"></polyline>
      ${points.split(" ").map(point => `<circle cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="4"></circle>`).join("")}
    </svg>`;
  }
  const max = Math.max(...values, 1);
  const xLabels = options.xLabels || values.map((_, index) => `P${index + 1}`);
  const yLabel = options.yLabel || "Value";
  const xLabel = options.xLabel || "Period";
  const title = options.title || "Trend chart";
  const plot = { left: 54, right: 426, top: 26, bottom: 142 };
  const points = values.map((value, index) => {
    const x = plot.left + (index / Math.max(values.length - 1, 1)) * (plot.right - plot.left);
    const y = plot.bottom - (value / max) * (plot.bottom - plot.top);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const ticks = [0, .33, .66, 1].map(ratio => {
    const y = plot.bottom - ratio * (plot.bottom - plot.top);
    const value = Math.round(max * ratio);
    return `<g class="axis-tick"><line x1="${plot.left}" x2="${plot.right}" y1="${y}" y2="${y}"></line><text x="${plot.left - 10}" y="${y + 4}" text-anchor="end">${value}</text></g>`;
  }).join("");
  return `<svg class="line-chart axis-chart" viewBox="0 0 460 190" role="img" aria-label="${title}">
    <text class="axis-title y-axis-title" x="14" y="88" transform="rotate(-90 14 88)">${yLabel}</text>
    <text class="axis-title x-axis-title" x="240" y="184" text-anchor="middle">${xLabel}</text>
    ${ticks}
    <line class="axis-line" x1="${plot.left}" x2="${plot.left}" y1="${plot.top}" y2="${plot.bottom}"></line>
    <line class="axis-line" x1="${plot.left}" x2="${plot.right}" y1="${plot.bottom}" y2="${plot.bottom}"></line>
    <polyline points="${points}"></polyline>
    ${points.split(" ").map(point => `<circle cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="4"></circle>`).join("")}
    ${xLabels.map((label, index) => {
      const x = plot.left + (index / Math.max(xLabels.length - 1, 1)) * (plot.right - plot.left);
      return `<text class="axis-label" x="${x}" y="${plot.bottom + 20}" text-anchor="middle">${label}</text>`;
    }).join("")}
  </svg>`;
}

function barChart(items, options = {}) {
  const showAxis = Boolean(options.xLabel || options.yLabel);
  const max = Math.max(...items.map(item => item.value || item.count), 1);
  if (!showAxis) {
    return `<div class="bar-chart simple-bar-chart">${items.map(item => `
      <div><span style="height:${Math.max(18, ((item.value || item.count) / max) * 180)}px"></span><small>${item.label}</small></div>
    `).join("")}</div>`;
  }
  const yLabel = options.yLabel || "Value";
  const xLabel = options.xLabel || "Category";
  return `<div class="bar-chart axis-bar-chart" role="img" aria-label="${options.title || "Bar chart"}">
    <span class="bar-y-title">${yLabel}</span>
    <span class="bar-x-title">${xLabel}</span>
    <div class="bar-y-labels"><b>${max}</b><b>${Math.round(max / 2)}</b><b>0</b></div>
    <div class="bar-plot">${items.map(item => `
      <div><span style="height:${Math.max(18, ((item.value || item.count) / max) * 166)}px"></span><small>${item.label}</small></div>
    `).join("")}</div>
  </div>`;
}

function dashboardCards() {
  const d = state.data.dashboard;
  const admin = state.user.role === "admin";
  return kpiCards([
    { label: admin ? "Total Revenue" : "Monthly Sales", value: money(d.kpis.revenue), delta: "" },
    { label: "New Leads", value: d.kpis.newLeads, delta: "" },
    { label: admin ? "Opportunities" : "Quota Progress", value: admin ? d.kpis.opportunities : "0%", delta: "" },
    { label: admin ? "Win Rate" : "Conversion", value: pct(d.kpis.winRate), delta: "" },
    { label: "Active Salesmen", value: d.kpis.activeSalesmen, delta: "" }
  ]);
}

function formatNewsDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" }); }
  catch { return ""; }
}

function dashboardNewsStrip() {
  const feed = state.data.industryNews || { articles: [] };
  const articles = (feed.articles || []).slice(0, 7);
  if (!articles.length) return "";
  return `<section class="industry-news">
    <div class="panel-head"><div><h2>Industry News Radar</h2><p>Construction, metals, oil & gas, metal fabrication, and EPC signals for today.</p></div><span>${feed.disabled ? "Fallback" : "Live News API"}</span></div>
    <div class="news-grid">${articles.map(article => `<a class="news-card" href="${article.url || "#"}" target="_blank" rel="noopener">
      <small>${article.category || article.source || "Industry"} · ${formatNewsDate(article.publishedAt)}</small>
      <b>${article.title}</b>
      <span>${article.source || "News API"}</span>
    </a>`).join("")}</div>
  </section>`;
}

function weeklySalesReportPanel() {
  const report = state.data.weeklyReport;
  if (!report) return "";
  const blockerList = report.blockers?.length ? report.blockers.map(item => `<li>${item}</li>`).join("") : "<li>No blockers. Ready for digital sign-off.</li>";
  return `<article class="panel full weekly-report">
    <div class="panel-head">
      <div><h2>Weekly Sales Report Gate</h2><p>Live-data weekly reporting discipline from ARG-IT-SPEC-WSR-001.</p></div>
      <span class="report-state">${report.state}</span>
    </div>
    <div class="report-meter"><strong>${report.completion}% complete</strong><i style="--w:${report.completion}%"></i><span>${report.blockers.length} blockers</span></div>
    <section class="report-block-grid">
      <div><b>A · Rep & Week</b><p>${report.rep} · Week ending ${report.weekEnding} · ${report.branch}</p><small>Auto-filled from login. No manual entry.</small></div>
      <div><b>B · Secured Orders</b><p>${report.securedOrders.length ? report.securedOrders.map(order => `${order.account} ${money(order.value)}`).join(", ") : "No secured orders this week."}</p><small>ERP-owned facts shown as read-only context.</small></div>
      <div><b>C · Pipeline Confirmation</b><p>${report.pipelineConfirmations.map(item => `${item.account}: ${item.likelihood}`).join(", ") || "No opportunities to confirm."}</p><small>Likelihood, timing, and risk notes confirmed in place.</small></div>
      <div><b>D · Problematic Accounts</b><p>${report.flaggedAccounts.map(item => item.companyName).join(", ") || "No system flags."}</p><small>Every flagged account needs report-or-dismiss disposition.</small></div>
      <div><b>E · Market Intelligence Overlay</b><p>Demand: ${report.marketOverlay.demand}; Pricing: ${report.marketOverlay.pricing}; Credit: ${report.marketOverlay.creditClimate}</p><small>Forced-choice scales feed aggregate indices.</small></div>
      <div><b>F · Completeness & Sign-Off</b><ul>${blockerList}</ul><button disabled>${report.blockers.length ? "Submit locked" : "Ready to sign"}</button></div>
    </section>
    ${report.directorQueue ? `<section class="director-queue"><b>Director Review Queue</b><p>Missing reports: ${report.directorQueue.missingReports.join(", ") || "none"}</p><p>Contradictions: ${report.directorQueue.contradictionFlags.join("; ") || "none"}</p></section>` : ""}
  </article>`;
}

function deletionApprovalPanel() {
  const requests = state.data.deletionRequests || [];
  if (state.user.role !== "admin" || !requests.length) return "";
  return `<article class="panel full approval-panel">
    <div class="panel-head"><div><h2>Lead Deletion Approvals</h2><p>Salesman deletion requests require admin password approval.</p></div><span>${requests.length} pending</span></div>
    <div class="approval-list">${requests.map(request => `<section>
      <div><b>${request.companyName}</b><p>${request.reason}</p><small>Requested by ${request.requestedByName} · ${new Date(request.requestedAt).toLocaleString()}</small></div>
      <div><button data-approve-delete="${request.id}">Approve</button><button data-reject-delete="${request.id}">Reject</button></div>
    </section>`).join("")}</div>
  </article>`;
}

function salesmanAccountForm() {
  if (state.user.role !== "admin") return "";
  return `<form id="salesmanForm" class="user-create-form">
    <h2>Create Salesman Account</h2>
    <p>Only the admin account can create individual salesman logins.</p>
    <div>
      <label>Name <input name="name" required></label>
      <label>Username <input name="username" autocomplete="username" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Password <input name="password" type="password" minlength="8" required></label>
      <label>Territory <select name="territory">${["UAE-North", "UAE-South", "Saudi", "Kuwait", "Bahrain", "Oman", "Mixed"].map(item => `<option>${item}</option>`).join("")}</select></label>
    </div>
    <button class="primary" type="submit">Create Salesman</button>
  </form>`;
}

const pages = {
  dashboard: {
    title: () => state.user?.role === "admin" ? "CRM Admin Dashboard" : "My Sales Dashboard",
    get subtitle() { return state.user?.role === "admin" ? "Complete overview of revenue, teams, leads, deals, and customer pipeline." : "Personal leads, quota progress, today schedule, and follow-up priorities."; },
    get action() { return { id: "new-lead", label: "+ New Lead" }; },
    render() {
      const d = state.data.dashboard;
      const isAdmin = state.user.role === "admin";
      const quotaPct = d.kpis.revenue > 0 ? Math.min(100, Math.round((d.kpis.revenue / 115000) * 100)) : 0;
      const quotaRemaining = Math.max(0, 115000 - d.kpis.revenue);
      const salesOverviewCard = `<article class="panel sales-overview ${isAdmin ? "compact-chart" : "wide"}"><h2>${isAdmin ? "Sales Overview" : "My Sales Performance"}</h2><div class="metric-line"><strong>${money(d.kpis.revenue)}</strong><em>${d.kpis.revenue ? "live total" : "no revenue yet"}</em></div>${lineChart(d.salesTrend)}</article>`;
      const pipelineCard = `<article class="panel pipeline ${isAdmin ? "wide" : ""}"><h2>${isAdmin ? "Customer Pipeline" : "My Pipeline"}</h2><div class="pipeline-row">${d.pipeline.map(stage => `<div><b class="${stage.stage.toLowerCase()}">${statusMeta(stage.stage).label}</b><strong>${money(stage.value)}</strong><small>${stage.count} accounts</small><button data-route="deals">View Deals</button></div>`).join("")}</div></article>`;
      const quotaCard = `<article class="panel donut-panel"><h2>Quota Progress</h2><div class="donut" style="--pct:${quotaPct}"><strong>${quotaPct}%</strong><span>of ${compactMoney(115000)}</span></div><footer><b>${money(d.kpis.revenue)} achieved</b><span>${money(quotaRemaining)} to go</span></footer></article>`;
      const primaryCards = isAdmin ? `${pipelineCard}${quotaCard}${salesOverviewCard}` : `${salesOverviewCard}${quotaCard}${pipelineCard}`;
      return `
        ${dashboardNewsStrip()}
        ${deletionApprovalPanel()}
        ${dashboardCards()}
        <section class="dashboard-grid">
          ${primaryCards}
          <article class="panel">${table(["Time", "Activity"], d.schedule.map(event => `<tr><td><b>${event.time}</b></td><td>${event.meeting}</td></tr>`))}</article>
          <article class="panel">${table(["Opportunity", "Value", "Stage"], state.data.deals.slice(0, 5).map(deal => `<tr><td><b>${deal.title}</b></td><td>${money(deal.value)}</td><td>${deal.stage}</td></tr>`))}</article>
          <article class="panel">${table(["Task", "Due"], d.tasks.map(task => `<tr><td><b>${task.title}</b></td><td>${task.due}</td></tr>`))}</article>
        </section>
        ${followupSection()}
        ${portfolioSection()}
      `;
    }
  },
  leads: {
    title: "My Leads Panel",
    subtitle: "Manage assigned leads, filter by status, and open a full customer activity profile.",
    action: { id: "new-lead", label: "+ Add Lead" },
    render() {
      const leads = filtered(state.data.leads, ["name", "company", "companyName", "contactPerson", "phone", "sector", "location", "territory", "countryEmirate", "status", "source", "nextAction"]);
      return `<section class="lead-table-page">
        <article class="panel leads-list">
          <div class="panel-head"><h2>Leads List</h2><button>View All</button></div>
          ${leadTable(leads, state.showLeadDetails ? state.selectedLeadId : null)}
        </article>
      </section>`;
    },
    bind() {}
  },
  contacts: {
    title: "Contacts",
    subtitle: "Customer contacts converted from Al Ras Steel lead activity.",
    action: { id: "new-lead", label: "+ New Contact" },
    render() {
      return `<article class="panel full">${table(["Name", "Company", "Email", "Phone", "Owner"], filtered(state.data.leads, ["name", "company", "email"]).map(lead => `<tr><td><b>${lead.name}</b></td><td>${lead.company}</td><td>${lead.email}</td><td>${lead.phone}</td><td>${ownerName(lead.ownerId)}</td></tr>`))}</article>`;
    }
  },
  deals: {
    title: "Deals Pipeline",
    subtitle: "Track opportunities, deal value, stages, owners, and close probability.",
    action: { id: "new-lead", label: "+ New Deal" },
    render() {
      const stageGroups = [
        { title: "Prospect", statuses: ["PROSPECT", "New"] },
        { title: "Negotiation", statuses: ["OUTREACH", "Contacted"] },
        { title: "Under Review", statuses: ["ENGAGED", "SAMPLING", "Proposal"] },
        { title: "Closed Won", statuses: ["ACTIVE", "Won"] }
      ];
      return `${kpiCards([
        { label: "Open Deals", value: state.data.deals.length, delta: "8.2%" },
        { label: "Pipeline Value", value: money(state.data.deals.reduce((sum, deal) => sum + deal.value, 0)), delta: "13.8%" },
        { label: "Won Deals", value: state.data.deals.filter(deal => deal.stage === "Won").length, delta: "15.3%" },
        { label: "Avg. Deal Size", value: money(12600), delta: "5.9%" }
      ])}
      <article class="panel full"><h2>Kanban Deal Board</h2><div class="kanban">${stageGroups.map(group => {
        const items = state.data.deals.filter(deal => group.statuses.includes(deal.stage)).concat(state.data.leads.filter(lead => group.statuses.includes(lead.status) || group.statuses.includes(lead.stage)).slice(0, 3));
        return `<section><header><h3>${group.title}</h3><span>${items.length}</span></header>${items.map(item => `<div class="deal-card"><b>${item.title || item.companyName || item.company}</b><span>${money(item.value || item.estimatedValue)}</span></div>`).join("")}</section>`;
      }).join("")}</div></article>
      <section class="two-col"><article class="panel">${table(["Deal", "Company", "Stage", "Close", "Value"], state.data.deals.map(deal => `<tr><td><b>${deal.title}</b></td><td>${deal.company}</td><td>${deal.stage}</td><td>${deal.close}</td><td>${money(deal.value)}</td></tr>`))}</article><article class="panel"><h2>Deal Value Trend</h2><strong class="large">${money(482000)}</strong>${lineChart([20, 36, 30, 62, 48, 78, 55])}</article></section>`;
    }
  },
  tasks: {
    title: "Tasks",
    subtitle: "Plan daily activities, follow-ups, demos, calls, proposals, and reminders.",
    action: { id: "new-lead", label: "+ Add Task" },
    render() {
      const counts = ["High", "Medium", "Low"].reduce((acc, key) => ({ ...acc, [key]: state.data.tasks.filter(task => task.priority === key).length }), {});
      const totalTasks = state.data.tasks.length;
      const dueToday = state.data.tasks.filter(task => task.due === "Today").length;
      const completed = state.data.tasks.filter(task => task.status === "Done").length;
      const overdue = state.data.tasks.filter(task => task.status === "Overdue").length;
      return `${kpiCards([
        { label: "Total Tasks", value: totalTasks, delta: "" },
        { label: "Due Today", value: dueToday, delta: "" },
        { label: "Completed", value: completed, delta: "" },
        { label: "Overdue", value: overdue, delta: "" }
      ])}${weeklySalesReportPanel()}<section class="two-col strong-left"><article class="panel">${table(["Task", "Related To", "Priority", "Due", "Status"], state.data.tasks.map(task => `<tr><td><b>${task.title}</b></td><td>${task.relatedTo}</td><td>${task.priority}</td><td>${task.due}</td><td>${task.status}</td></tr>`))}</article><div class="stack"><article class="panel"><h2>Priority Breakdown</h2>${Object.entries(counts).map(([key, value], index) => `<div class="progress-row"><b>${key}</b><i class="tone-${index}" style="--w:${value * 2}%"></i><span>${value}</span></div>`).join("")}</article><article class="panel">${table(["Reminder", "Time"], state.data.tasks.slice(0, 4).map(task => `<tr><td><b>${task.title}</b></td><td>${task.due}</td></tr>`), "No reminders")}</article></div></section>`;
    }
  },
  calendar: {
    title: "Calendar",
    subtitle: "View meetings, demos, calls, follow-ups, and weekly sales schedule.",
    action: { id: "new-lead", label: "+ New Event" },
    render() {
      const marked = state.data.events.map(event => Number(String(event.date || event.day || "").slice(-2))).filter(Boolean);
      const eventsToday = state.data.events.length;
      return `${kpiCards([
        { label: "Events Today", value: eventsToday, delta: "" },
        { label: "Demos", value: state.data.events.filter(event => event.type === "Demo").length, delta: "" },
        { label: "Calls", value: state.data.events.filter(event => event.type === "Call").length, delta: "" },
        { label: "Follow-ups", value: state.data.events.filter(event => event.type === "Follow-up").length, delta: "" }
      ])}<section class="two-col strong-left"><article class="panel calendar"><h2>June 2026</h2><div class="weekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<b>${day}</b>`).join("")}</div><div class="days">${Array.from({ length: 30 }, (_, i) => `<button><span>${i + 1}</span>${marked.includes(i + 1) ? "<i></i>" : ""}</button>`).join("")}</div></article><article class="panel">${table(["Time", "Meeting", "Type"], state.data.events.map(event => `<tr><td><b>${event.time}</b></td><td>${event.meeting}</td><td>${event.type}</td></tr>`))}</article></section>`;
    }
  },
  reports: {
    title: "Reports & Analytics",
    subtitle: "Analyze revenue, sales performance, conversion, sources, and team productivity.",
    action: { id: "export", label: "Export Report" },
    render() {
      const leadSources = [
        { label: "Manual", value: state.data.leads.filter(lead => lead.source === "Manual").length },
        { label: "Google", value: state.data.leads.filter(lead => String(lead.source || "").includes("Google")).length },
        { label: "Website", value: state.data.leads.filter(lead => lead.source === "Website").length },
        { label: "Other", value: state.data.leads.filter(lead => lead.source && lead.source !== "Manual" && lead.source !== "Website" && !String(lead.source).includes("Google")).length }
      ];
      const rankingRows = state.data.users.filter(user => user.role !== "admin").map(user => {
        const ownedDeals = state.data.deals.filter(deal => deal.ownerId === user.id);
        const won = ownedDeals.filter(deal => deal.stage === "Won");
        const revenue = won.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
        const winRate = ownedDeals.length ? `${Math.round((won.length / ownedDeals.length) * 100)}%` : "0%";
        return `<tr><td><b>${user.name}</b></td><td>${ownedDeals.length}</td><td>${money(revenue)}</td><td>${winRate}</td></tr>`;
      });
      return `<section class="reports-view">${kpiCards([
        { label: "Revenue", value: compactMoney(state.data.dashboard.kpis.revenue), delta: "" },
        { label: "Conversion", value: pct(state.data.dashboard.kpis.winRate), delta: "" },
        { label: "Lead Sources", value: leadSources.filter(source => source.value > 0).length, delta: "" },
        { label: "Team Activity", value: state.data.activities.length, delta: "" }
      ])}<section class="two-col"><article class="panel chart-panel"><h2>Revenue Performance</h2><strong class="large">${money(state.data.dashboard.kpis.revenue)}</strong>${lineChart(state.data.dashboard.salesTrend, { title: "Monthly revenue performance", xLabel: "Month", yLabel: "Revenue (AED k)", xLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"] })}</article><article class="panel chart-panel"><h2>Lead Source Breakdown</h2>${barChart(leadSources, { title: "Lead source count by source", xLabel: "Source", yLabel: "Lead count" })}</article></section><section class="two-col"><article class="panel">${table(["Name", "Deals", "Revenue", "Win Rate"], rankingRows, "Create salesman accounts to populate ranking")}</article><article class="panel">${table(["Report", "Owner", "Updated", "Status"], state.data.reports.map(report => `<tr><td><b>${report.report}</b></td><td>${report.owner}</td><td>${report.updated}</td><td>${report.status}</td></tr>`), "No reports generated yet")}</article></section></section>`;
    }
  },
  messages: {
    title: "Messages",
    subtitle: "Review client conversations, team chats, email threads, and lead notes.",
    action: { id: "message", label: "New Message" },
    render() {
      const selected = state.data.messages.find(message => message.id === state.selectedMessageId) || state.data.messages[0];
      return `${kpiCards([
        { label: "Unread", value: state.data.messages.filter(m => m.unread).length, delta: "" },
        { label: "Client Chats", value: state.data.messages.filter(m => m.company !== "Internal").length, delta: "" },
        { label: "Team Threads", value: state.data.messages.filter(m => m.company === "Internal").length, delta: "" },
        { label: "Response Rate", value: "0%", delta: "" }
      ])}<section class="split-view messages-view"><article class="panel">${table(["Sender", "Subject", "Time"], state.data.messages.map(message => `<tr data-message-id="${message.id}" class="${selected?.id === message.id ? "selected" : ""}"><td><b>${message.sender}</b></td><td>${message.subject}</td><td>${message.time}</td></tr>`), "No messages yet")}</article><article class="panel chat">${selected ? `<h2>${selected.sender}</h2><p>${selected.company} · ${selected.subject}</p><div class="bubble">${selected.body[0]}</div><input placeholder="Write a message...">` : "<h2>No conversation selected</h2><p>Create leads and conversations to populate this workspace.</p>"}</article></section>`;
    },
    bind() {
      document.querySelectorAll("[data-message-id]").forEach(row => row.addEventListener("click", () => {
        state.selectedMessageId = row.dataset.messageId;
        render();
      }));
    }
  },
  settings: {
    title: "Settings",
    subtitle: "Configure profile, workspace, permissions, automation, notifications, and integrations.",
    action: { id: "logout", label: "Sign Out" },
    render() {
      return `${kpiCards([
        { label: "Users", value: state.user.role === "admin" ? state.data.users.length : 1, delta: "" },
        { label: "Roles", value: 2, delta: "" },
        { label: "Automations", value: 0, delta: "" },
        { label: "Integrations", value: state.data.meta?.supabase?.configured ? 1 : 0, delta: "" }
      ])}<section class="settings-grid"><article class="panel menu"><h2>Settings Menu</h2>${["Profile", "Workspace", "Users & Roles", "Notifications", "Integrations", "Security", "Billing"].map((item, index) => `<button class="${index === 2 ? "active" : ""}">${item}</button>`).join("")}</article><article class="panel"><h2>Users & Roles</h2><p>Manage director and salesman access permissions by territory.</p>${salesmanAccountForm()}${table(["User", "Username", "Role", "Territory", "Access", "Status"], (state.data.users.length ? state.data.users : [state.user]).map(user => `<tr><td><b>${user.name}</b></td><td>${user.username || "—"}</td><td>${user.title || user.role}</td><td>${user.territory || "Mixed"}</td><td>${user.access}</td><td>${user.status}</td></tr>`))}<h2>Permission Controls</h2>${["Can export reports", "Can assign leads", "Can request lead deletion", "Can edit automation"].map((item, index) => `<label class="switch-row"><b>${item}</b><input type="checkbox" ${index < 2 ? "checked" : ""}><span></span></label>`).join("")}</article></section>${integrationPanel()}${state.data.configAudit?.length ? `<article class="panel full">${table(["Change", "Parameter", "Previous", "New", "Confirmed"], state.data.configAudit.map(change => `<tr><td><b>${change.change_id}</b></td><td>${change.parameter_changed}</td><td>${change.previous_value}</td><td>${change.new_value}</td><td>${change.confirmation_given ? "Yes" : "No"}</td></tr>`))}</article>` : ""}`;
    }
  }
};

function followupSection() {
  const buckets = state.data.followups;
  return `<article class="panel full followups"><div class="panel-head"><h2>Due Follow-Up Breakdown</h2><button data-route="tasks">Open Tasks</button></div><div class="bucket-grid">${Object.entries(buckets).map(([name, items]) => `<section><h3>${name}</h3>${items.length ? items.map(item => `<div class="follow-card"><b>${item.leadName}</b><span>${item.company}</span><small>${item.stage} · ${new Date(item.due).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small><p>${item.purpose}</p><em>${item.priority}</em><div><button data-open-lead="${item.leadId}">Open Lead</button><button data-complete="${item.leadId}">Complete</button><button>Reschedule</button><button>Add Note</button></div></div>`).join("") : "<p class='muted'>No due follow-ups.</p>"}</section>`).join("")}</div></article>`;
}

function portfolioSection() {
  const p = state.data.portfolio;
  return `<article class="panel full portfolio"><div class="panel-head"><h2>Lead Portfolio Analytics</h2><button data-market-refresh>Refresh Intel</button></div><div class="portfolio-grid"><div class="mini-kpis">${Object.entries(p.totals).map(([key, value]) => `<div><small>${key.replace(/([A-Z])/g, " $1")}</small><strong>${key.toLowerCase().includes("value") ? money(value) : value}</strong></div>`).join("")}</div><div>${barChart(p.stages.map(stage => ({ label: stage.stage.slice(0, 4), value: stage.value || stage.count })))}</div><div class="intel-list">${state.data.marketIntel.map(item => `<article><b>${item.title}</b><p>${item.summary}</p><span>${item.geography_tags.join(", ")} · ${Math.round(item.relevance_score * 100)}% match</span></article>`).join("")}</div></div></article>`;
}

function integrationPanel() {
  return `<article class="panel full integration-panel"><h2>AI & Data Integrations</h2><div class="integration-grid"><button data-ai-demo>Whisper AI Voice Note</button><button data-places-demo>Google Places Prospecting</button><button data-market-refresh>Market Intelligence Feed</button><button data-config-preview>Configuration Impact Preview</button></div><div id="integrationOutput" class="integration-output">Use the integration controls to preview live or fallback CRM intelligence.</div></article>`;
}

async function addLead() {
  state.showLeadForm = true;
  state.duplicateCandidates = [];
  state.placeCandidates = [];
  state.placeAssistMessage = "";
  render();
}

function renderLeadFormModal() {
  const salesmen = (state.data.users?.length ? state.data.users : [state.user]).filter(user => user.role !== "admin");
  const placeAssist = `<div class="lead-ai-assist">
    <div><b>Google Maps AI assistance</b><p>${state.placeAssistMessage || "Enter a company name, then fetch possible Google Maps matches to auto-fill this form."}</p></div>
    <button type="button" data-enrich-lead>Fetch company data</button>
    ${state.placeCandidates.length ? `<div class="place-candidates">${state.placeCandidates.map(place => `<button type="button" data-place-id="${place.place_id}"><b>${place.name}</b><span>${place.formatted_address || place.address || ""}</span><small>${place.rating ? `Rating ${place.rating}` : "Google Maps result"}</small></button>`).join("")}</div>` : ""}
  </div>`;
  return `<div class="modal-backdrop">
    <section class="modal lead-modal">
      <div class="modal-head">
        <div><h2>Add New Lead</h2><p>Create once. Salespeople can access it from web or mobile.</p></div>
        ${placeAssist}
        <button data-close-modal title="Close">×</button>
      </div>
      <form id="leadForm" class="lead-form-grid">
        ${ARG_ADD_LEAD_FIELDS.map(([name, label, type, required, options]) => {
          const req = required ? "required" : "";
          if (name === "companyName") return `<label>${label}${required ? " *" : ""}<input id="companyNameInput" name="${name}" type="${type}" ${req}></label>`;
          if (name === "notes") return `<label class="span-2 ai-note-field"><span>${label}${required ? " *" : ""}</span><div class="note-tools"><button type="button" data-whisper-note>Record Note</button><small>Whisper detects the spoken language and inserts English notes.</small></div><textarea name="${name}" ${req}></textarea></label>`;
          if (type === "textarea") return `<label class="span-2">${label}${required ? " *" : ""}<textarea name="${name}" ${req}></textarea></label>`;
          if (type === "select") return `<label>${label}${required ? " *" : ""}<select name="${name}" ${req}>${options.map(option => `<option value="${option}">${option}</option>`).join("")}</select></label>`;
          if (type === "salesman") return `<label>${label}${required ? " *" : ""}<select name="${name}" ${req}>${salesmen.length ? salesmen.map(user => `<option value="${user.id}" ${user.id === state.user.id ? "selected" : ""}>${user.name}</option>`).join("") : `<option value="">Create salesman first</option>`}</select></label>`;
          return `<label>${label}${required ? " *" : ""}<input name="${name}" type="${type}" ${req}></label>`;
        }).join("")}
        <div class="duplicate-box span-2">${state.duplicateCandidates.length ? `<b>Possible duplicate found</b>${state.duplicateCandidates.map(item => `<p>${item.companyName} · ${item.owner} · ${Math.round(item.score * 100)}% match</p>`).join("")}` : "Duplicate prevention is active. Type a company name to check existing records."}</div>
        <div class="modal-actions span-2"><button type="button" data-close-modal>Cancel</button><button class="primary" type="submit">Save Lead</button></div>
      </form>
    </section>
  </div>`;
}

async function checkDuplicateLead(event) {
  const companyName = event.target.value.trim();
  if (companyName.length < 3) {
    state.duplicateCandidates = [];
    render();
    return;
  }
  try {
    const result = await api("/api/leads/check-duplicate", { method: "POST", body: JSON.stringify({ companyName }) });
    state.duplicateCandidates = result.candidates || [];
    const formValues = new FormData(document.querySelector("#leadForm"));
    render();
    Object.entries(Object.fromEntries(formValues.entries())).forEach(([key, value]) => {
      const field = document.querySelector(`[name="${key}"]`);
      if (field) field.value = value;
    });
  } catch {
    state.duplicateCandidates = [];
  }
}

function currentLeadFormValues() {
  const form = document.querySelector("#leadForm");
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

function restoreLeadFormValues(values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = document.querySelector(`[name="${key}"]`);
    if (field) field.value = value;
  });
}

function fillLeadForm(fields = {}) {
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    const field = document.querySelector(`[name="${key}"]`);
    if (!field) return;
    if (key === "notes" && field.value.trim()) field.value = `${field.value.trim()}\n${value}`;
    else field.value = value;
  });
}

async function enrichLeadFromPlaces() {
  const values = currentLeadFormValues();
  if (!values.companyName?.trim()) {
    state.placeAssistMessage = "Enter a company name first.";
    render();
    restoreLeadFormValues(values);
    return;
  }
  const result = await api("/api/integrations/places/candidates", { method: "POST", body: JSON.stringify(values) });
  if (result.fields) {
    fillLeadForm(result.fields);
    state.placeCandidates = [];
    state.placeAssistMessage = `${result.disabled ? "Fallback" : "Google Maps"} match applied.`;
    render();
    restoreLeadFormValues({ ...values, ...result.fields });
    return;
  }
  state.placeCandidates = result.results || [];
  state.placeAssistMessage = state.placeCandidates.length > 1
    ? "Multiple companies matched. Choose the correct Google Maps result."
    : state.placeCandidates.length ? "One company matched. Select it to fill the form." : "No Google Maps matches found.";
  render();
  restoreLeadFormValues(values);
}

async function choosePlace(placeId) {
  const values = currentLeadFormValues();
  const result = await api("/api/integrations/places/details", { method: "POST", body: JSON.stringify({ placeId }) });
  state.placeCandidates = [];
  state.placeAssistMessage = `${result.disabled ? "Fallback" : "Google Maps"} company details applied.`;
  render();
  restoreLeadFormValues({ ...values, ...result.fields });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function toggleWhisperNote(button) {
  const notes = document.querySelector(`[name="notes"]`);
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    state.notice = "Audio recording is not supported in this browser.";
    render();
    return;
  }
  if (leadNoteRecorder?.state === "recording") {
    leadNoteRecorder.stop();
    button.textContent = "Transcribing...";
    button.disabled = true;
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  leadNoteChunks = [];
  leadNoteRecorder = new MediaRecorder(stream);
  leadNoteRecorder.ondataavailable = event => {
    if (event.data.size) leadNoteChunks.push(event.data);
  };
  leadNoteRecorder.onstop = async () => {
    try {
      const values = currentLeadFormValues();
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(leadNoteChunks, { type: leadNoteRecorder.mimeType || "audio/webm" });
      const audioBase64 = await blobToBase64(blob);
      const result = await api("/api/ai/transcribe", { method: "POST", body: JSON.stringify({ audioBase64, mimeType: blob.type, fileName: "lead-note.webm" }) });
      const mergedNotes = `${values.notes?.trim() ? `${values.notes.trim()}\n` : ""}${result.transcript}`.trim();
      if (notes) notes.value = mergedNotes;
      state.notice = `${result.disabled ? "Fallback" : "Whisper"}: ${result.summary}`;
      render();
      restoreLeadFormValues({ ...values, notes: mergedNotes });
    } catch (error) {
      state.notice = error.message || "Whisper transcription failed.";
      render();
    }
  };
  leadNoteRecorder.start();
  button.textContent = "Stop recording";
}

async function saveLeadForm(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api("/api/leads", { method: "POST", body: JSON.stringify(payload) });
    state.showLeadForm = false;
    state.duplicateCandidates = [];
    state.placeCandidates = [];
    state.placeAssistMessage = "";
    state.notice = `${result.lead.companyName} saved as ${result.lead.companyId}.`;
    await bootstrap();
    state.selectedLeadId = result.lead.id;
    setRoute("leads");
  } catch (error) {
    state.offlineQueue.push({ type: "lead", payload, queuedAt: new Date().toISOString() });
    localStorage.setItem("arscrm:offlineQueue", JSON.stringify(state.offlineQueue));
    state.showLeadForm = false;
    state.notice = `Saved locally for sync when back online: ${payload.companyName}.`;
    render();
  }
}

async function requestLeadDeletion(leadId) {
  const reason = prompt("Reason for deleting this lead?");
  if (reason === null) return;
  const result = await api(`/api/leads/${leadId}/delete-request`, { method: "POST", body: JSON.stringify({ reason }) });
  state.notice = result.message || `Deletion request submitted for ${result.request.companyName}.`;
  await bootstrap();
  render();
}

async function approveDeletionRequest(requestId) {
  const password = prompt("Enter admin password to approve this lead deletion:");
  if (!password) return;
  await api(`/api/deletion-requests/${requestId}/approve`, { method: "POST", body: JSON.stringify({ password }) });
  state.notice = "Lead deletion approved and completed.";
  await bootstrap();
  render();
}

async function rejectDeletionRequest(requestId) {
  const reason = prompt("Reason for rejecting this deletion request?") || "Rejected by admin.";
  await api(`/api/deletion-requests/${requestId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  state.notice = "Deletion request rejected.";
  await bootstrap();
  render();
}

async function saveSalesmanForm(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const result = await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
  state.notice = `Salesman account created for ${result.user.name}.`;
  await bootstrap();
  render();
}

async function runRelationshipAction(action) {
  const lead = state.data.leads.find(item => item.id === state.selectedLeadId) || state.data.leads[0];
  const result = await api("/api/ai/actions", { method: "POST", body: JSON.stringify({ action, companyId: lead?.companyId }) });
  state.aiOutput = result.output;
  render();
}

async function saveActivity(event) {
  event.preventDefault();
  const lead = state.data.leads.find(item => item.id === state.selectedLeadId) || state.data.leads[0];
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api("/api/activities", { method: "POST", body: JSON.stringify({ ...payload, companyId: lead.companyId }) });
  state.notice = "Activity logged append-only.";
  await bootstrap();
}

async function savePmr(event) {
  event.preventDefault();
  const lead = state.data.leads.find(item => item.id === state.selectedLeadId) || state.data.leads[0];
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api("/api/pmrs", { method: "POST", body: JSON.stringify({ ...payload, companyId: lead.companyId }) });
  state.notice = "Structured PMR saved and linked to the activity log.";
  await bootstrap();
}

async function runAiDemo() {
  const result = await api("/api/ai/transcribe", { method: "POST", body: JSON.stringify({ text: "Client requested updated steel plate pricing and a follow-up tomorrow morning." }) });
  state.notice = `${result.disabled ? "Fallback" : "Live"} Whisper: ${result.summary}`;
  render();
}

document.addEventListener("click", async event => {
  const route = event.target.closest("[data-route]")?.dataset.route;
  if (route) setRoute(route);
  const leadId = event.target.closest("[data-open-lead]")?.dataset.openLead;
  if (leadId) {
    state.selectedLeadId = leadId;
    state.showLeadDetails = true;
    state.route = "leads";
    localStorage.setItem("arscrm:route", "leads");
    render();
  }
  const completeId = event.target.closest("[data-complete]")?.dataset.complete;
  if (completeId) {
    await api(`/api/leads/${completeId}`, { method: "PATCH", body: JSON.stringify({ status: "Contacted", purpose: "Follow-up completed" }) });
    state.notice = "Follow-up marked complete.";
    await bootstrap();
  }
  const deleteLeadId = event.target.closest("[data-delete-lead]")?.dataset.deleteLead;
  if (deleteLeadId) await requestLeadDeletion(deleteLeadId);
  const approveDeleteId = event.target.closest("[data-approve-delete]")?.dataset.approveDelete;
  if (approveDeleteId) await approveDeletionRequest(approveDeleteId);
  const rejectDeleteId = event.target.closest("[data-reject-delete]")?.dataset.rejectDelete;
  if (rejectDeleteId) await rejectDeletionRequest(rejectDeleteId);
  if (event.target.closest("[data-places-demo]")) {
    const result = await api("/api/integrations/places/search?q=steel fabricators UAE");
    el("#integrationOutput").innerHTML = `<b>${result.disabled ? "Fallback" : "Live"} Google Places</b>${result.results.map(place => `<p>${place.name || place.formatted_address} · ${place.address || place.formatted_address || ""}</p>`).join("")}`;
  }
  const placePick = event.target.closest("[data-place-id]");
  if (placePick) await choosePlace(placePick.dataset.placeId);
  if (event.target.closest("[data-enrich-lead]")) await enrichLeadFromPlaces();
  const whisperButton = event.target.closest("[data-whisper-note]");
  if (whisperButton) await toggleWhisperNote(whisperButton);
  if (event.target.closest("[data-market-refresh]")) {
    const result = await api("/api/market-intelligence");
    const output = el("#integrationOutput");
    if (output) output.innerHTML = `<b>${result.disabled ? "Fallback" : "Live"} Market Intelligence</b>${result.items.map(item => `<p>${item.title}</p>`).join("")}`;
    state.notice = `${result.items.length} market intelligence items loaded.`;
  }
  if (event.target.closest("[data-config-preview]")) {
    const result = await api("/api/config/preview", { method: "POST", body: JSON.stringify({ input: "Reduce Tier 1 follow-up threshold to 10 days" }) });
    const output = el("#integrationOutput");
    if (output) output.innerHTML = `<b>Retrospective Impact Preview</b><p>${result.preview}</p><p><strong>Confirmation required before write.</strong></p>`;
  }
});

Object.defineProperty(pages.dashboard, "title", { get() { return state.user?.role === "admin" ? "CRM Admin Dashboard" : "My Sales Dashboard"; } });

async function start() {
  const demo = bootParams.get("demo");
  if (demo === "admin" && !state.token) {
    await login("glory@alrassteel.com", "glory12345");
    return;
  }
  await bootstrap();
}

start();
