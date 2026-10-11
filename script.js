
"use strict";

/*
  MARKS IMOB — SUPABASE
  Cole a URL do projeto e a Publishable key abaixo.
  Nunca coloque uma service_role ou secret key no site.
*/

const SUPABASE_URL = "https://anemrbmvjrujlwqmannf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_N4LE8d32FUxvduzrV1vbNw_TAOazd_e";

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

let supabaseClient = null;
let currentUser = null;
let currentOrg = null;
let data = { properties: [], leads: [] };
let toastTimer = null;
let busy = false;

const configurationReady =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_URL.includes(".supabase.co") &&
  SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("COLE_AQUI");

if (configurationReady && window.supabase?.createClient) {
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
}

/* UTILITÁRIOS */

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
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function showLoginError(message) {
  const error = $("loginError");
  if (!error) {
    alert(message);
    return;
  }

  error.textContent = message;
  error.hidden = false;
}

function clearLoginError() {
  const error = $("loginError");
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function setConnectionLabel(message) {
  const label = $("connectionLabel");
  if (label) label.textContent = message;
}

function setLoginBusy(value) {
  const button = $("loginButton");
  if (!button) return;

  button.disabled = value;
  button.textContent = value ? "Entrando..." : "Entrar na plataforma";
}

/* SESSÃO E LOGIN */

function showLogin() {
  const login = $("loginScreen");
  const app = $("app");

  if (login) login.hidden = false;
  if (app) app.hidden = true;

  setConnectionLabel("DESCONECTADO");
}

function showApp() {
  const login = $("loginScreen");
  const app = $("app");

  if (login) login.hidden = true;
  if (app) app.hidden = false;

  const email = currentUser?.email || "Usuário";
  const name = email.split("@")[0] || "Usuário";

  if ($("profileName")) $("profileName").textContent = name;
  if ($("profileEmail")) $("profileEmail").textContent = email;
  if ($("profileAvatar")) {
    $("profileAvatar").textContent = name.charAt(0).toUpperCase();
  }

  setConnectionLabel("CONECTADO");
}

/*
  Cada usuário terá uma imobiliária própria.
  As políticas RLS do Supabase também protegem os dados.
*/

async function getOrCreateOrganization(user) {
  const { data: existing, error: searchError } = await supabaseClient
    .from("imobiliarias")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (searchError) throw searchError;
  if (existing) return existing;

  const suggestedName = user.email
    ? user.email.split("@")[0]
    : "Minha imobiliária";

  const { data: created, error: createError } = await supabaseClient
    .from("imobiliarias")
    .insert({
      owner_id: user.id,
      nome: suggestedName
    })
    .select("*")
    .single();

  if (!createError) return created;

  // Se a imobiliária já tiver sido criada em outra tentativa,
  // tenta localizar o registro novamente.
  const { data: retry, error: retryError } = await supabaseClient
    .from("imobiliarias")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!retryError && retry) return retry;

  throw createError;
}

async function enterApplication(user) {
  currentUser = user;
  showApp();
  setConnectionLabel("CARREGANDO...");

  try {
    currentOrg = await getOrCreateOrganization(user);
    await loadData();
    renderAll();
    setConnectionLabel("CONECTADO");
  } catch (error) {
    console.error("Erro ao carregar a imobiliária:", error);
    setConnectionLabel("ERRO DE CONEXÃO");
    notify("Não foi possível carregar os dados: " + error.message);
  }
}

async function login(event) {
  event.preventDefault();

  if (busy) return;

  clearLoginError();

  if (!configurationReady || !supabaseClient) {
    showLoginError(
      "Configure a URL do projeto e a Publishable key no início do script.js."
    );
    return;
  }

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  if (!email || !password) {
    showLoginError("Informe seu e-mail e sua senha.");
    return;
  }

  busy = true;
  setLoginBusy(true);

  try {
    const { data: result, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    if (!result.user) {
      throw new Error("Não foi possível identificar o usuário.");
    }

    await enterApplication(result.user);
  } catch (error) {
    console.error("Erro no login:", error);

    showLoginError(
      error.message === "Invalid login credentials"
        ? "E-mail ou senha incorretos. Confira os dados e tente novamente."
        : error.message || "Não foi possível entrar. Tente novamente."
    );
  } finally {
    busy = false;
    setLoginBusy(false);
  }
}

async function logout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Erro ao sair:", error);
    notify("Não foi possível encerrar a sessão.");
    return;
  }

  currentUser = null;
  currentOrg = null;
  data = { properties: [], leads: [] };

  showLogin();
  clearLoginError();

  if ($("loginPassword")) $("loginPassword").value = "";

  notify("Você saiu da sua conta.");
}

