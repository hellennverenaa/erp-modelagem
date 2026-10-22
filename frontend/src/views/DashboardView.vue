<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute, RouterLink, RouterView } from 'vue-router'
import { authStore } from '../api/auth.store'
import {
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Barcode,
  ClipboardList,
  Layers,
  PlusCircle,
  MonitorPlay,
  Activity,
  Search,
  X
} from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const user = computed(() => authStore.user.value)

const desktopSidebarExpanded = ref(true)
const mobileViewport = ref(false)
const mobileDrawerOpen = ref(false)
const searchQuery = ref('')
const compactSearchOpen = ref(false)
const compactSearchInput = ref<HTMLInputElement | null>(null)
const sidebarExpanded = computed(() => mobileViewport.value || desktopSidebarExpanded.value)
const userDisplayName = computed(() => user.value?.nomeCompleto || user.value?.usuario || 'Usuário')
const userInitial = computed(() => userDisplayName.value.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'U')

const navItems = [
  { to: '/dashboard/gerencial', label: 'Torre de Controle', icon: LayoutDashboard, permission: 'TELA_TORRE_CONTROLE' },
  { to: '/dashboard/rastreamento', label: 'TV Rastreamento', icon: MonitorPlay, permission: 'TELA_RASTREAMENTO' },
  { to: '/dashboard/modelos', label: 'Catálogo de Modelos', icon: Layers, permission: 'TELA_CATALOGO_MODELOS' },
  { to: '/dashboard/catalogo-pecas', label: 'Catálogo de Peças', icon: Layers, permission: 'TELA_CATALOGO_PECAS' },
  { to: '/dashboard/rotas', label: 'Construtor de Rota', icon: ListOrdered, permission: 'TELA_CONSTRUTOR_ROTA' },
  { to: '/dashboard/ordens', label: 'Gestão de Ordens', icon: ClipboardList, permission: 'TELA_GESTAO_ORDENS' },
  { to: '/dashboard/bipagem', label: 'Bipagem Operacional', icon: Barcode, permission: 'TELA_BIPAGEM' },
  { to: '/dashboard/inspecao', label: 'Inspeção de Qualidade', icon: ShieldCheck, permission: 'TELA_INSPECAO_QUALIDADE' },
  { to: '/dashboard/rbac', label: 'Permissões RBAC', icon: ShieldCheck, permission: 'TELA_GESTAO_RBAC' },
  { to: '/dashboard/historico', label: 'Histórico de Movimentações', icon: Activity, permission: 'TELA_HISTORICO_MOVIMENTACOES' },
]

const navSections = [
  { id: 'overview', label: 'Acesso rápido', items: [navItems[0], navItems[1]] },
  { id: 'modelagem', label: 'Modelagem', items: [navItems[2], navItems[3], navItems[4]] },
  { id: 'producao', label: 'Produção', items: [navItems[5], navItems[6], navItems[7]] },
  { id: 'administracao', label: 'Administração', items: [navItems[8], navItems[9]] },
]

const visibleNavSections = computed(() => {
  const query = normalizeSearchText(searchQuery.value.trim())

  return navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        const allowed = item.to === '/dashboard/rbac'
          ? authStore.isAdminAutomacao.value || authStore.hasPermission(item.permission)
          : authStore.hasPermission(item.permission)

        return allowed && (!query || normalizeSearchText(item.label).includes(query))
      }),
    }))
    .filter(section => section.items.length > 0)
})

const hasNavigationMatches = computed(() => visibleNavSections.value.length > 0)

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function isNavItemActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function logout() {
  authStore.logout()
  router.push({ name: 'login' })
}

function toggleSidebar() {
  if (mobileViewport.value) {
    mobileDrawerOpen.value = false
    return
  }

  desktopSidebarExpanded.value = !desktopSidebarExpanded.value
  compactSearchOpen.value = false
}

async function toggleCompactSearch() {
  compactSearchOpen.value = !compactSearchOpen.value
  if (compactSearchOpen.value) {
    await nextTick()
    compactSearchInput.value?.focus()
  }
}

function clearSearch() {
  searchQuery.value = ''
}

function closeMobileDrawer() {
  mobileDrawerOpen.value = false
}

