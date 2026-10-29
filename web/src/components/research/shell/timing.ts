export type TimingCase = { python_seconds: number; rust_native_seconds: number; steps: number; elements: number };
export type ReferenceTiming = {
  machine: { runner_label: string; cpu_model: string; cores: number };
  date: string;
  scope?: string;
  reference_includes_output?: boolean;
  cases: Record<string, TimingCase>;
  python_seconds: number;
  rust_native_seconds: number;
};

export function completedTiming(run: { status: string; seconds: number | null; origin: string } | null) {
  return run?.status === 'done' && run.origin === 'live' && run.seconds !== null && Number.isFinite(run.seconds) && run.seconds >= 0 ? run.seconds : null;
}

export function timingText(locale: 'en' | 'es' | 'pt', seconds: number, steps: number, elements: number) {
  const n = (v: number, digits = 0) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return {
    en: `Solved in ${n(seconds, 1)} s on your device (${n(steps)} load steps, ${n(elements)} elements)`,
    es: `Resuelto en ${n(seconds, 1)} s en tu dispositivo (${n(steps)} pasos de carga, ${n(elements)} elementos)`,
    pt: `Resolvido em ${n(seconds, 1)} s no seu dispositivo (${n(steps)} passos de carga, ${n(elements)} elementos)`,
  }[locale];
}

export function referenceTimingText(locale: 'en' | 'es' | 'pt', timing: ReferenceTiming, caseId: string) {
  const c = timing.cases[caseId];
  if (!c) return null;
  const n = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1 });
  const machine = `${timing.machine.runner_label} / ${timing.machine.cpu_model}`;
  const output = timing.reference_includes_output ? {
    en: 'Python includes file/plot output; Rust solves without field export. ',
    es: 'Python incluye archivos/gráficos; Rust resuelve sin exportar campos. ',
    pt: 'Python inclui arquivos/gráficos; Rust resolve sem exportar campos. ',
  }[locale] : '';
  return {
    en: `Reference Python: ${n(c.python_seconds)} s, native Rust: ${n(c.rust_native_seconds)} s on ${machine} (same mesh, same steps; example ${caseId}). ${output}Your browser runs on a different device.`,
    es: `Python de referencia: ${n(c.python_seconds)} s, Rust nativo: ${n(c.rust_native_seconds)} s en ${machine} (misma malla, mismos pasos; ejemplo ${caseId}). ${output}Tu navegador usa otro dispositivo.`,
    pt: `Python de referência: ${n(c.python_seconds)} s, Rust nativo: ${n(c.rust_native_seconds)} s em ${machine} (mesma malha, mesmos passos; exemplo ${caseId}). ${output}Seu navegador usa outro dispositivo.`,
  }[locale];
}
