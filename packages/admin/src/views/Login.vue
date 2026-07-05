<template>
  <div class="login-page">
    <div class="login-card">
      <h1>{{ $t('login.title') }}</h1>
      <p class="sub">{{ $t('login.subtitle') }}</p>

      <div class="tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">{{ $t('login.tab_login') }}</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">{{ $t('login.tab_register') }}</button>
      </div>

      <form @submit.prevent="submit">
        <input v-model="username" :placeholder="$t('login.username')" required autocomplete="username" />
        <input v-if="mode === 'register'" v-model="email" :placeholder="$t('login.email')" type="email" />
        <input v-model="password" :placeholder="$t('login.password')" type="password" required autocomplete="current-password" />
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn" :disabled="loading">
          {{ loading ? $t('login.loading') : mode === 'login' ? $t('login.submit_login') : $t('login.submit_register') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../stores/auth.js'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const router = useRouter()
const { t: $t } = useI18n()
const mode = ref('login')
const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const fn = mode.value === 'login' ? api.login : api.register
    const body = mode.value === 'login'
      ? { username: username.value, password: password.value }
      : { username: username.value, email: email.value, password: password.value }
    const res = await fn(body)
    auth.setSession(res.user, res.token)
    router.push('/dashboard')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--bg);
}
.login-card {
  background: var(--surface); padding: 40px; border-radius: 12px;
  border: 1px solid var(--border); width: 380px; max-width: 90vw;
}
h1 { font-size: 24px; text-align: center; margin-bottom: 4px; }
.sub { text-align: center; color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; }
.tabs { display: flex; gap: 0; margin-bottom: 20px; }
.tabs button {
  flex: 1; padding: 8px; border: 1px solid var(--border); background: var(--bg);
  font-size: 13px; cursor: pointer; color: var(--text-secondary);
}
.tabs button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
.tabs button:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
.tabs button.active { background: var(--primary); color: white; border-color: var(--primary); }
input {
  width: 100%; padding: 10px 12px; margin-bottom: 12px; border: 1px solid var(--border);
  border-radius: var(--radius); font-size: 14px; outline: none;
}
input:focus { border-color: var(--primary); }
.btn {
  width: 100%; padding: 10px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn:hover { background: var(--primary-dark); }
.btn:disabled { opacity: 0.6; }
.error { color: var(--danger); font-size: 13px; margin-bottom: 8px; }
</style>
