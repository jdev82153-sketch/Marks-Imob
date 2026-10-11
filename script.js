
// ============================================
// MARKS IMOB — script.js
// Login, dashboard, imóveis, interessados e negociações
// ============================================

// 1. CONFIGURAÇÃO DO SUPABASE
// Mantenha sua Publishable key atual neste campo.
const SUPABASE_URL = "https://anemrbmvjrujlwqmannf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_N4LE8d32FUxvduzrV1vbNw_TAOazd_e";

// Normaliza a URL para evitar caminhos duplicados.
function normalizeSupabaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest\/v1|auth\/v1)$/, "");
}

const PROJECT_URL = normalizeSupabaseUrl(SUPABASE_URL);

let supabaseClient = null;
let currentUser = null;
let currentOrganization = null;
let properties = [];
let leads = [];
let deals = [];
let currentView = "dashboard";
let isSaving = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function byId(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showToast(message, type = "success") {
  const toast = byId("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("error", "success", "show");
  toast.classList.add(type, "show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function setLoginError(message = "") {
  const errorElement = byId("loginError");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }
}

function setLoginLoading(loading) {
  const button = byId("loginButton");
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Entrando..." : "Entrar";
}

function setConnectionLabel(message) {
  const element = byId("connectionLabel");
  if (element) element.textContent = message;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("pt-BR");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function showLogin() {
  setHidden(byId("loginScreen"), false);
  setHidden(byId("app"), true);
}

function showApplication() {
  setHidden(byId("loginScreen"), true);
  setHidden(byId("app"), false);
}

function closeModal(modalId) {
  const modal = byId(modalId);
  if (modal) modal.classList.remove("open", "active", "show");
}

function openModal(modalId) {
  const modal = byId(modalId);
  if (modal) modal.classList.add("open");
}

// ============================================
// 2. INICIALIZAÇÃO DO SUPABASE
// ============================================

function initializeSupabase() {
  if (!window.supabase?.createClient) {
    throw new Error(
      "A biblioteca do Supabase não carregou. Confira o script CDN no index.html."
    );
  }

  if (
    !PROJECT_URL.startsWith("https://") ||
    !PROJECT_URL.includes(".supabase.co") ||
    SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_N4LE8d32FUxvduzrV1vbNw_TAOazd_e") ||
    !SUPABASE_PUBLISHABLE_KEY.trim()
  ) {
    throw new Error(
      "Confira a URL do projeto e a Publishable key no início do script.js."
    );
  }

  supabaseClient = window.supabase.createClient(
    PROJECT_URL,
    SUPABASE_PUBLISHABLE_KEY.trim(),
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}

// ============================================
// 3. LOGIN E SESSÃO
// ============================================

async function handleLogin(event) {
  event.preventDefault();
  setLoginError("");

  if (!supabaseClient) {
    setLoginError("O sistema não conseguiu iniciar. Confira a configuração.");
    return;
  }

  const email = normalizeText(byId("loginEmail")?.value).toLowerCase();
  const password = byId("loginPassword")?.value || "";

  if (!email || !password) {
    setLoginError("Preencha o e-mail e a senha.");
    return;
  }

  setLoginLoading(true);

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data?.user) throw new Error("Não foi possível identificar o usuário.");

    currentUser = data.user;
    await enterApplication();
  } catch (error) {
    console.error("Erro de login:", error);
    setLoginError(getFriendlyAuthError(error));
  } finally {
    setLoginLoading(false);
  }
}

function getFriendlyAuthError(error) {
  const message = String(error?.message || "");

  if (/invalid login credentials/i.test(message)) {
    return "E-mail ou senha incorretos.";
  }

  if (/email not confirmed/i.test(message)) {
    return "Confirme seu e-mail no Supabase antes de entrar.";
  }

  if (/failed to fetch|network|fetch/i.test(message)) {
    return "Não foi possível conectar ao Supabase. Confira sua conexão e a URL do projeto.";
  }

  if (/invalid path specified in request url/i.test(message)) {
    return "O Supabase recebeu um caminho inválido. Confira a URL do projeto e se a biblioteca está carregada corretamente.";
  }

  return "Não foi possível entrar: " + message;
}

async function handleLogout() {
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    }

    currentUser = null;
    currentOrganization = null;
    properties = [];
    leads = [];
    deals = [];

    showLogin();
    setConnectionLabel("Desconectado");

    if (byId("loginPassword")) byId("loginPassword").value = "";
    setLoginError("");
  } catch (error) {
    console.error("Erro ao sair:", error);
    showToast("Não foi possível encerrar a sessão.", "error");
  }
}

