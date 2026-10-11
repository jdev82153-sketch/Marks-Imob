"use strict";

const STORAGE_KEY = "marksImob_demo_v1";

const stages = [
  "Novo",
  "Em contato",
  "Visita agendada",
  "Proposta enviada",
  "Concluído",
  "Perdido"
];

const $ = id => document.getElementById(id);

function readData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.properties) &&
          Array.isArray(parsed.leads)) return parsed;
    }
  } catch (error) {
    console.error("Erro ao ler os dados:", error);
  }

  return {
    properties: [
      {
        id: "P1001",
        title: "Apartamento residencial",
        type: "Apartamento",
        purpose: "Venda",
        price: 285000,
        bedrooms: 2,
        city: "São Paulo",
        neighborhood: "Centro",
        address: "",
        status: "Disponível",
        createdAt: Date.now() - 2000
      },
      {
        id: "P1002",
        title: "Casa com quintal",
        type: "Casa",
        purpose: "Venda",
        price: 420000,
        bedrooms: 3,
        city: "Campinas",
        neighborhood: "Jardim América",
        address: "",
        status: "Reservado",
        createdAt: Date.now() - 1000
      }
    ],
    leads: [
      {
        id: "L1001",
        name: "Cliente demonstrativo",
        phone: "",
        email: "",
        propertyId: "P1001",
        agent: "Corretor demonstrativo",
        status: "Em contato",
        notes: "",
        createdAt: Date.now()
      }
    ]
  };
}

let data = readData();
let toastTimer;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar:", error);
    notify("Não foi possível salvar. Verifique o armazenamento do navegador.");
    return false;
  }
}

function makeId(prefix) {
  return prefix + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  });
}

function shortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function statusClass(status) {
  const classes = {
    "Disponível": "available",
    "Reservado": "reserved",
    "Vendido": "sold",
    "Alugado": "sold",
    "Novo": "",
    "Em contato": "contact",
    "Visita agendada": "visit",
    "Proposta enviada": "proposal",
    "Concluído": "done",
    "Perdido": "lost"
  };

  return classes[status] || "";
}

function statusBadge(status) {
  return `<span class="status ${statusClass(status)}">${escapeHTML(status)}</span>`;
}

/* Navegação */

function navigate(view) {
  const titles = {
    dashboard: "Dashboard",
    properties: "Imóveis",
    leads: "Interessados",
    pipeline: "Negociações"
  };

  if (!titles[view]) return;

  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  $("pageTitle").textContent = titles[view];
  $("breadcrumb").textContent = titles[view];
  $("sidebar").classList.remove("open");
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.go));
});

$("menuToggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

/* Modais */

function openModal(id) {
  if (id === "leadModal") refreshPropertyOptions();
  $(id).classList.add("open");
}

function closeModal(id) {
  $(id).classList.remove("open");
}

document.querySelectorAll("[data-open]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.open === "propertyModal") resetPropertyForm();
    if (button.dataset.open === "leadModal") resetLeadForm();
    openModal(button.dataset.open);
  });
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => closeModal(button.dataset.close));
});

document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeModal(backdrop.id);
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-backdrop.open").forEach(modal => {
      closeModal(modal.id);
    });
    $("sidebar").classList.remove("open");
  }
});

/* Dashboard */

function renderDashboard() {
  const properties = data.properties;
  const leads = data.leads;

  $("statProperties").textContent = properties.length;
  $("statAvailable").textContent =
    properties.filter(p => p.status === "Disponível").length;
  $("statLeads").textContent = leads.length;
  $("statDeals").textContent =
    leads.filter(l => !["Concluído", "Perdido"].includes(l.status)).length;

  const recentProperties = [...properties]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  $("recentProperties").innerHTML = recentProperties.length
    ? recentProperties.map(p => `
      <div class="recent-item">
        <div class="recent-icon">⌂</div>
        <div class="recent-info">
          <strong>${escapeHTML(p.title)}</strong>
          <small>${escapeHTML(p.city)} · ${money(p.price)}</small>
        </div>
        ${statusBadge(p.status)}
      </div>
    `).join("")
    : `<div class="empty-state">
        <strong>Nenhum imóvel cadastrado</strong>
        <p>Cadastre um imóvel para começar.</p>
      </div>`;

  const recentLeads = [...leads]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  $("recentLeads").innerHTML = recentLeads.length
    ? recentLeads.map(lead => `
      <div class="recent-item">
        <div class="recent-icon">♙</div>
        <div class="recent-info">
          <strong>${escapeHTML(lead.name)}</strong>
          <small>${escapeHTML(lead.phone || lead.email || "Sem contato informado")}</small>
        </div>
        ${statusBadge(lead.status)}
      </div>
    `).join("")
    : `<div class="empty-state">
        <strong>Nenhum interessado cadastrado</strong>
        <p>Cadastre um contato para começar.</p>
      </div>`;
}

/* Imóveis */

