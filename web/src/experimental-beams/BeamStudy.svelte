<script lang="ts">
  import { onDestroy } from 'svelte';
  import { colors, labels, reasons, point, requestFor, segmentVerdict, type Example, type Study } from './study';

  let example = $state<Example>('column');
  let amplitude = $state(0);
  let busy = $state(false);
  let error = $state('');
  let result = $state<Study | null>(null);
  let selected = $state(0);
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = $derived(result?.states[selected]);
  const points = $derived(result?.states.map(s => point(example, result!.model, s.equilibrium)) ?? []);
  const criticalPoint = $derived(result?.critical ? point(example, result.model, result.critical.nearCritical.equilibrium) : null);
  const all = $derived(criticalPoint ? [...points, criticalPoint] : points);
  const xmin = $derived(Math.min(0, ...all.map(p => p[0])));
  const xmax = $derived(Math.max(0, ...all.map(p => p[0])));
  const ymin = $derived(Math.min(0, ...all.map(p => p[1])));
  const ymax = $derived(Math.max(0, ...all.map(p => p[1])));
  const sx = (x: number) => 80 + 570 * (x - xmin) / (xmax - xmin || 0.001);
  const sy = (y: number) => 320 - 280 * (y - ymin) / (ymax - ymin || 1);
  const fmt = (x: number | null | undefined) => x == null ? 'No disponible' : x.toPrecision(5);

  function dispose() { worker?.terminate(); worker = null; clearTimeout(timer); }
  function cancel() { dispose(); busy = false; error = 'Cálculo cancelado. No se publicaron resultados de esa ejecución.'; }
  onDestroy(dispose);
  function reset() { dispose(); busy = false; result = null; error = ''; selected = 0; }
  function run() {
    reset();
    try {
      const request = requestFor(example, amplitude);
      const active = new Worker(new URL('./study.worker.ts', import.meta.url), { type: 'module' });
      worker = active;
      busy = true;
      const fail = (message: string) => {
        if (worker !== active) return;
        dispose(); busy = false; error = message;
      };
      active.onerror = () => fail('No se pudo ejecutar el motor experimental. Revisá la compilación WASM.');
      active.onmessageerror = () => fail('No se pudo leer la respuesta del motor.');
      active.onmessage = ({ data }: MessageEvent<{ result?: Study; error?: string }>) => {
        if (worker !== active) return;
        if (data.error || !data.result) { fail(data.error ?? 'Respuesta vacía del motor.'); return; }
        result = data.result;
        selected = Math.max(0, result.states.length - 1);
        dispose(); busy = false;
      };
      timer = setTimeout(() => fail('Se agotaron 60 segundos. Se canceló el worker sin aceptar resultados parciales.'), 60_000);
      active.postMessage(JSON.stringify(request));
    } catch (e) { dispose(); busy = false; error = e instanceof Error ? e.message : String(e); }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ request: requestFor(example, amplitude), result }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `beam-study-${example}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<svelte:head><title>Vigas no lineales — experimento local</title></svelte:head>
<main>
  <header><p class="eyebrow">STABILEO · EXPERIMENTO LOCAL</p><h1>Equilibrio y estabilidad</h1>
    <p>Vigas elásticas 2D con rotaciones finitas. Un estado que converge puede ser inestable.</p>
  </header>
  <form onsubmit={(event) => { event.preventDefault(); run(); }}>
    <label>Modelo<select aria-label="Modelo" bind:value={example} disabled={busy} onchange={reset}>
      <option value="column">Columna articulada · 8 elementos</option>
      <option value="arch">Medio arco simétrico · 6 elementos</option>
    </select></label>
    <label>Imperfección máxima (m)<input type="number" min="-0.005" max="0.005" step="0.00001" required bind:value={amplitude} disabled={busy} oninput={reset} /></label>
    <button disabled={busy} type="submit">{busy ? 'Calculando…' : 'Calcular'}</button>
    {#if busy}<button type="button" onclick={cancel}>Cancelar</button>{/if}
  </form>
  <p class="note">{example === 'column' ? 'Columna de 1 m, carga de referencia 1,2 π² EI/L² y control de carga. La imperfección es una semionda lateral.' : 'Medio arco de 1 m de luz y 0,1 m de altura, carga vertical de referencia 0,5 N y continuación por longitud de arco. La imperfección cambia su altura con una forma sinusoidal.'} Unidades: N y m.</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if result}
    <section aria-label="Resultados">
      <div class="result-heading"><h2>Trayectoria carga–desplazamiento</h2><button onclick={download}>Descargar JSON</button></div>
      <p role="status">{result.completed ? 'Pasos solicitados completados' : 'Trayectoria incompleta'} · {result.states.length} estados aceptados · {result.iterations} iteraciones. Completar los pasos no certifica estabilidad.</p>
      {#if points.length}
        <svg viewBox="0 0 720 380" role="img" aria-label="Curva carga desplazamiento; los colores representan la estabilidad de los estados muestreados">
          {#each [0, 0.25, 0.5, 0.75, 1] as t}
            {@const y = ymin + (ymax - ymin || 1) * t}
            <line x1="80" x2="650" y1={sy(y)} y2={sy(y)} stroke="#dae0e1" />
            <text x="70" y={sy(y) + 4} text-anchor="end">{fmt(y)}</text>
          {/each}
          <text x="80" y="20">Carga vertical (N)</text>
          <text x="80" y="345">{fmt(xmin)}</text><text x="650" y="345" text-anchor="end">{fmt(xmax || 0.001)}</text>
          <text x="365" y="370" text-anchor="middle">{example === 'column' ? 'Desplazamiento lateral del centro (m)' : 'Descenso de la clave (m)'}</text>
          {#each points as p, i}
            {#if i > 0}<line x1={sx(points[i-1][0])} y1={sy(points[i-1][1])} x2={sx(p[0])} y2={sy(p[1])} stroke={colors[segmentVerdict(result.states[i-1], result.states[i])]} stroke-width="2" />{/if}
            <circle cx={sx(p[0])} cy={sy(p[1])} r={i === selected ? 6 : 3} fill={colors[result.states[i].stability.verdict]} stroke={i === selected ? '#111' : 'none'} />
          {/each}
          {#if criticalPoint}<circle cx={sx(criticalPoint[0])} cy={sy(criticalPoint[1])} r="10" stroke="#111" stroke-width="2" fill="none" />{/if}
        </svg>
        <p class="legend">{#each Object.entries(labels) as [key, label]}<span style:color={colors[key as keyof typeof colors]}>● {label}</span>{/each} · Los segmentos solo unen muestras.</p>
        <label>Estado {selected + 1} de {points.length}<input aria-label="Estado" type="range" min="0" max={points.length - 1} step="1" bind:value={selected} /></label>
      {/if}
      {#if current}<dl>
        <div><dt>Estabilidad local</dt><dd data-testid="verdict">{labels[current.stability.verdict]}</dd></div>
        <div><dt>Factor de carga λ</dt><dd>{fmt(current.equilibrium.loadFactor)}</dd></div>
        <div><dt>Residual relativo</dt><dd>{fmt(current.equilibrium.relativeResidual)}</dd></div>
        <div><dt>Autovalor mínimo normalizado</dt><dd>{fmt(current.stability.minimum)}</dd></div>
        <div><dt>Incertidumbre espectral</dt><dd>{fmt(current.stability.uncertainty)}</dd></div>
        <div><dt>Direcciones negativas verificadas</dt><dd>{current.stability.negativeModes}</dd></div>
      </dl><p class="note">{reasons[current.stability.reason] ?? 'Diagnóstico no reconocido.'}</p>{/if}
      {#if result.critical}
        {@const critical = result.critical}
        <h3>Primera transición muestreada</h3>
        <p data-testid="critical">{critical.resolution === 'bracketed' ? 'Intervalo localizado' : 'Localización no resuelta'} · {critical.kind === 'bifurcationCandidate' ? 'Candidato a bifurcación' : critical.kind === 'limitPointCandidate' ? 'Candidato a punto límite' : 'Tipo no determinado'}.</p>
        {#if critical.resolution === 'spectralUncertainty'}<p>La incertidumbre espectral impidió reducir más el intervalo.</p>{/if}
        {#if critical.resolution === 'budgetExhausted'}<p>Se agotó el presupuesto de refinamiento. Se conservan los extremos verificados.</p>{/if}
        <p>λ del estado más cercano: {fmt(critical.nearCritical.equilibrium.loadFactor)}. Ancho del intervalo en coordenadas normalizadas: {fmt(critical.intervalSize)}.</p>
        {#if critical.correctorError}<p role="alert">{critical.correctorError}</p>{/if}
        <p class="note">El círculo marca el estado calculado más cercano, no una carga crítica exacta. En un punto límite, las cargas de los extremos no acotan necesariamente la carga máxima.</p>
      {:else}<p>No se encontró una transición de signo verificada entre las muestras. Esto no demuestra estabilidad de toda la trayectoria.</p>{/if}
    </section>
  {/if}
  <footer>Diagnóstico local del modelo discreto elástico. La incertidumbre espectral no incluye errores de malla, equilibrio o constitutivos. Se conservan los límites de deformación y rotación del experimento. No representa una verificación de capacidad de diseño.</footer>
</main>

<style>
  :global(body) { margin: 0; background: #f4f6f5; color: #182c32; font-family: system-ui, sans-serif; }
  :global(*) { box-sizing: border-box; }
  main { max-width: 1000px; margin: auto; padding: 2rem; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: .25rem 0; }
  h2 { font-size: 1.4rem; }
  p, footer { line-height: 1.6; }
  .eyebrow { letter-spacing: .12em; font-size: .75rem; font-weight: 700; }
  form, .result-heading { display: flex; gap: 1rem; align-items: end; flex-wrap: wrap; }
  form { padding: 1.5rem 0; }
  label { display: grid; gap: .4rem; font-size: .9rem; }
  input, select, button { font: inherit; padding: .65rem; border: 1px solid #99aeb0; border-radius: .35rem; }
  button { cursor: pointer; background: #173f48; color: white; }
  button:disabled { opacity: .6; cursor: wait; }
  section { background: white; border: 1px solid #d3dede; border-radius: .75rem; padding: 1.5rem; margin: 1.5rem 0; }
  svg { width: 100%; display: block; }
  svg text { font-size: 12px; fill: #344e54; }
  .result-heading { justify-content: space-between; align-items: center; }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; }
  dt, .note, footer { color: #4c6268; font-size: .85rem; }
  dd { margin: .3rem 0; font-variant-numeric: tabular-nums; }
  [role='alert'] { color: #9b2626; overflow-wrap: anywhere; }
  input[type='range'] { width: 100%; }
  @media (max-width: 600px) { main { padding: 1rem; } section { padding: .8rem; } }
</style>