function handleNavigation() {
  searchQuery.value = ''
  compactSearchOpen.value = false
  closeMobileDrawer()
}

function handleMediaChange() {
  const isMobile = mobileQuery?.matches ?? false
  mobileViewport.value = isMobile
  if (!isMobile) mobileDrawerOpen.value = false
  compactSearchOpen.value = false
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (mobileDrawerOpen.value) closeMobileDrawer()
  if (compactSearchOpen.value) compactSearchOpen.value = false
}

let mobileQuery: MediaQueryList | null = null
let previousBodyOverflow = ''

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 767px)')
  handleMediaChange()
  mobileQuery.addEventListener('change', handleMediaChange)
  window.addEventListener('keydown', handleGlobalKeydown)
})

watch(() => route.fullPath, () => {
  searchQuery.value = ''
  closeMobileDrawer()
  compactSearchOpen.value = false
})

watch(() => mobileViewport.value && mobileDrawerOpen.value, isOpen => {
  if (isOpen) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = previousBodyOverflow
  }
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', handleMediaChange)
  window.removeEventListener('keydown', handleGlobalKeydown)
  document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <div class="dash-root">
    <aside
      id="main-sidebar"
      :class="[
        'sidebar',
        {
          'sidebar--collapsed': !sidebarExpanded,
          'sidebar--mobile-open': mobileViewport && mobileDrawerOpen,
        },
      ]"
      aria-label="Navegação principal"
      :aria-hidden="mobileViewport && !mobileDrawerOpen ? 'true' : undefined"
      :inert="mobileViewport && !mobileDrawerOpen"
    >
      <div class="sidebar-brand">
        <div class="brand-lockup">
          <div class="brand-mark" aria-hidden="true">
            <div class="brand-diamond"></div>
          </div>
          <Transition name="fade-slide">
            <div v-if="sidebarExpanded" class="brand-info">
              <span class="brand-name">ERP</span>
              <span class="brand-sub">Modelagem</span>
            </div>
          </Transition>
        </div>

        <button
          id="btn-sidebar-toggle"
          class="sidebar-toggle"
          type="button"
          :aria-label="mobileViewport
            ? 'Fechar menu lateral'
            : desktopSidebarExpanded
              ? 'Recolher barra lateral'
              : 'Expandir barra lateral'"
          :aria-controls="'main-sidebar'"
          :aria-expanded="mobileViewport ? mobileDrawerOpen : desktopSidebarExpanded"
          @click="toggleSidebar"
        >
          <ChevronLeft v-if="mobileViewport || desktopSidebarExpanded" :size="18" aria-hidden="true" />
          <ChevronRight v-else :size="18" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="authStore.hasPermission('TELA_NOVA_ORDEM_TESTE') && (authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE') || authStore.hasPermission('CONFIGURAR_MODELO_ORDEM'))"
        class="sidebar-action-wrap"
      >
        <RouterLink
          to="/dashboard/novo-teste"
          class="btn-sidebar-action"
          :class="{ 'btn-sidebar-action--active': route.path === '/dashboard/novo-teste' }"
          :title="!sidebarExpanded ? (authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE') ? 'Iniciar Novo Teste' : 'Fila da Modelagem') : undefined"
          @click="handleNavigation"
        >
          <PlusCircle :size="19" class="action-icon" aria-hidden="true" />
          <Transition name="fade-slide">
            <span v-if="sidebarExpanded" class="action-label">{{ authStore.hasPermission('EDITAR_TELA_NOVA_ORDEM_TESTE') ? 'Iniciar Novo Teste' : 'Fila da Modelagem' }}</span>
          </Transition>
        </RouterLink>
      </div>

      <div class="sidebar-search">
        <div v-if="sidebarExpanded" class="search-control">
          <Search :size="17" class="search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            class="search-input"
            placeholder="Buscar tela"
            aria-label="Buscar telas de navegação"
          />
          <button
            v-if="searchQuery"
            class="search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="clearSearch"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </div>

        <button
          v-else
          class="search-compact"
          type="button"
          title="Buscar telas"
          aria-label="Buscar telas de navegação"
          :aria-expanded="compactSearchOpen"
          @click="toggleCompactSearch"
        >
          <Search :size="18" aria-hidden="true" />
        </button>

        <div
          v-if="!sidebarExpanded && compactSearchOpen"
          class="sidebar-search-popover"
          @keydown.esc.stop="compactSearchOpen = false"
        >
          <div class="search-control">
            <Search :size="17" class="search-icon" aria-hidden="true" />
            <input
              ref="compactSearchInput"
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="Buscar tela"
              aria-label="Buscar telas de navegação"
            />
            <button
              v-if="searchQuery"
              class="search-clear"
              type="button"
              aria-label="Limpar busca"
              @click="clearSearch"
            >
              <X :size="15" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Telas do ERP">
        <section
          v-for="section in visibleNavSections"
          :key="section.id"
          class="nav-section"
        >
          <h2 v-if="sidebarExpanded" class="nav-section-title">{{ section.label }}</h2>
          <RouterLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'nav-item--active': isNavItemActive(item.to) }"
            :title="!sidebarExpanded ? item.label : undefined"
            :aria-current="isNavItemActive(item.to) ? 'page' : undefined"
            @click="handleNavigation"
          >
            <component :is="item.icon" :size="19" class="nav-icon" aria-hidden="true" />
            <Transition name="fade-slide">
              <span v-if="sidebarExpanded" class="nav-label">{{ item.label }}</span>
            </Transition>
            <ChevronRight
              v-if="sidebarExpanded && isNavItemActive(item.to)"
              :size="15"
              class="nav-active-chevron"
              aria-hidden="true"
            />
          </RouterLink>
        </section>
        <p v-if="!hasNavigationMatches" class="nav-empty" aria-live="polite">
          Nenhuma tela encontrada
        </p>
      </nav>

      <div class="sidebar-footer">
        <div
          class="user-chip"
          aria-label="Usuário logado"
          :title="!sidebarExpanded ? userDisplayName + (user?.perfilNome ? ' — ' + user.perfilNome : '') : undefined"
        >
          <div class="user-avatar" aria-hidden="true">{{ userInitial }}</div>
          <div v-if="sidebarExpanded" class="user-info">
            <span class="user-name">{{ userDisplayName }}</span>
            <span v-if="user?.perfilNome" class="user-role">{{ user.perfilNome }}</span>
          </div>
        </div>
        <button
          id="btn-logout"
          class="btn-logout"
          type="button"
          title="Sair do sistema"
          aria-label="Sair do sistema"
          @click="logout"
        >
          <LogOut :size="17" aria-hidden="true" />
          <span v-if="sidebarExpanded">Sair</span>
        </button>
      </div>
    </aside>

    <button
      v-if="mobileViewport && mobileDrawerOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="Fechar menu lateral"
      @click="closeMobileDrawer"
    ></button>

    <div class="main-wrapper">
      <header v-if="mobileViewport" class="mobile-topbar">
        <button
          class="mobile-menu-toggle"
          type="button"
          aria-label="Abrir menu de navegação"
          aria-controls="main-sidebar"
          :aria-expanded="mobileDrawerOpen"
          @click="mobileDrawerOpen = true"
        >
          <Menu :size="20" aria-hidden="true" />
        </button>
        <div class="mobile-brand-mark" aria-hidden="true">
          <div class="brand-diamond"></div>
        </div>
        <div class="mobile-brand-info">
          <span class="mobile-brand-name">ERP</span>
          <span class="mobile-brand-sub">Modelagem</span>
        </div>
      </header>

      <main
        class="main-content"
        :class="{
          'main-content--dashboard-gerencial': route.path === '/dashboard/gerencial',
          'main-content--rastreamento': route.name === 'rastreamento-ordem',
        }"
        id="main-content"
      >
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.dash-root {
  --sidebar-bg: #0f172a;
  --sidebar-surface: #111c30;
  --sidebar-border: rgba(148, 163, 184, 0.14);
  --sidebar-muted: #94a3b8;
  --sidebar-text: #e2e8f0;
  --sidebar-blue: #3b82f6;
  display: flex;
  min-height: 100dvh;
  background: #f1f5f9;
}

