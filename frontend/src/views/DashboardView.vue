<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute, RouterLink, RouterView } from 'vue-router'
import { authStore } from '../api/auth.store'
import {
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ListOrdered,
  Barcode,
  ClipboardList,
  Layers,
  PlusCircle
} from '@lucide/vue'

const router = useRouter()
const route = useRoute()
const user = computed(() => authStore.user.value)

const sidebarOpen = ref(true)

const navItems = [
  { to: '/dashboard/gerencial', label: 'Torre de Controle',     icon: LayoutDashboard },
  { to: '/dashboard/modelos',   label: 'Catálogo de Modelos',   icon: Layers },
  { to: '/dashboard/ordens',    label: 'Gestão de Ordens',     icon: ClipboardList },
  { to: '/dashboard/rotas',     label: 'Construtor de Rota',   icon: ListOrdered },
  { to: '/dashboard/bipagem',   label: 'Bipagem Operacional',  icon: Barcode },
  { to: '/dashboard/rbac',      label: 'Permissões RBAC',      icon: ShieldCheck },
]

const visibleNavItems = computed(() => {
  return navItems.filter(item => {
    // Torre de Controle (Gerencial)
    if (item.to === '/dashboard/gerencial') {
      const perfil = authStore.user.value?.perfilNome?.toUpperCase() || ''
      return authStore.isAdmin.value || authStore.isGerente.value || perfil === 'SUPERVISOR_SETOR'
    }
    // Permissões RBAC é exclusivo para ADMIN
    if (item.to === '/dashboard/rbac') {
      return authStore.isAdmin.value
    }
    // Construtor de Rota é acessível por ADMIN, MODELISTA ou GERENTE
    if (item.to === '/dashboard/rotas') {
      return authStore.isAdmin.value || authStore.isModelista.value || authStore.isGerente.value
    }
    return true
  })
})

const activeLabel = computed(() => {
  if (route.path.endsWith('/gerencial'))  return 'Torre de Controle'
  if (route.path.endsWith('/novo-teste')) return 'Iniciar Novo Teste'
  if (route.path.endsWith('/modelos'))    return 'Catálogo de Modelos'
  if (route.path.endsWith('/ordens'))     return 'Gestão de Ordens'
  if (route.path.endsWith('/rotas'))      return 'Construtor de Rota'
  if (route.path.endsWith('/bipagem'))    return 'Bipagem Operacional'
  if (route.path.endsWith('/rbac'))       return 'Permissões RBAC'
  if (route.path.includes('/rastreamento/')) return 'Rastreamento Dual'
  return 'Dashboard'
})

function logout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="dash-root">
    <!-- ── SIDEBAR ── -->
    <aside :class="['sidebar', { 'sidebar--collapsed': !sidebarOpen }]" aria-label="Navegação principal">
      <!-- Logo / Brand -->
      <div class="sidebar-brand">
        <div class="brand-mark" aria-hidden="true">
          <div class="brand-diamond"></div>
        </div>
        <Transition name="fade-slide">
          <div v-if="sidebarOpen" class="brand-info">
            <span class="brand-name">ERP</span>
            <span class="brand-sub">Modelagem</span>
          </div>
        </Transition>
      </div>

      <!-- Stepper Quick Action Button (Destaque) -->
      <div v-if="authStore.isAdmin.value || authStore.isModelista.value || authStore.isGerente.value" class="sidebar-action-wrap">
        <RouterLink
          to="/dashboard/novo-teste"
          class="btn-sidebar-action"
          :class="{ 'btn-sidebar-action--active': route.path === '/dashboard/novo-teste' }"
          :title="!sidebarOpen ? 'Iniciar Novo Teste' : undefined"
        >
          <PlusCircle :size="18" class="action-icon" aria-hidden="true" />
          <Transition name="fade-slide">
            <span v-if="sidebarOpen" class="action-label">Iniciar Novo Teste</span>
          </Transition>
        </RouterLink>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav" role="navigation">
        <RouterLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-item--active"
          :title="!sidebarOpen ? item.label : undefined"
        >
          <component :is="item.icon" :size="18" class="nav-icon" aria-hidden="true" />
          <Transition name="fade-slide">
            <span v-if="sidebarOpen" class="nav-label">{{ item.label }}</span>
          </Transition>
          <Transition name="fade-slide">
            <ChevronRight v-if="sidebarOpen && route.path === item.to" :size="14" class="nav-chevron" aria-hidden="true" />
          </Transition>
        </RouterLink>
      </nav>

      <!-- Sidebar toggle -->
      <button
        id="btn-sidebar-toggle"
        class="sidebar-toggle"
        @click="sidebarOpen = !sidebarOpen"
        type="button"
        :aria-label="sidebarOpen ? 'Recolher barra lateral' : 'Expandir barra lateral'"
      >
        <X v-if="sidebarOpen" :size="16" aria-hidden="true" />
        <Menu v-else :size="16" aria-hidden="true" />
      </button>
    </aside>

    <!-- ── MAIN AREA ── -->
    <div class="main-wrapper">
      <!-- Top header bar -->
      <header class="top-bar">
        <div class="top-bar-left">
          <LayoutDashboard :size="16" class="top-bar-icon" aria-hidden="true" />
          <nav class="breadcrumb" aria-label="Localização atual">
            <span class="breadcrumb-root">Painel Admin</span>
            <ChevronRight :size="14" class="breadcrumb-sep" aria-hidden="true" />
            <span class="breadcrumb-current">{{ activeLabel }}</span>
          </nav>
        </div>

        <div class="top-bar-right">
          <div class="user-chip" aria-label="Usuário logado">
            <div class="user-avatar" aria-hidden="true">
              {{ (user?.nomeCompleto || user?.usuario || 'U')[0].toUpperCase() }}
            </div>
            <div class="user-info">
              <span class="user-name">{{ user?.nomeCompleto || user?.usuario || 'Usuário' }}</span>
              <span v-if="user?.perfilNome" class="user-role">{{ user.perfilNome }}</span>
            </div>
          </div>
          <button
            id="btn-logout"
            class="btn-logout"
            @click="logout"
            type="button"
            title="Sair do sistema"
          >
            <LogOut :size="15" aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <!-- Content -->
      <main class="main-content" id="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════
   LAYOUT ROOT