async function enterApplication() {
  if (!currentUser) return;

  showApplication();
  setConnectionLabel("Conectando...");

  const profileName = byId("profileName");
  const profileEmail = byId("profileEmail");
  const profileAvatar = byId("profileAvatar");

  if (profileName) {
    profileName.textContent =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email?.split("@")[0] ||
      "Usuário";
  }

  if (profileEmail) profileEmail.textContent = currentUser.email || "";

  if (profileAvatar) {
    profileAvatar.textContent =
      (currentUser.email || "U").charAt(0).toUpperCase();
  }

  try {
    await getOrCreateOrganization();
    await loadData();
    renderAll();
    setConnectionLabel("Conectado");
    navigateTo("dashboard");
  } catch (error) {
    console.error("Erro ao carregar a imobiliária:", error);
    setConnectionLabel("Erro de conexão");
    showToast(
      "O login funcionou, mas houve um erro ao carregar os dados. Confira as tabelas e as políticas RLS.",
      "error"
    );
  }
}

// ============================================
// 4. IMOBILIÁRIA DO USUÁRIO
// ============================================

async function getOrCreateOrganization() {
  const { data, error } = await supabaseClient
    .from("imobiliarias")
    .select("*")
    .eq("owner_id", currentUser.id)
    .limit(1);

  if (error) throw error;

  if (data?.length) {
    currentOrganization = data[0];
    return currentOrganization;
  }

  const organizationName =
    currentUser.user_metadata?.company_name ||
    currentUser.user_metadata?.full_name ||
    currentUser.email?.split("@")[0] ||
    "Minha Imobiliária";

  const { data: created, error: createError } = await supabaseClient
    .from("imobiliarias")
    .insert({
      nome: organizationName,
      owner_id: currentUser.id
    })
    .select("*")
    .single();

  if (createError) throw createError;

  currentOrganization = created;
  return currentOrganization;
}

// ============================================
// 5. CARREGAMENTO DOS DADOS
// ============================================

async function loadData() {
  if (!currentOrganization) return;

  const organizationId = currentOrganization.id;

  const [propertyResult, leadResult, dealResult] = await Promise.all([
    supabaseClient
      .from("imoveis")
      .select("*")
      .eq("imobiliaria_id", organizationId)
      .order("created_at", { ascending: false }),

    supabaseClient
      .from("interessados")
      .select("*")
      .eq("imobiliaria_id", organizationId)
      .order("created_at", { ascending: false }),

    supabaseClient
      .from("negociacoes")
      .select("*")
      .eq("imobiliaria_id", organizationId)
      .order("created_at", { ascending: false })
  ]);

  if (propertyResult.error) throw propertyResult.error;
  if (leadResult.error) throw leadResult.error;
  if (dealResult.error) throw dealResult.error;

  properties = propertyResult.data || [];
  leads = leadResult.data || [];
  deals = dealResult.data || [];
}

async function refreshData() {
  try {
    await loadData();
    renderAll();
  } catch (error) {
    console.error("Erro ao atualizar dados:", error);
    showToast("Erro ao atualizar os dados.", "error");
  }
}

// ============================================
// 6. NAVEGAÇÃO
// ============================================

function navigateTo(view) {
  const knownViews = ["dashboard", "properties", "leads", "pipeline"];
  if (!knownViews.includes(view)) view = "dashboard";

  currentView = view;

  $$(".view").forEach((element) => {
    element.hidden = true;
    element.classList.remove("active");
  });

  const viewElement = byId(`view-${view}`);
  if (viewElement) {
    viewElement.hidden = false;
    viewElement.classList.add("active");
  }

  $$(".nav-item, [data-view]").forEach((element) => {
    const active =
      element.dataset.view === view ||
      element.dataset.target === view;

    element.classList.toggle("active", active);
  });

  const titles = {
    dashboard: "Dashboard",
    properties: "Imóveis",
    leads: "Interessados",
    pipeline: "Negociações"
  };

  if (byId("pageTitle")) byId("pageTitle").textContent = titles[view];
  if (byId("breadcrumb")) byId("breadcrumb").textContent = titles[view];

  if (byId("sidebar")) {
    byId("sidebar").classList.remove("open");
  }
}