.sidebar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 17.5rem;
  height: 100dvh;
  color: var(--sidebar-text);
  background: var(--sidebar-bg);
  border-right: 1px solid rgba(2, 6, 23, 0.35);
  transition: width 0.24s cubic-bezier(0.32, 0.72, 0, 1), transform 0.24s ease, box-shadow 0.24s ease;
}

.sidebar--collapsed {
  width: 4.5rem;
}

.sidebar-brand {
  display: flex;
  min-height: 4.75rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.8rem 0.75rem 1rem;
  border-bottom: 1px solid var(--sidebar-border);
}

.brand-lockup {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.brand-mark,
.mobile-brand-mark {
  display: flex;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.55rem;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  box-shadow: 0 3px 12px rgba(37, 99, 235, 0.35);
}

.brand-diamond {
  width: 0.65rem;
  height: 0.65rem;
  background: #fff;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

.brand-info,
.mobile-brand-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  white-space: nowrap;
}

.brand-name,
.mobile-brand-name {
  color: #f8fafc;
  font-size: 0.94rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.brand-sub,
.mobile-brand-sub {
  color: #7890b2;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.075em;
  line-height: 1.35;
  text-transform: uppercase;
}

.sidebar-toggle,
.search-compact,
.mobile-menu-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #9fb0c9;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 0.6rem;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.sidebar-toggle {
  width: 2rem;
  height: 2rem;
}

.sidebar-toggle:hover,
.search-compact:hover,
.mobile-menu-toggle:hover {
  color: #fff;
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(96, 165, 250, 0.35);
}

.sidebar-toggle:focus-visible,
.search-compact:focus-visible,
.mobile-menu-toggle:focus-visible,
.btn-sidebar-action:focus-visible,
.nav-item:focus-visible,
.btn-logout:focus-visible,
.search-clear:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

.sidebar--collapsed .sidebar-brand {
  min-height: 6rem;
  flex-direction: column;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.65rem 0.4rem;
}

.sidebar--collapsed .brand-lockup {
  justify-content: center;
}

.sidebar--collapsed .brand-mark {
  width: 1.8rem;
  height: 1.8rem;
}

.sidebar--collapsed .sidebar-toggle {
  width: 1.8rem;
  height: 1.65rem;
}

.sidebar-action-wrap {
  flex: 0 0 auto;
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid var(--sidebar-border);
}

.btn-sidebar-action {
  display: flex;
  min-height: 2.8rem;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.85rem;
  color: #fff;
  background: linear-gradient(120deg, #1e40af, #2456d3);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 0.65rem;
  box-shadow: 0 5px 14px rgba(29, 78, 216, 0.22);
  font-size: 0.83rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.btn-sidebar-action:hover {
  background: linear-gradient(120deg, #1d4ed8, #2563eb);
  box-shadow: 0 7px 18px rgba(29, 78, 216, 0.28);
  transform: translateY(-1px);
}

.btn-sidebar-action--active {
  background: linear-gradient(120deg, #1e3a8a, #172554);
}

.action-icon {
  flex: 0 0 auto;
}

.action-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar--collapsed .sidebar-action-wrap {
  padding: 0.65rem 0.45rem;
}

.sidebar--collapsed .btn-sidebar-action {
  justify-content: center;
  padding: 0.65rem 0;
}

.sidebar-search {
  position: relative;
  flex: 0 0 auto;
  padding: 0.75rem 0.8rem 0.35rem;
}

.search-control {
  position: relative;
  display: flex;
  min-width: 0;
  height: 2.65rem;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem;
  color: #8ea0bb;
  background: rgba(2, 6, 23, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 0.65rem;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.search-control:focus-within {
  background: rgba(2, 6, 23, 0.58);
  border-color: rgba(96, 165, 250, 0.58);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-icon {
  display: block;
  flex: 0 0 auto;
  align-self: center;
  margin: 0;
}

.search-input {
  width: 100%;
  min-width: 0;
  padding: 0;
  color: #e2e8f0;
  background: transparent;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 0.8rem;
}

.search-input::placeholder {
  color: #71829e;
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #9fb0c9;
  background: transparent;
  border: 0;
  border-radius: 0.35rem;
  cursor: pointer;
}

.search-clear:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar--collapsed .sidebar-search {
  display: flex;
  justify-content: center;
  padding: 0.6rem 0.4rem 0.45rem;
}

.search-compact {
  width: 2.8rem;
  height: 2.6rem;
}

.sidebar-search-popover {
  position: absolute;
  top: 0.55rem;
  left: calc(100% + 0.6rem);
  z-index: 30;
  width: 18rem;
  padding: 0.65rem;
  background: #111c30;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.38);
}

.sidebar-nav {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem 0.55rem 0.75rem;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: rgba(148, 163, 184, 0.32) transparent;
  scrollbar-width: thin;
}

.nav-section {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.18rem;
}

.nav-section + .nav-section {
  margin-top: 0.35rem;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.nav-section-title {
  margin: 0;
  padding: 0.1rem 0.75rem 0.42rem;
  overflow: hidden;
  color: #71829e;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.nav-item {
  position: relative;
  display: flex;
  min-height: 2.8rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.62rem 0.75rem;
  overflow: hidden;
  color: var(--sidebar-muted);
  border: 1px solid transparent;
  border-radius: 0.62rem;
  font-size: 0.84rem;
  font-weight: 550;
  text-decoration: none;
  transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.nav-item::before {
  position: absolute;
  top: 0.55rem;
  bottom: 0.55rem;
  left: 0;
  width: 3px;
  background: transparent;
  border-radius: 0 4px 4px 0;
  content: '';
  transition: background 0.16s ease;
}

.nav-item:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.055);
}

.nav-item--active {
  color: #dbeafe;
  background: rgba(37, 99, 235, 0.19);
  border-color: rgba(96, 165, 250, 0.08);
}

.nav-item--active::before {
  background: #60a5fa;
}

.nav-icon {
  flex: 0 0 auto;
  color: #8293ad;
  transition: color 0.16s ease;
}

.nav-item:hover .nav-icon,
.nav-item--active .nav-icon {
  color: #7db4ff;
}

.nav-label {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-active-chevron {
  flex: 0 0 auto;
  color: #60a5fa;
}

.sidebar--collapsed .sidebar-nav {
  align-items: center;
  padding-right: 0.45rem;
  padding-left: 0.45rem;
}

.sidebar--collapsed .nav-section {
  width: 100%;
}

.sidebar--collapsed .nav-item {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}

.sidebar--collapsed .nav-item::before {
  left: -0.45rem;
}

.sidebar--collapsed .nav-empty {
  display: none;
}

.nav-empty {
  margin: 0.5rem 0.65rem;
  color: #8ea0bb;
  font-size: 0.75rem;
  line-height: 1.45;
}

.sidebar-footer {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.7rem 0.6rem 0.65rem;
  border-top: 1px solid var(--sidebar-border);
}

.user-chip {
  display: flex;
  min-width: 0;
  min-height: 3.35rem;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.55rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 0.65rem;
}

.user-avatar {
  display: flex;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: #eff6ff;
  background: linear-gradient(140deg, #1e40af, #0f2d6e);
  border: 1px solid rgba(96, 165, 250, 0.25);
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 800;
}

.user-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.1rem;
}

.user-name,
.user-role {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-name {
  color: #e2e8f0;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
}

.user-role {
  color: #91a1ba;
  font-size: 0.65rem;
  font-weight: 550;
}

.btn-logout {
  display: flex;
  min-height: 2.65rem;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  color: #b9c5d7;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.62rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  text-align: left;
  transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.btn-logout:hover {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.18);
  border-color: rgba(248, 113, 113, 0.23);
}

.sidebar--collapsed .sidebar-footer {
  align-items: center;
  padding-right: 0.4rem;
  padding-left: 0.4rem;
}

.sidebar--collapsed .user-chip {
  justify-content: center;
  width: 100%;
  padding: 0.4rem 0;
}

.sidebar--collapsed .btn-logout {
  justify-content: center;
  width: 100%;
  padding-right: 0;
  padding-left: 0;
}

.main-wrapper {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.main-content {
  min-width: 0;
  flex: 1 1 auto;
  padding: 1.75rem;
  overflow: auto;
}

.main-content.main-content--dashboard-gerencial {
  padding: 0;
  background: #f8fafc;
}

.main-content.main-content--rastreamento {
  padding: 0;
}

.mobile-topbar {
  display: none;
}

.sidebar-backdrop {
  display: none;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

@media (min-width: 1920px) {
  .sidebar {
    width: 18.5rem;
  }

  .sidebar--collapsed {
    width: 5rem;
  }

  .main-content {
    padding: 2.5rem;
  }
}

@media (min-width: 2560px) {
  .sidebar {
    width: 21rem;
  }

  .sidebar--collapsed {
    width: 5.25rem;
  }

  .nav-item {
    min-height: 3rem;
    font-size: 0.95rem;
  }

  .main-content {
    padding: 3rem;
  }
}

@media (max-width: 767px) {
  .dash-root {
    display: block;
  }

  .sidebar,
  .sidebar--collapsed {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(20rem, 86vw);
    height: 100dvh;
    transform: translateX(-101%);
    visibility: hidden;
    transition:
      transform 0.24s cubic-bezier(0.32, 0.72, 0, 1),
      visibility 0s linear 0.24s,
      box-shadow 0.24s ease;
  }

  .sidebar--mobile-open {
    transform: translateX(0);
    visibility: visible;
    box-shadow: 18px 0 42px rgba(2, 6, 23, 0.34);
    transition:
      transform 0.24s cubic-bezier(0.32, 0.72, 0, 1),
      visibility 0s,
      box-shadow 0.24s ease;
  }

  .sidebar--collapsed .sidebar-brand,
  .sidebar-brand {
    min-height: 4.75rem;
    flex-direction: row;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 0.8rem 0.75rem 1rem;
  }

  .sidebar--collapsed .brand-lockup,
  .brand-lockup {
    justify-content: flex-start;
  }

  .sidebar--collapsed .brand-mark,
  .brand-mark {
    width: 2rem;
    height: 2rem;
  }

  .sidebar--collapsed .sidebar-toggle,
  .sidebar-toggle {
    width: 2rem;
    height: 2rem;
  }

  .sidebar--collapsed .sidebar-action-wrap,
  .sidebar-action-wrap {
    padding: 0.75rem 0.8rem;
  }

  .sidebar--collapsed .btn-sidebar-action,
  .btn-sidebar-action {
    justify-content: flex-start;
    padding: 0.65rem 0.85rem;
  }

  .sidebar--collapsed .sidebar-search,
  .sidebar-search {
    display: block;
    padding: 0.75rem 0.8rem 0.35rem;
  }

  .sidebar--collapsed .sidebar-nav,
  .sidebar-nav {
    align-items: stretch;
    padding: 0.55rem 0.55rem 0.75rem;
  }

  .sidebar--collapsed .nav-section,
  .nav-section {
    width: auto;
  }

  .sidebar--collapsed .nav-item,
  .nav-item {
    justify-content: flex-start;
    padding: 0.62rem 0.75rem;
  }

  .sidebar--collapsed .nav-item::before,
  .nav-item::before {
    left: 0;
  }

  .sidebar--collapsed .sidebar-footer,
  .sidebar-footer {
    align-items: stretch;
    padding: 0.7rem 0.6rem 0.65rem;
  }

  .sidebar--collapsed .user-chip,
  .user-chip {
    justify-content: flex-start;
    width: auto;
    padding: 0.45rem 0.55rem;
  }

  .sidebar--collapsed .btn-logout,
  .btn-logout {
    justify-content: flex-start;
    width: auto;
    padding: 0.55rem 0.75rem;
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: block;
    padding: 0;
    background: rgba(2, 6, 23, 0.56);
    border: 0;
    backdrop-filter: blur(2px);
  }

  .main-wrapper {
    height: 100dvh;
    min-height: 100dvh;
  }

  .mobile-topbar {
    position: relative;
    z-index: 5;
    display: flex;
    min-height: 3.75rem;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0 0.9rem;
    background: rgba(255, 255, 255, 0.96);
    border-bottom: 1px solid #dbe4f0;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
  }

  .mobile-menu-toggle {
    width: 2.35rem;
    height: 2.35rem;
    color: #334155;
    background: #f8fafc;
    border-color: #dbe4f0;
  }

  .mobile-brand-mark {
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 0.5rem;
  }

  .mobile-brand-name {
    color: #0f172a;
    font-size: 0.82rem;
  }

  .mobile-brand-sub {
    color: #64748b;
    font-size: 0.58rem;
  }

  .main-content {
    padding: 0.85rem;
  }
}

@media (max-width: 380px) {
  .main-content {
    padding: 0.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
