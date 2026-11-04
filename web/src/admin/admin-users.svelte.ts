import { adminApi, type AdminAccount } from '../lib/api/admin';
import { adminAuth } from './admin-auth.svelte';
import { toParams, type ListQuery } from './list-query';

export type UserAction = 'disable' | 'enable' | 'force-logout';

export interface ActionOutcome {
  account: AdminAccount;
  revoked: number | null;
}

let rows = $state<AdminAccount[]>([]);
let total = $state(0);
let loading = $state(false);
let listError = $state<unknown>(null);
let selected = $state<AdminAccount | null>(null);
let selectedId = $state<string | null>(null);
let detailLoading = $state(false);
let detailError = $state<unknown>(null);
let listSeq = 0;
let detailSeq = 0;

function replaceRow(next: AdminAccount): void {
  rows = rows.map((r) => (r.id === next.id ? next : r));
}

async function runAction(id: string, action: UserAction): Promise<ActionOutcome> {
  if (action === 'force-logout') {
    const out = await adminAuth.call(() => adminApi.forceLogout(id));
    return { account: out.data, revoked: out.revoked };
  }
  const call = action === 'disable' ? adminApi.disableUser : adminApi.enableUser;
  return { account: await adminAuth.call(() => call(id)), revoked: null };
}

export const adminUsers = {
  get rows() { return rows; },
  get total() { return total; },
  get loading() { return loading; },
  get listError() { return listError; },
  get selected() { return selected; },
  get selectedId() { return selectedId; },
  get detailLoading() { return detailLoading; },
  get detailError() { return detailError; },

  async load(query: ListQuery): Promise<void> {
    const seq = ++listSeq;
    loading = true;
    try {
      const page = await adminAuth.call(() => adminApi.listUsers(toParams(query)));
      if (seq !== listSeq) return;
      rows = page.data;
      total = page.meta.total;
      listError = null;
    } catch (e) {
      if (seq !== listSeq) return;
      listError = e;
    } finally {
      if (seq === listSeq) loading = false;
    }
  },

  async open(id: string): Promise<void> {
    const seq = ++detailSeq;
    selectedId = id;
    selected = rows.find((r) => r.id === id) ?? null;
    detailError = null;
    detailLoading = true;
    try {
      const account = await adminAuth.call(() => adminApi.getUser(id));
      if (seq !== detailSeq) return;
      selected = account;
      replaceRow(account);
    } catch (e) {
      if (seq !== detailSeq) return;
      detailError = e;
    } finally {
      if (seq === detailSeq) detailLoading = false;
    }
  },

  close(): void {
    detailSeq++;
    selectedId = null;
    selected = null;
    detailError = null;
    detailLoading = false;
  },

  async act(id: string, action: UserAction): Promise<ActionOutcome> {
    const outcome = await runAction(id, action);
    replaceRow(outcome.account);
    if (selectedId === id) selected = outcome.account;
    return outcome;
  },

  reset(): void {
    listSeq++;
    rows = [];
    total = 0;
    loading = false;
    listError = null;
    this.close();
  },
};
