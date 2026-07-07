import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'

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
      path: '/dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          redirect: () => {
            const userRaw = localStorage.getItem('erp_user')
            const user = userRaw ? JSON.parse(userRaw) : null
            const perfil = user?.perfilNome?.toUpperCase() || ''
            if (perfil === 'ADMIN') return '/dashboard/rbac'
            return '/dashboard/ordens'
          }
        },
        {
          path: 'rbac',
          name: 'rbac',
          component: () => import('../components/AdminRBAC.vue'),
        },
        {
          path: 'rotas',
          name: 'rotas',
          component: () => import('../components/RouteBuilder.vue'),
        },
        {
          path: 'bipagem',
          name: 'bipagem',
          component: () => import('../views/BipagemView.vue'),
        },
        {
          path: 'ordens',
          name: 'ordens',
          component: () => import('../views/GestaoOrdensView.vue'),
        },
        {
          path: 'modelos',
          name: 'modelos',
          component: () => import('../views/GestaoModelosView.vue'),
        },
        {
          path: 'novo-teste',
          name: 'novo-teste',
          component: () => import('../views/WizardCriacaoTesteView.vue'),
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

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('erp_token')
  const userRaw = localStorage.getItem('erp_user')
  const user = userRaw ? JSON.parse(userRaw) : null
  const perfil = user?.perfilNome?.toUpperCase() || ''

  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!token) {
      next({ name: 'login' })
      return
    }

    // Validação estrita de RBAC de rotas
    if (to.name === 'rbac' && perfil !== 'ADMIN') {
      next({ name: 'acesso-negado' })
      return
    }

    if ((to.name === 'rotas' || to.name === 'novo-teste') && 
        perfil !== 'ADMIN' && perfil !== 'MODELISTA' && perfil !== 'GERENTE') {
      next({ name: 'acesso-negado' })
      return
    }
  }

  if (to.name === 'login' && token) {
    next({ name: 'dashboard' })
    return
  }

  next()
})

export default router