function bindNavigation() {
  $$(".nav-item, [data-view]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const view = element.dataset.view || element.dataset.target;
      if (!view) return;

      event.preventDefault();
      navigateTo(view);
    });
  });

  byId("menuToggle")?.addEventListener("click", () => {
    byId("sidebar")?.classList.toggle("open");
  });

  byId("logoutButton")?.addEventListener("click", handleLogout);
}

// ============================================
// 7. DASHBOARD
// ============================================

function renderDashboard() {
  const availableProperties = properties.filter(
    (property) => property.status === "Disponível"
  );

  const activeDeals = deals.filter(
    (deal) => !["Concluído", "Perdido", "Cancelado"].includes(deal.etapa)
  );

  if (byId("statProperties")) {
    byId("statProperties").textContent = properties.length;
  }

  if (byId("statAvailable")) {
    byId("statAvailable").textContent = availableProperties.length;
  }

  if (byId("statLeads")) {
    byId("statLeads").textContent = leads.length;
  }

  if (byId("statDeals")) {
    byId("statDeals").textContent = activeDeals.length;
  }

  const recentProperties = byId("recentProperties");

  if (recentProperties) {
    const latest = properties.slice(0, 5);

    recentProperties.innerHTML = latest.length
      ? latest.map((property) => `
          <tr>
            <td>${escapeHTML(property.titulo)}</td>
            <td>${escapeHTML(property.cidade || "—")}</td>
            <td>${formatMoney(property.preco)}</td>
            <td>${escapeHTML(property.status || "Disponível")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="4">Nenhum imóvel cadastrado.</td></tr>`;
  }

  const recentLeads = byId("recentLeads");

  if (recentLeads) {
    const latest = leads.slice(0, 5);

    recentLeads.innerHTML = latest.length
      ? latest.map((lead) => `
          <tr>
            <td>${escapeHTML(lead.nome)}</td>
            <td>${escapeHTML(lead.interesse || "—")}</td>
            <td>${escapeHTML(lead.status || "Novo")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="3">Nenhum interessado cadastrado.</td></tr>`;
  }
}

// ============================================
// 8. IMÓVEIS — LISTAGEM E FILTROS
// ============================================

function renderProperties() {
  const table = byId("propertiesTable");
  if (!table) return;

  const query = normalizeText(byId("propertySearch")?.value).toLowerCase();
  const statusFilter = byId("propertyFilter")?.value || "";

  const filtered = properties.filter((property) => {
    const searchable = [
      property.titulo,
      property.cidade,
      property.bairro,
      property.endereco,
      property.tipo
    ].join(" ").toLowerCase();

    return searchable.includes(query) &&
      (!statusFilter || property.status === statusFilter);
  });

  table.innerHTML = filtered.map((property) => `
    <tr>
      <td>
        <strong>${escapeHTML(property.titulo)}</strong>
        <div class="muted">${escapeHTML(property.tipo || "Imóvel")}</div>
      </td>
      <td>${escapeHTML(property.cidade || "—")}</td>
      <td>${formatMoney(property.preco)}</td>
      <td>${escapeHTML(property.finalidade || "Venda")}</td>
      <td>${escapeHTML(property.status || "Disponível")}</td>
      <td>
        <button type="button" class="table-action" data-edit-property="${property.id}">Editar</button>
        <button type="button" class="table-action danger" data-delete-property="${property.id}">Excluir</button>
      </td>
    </tr>
  `).join("");

  setHidden(byId("propertiesEmpty"), filtered.length > 0);

  table.querySelectorAll("[data-edit-property]").forEach((button) => {
    button.addEventListener("click", () => {
      const property = properties.find(
        (item) => item.id === button.dataset.editProperty
      );
      if (property) openPropertyForm(property);
    });
  });

  table.querySelectorAll("[data-delete-property]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteProperty(button.dataset.deleteProperty);
    });
  });
}