function resetPropertyForm() {
  $("propertyForm").reset();
  $("propertyId").value = "";
  $("propertyModalTitle").textContent = "Cadastrar imóvel";
  $("propertyBedrooms").value = "2";
  $("propertyStatus").value = "Disponível";
}

function renderProperties() {
  const query = $("propertySearch").value.trim().toLowerCase();
  const filter = $("propertyFilter").value;

  const properties = data.properties.filter(p => {
    const searchable = [
      p.id, p.title, p.type, p.city, p.neighborhood
    ].join(" ").toLowerCase();

    return searchable.includes(query) && (!filter || p.status === filter);
  }).sort((a, b) => b.createdAt - a.createdAt);

  $("propertiesTable").innerHTML = properties.map(p => `
    <tr>
      <td>
        <span class="cell-title">${escapeHTML(p.title)}</span>
        <span class="cell-sub">${escapeHTML(p.type)} · ${escapeHTML(p.purpose)} · ${escapeHTML(p.id)}</span>
      </td>
      <td>
        ${escapeHTML(p.city)}
        <span class="cell-sub">${escapeHTML(p.neighborhood || "Bairro não informado")}</span>
      </td>
      <td class="price">${money(p.price)}</td>
      <td>${statusBadge(p.status)}</td>
      <td>
        <div class="action-group">
          <button class="action-btn" data-edit-property="${escapeHTML(p.id)}">Editar</button>
          <button class="action-btn delete" data-delete-property="${escapeHTML(p.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("propertiesEmpty").hidden = properties.length !== 0;
}

$("propertySearch").addEventListener("input", renderProperties);
$("propertyFilter").addEventListener("change", renderProperties);

$("propertyForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("propertyId").value;
  const existing = data.properties.find(p => p.id === id);

  const property = {
    id: id || makeId("P"),
    title: $("propertyTitle").value.trim(),
    type: $("propertyType").value,
    purpose: $("propertyPurpose").value,
    price: Number($("propertyPrice").value),
    bedrooms: Number($("propertyBedrooms").value || 0),
    city: $("propertyCity").value.trim(),
    neighborhood: $("propertyNeighborhood").value.trim(),
    address: $("propertyAddress").value.trim(),
    status: $("propertyStatus").value,
    createdAt: existing ? existing.createdAt : Date.now()
  };

  if (!property.title || !property.city ||
      !Number.isFinite(property.price) || property.price < 0) {
    notify("Confira os dados do imóvel.");
    return;
  }

  if (existing) {
    data.properties = data.properties.map(p => p.id === id ? property : p);
  } else {
    data.properties.push(property);
  }

  if (!saveData()) return;

  closeModal("propertyModal");
  resetPropertyForm();
  renderAll();
  notify(existing ? "Imóvel atualizado!" : "Imóvel cadastrado!");
});

$("propertiesTable").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-property]");
  const deleteButton = event.target.closest("[data-delete-property]");

  if (editButton) {
    const p = data.properties.find(x => x.id === editButton.dataset.editProperty);
    if (!p) return;

    $("propertyId").value = p.id;
    $("propertyTitle").value = p.title;
    $("propertyType").value = p.type;
    $("propertyPurpose").value = p.purpose;
    $("propertyPrice").value = p.price;
    $("propertyBedrooms").value = p.bedrooms;
    $("propertyCity").value = p.city;
    $("propertyNeighborhood").value = p.neighborhood;
    $("propertyAddress").value = p.address;
    $("propertyStatus").value = p.status;
    $("propertyModalTitle").textContent = "Editar imóvel";

    openModal("propertyModal");
  }

  if (deleteButton) {
    const id = deleteButton.dataset.deleteProperty;
    const p = data.properties.find(x => x.id === id);
    if (!p) return;

    if (!confirm(`Excluir "${p.title}"? Os interessados associados não serão excluídos.`)) return;

    data.properties = data.properties.filter(x => x.id !== id);
    if (!saveData()) return;
    renderAll();
    notify("Imóvel excluído.");
  }
});

/* Interessados */

function refreshPropertyOptions(selectedId = "") {
  const options = data.properties.map(p => `
    <option value="${escapeHTML(p.id)}" ${p.id === selectedId ? "selected" : ""}>
      ${escapeHTML(p.title)} — ${escapeHTML(p.city)}
    </option>
  `).join("");

  $("leadProperty").innerHTML =
    `<option value="">Ainda não definido</option>${options}`;
}

function resetLeadForm() {
  $("leadForm").reset();
  $("leadId").value = "";
  $("leadModalTitle").textContent = "Novo interessado";
  $("leadStatus").value = "Novo";
  refreshPropertyOptions();
}

function propertyName(id) {
  const p = data.properties.find(item => item.id === id);
  return p ? p.title : "Não definido";
}

function renderLeads() {
  const query = $("leadSearch").value.trim().toLowerCase();
  const filter = $("leadFilter").value;

  const leads = data.leads.filter(lead => {
    const searchable = [
      lead.name, lead.phone, lead.email, lead.agent,
      propertyName(lead.propertyId)
    ].join(" ").toLowerCase();

    return searchable.includes(query) && (!filter || lead.status === filter);
  }).sort((a, b) => b.createdAt - a.createdAt);

  $("leadsTable").innerHTML = leads.map(lead => `
    <tr>
      <td>
        <span class="cell-title">${escapeHTML(lead.name)}</span>
        <span class="cell-sub">Responsável: ${escapeHTML(lead.agent || "Não definido")}</span>
      </td>
      <td>
        ${escapeHTML(lead.phone || "Sem telefone")}
        <span class="cell-sub">${escapeHTML(lead.email || "Sem e-mail")}</span>
      </td>
      <td>${escapeHTML(propertyName(lead.propertyId))}</td>
      <td>${statusBadge(lead.status)}</td>
      <td>
        <div class="action-group">
          <button class="action-btn" data-edit-lead="${escapeHTML(lead.id)}">Editar</button>
          <button class="action-btn delete" data-delete-lead="${escapeHTML(lead.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("leadsEmpty").hidden = leads.length !== 0;
}

$("leadSearch").addEventListener("input", renderLeads);
$("leadFilter").addEventListener("change", renderLeads);

$("leadForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("leadId").value;
  const existing = data.leads.find(lead => lead.id === id);

  const lead = {
    id: id || makeId("L"),
    name: $("leadName").value.trim(),
    phone: $("leadPhone").value.trim(),
    email: $("leadEmail").value.trim(),
    propertyId: $("leadProperty").value,
    agent: $("leadAgent").value.trim(),
    status: $("leadStatus").value,
    notes: $("leadNotes").value.trim(),
    createdAt: existing ? existing.createdAt : Date.now()
  };

  if (!lead.name) {
    notify("Informe o nome do interessado.");
    return;
  }

  if (existing) {
    data.leads = data.leads.map(item => item.id === id ? lead : item);
  } else {
    data.leads.push(lead);
  }

  if (!saveData()) return;

  closeModal("leadModal");
  resetLeadForm();
  renderAll();
  notify(existing ? "Interessado atualizado!" : "Interessado cadastrado!");
});