═══════════════════════════════════════ */
.dash-root {
  display: flex;
  min-height: 100dvh;
  background: #f1f5f9; /* slate-100 — fosco antirreflexo */
}

/* ═══════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════ */
.sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  width: 15rem;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 10;
}

.sidebar--collapsed {
  width: 3.75rem;
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1.25rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  min-height: 4.25rem;
  overflow: hidden;
}

.brand-mark {
  width: 1.75rem;
  height: 1.75rem;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.brand-diamond {
  width: 0.75rem;
  height: 0.75rem;
  background: #fff;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

.brand-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  white-space: nowrap;
}

.brand-name {
  font-size: 0.9375rem;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.brand-sub {
  font-size: 0.6875rem;
  font-weight: 500;
  color: #64748b;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Nav */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.75rem 0.5rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  background: transparent;
  border-radius: 0.5rem;
  color: #94a3b8;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-item:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.nav-item:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; }

.nav-item--active {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}

.nav-icon { flex-shrink: 0; }

.nav-label { flex: 1; }

.nav-chevron { color: #3b82f6; flex-shrink: 0; margin-left: auto; }

/* Toggle button */
.sidebar-toggle {
  margin: 0.75rem 0.5rem;
  padding: 0.625rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.5rem;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.sidebar-toggle:hover { background: rgba(255,255,255,0.1); color: #cbd5e1; }
.sidebar-toggle:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; }

/* Transition */
.fade-slide-enter-active,
.fade-slide-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.fade-slide-enter-from,
.fade-slide-leave-to { opacity: 0; transform: translateX(-6px); }

/* ═══════════════════════════════════════
   MAIN WRAPPER
═══════════════════════════════════════ */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* ═══════════════════════════════════════
   TOP BAR
═══════════════════════════════════════ */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  height: 3.75rem;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  flex-shrink: 0;
  gap: 1rem;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.top-bar-icon { color: #94a3b8; flex-shrink: 0; }

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  min-width: 0;
}

.breadcrumb-root { color: #94a3b8; font-weight: 500; white-space: nowrap; }
.breadcrumb-sep { color: #cbd5e1; flex-shrink: 0; }
.breadcrumb-current { color: #0f172a; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.75rem 0.375rem 0.375rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 2rem;
}

.user-avatar {
  width: 1.75rem;
  height: 1.75rem;
  background: linear-gradient(135deg, #0f172a, #1e40af);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.user-info { display: flex; flex-direction: column; }
.user-name { font-size: 0.8125rem; font-weight: 700; color: #0f172a; line-height: 1.2; }
.user-role { font-size: 0.6875rem; color: #64748b; font-weight: 500; }

.btn-logout {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 600;
  font-family: inherit;
  color: #475569;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.btn-logout:hover { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
.btn-logout:focus-visible { outline: 2px solid #1e40af; outline-offset: 2px; }

/* ═══════════════════════════════════════
   MAIN CONTENT
═══════════════════════════════════════ */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.75rem;
}

/* TV / ultra-wide scaling */
@media (min-width: 1920px) {
  .sidebar { width: 18rem; }
  .sidebar--collapsed { width: 5rem; }
  .top-bar { height: 4.5rem; font-size: 1.125rem; }
  .main-content { padding: 2.5rem; }
  .user-name { font-size: 1rem; }
  .btn-logout { font-size: 1rem; padding: 0.625rem 1.125rem; }
}

@media (min-width: 2560px) {
  .sidebar { width: 22rem; }
  .sidebar--collapsed { width: 6rem; }
  .top-bar { height: 5.5rem; }
  .nav-item { font-size: 1.25rem; padding: 0.875rem 1rem; }
  .main-content { padding: 3rem; }
}

/* Stepper Quick Action styles */
.sidebar-action-wrap {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
}
.btn-sidebar-action {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.6875rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 700;
  text-decoration: none;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.2);
  transition: opacity 0.2s, transform 0.15s;
}
.btn-sidebar-action:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
.btn-sidebar-action:active {
  transform: translateY(0);
}
.btn-sidebar-action--active {
  background: linear-gradient(135deg, #1e3a8a, #111827);
  box-shadow: 0 4px 12px rgba(17, 24, 39, 0.25);
}
.action-icon {
  flex-shrink: 0;
}
.action-label {
  white-space: nowrap;
}

/* Collapsed adjustment */
.sidebar--collapsed .sidebar-action-wrap {
  padding: 0.75rem 0.5rem;
}
.sidebar--collapsed .btn-sidebar-action {
  justify-content: center;
  padding: 0.6875rem 0;
  width: 100%;
}
</style>