function openPropertyForm(property = null) {
  const form = byId("propertyForm");
  if (!form) {
    showToast("Formulário de imóvel não encontrado no index.html.", "error");
    return;
  }

  form.reset();

  const values = {
    propertyId: property?.id || "",
    propertyTitle: property?.titulo || "",
    propertyType: property?.tipo || "",
    propertyPurpose: property?.finalidade || "Venda",
    propertyPrice: property?.preco ?? "",
    propertyBedrooms: property?.quartos ?? 0,
    propertyCity: property?.cidade || "",
    propertyNeighborhood: property?.bairro || "",
    propertyAddress: property?.endereco || "",
    propertyStatus: property?.status || "Disponível"
  };

  Object.entries(values).forEach(([id, value]) => {
    if (byId(id)) byId(id).value = value;
  });

  if (byId("propertyModalTitle")) {
    byId("propertyModalTitle").textContent =
      property ? "Editar imóvel" : "Novo imóvel";
  }

  openModal("propertyModal");
}

async function saveProperty(event) {
  event.preventDefault();
  if (isSaving || !currentOrganization) return;

  const id = byId("propertyId")?.value || "";

  const payload = {
    imobiliaria_id: currentOrganization.id,
    titulo: normalizeText(byId("propertyTitle")?.value),
    tipo: normalizeText(byId("propertyType")?.value),
    finalidade: byId("propertyPurpose")?.value || "Venda",
    preco: Number(byId("propertyPrice")?.value || 0),
    quartos: Number(byId("propertyBedrooms")?.value || 0),
    cidade: normalizeText(byId("propertyCity")?.value),
    bairro: normalizeText(byId("propertyNeighborhood")?.value),
    endereco: normalizeText(byId("propertyAddress")?.value),
    status: byId("propertyStatus")?.value || "Disponível"
  };

  if (!payload.titulo) {
    showToast("Informe o título do imóvel.", "error");
    return;
  }

  isSaving = true;

  try {
    const request = id
      ? supabaseClient.from("imoveis").update(payload).eq("id", id)
      : supabaseClient.from("imoveis").insert(payload);

    const { error } = await request;
    if (error) throw error;

    closeModal("propertyModal");
    await refreshData();
    showToast(id ? "Imóvel atualizado!" : "Imóvel cadastrado!");
  } catch (error) {
    console.error("Erro ao salvar imóvel:", error);
    showToast("Não foi possível salvar o imóvel: " + error.message, "error");
  } finally {
    isSaving = false;
  }
}

async function deleteProperty(id) {
  if (!confirm("Deseja realmente excluir este imóvel?")) return;

  try {
    const { error } = await supabaseClient
      .from("imoveis")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await refreshData();
    showToast("Imóvel excluído.");
  } catch (error) {
    console.error("Erro ao excluir imóvel:", error);
    showToast("Não foi possível excluir o imóvel: " + error.message, "error");
  }
}

// ============================================
// 9. INTERESSADOS — LISTAGEM E FILTROS
// ============================================

function renderLeads() {
  const table = byId("leadsTable");
  if (!table) return;

  const query = normalizeText(byId("leadSearch")?.value).toLowerCase();
  const statusFilter = byId("leadFilter")?.value || "";

  const filtered = leads.filter((lead) => {
    const searchable = [
      lead.nome,
      lead.telefone,
      lead.email,
      lead.interesse,
      lead.corretor
    ].join(" ").toLowerCase();

    return searchable.includes(query) &&
      (!statusFilter || lead.status === statusFilter);
  });

  table.innerHTML = filtered.map((lead) => `
    <tr>
      <td>
        <strong>${escapeHTML(lead.nome)}</strong>
        <div class="muted">${escapeHTML(lead.email || "")}</div>
      </td>
      <td>${escapeHTML(lead.telefone || "—")}</td>
      <td>${escapeHTML(lead.interesse || "—")}</td>
      <td>${escapeHTML(lead.status || "Novo")}</td>
      <td>${escapeHTML(lead.corretor || "—")}</td>
      <td>
        <button type="button" class="table-action" data-edit-lead="${lead.id}">Editar</button>
        <button type="button" class="table-action danger" data-delete-lead="${lead.id}">Excluir</button>
      </td>
    </tr>
  `).join("");

  setHidden(byId("leadsEmpty"), filtered.length > 0);

  table.querySelectorAll("[data-edit-lead]").forEach((button) => {
    button.addEventListener("click", () => {
      const lead = leads.find((item) => item.id === button.dataset.editLead);
      if (lead) openLeadForm(lead);
    });
  });

  table.querySelectorAll("[data-delete-lead]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteLead(button.dataset.deleteLead);
    });
  });
}