/* CONVERSÃO DOS DADOS DO BANCO */

function propertyFromDB(row) {
  return {
    id: row.id,
    title: row.titulo || "",
    type: row.tipo || "",
    purpose: row.finalidade || "Venda",
    price: Number(row.preco || 0),
    bedrooms: Number(row.quartos || 0),
    city: row.cidade || "",
    neighborhood: row.bairro || "",
    address: row.endereco || "",
    status: row.status || "Disponível",
    createdAt: row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now()
  };
}

function leadFromDB(row) {
  return {
    id: row.id,
    name: row.nome || "",
    phone: row.telefone || "",
    email: row.email || "",
    propertyId: row.imovel_id || "",
    agent: row.corretor || "",
    status: row.status || "Novo",
    notes: row.observacoes || "",
    createdAt: row.created_at
      ? new Date(row.created_at).getTime()
      : Date.now()
  };
}

function propertyToDB(property) {
  return {
    imobiliaria_id: currentOrg.id,
    titulo: property.title,
    tipo: property.type,
    finalidade: property.purpose,
    preco: property.price,
    quartos: property.bedrooms,
    cidade: property.city,
    bairro: property.neighborhood,
    endereco: property.address,
    status: property.status
  };
}

function leadToDB(lead) {
  return {
    imobiliaria_id: currentOrg.id,
    nome: lead.name,
    telefone: lead.phone,
    email: lead.email,
    imovel_id: lead.propertyId || null,
    corretor: lead.agent,
    status: lead.status,
    observacoes: lead.notes
  };
}

/* CARREGAR DADOS DO SUPABASE */

async function loadData() {
  if (!currentOrg) {
    throw new Error("A imobiliária não foi identificada.");
  }

  const [propertiesResult, leadsResult] = await Promise.all([
    supabaseClient
      .from("imoveis")
      .select("*")
      .eq("imobiliaria_id", currentOrg.id)
      .order("created_at", { ascending: false }),

    supabaseClient
      .from("interessados")
      .select("*")
      .eq("imobiliaria_id", currentOrg.id)
      .order("created_at", { ascending: false })
  ]);

  if (propertiesResult.error) throw propertiesResult.error;
  if (leadsResult.error) throw leadsResult.error;

  data.properties = (propertiesResult.data || []).map(propertyFromDB);
  data.leads = (leadsResult.data || []).map(leadFromDB);
}

/* STATUS */

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

/* NAVEGAÇÃO */

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

  if ($("pageTitle")) $("pageTitle").textContent = titles[view];
  if ($("breadcrumb")) $("breadcrumb").textContent = titles[view];
  if ($("sidebar")) $("sidebar").classList.remove("open");
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.go));
});

if ($("menuToggle")) {
  $("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });
}

/* MODAIS */

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

    if ($("sidebar")) $("sidebar").classList.remove("open");
  }
});

/* DASHBOARD */

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

/* IMÓVEIS */

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

$("propertyForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !currentOrg) return;

  const id = $("propertyId").value;
  const existing = data.properties.find(p => p.id === id);

  const property = {
    id,
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

  if (
    !property.title ||
    !property.city ||
    !Number.isFinite(property.price) ||
    property.price < 0
  ) {
    notify("Confira os dados do imóvel.");
    return;
  }

  busy = true;

  try {
    let result;

    if (existing) {
      result = await supabaseClient
        .from("imoveis")
        .update(propertyToDB(property))
        .eq("id", id)
        .eq("imobiliaria_id", currentOrg.id)
        .select("*")
        .single();
    } else {
      result = await supabaseClient
        .from("imoveis")
        .insert(propertyToDB(property))
        .select("*")
        .single();
    }

    if (result.error) throw result.error;

    const saved = propertyFromDB(result.data);

    if (existing) {
      data.properties = data.properties.map(p => p.id === id ? saved : p);
    } else {
      data.properties.unshift(saved);
    }

    closeModal("propertyModal");
    resetPropertyForm();
    renderAll();
    notify(existing ? "Imóvel atualizado!" : "Imóvel cadastrado!");
  } catch (error) {
    console.error(error);
    notify("Erro ao salvar imóvel: " + error.message);
  } finally {
    busy = false;
  }
});

