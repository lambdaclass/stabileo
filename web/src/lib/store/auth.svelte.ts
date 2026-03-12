// Stub: replaced by real auth store in pr/2-landing

class AuthStore {
  ready = $state(true);
  isLoggedIn = $state(false);
  user = $state<{ name?: string; picture?: string; email?: string } | null>(null);

  setReady() { this.ready = true; }
  logout() { /* stub */ }
}

export const authStore = new AuthStore();