function openLeadForm(lead = null) {
  const form = byId("leadForm");
  if (!form) {
    showToast("Formulário de interessado não encontrado no index.html.", "error");
    return;
  }

  form.reset();

  const values = {
    leadId: lead?.id || "",
    leadName: lead?.nome || "",
    leadPhone: lead?.telefone || "",
    leadEmail: lead?.email || "",
    leadProperty: lead?.interesse || "",
    leadAgent: lead?.corretor || "",
    leadStatus: lead?.status || "Novo",
    leadNotes: lead?.observacoes || ""
  };

  Object.entries(values).forEach(([id, value]) => {
    if (byId(id)) byId(id).value = value;
  });

  if (byId("leadModalTitle")) {
    byId("leadModalTitle").textContent =
      lead ? "Editar interessado" : "Novo interessado";
  }

  openModal("leadModal");
}

async function saveLead(event) {
  event.preventDefault();
  if (isSaving || !currentOrganization) return;

  const id = byId("leadId")?.value || "";

  const payload = {
    imobiliaria_id: currentOrganization.id,
    nome: normalizeText(byId("leadName")?.value),
    telefone: normalizeText(byId("leadPhone")?.value),
    email: normalizeText(byId("leadEmail")?.value),
    interesse: normalizeText(byId("leadProperty")?.value),
    corretor: normalizeText(byId("leadAgent")?.value),
    status: byId("leadStatus")?.value || "Novo",
    observacoes: normalizeText(byId("leadNotes")?.value)
  };

  if (!payload.nome) {
    showToast("Informe o nome do interessado.", "error");
    return;
  }

  isSaving = true;

  try {
    const request = id
      ? supabaseClient.from("interessados").update(payload).eq("id", id)
      : supabaseClient.from("interessados").insert(payload);

    const { error } = await request;
    if (error) throw error;

    closeModal("leadModal");
    await refreshData();
    showToast(id ? "Interessado atualizado!" : "Interessado cadastrado!");
  } catch (error) {
    console.error("Erro ao salvar interessado:", error);
    showToast("Não foi possível salvar o interessado: " + error.message, "error");
  } finally {
    isSaving = false;
  }
}

async function deleteLead(id) {
  if (!confirm("Deseja realmente excluir este interessado?")) return;

  try {
    const { error } = await supabaseClient
      .from("interessados")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await refreshData();
    showToast("Interessado excluído.");
  } catch (error) {
    console.error("Erro ao excluir interessado:", error);
    showToast("Não foi possível excluir o interessado: " + error.message, "error");
  }
}

// ============================================
// 10. NEGOCIAÇÕES — QUADRO
// ============================================

