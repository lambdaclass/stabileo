# Propuesta única para M1 — tres defectos en la cromática compartida de PRO

**Origen:** H1-A y H1-B (`feat/pro-concrete-h1`, [PR #161](https://github.com/lambdaclass/stabileo/pull/161)).
**Estado: propuesta. Los tres archivos están sin tocar.**
`WorkflowStages.svelte` y `DesignOverview.svelte` no fueron editados por H1 en ningún commit.
**Decisión pendiente:** de Bauti y Diego.

Los tres son de una línea. Los tres los ve M1, porque el flujo metálico se renderiza dentro de la
misma franja de etapas y del mismo censo.

---

## 1. `WorkflowStages` — el chevron colgado

### Líneas exactas

```
web/src/components/pro/design/WorkflowStages.svelte:131   <nav class="stages" data-testid="workflow-stages">
web/src/components/pro/design/WorkflowStages.svelte:132     <ol>
web/src/components/pro/design/WorkflowStages.svelte:174       display: flex;
web/src/components/pro/design/WorkflowStages.svelte:175       flex-wrap: wrap;          ← envuelve
web/src/components/pro/design/WorkflowStages.svelte:184     .stage:not(:last-child)::after {
web/src/components/pro/design/WorkflowStages.svelte:185       content: '›';             ← el chevron
```

### Medición DOM

`e2e/h1b-panel-navigation.spec.ts`, agrupando los `<li>` por su `top`:

| ancho | fila 1 | fila 2 | `scrollWidth − clientWidth` | alto |
|---:|---|---|---:|---:|
| 1280 | `model` `demands` `check` `design` `detailing` | `documents` | 0 | 50 px |
| 1024 | idem | `documents` | 0 | 50 px |
| 900 | idem | `documents` | 0 | 50 px |
| 820 | idem | `documents` | 0 | 50 px |

**Dos hechos que corrigen cómo se venía describiendo el defecto:**

1. **No hay desborde.** `scrollWidth === clientWidth` a los cuatro anchos. Envolver no es
   desbordar, y buscarlo como desborde es por lo que H1-A lo reportó primero como "no
   reproduce".
2. **Es independiente del ancho.** Las mismas dos filas de 1280 a 820. La franja vive en el
   sidebar PRO de ancho fijo (539 px de `clientWidth`), así que **nunca fue un problema de
   viewport angosto** — mirar sólo 1280 lo hacía parecer uno.

El chevron sale de `.stage:not(:last-child)::after`. `detailing` **no** es el último hijo, así que
dibuja un `›` — y es lo último de la fila 1. Un chevron apuntando al final de la línea, y
`documents` arrancando la fila 2 sin nada que lo preceda.

### Cambio mínimo

```css
/* Un separador entre pares de la MISMA fila, no después de cada ítem. */
.stage + .stage::before { content: '›'; color: var(--st-text-2); padding: 0 0.1rem; }
/* y borrar la regla ::after de la línea 184 */
```

Un `::before` en el ítem *siguiente* se mueve con él al envolver: si `documents` baja a la fila 2,
su chevron baja con él y la fila 1 termina en un ítem. Es el mismo glifo y la misma lectura de
secuencia, en el otro lado de la junta.

Alternativa si se prefiere no envolver: `flex-wrap: nowrap` + `overflow-x: auto` en el `ol`. La
descarto: seis etapas en 539 px obligan a scroll horizontal en un elemento de navegación, que es
peor que dos filas.

### Impacto sobre M1

La franja es la misma para los dos flujos. El cambio es puramente de presentación —ni el markup,
ni los `data-testid`, ni el orden de las etapas se mueven— así que M1 no necesita adaptar nada,
pero **lo ve**.

### Tests afectados

- `e2e/h1b-panel-navigation.spec.ts` → `no wrapped row ends in a chevron pointing at nothing`
  está marcado **`test.fail()`**. Al aplicar el arreglo, Playwright lo reporta como **pass
  inesperado** y hay que sacar la marca. Está puesto así a propósito: un test que *asertara* el
  defecto habría que invertirlo.
- `the strip itself never scrolls sideways` (mismo archivo) tiene que seguir pasando.

---

## 2. `WorkflowStages` — contraste

### Líneas exactas y medición

| línea | regla | par | ratio | umbral | ¿pasa? |
|---|---|---|---:|---:|---|
| 186 | `color: var(--st-text-3)` en el `.mark` base | `#64798a` sobre `--st-surface` | **3.74** | 4.5 (texto) | **no** |
| 227 | `.stage-current .mark { color: var(--st-interactive) }` | `#4a8fd4` sobre `--st-surface-3` | **4.36** | 4.5 (texto) | **no** |
| 229 | `.stage-blocked button { color: var(--st-text-3) }` | `#64798a` sobre `--st-surface` | 3.74 | **3.0** | **sí** — inactivo |

Medido en navegador por `e2e/h1a-audit.spec.ts` a 9.9 px, en los tres idiomas.

**La 229 no es un defecto.** Una etapa bloqueada es un control inactivo, y §1.4.3 exime su texto
explícitamente. Es exactamente el uso para el que `--st-text-3` quedó reservado.

### Cambio mínimo

```css
/* 186 */ color: var(--st-text-2);                    /* 3.74 → 6.49 */
/* 227 */ .stage-current .mark {
            border-color: var(--st-interactive);       /* el borde SÍ pasa: 4.36 ≥ 3.0 */
            color: var(--st-text);                     /* → 15.74 */
          }
```

La 227 es el mismo canje que H1 midió tres veces en esta rama: el estado va al **trazo**, las
palabras a contraste pleno. `--st-interactive` como borde clara el 3:1 de §1.4.11 con 4.36; como
color de texto no clara el 4.5. No hace falta cambiar el matiz, sólo el rol.

### Impacto sobre M1

La etapa actual y la marca de etapa son de los dos flujos. Cambio visible y de una línea cada uno.

### Tests afectados

`e2e/concrete-copy-contrast.spec.ts` exime hoy `.mark` de forma indirecta (no aparece bajo
`.pro-panel` con esa clase). Al aplicarse, nada se rompe; conviene **agregar** `.mark` a las
aserciones nombradas de ese archivo para que quede fijado.

---

## 3. `DesignOverview` — el glifo del censo

### Línea exacta y medición

```
web/src/components/pro/design/DesignOverview.svelte:278   .glyph { text-align: center; }
web/src/components/pro/design/DesignOverview.svelte:280   .label { overflow: hidden; text-overflow: ellipsis; }
web/src/components/pro/design/DesignOverview.svelte:286   .tone-muted { color: var(--st-text-3); }
```

`.glyph` y `.label` no declaran color: **heredan** de `.tone-muted`. Medición DOM, a 11.2 px:

    3.74 (need 4.5)  .glyph  11.2px  rgb(100, 121, 138) on rgb(15, 30, 43) — "not verified"
    3.74 (need 4.5)  .label  11.2px  rgb(100, 121, 138) on rgb(15, 30, 43) — "not verified"

Reproducido en `en`, `es` y `pt` a 1280×720 y 1024×700 — el texto es "not verified" / "sin
verificar" / "não verificado", que es justamente el estado que un lector **no** debería tener que
esforzarse por leer.

Las otras tres tonalidades del mismo censo **sí** pasan, porque usan las variantes `-text`:
`.tone-ok` → `--st-ok` (4.88), `.tone-warn` → `--st-warn` (6.60), `.tone-bad` → `--st-danger`
(4.89). `tone-muted` es la única que tomó un token de texto que no es AA.

### Cambio mínimo

```css
/* 286 */ .tone-muted { color: var(--st-text-2); }    /* 3.74 → 6.49 */
```

Una línea. El resto del censo ya está en la convención correcta.

### Impacto sobre M1

`DesignOverview` dibuja el censo metálico con el mismo componente, así que la tonalidad "muted" de
M1 sube de contraste igual. No hay cambio de API ni de markup.

### Tests afectados

`e2e/concrete-copy-contrast.spec.ts` exime hoy `glyph` y `label` **por nombre, con el motivo
escrito**. Al aplicarse, hay que **quitar esas dos entradas** de `ALLOWED_BELOW_AA`, y el gate
empieza a cubrirlas. La exención está nombrada precisamente para que sacarla sea el paso final del
arreglo y no quede olvidada.

---

## 4. Orden de aplicación

Los tres son independientes, pero este orden deja el árbol verde en cada paso y hace visible el
efecto de cada uno:

1. **`DesignOverview:286`** — una línea, sin nada más que tocar. Después, quitar `'glyph'` y
   `'label'` de `ALLOWED_BELOW_AA` en `concrete-copy-contrast.spec.ts` y correrlo: el gate pasa a
   cubrir el censo.
2. **`WorkflowStages:186` y `:227`** — dos líneas. Dejar la 229 como está y **documentar en el
   archivo por qué**, o el próximo lector la "arregla" y baja el contraste de una etapa
   deshabilitada sin necesidad. Agregar `.mark` a las aserciones nombradas.
3. **El chevron** — el más visible y el único con riesgo de layout, así que último. Al aplicarlo,
   `no wrapped row ends in a chevron pointing at nothing` pasa a reportar un **pass inesperado**:
   sacar el `test.fail()` en el mismo commit.

También pendiente y del mismo dueño: `DesignToolbar:341` (`.group-label`, 3.74) y `:437`
(`.count-sep`). Están exentos por nombre en el mismo gate. Los dejo fuera de esta propuesta
porque `DesignToolbar` es la fila de comandos y merece su propia revisión —tiene 10 colores
crudos y dos niveles de hover en el comando de diagnóstico— no un arreglo de contraste suelto.

---

## 5. Lo que H1 ya hizo, para que no se duplique

- Las cinco superficies de estado (`dfa20d8b`) y sus consumidores (`695265ba`).
- `--st-accent` dejó de hacer de veredicto en ocho sitios de hormigón, los ocho bajo AA
  (`e67e2dc2`).
- La tipografía del visor (`92c061ec`), incluido el hallazgo de que **los controles de formulario
  no heredan la fuente**: 489 botones y 23 inputs en Arial dentro de `.app-container`. Resuelto
  sólo dentro del overlay; el caso global está en
  `docs/handoffs/h1-text-3-contrast-proposal.md` §7 y es de la hoja global, no de H1.
- Los dos saltos de encabezado (`4d6b008f`).
- La copia de hormigón fuera de `--st-text-3` (`d0ba026f`), con el token documentado como
  reservado para inactivo.