$("propertiesTable").addEventListener("click", async event => {
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
    return;
  }

  if (deleteButton) {
    if (busy || !currentOrg) return;

    const id = deleteButton.dataset.deleteProperty;
    const p = data.properties.find(x => x.id === id);
    if (!p) return;

    if (!confirm(`Excluir "${p.title}"? Os interessados associados não serão excluídos.`)) return;

    busy = true;

    try {
      const { data: deleted, error } = await supabaseClient
        .from("imoveis")
        .delete()
        .eq("id", id)
        .eq("imobiliaria_id", currentOrg.id)
        .select("id");

      if (error) throw error;
      if (!deleted?.length) {
        throw new Error("Nenhum imóvel foi excluído. Verifique as permissões.");
      }

      data.properties = data.properties.filter(x => x.id !== id);
      data.leads = data.leads.map(lead =>
        lead.propertyId === id ? { ...lead, propertyId: "" } : lead
      );

      renderAll();
      notify("Imóvel excluído.");
    } catch (error) {
      console.error(error);
      notify("Erro ao excluir imóvel: " + error.message);
    } finally {
      busy = false;
    }
  }
});

/* INTERESSADOS */

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
      lead.name,
      lead.phone,
      lead.email,
      lead.agent,
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

$("leadForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !currentOrg) return;

  const id = $("leadId").value;
  const existing = data.leads.find(lead => lead.id === id);

  const lead = {
    id,
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

  busy = true;

  try {
    let result;

    if (existing) {
      result = await supabaseClient
        .from("interessados")
        .update(leadToDB(lead))
        .eq("id", id)
        .eq("imobiliaria_id", currentOrg.id)
        .select("*")
        .single();
    } else {
      result = await supabaseClient
        .from("interessados")
        .insert(leadToDB(lead))
        .select("*")
        .single();
    }

    if (result.error) throw result.error;

    const saved = leadFromDB(result.data);

    if (existing) {
      data.leads = data.leads.map(item => item.id === id ? saved : item);
    } else {
      data.leads.unshift(saved);
    }

    closeModal("leadModal");
    resetLeadForm();
    renderAll();
    notify(existing ? "Interessado atualizado!" : "Interessado cadastrado!");
  } catch (error) {
    console.error(error);
    notify("Erro ao salvar interessado: " + error.message);
  } finally {
    busy = false;
  }
});

$("leadsTable").addEventListener("click", async event => {
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
    return;
  }

  if (deleteButton) {
    if (busy || !currentOrg) return;

    const id = deleteButton.dataset.deleteLead;
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;

    if (!confirm(`Excluir o cadastro de "${lead.name}"?`)) return;

    busy = true;

    try {
      const { data: deleted, error } = await supabaseClient
        .from("interessados")
        .delete()
        .eq("id", id)
        .eq("imobiliaria_id", currentOrg.id)
        .select("id");

      if (error) throw error;
      if (!deleted?.length) {
        throw new Error("Nenhum interessado foi excluído. Verifique as permissões.");
      }

      data.leads = data.leads.filter(x => x.id !== id);
      renderAll();
      notify("Interessado excluído.");
    } catch (error) {
      console.error(error);
      notify("Erro ao excluir interessado: " + error.message);
    } finally {
      busy = false;
    }
  }
});

/* FUNIL COMERCIAL */

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

$("pipelineBoard").addEventListener("change", async event => {
  const select = event.target.closest("[data-stage-lead]");
  if (!select || busy || !currentOrg) return;

  const lead = data.leads.find(x => x.id === select.dataset.stageLead);
  if (!lead || !stages.includes(select.value)) return;

  const oldStatus = lead.status;
  const newStatus = select.value;

  busy = true;

  try {
    const { error } = await supabaseClient
      .from("interessados")
      .update({ status: newStatus })
      .eq("id", lead.id)
      .eq("imobiliaria_id", currentOrg.id);

    if (error) throw error;

    lead.status = newStatus;
    renderAll();
    notify("Etapa comercial atualizada.");
  } catch (error) {
    console.error(error);
    lead.status = oldStatus;
    renderAll();
    notify("Erro ao atualizar a etapa: " + error.message);
  } finally {
    busy = false;
  }
});

/* ATUALIZAÇÃO GERAL */

function renderAll() {
  renderDashboard();
  renderProperties();
  renderLeads();
  renderPipeline();
}

/* INICIALIZAÇÃO */

async function initialize() {
  if ($("loginForm")) {
    $("loginForm").addEventListener("submit", login);
  }

  if ($("logoutButton")) {
    $("logoutButton").addEventListener("click", logout);
  }

  if (!configurationReady || !supabaseClient) {
    showLogin();
    showLoginError(
      "Falta configurar a URL do Supabase e a Publishable key no início do script.js."
    );
    return;
  }

  showLogin();

  try {
    const { data: result, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (result.session?.user) {
      await enterApplication(result.session.user);
    }
  } catch (error) {
    console.error("Erro ao recuperar a sessão:", error);
    showLoginError("Não foi possível conectar ao Supabase. Confira a configuração.");
  }
}

initialize();