function renderPipeline() {
  const board = byId("pipelineBoard");
  if (!board) return;

  const stages = ["Novo", "Contato", "Visita", "Proposta", "Concluído"];

  board.innerHTML = stages.map((stage) => {
    const stageDeals = deals.filter((deal) => deal.etapa === stage);

    return `
      <section class="pipeline-column">
        <header class="pipeline-column-header">
          <strong>${escapeHTML(stage)}</strong>
          <span>${stageDeals.length}</span>
        </header>
        <div class="pipeline-cards">
          ${stageDeals.map((deal) => {
            const lead = leads.find((item) => item.id === deal.interessado_id);
            const property = properties.find((item) => item.id === deal.imovel_id);

            return `
              <article class="pipeline-card">
                <strong>${escapeHTML(deal.titulo)}</strong>
                <p>${escapeHTML(lead?.nome || "Sem interessado vinculado")}</p>
                <p>${escapeHTML(property?.titulo || "Sem imóvel vinculado")}</p>
                <strong>${formatMoney(deal.valor)}</strong>
                <div class="pipeline-actions">
                  <select data-deal-stage="${deal.id}" aria-label="Alterar etapa">
                    ${stages.map((option) => `
                      <option value="${escapeHTML(option)}" ${option === deal.etapa ? "selected" : ""}>
                        ${escapeHTML(option)}
                      </option>
                    `).join("")}
                    <option value="Perdido" ${deal.etapa === "Perdido" ? "selected" : ""}>Perdido</option>
                  </select>
                  <button type="button" class="table-action danger" data-delete-deal="${deal.id}">Excluir</button>
                </div>
              </article>
            `;
          }).join("") || `<p class="muted">Nenhuma negociação.</p>`}
        </div>
      </section>
    `;
  }).join("");

  board.querySelectorAll("[data-deal-stage]").forEach((select) => {
    select.addEventListener("change", async () => {
      await updateDealStage(select.dataset.dealStage, select.value);
    });
  });

  board.querySelectorAll("[data-delete-deal]").forEach((button) => {
    button.addEventListener("click", () => deleteDeal(button.dataset.deleteDeal));
  });
}

async function updateDealStage(id, stage) {
  try {
    const { error } = await supabaseClient
      .from("negociacoes")
      .update({ etapa: stage })
      .eq("id", id);

    if (error) throw error;

    await refreshData();
    showToast("Etapa da negociação atualizada.");
  } catch (error) {
    console.error("Erro ao atualizar negociação:", error);
    showToast("Não foi possível atualizar a negociação.", "error");
  }
}

async function deleteDeal(id) {
  if (!confirm("Deseja excluir esta negociação?")) return;

  try {
    const { error } = await supabaseClient
      .from("negociacoes")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await refreshData();
    showToast("Negociação excluída.");
  } catch (error) {
    console.error("Erro ao excluir negociação:", error);
    showToast("Não foi possível excluir a negociação.", "error");
  }
}

// ============================================
// 11. RENDERIZAÇÃO GERAL
// ============================================

function renderAll() {
  renderDashboard();
  renderProperties();
  renderLeads();
  renderPipeline();
}

// ============================================
// 12. EVENTOS DOS FORMULÁRIOS E BOTÕES
// ============================================

function bindForms() {
  byId("loginForm")?.addEventListener("submit", handleLogin);
  byId("propertyForm")?.addEventListener("submit", saveProperty);
  byId("leadForm")?.addEventListener("submit", saveLead);

  byId("propertySearch")?.addEventListener("input", renderProperties);
  byId("propertyFilter")?.addEventListener("change", renderProperties);
  byId("leadSearch")?.addEventListener("input", renderLeads);
  byId("leadFilter")?.addEventListener("change", renderLeads);

  // Botões que podem existir no index.html.
  byId("addPropertyButton")?.addEventListener("click", () => openPropertyForm());
  byId("newPropertyButton")?.addEventListener("click", () => openPropertyForm());
  byId("addLeadButton")?.addEventListener("click", () => openLeadForm());
  byId("newLeadButton")?.addEventListener("click", () => openLeadForm());

  // Botões de fechar modal.
  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  $$(".modal-close").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");
      if (modal?.id) closeModal(modal.id);
    });
  });
}

// ============================================
// 13. INICIALIZAÇÃO DO APP
// ============================================

async function initialize() {
  bindNavigation();
  bindForms();

  try {
    initializeSupabase();

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (data?.session?.user) {
      currentUser = data.session.user;
      await enterApplication();
    } else {
      showLogin();
      setConnectionLabel("Desconectado");
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentOrganization = null;
        showLogin();
      } else if (session?.user && !currentUser) {
        currentUser = session.user;
        setTimeout(() => enterApplication(), 0);
      }
    });
  } catch (error) {
    console.error("Erro na inicialização:", error);
    showLogin();
    setConnectionLabel("Erro de conexão");

    setLoginError(
      "Erro ao iniciar o sistema: " + (error?.message || "verifique a configuração.")
    );
  }
}

document.addEventListener("DOMContentLoaded", initialize);
