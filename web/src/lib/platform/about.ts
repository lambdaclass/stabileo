import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { i18n } from '../i18n';
import { buildIdentity } from '../provenance/build-identity';
import { initSolver } from '../engine/wasm-solver';
import { desktopText } from './desktop-text';

interface SystemInfo {
  version: string;
  os: string;
  arch: string;
}

const ISSUE_URL = 'https://github.com/lambdaclass/stabileo/issues/new';

async function details(): Promise<{ sys: SystemInfo; text: string }> {
  await initSolver().catch(() => undefined);
  const sys = await invoke<SystemInfo>('system_info');
  const id = buildIdentity();
  const text = [
    `Stabileo desktop ${sys.version}`,
    `Web build: ${id.appVersion} (${id.commit})`,
    `Engine: ${id.engineVersion} (${id.engineCommit})`,
    `Engine WASM SHA-256: ${id.wasmHash}`,
    `System: ${sys.os} ${sys.arch}`,
  ].join('\n');
  return { sys, text };
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

export async function showAbout(): Promise<void> {
  const tx = (k: Parameters<typeof desktopText>[1]) => desktopText(i18n.locale, k);
  const { text } = await details();
  const answer = await message(text, { title: tx('aboutTitle'), kind: 'info', buttons: { ok: tx('copy'), cancel: tx('close') } });
  if (answer === tx('copy') || answer === 'Ok') await copy(text);
}

export async function reportProblem(): Promise<void> {
  const { sys, text } = await details();
  const body = `**What happened**\n\n\n**What you expected**\n\n\n**Steps to reproduce**\n\n\n---\n${text}\n`;
  const url = `${ISSUE_URL}?labels=desktop&title=${encodeURIComponent(`[desktop ${sys.version}] `)}&body=${encodeURIComponent(body)}`;
  await openUrl(url);
}
