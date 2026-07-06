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
          redirect: '/dashboard/rbac',
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
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('erp_token')
  if (to.meta.requiresAuth && !token) {
    next({ name: 'login' })
  } else if (to.name === 'login' && token) {
    next({ name: 'dashboard' })
  } else {
    next()
  }
})

export default router
