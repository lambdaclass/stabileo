class AuthStore {
  ready = $state(true);
  isLoggedIn = $state(false);
  user = $state<{ name?: string; picture?: string; email?: string } | null>(null);
  setReady() { this.ready = true; }
  logout() {}
}
export const authStore = new AuthStore();