$("leadsTable").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-lead]");
  const deleteButton = event.target.closest("[data-delete-lead]");

  if (editButton) {
    const lead = data.leads.find(x => x.id === editButton.dataset.editLead);
    if (!lead) return;

    $("leadId").value = lead.id;
    $("leadName").value = lead.name;
    $("leadPhone").value = lead.phone;
    $("leadEmail").value = lead.email;
    $("leadAgent").value = lead.agent;
    $("leadStatus").value = lead.status;
    $("leadNotes").value = lead.notes;
    $("leadModalTitle").textContent = "Editar interessado";
    refreshPropertyOptions(lead.propertyId);

    openModal("leadModal");
  }

  if (deleteButton) {
    const id = deleteButton.dataset.deleteLead;
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;

    if (!confirm(`Excluir o cadastro de "${lead.name}"?`)) return;

    data.leads = data.leads.filter(x => x.id !== id);
    if (!saveData()) return;
    renderAll();
    notify("Interessado excluído.");
  }
});

/* Funil comercial */

function renderPipeline() {
  const board = $("pipelineBoard");

  board.innerHTML = stages.map(stage => {
    const leads = data.leads.filter(lead => lead.status === stage);

    return `
      <section class="pipeline-column">
        <div class="pipeline-column-head">
          <span>${escapeHTML(stage)}</span>
          <span class="pipeline-count">${leads.length}</span>
        </div>

        ${leads.length ? leads.map(lead => `
          <article class="pipeline-card">
            <strong>${escapeHTML(lead.name)}</strong>
            <p>${escapeHTML(propertyName(lead.propertyId))}</p>
            <select data-stage-lead="${escapeHTML(lead.id)}"
              aria-label="Alterar etapa de ${escapeHTML(lead.name)}">
              ${stages.map(option => `
                <option value="${escapeHTML(option)}"
                  ${option === lead.status ? "selected" : ""}>
                  ${escapeHTML(option)}
                </option>
              `).join("")}
            </select>
          </article>
        `).join("") : `<div class="pipeline-empty">Nenhum interessado</div>`}
      </section>
    `;
  }).join("");
}

$("pipelineBoard").addEventListener("change", event => {
  const select = event.target.closest("[data-stage-lead]");
  if (!select) return;

  const lead = data.leads.find(x => x.id === select.dataset.stageLead);
  if (!lead || !stages.includes(select.value)) return;

  const oldStatus = lead.status;
  lead.status = select.value;

  if (!saveData()) {
    lead.status = oldStatus;
    renderAll();
    return;
  }

  renderAll();
  notify("Etapa comercial atualizada.");
});

/* Atualização geral */

function renderAll() {
  renderDashboard();
  renderProperties();
  renderLeads();
  renderPipeline();
}

renderAll();
