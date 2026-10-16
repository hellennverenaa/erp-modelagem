import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AuthSessionUnavailableView from '../views/AuthSessionUnavailableView.vue'
import { authStore } from '../api/auth.store'
import { isAuthSessionRejected } from '../api/axios'

function dashboardStartPath(): string {
  if (authStore.hasPermission('TELA_TORRE_CONTROLE')) return '/dashboard/gerencial'
  if (authStore.isAdminAutomacao.value || authStore.hasPermission('TELA_GESTAO_RBAC')) return '/dashboard/rbac'

  const user = authStore.user.value

  const preferredScreens = [
    ['TELA_GESTAO_ORDENS', '/dashboard/ordens'],
    ['TELA_BIPAGEM', '/dashboard/bipagem'],
    ['TELA_CATALOGO_MODELOS', '/dashboard/modelos'],
    ['TELA_CATALOGO_PECAS', '/dashboard/catalogo-pecas'],
    ['TELA_CONSTRUTOR_ROTA', '/dashboard/rotas'],
    ['TELA_INSPECAO_QUALIDADE', '/dashboard/inspecao'],
    ['TELA_RASTREAMENTO', '/dashboard/rastreamento'],
    ['TELA_NOVA_ORDEM_TESTE', '/dashboard/novo-teste'],
  ]
  return preferredScreens.find(([key]) => user?.permissoes?.[key] === true)?.[1] || '/dashboard/acesso-negado'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false },
    },
    {
      path: '/sessao-indisponivel',
      name: 'sessao-indisponivel',
      component: AuthSessionUnavailableView,
      meta: { requiresAuth: false },
    },
    {
      path: '/dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          redirect: dashboardStartPath,
        },
        {
          path: 'rbac',
          name: 'rbac',
          component: () => import('../components/AdminRBAC.vue'),
          meta: { requiresAuth: true, permission: 'TELA_GESTAO_RBAC' },
        },
        {
          path: 'rotas',
          name: 'rotas',
          component: () => import('../components/RouteBuilder.vue'),
          meta: { requiresAuth: true, permission: 'TELA_CONSTRUTOR_ROTA' },
        },
        {
          path: 'bipagem',
          name: 'bipagem',
          component: () => import('../views/BipagemView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_BIPAGEM' },
        },
        {
          path: 'inspecao',
          name: 'inspecao',
          component: () => import('../views/InspecaoQualidadeView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_INSPECAO_QUALIDADE' },
        },
        {
          path: 'ordens',
          name: 'ordens',
          component: () => import('../views/GestaoOrdensView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_GESTAO_ORDENS' },
        },
        {
          path: 'modelos',
          name: 'modelos',
          component: () => import('../views/GestaoModelosView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_CATALOGO_MODELOS' },
        },
        {
          path: 'catalogo-pecas',
          name: 'catalogo-pecas',
          component: () => import('../views/CatalogoPecasView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_CATALOGO_PECAS' },
        },
        {
          path: 'gerencial',
          name: 'gerencial',
          component: () => import('../views/DashboardGerencialView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_TORRE_CONTROLE' },
        },
        {
          path: 'novo-teste',
          name: 'novo-teste',
          component: () => import('../views/WizardCriacaoTesteView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_NOVA_ORDEM_TESTE' },
        },
        {
          path: 'rastreamento/:ordemTesteId?',
          name: 'rastreamento-ordem',
          component: () => import('../views/RastreamentoOrdemView.vue'),
          meta: { requiresAuth: true, permission: 'TELA_RASTREAMENTO' },
        },
        {
          path: 'acesso-negado',
          name: 'acesso-negado',
          component: {
            template: `
              <div class="acesso-negado-container">
                <h1>Acesso Negado</h1>
                <p>Voce nao possui as permissoes necessarias para acessar esta tela.</p>
              </div>
            `
          }
        }
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const token = localStorage.getItem('erp_token')

  if (to.name === 'sessao-indisponivel' && !token) return { name: 'login' }

  if (to.name === 'login' && token) {
    try {
      await authStore.refreshCurrentUser()
      return { name: 'dashboard' }
    } catch (error) {
      if (isAuthSessionRejected(error)) {
        authStore.logout()
      } else if (!authStore.user.value) {
        return { name: 'sessao-indisponivel' }
      }
    }
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (!token) return { name: 'login' }

    try {
      await authStore.refreshCurrentUser()
    } catch (error) {
      if (isAuthSessionRejected(error)) {
        authStore.logout()
        return { name: 'login' }
      }
      if (!authStore.user.value) return { name: 'sessao-indisponivel' }
    }

    if (to.name === 'rbac' && !authStore.isAdminAutomacao.value && !authStore.hasPermission('TELA_GESTAO_RBAC')) {
      return { name: 'acesso-negado' }
    }

    const permission = to.meta.permission
    if (typeof permission === 'string' && !(to.name === 'rbac' && authStore.isAdminAutomacao.value) && !authStore.hasPermission(permission)) {
      return { name: 'acesso-negado' }
    }
  }

  return true
})

export default router
