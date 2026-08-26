# Auditoría de CI de M1/M2, y las tres decisiones aprobadas

Continúa `m1-m2-audit.md`. La Parte I audita el CI de los dos PR y no da ninguno por listo sin
explicar cada check ausente o rojo. La Parte II implementa las tres decisiones. La Parte III deja
abierto, con evidencia, lo que no corresponde cerrar acá.

Ramas: `feat/pro-steel-m1` (PR **#156**, draft, base `main`) y `feat/pro-steel-m2` (PR **#164**,
draft, base `feat/pro-steel-m1`).

---

# Parte I · CI

## 1 · Qué está configurado

Un solo workflow, `.github/workflows/ci.yml`, con `on: push[main]` y `on: pull_request` sin
`types`, es decir los tres por defecto (`opened`, `synchronize`, `reopened`).

| Job | Qué corre | En un PR |
|---|---|---|
| `lint` | `cargo clippy --lib` | sí |
| `test` | los ocho *gates* nombrados de `nextest` | sí |
| `suite (1)` y `suite (2)` | el resto de los ~6700 tests, particionados 2 vías | sí |
| `bench` | criterion, corto | **no** |
| `web` | `wasm-pack build` → `npm ci` → `npm run build` → `npm run test` | sí |
| `e2e` | `npx playwright test --grep @smoke` | sí |

No hay `concurrency:` en el workflow. Sí lo hay en `deploy-gh-pages.yml`.

## 2 · Jobs ausentes, uno por uno

**`bench` — salteado a propósito.** `if: github.ref == 'refs/heads/main'`. Aparece como
`skipping` en los dos PR y no es una omisión.

**La suite E2E `@slow` — nunca corrió en ninguno de los dos.** El paso está condicionado a
`github.ref == 'refs/heads/main' || contains(github.event.pull_request.labels.*.name, 'run-e2e')`.
Ni #156 ni #164 tienen etiquetas: `labels: []` en los dos. El modelo de 408 barras no se ejercitó
en CI en ninguna rama.

**Las baselines visuales — tampoco.** Mismo condicional. El paso es además `continue-on-error`,
así que aun corriendo no bloquearía.

**Typecheck y `svelte-check` — no existen como job.** `web/package.json` define `typecheck`,
`check`, `check:gate` y `test:unit`, y **ninguno** de esos scripts aparece en ningún workflow. El
job `web` corre `npm run build` y `npm run test`, y `npm run test` es `scripts/test-all.mjs`, que
es vitest en dos pases (`unit` y `build`). Un error de tipos nuevo, o un selector CSS muerto, sólo
lo ve quien corra el gate a mano.

**Los specs `@perf` — cero menciones.** `viewport-perf.spec.ts` es el único con esa etiqueta y
ningún paso de Playwright la selecciona.

**`basic-selection-permutations.spec.ts` — sin etiqueta.** No tiene `@smoke` ni `@slow`, y el
único paso que corre en un PR es `--grep @smoke`. No lo cubre nada.

## 3 · Fallos reales

**M1 tiene verde y rojo sobre el MISMO sha.** Sobre `9883e2bd` hay dos corridas de CI, ambas
`pull_request`, ambas de #156, con **un segundo** de diferencia:

| Run | Conclusión | e2e |
|---|---|---|
| `32921288831` | success | 1 flaky, 4 skipped, **336 pasan**, 0 fallan |
| `32921289231` | failure | 1 failed, 1 flaky, 4 skipped, **335 pasan** |

La diferencia es exactamente un test:
`basic-demos.spec.ts:285 › @smoke the section walkthrough › advances when the reader clicks the
member`. `Expected: "sliders" / Received: "pick"` — el recorrido se quedó en el paso `pick`, con
`retries: 1`, o sea que falló el intento y el reintento.

**Por qué el rojo no se ve.** `gh pr checks` imprime una fila por nombre de check y muestra la
última: los siete salen `pass`. El rojo sólo aparece en `statusCheckRollup`, donde conviven las
dos corridas. Sin bloque `concurrency` nada se cancela, las dos llegan hasta el final y las dos
reportan al mismo PR.

**M2 está verde**, una sola corrida por sha.

## 4 · Flakiness

`basic-demos:285` hace clic sobre el canvas en cuatro fracciones verticales hasta que el paso
avance. Ni M1 ni M2 tocan ese spec ni el modo Básico que maneja: `git diff --name-only
origin/main...origin/feat/pro-steel-m1` y el equivalente de M2 no devuelven nada bajo
`basic-demos`. Mismo sha, misma imagen de runner, resultados opuestos. Es *flakiness*, y esto es
la evidencia, no la conjetura.

Aparte, `prerender.spec.ts:240` salió `flaky` en **las dos** corridas: falla y pasa al reintento.
El propio `ci.yml` ya documenta el patrón —`browser.newContext` que no vuelve— para los specs de
landing.

## 5 · Conflictos de base

Hoy no hay ninguno abierto:

```
git merge-tree --write-tree origin/feat/pro-steel-m1 origin/main            → limpio
git merge-tree --write-tree origin/feat/pro-steel-m2 origin/feat/pro-steel-m1 → limpio
```

M1 está **4 commits detrás de main** (`2b0851a9`, `cc814798`, `5194752e`, `71426e85`: favicon,
README y el gate de assets de desarrollo). Tocan `web/index.html`, `web/src/main.ts`,
`web/vite.config.ts`, `web/public/*` y un test — ninguno de los archivos de M1 o M2.

Los conflictos que M1 reportó son los ya resueltos en §12 y §14 de `m1-m2-audit.md`. Uno de ellos
dejó consecuencia y está en la Parte III.

## 6 · Comparación con main

`git rev-list --count`: M1 aporta **30** commits sobre `main` —29 propios más el merge
`9883e2bd`— y M2 aporta **48** sobre M1, que son los 44 que ya tenía más los cuatro de este
trabajo. `feat/pro-steel-family`, base original de #156, ya estaba contenida en `main`, que es
por qué reapuntar M1 a `main` no agrandó su diff.

## 7 · Estado de los PR

| | #156 (M1) | #164 (M2) |
|---|---|---|
| Estado | OPEN, **draft** | OPEN, **draft** |
| Base | `main` | `feat/pro-steel-m1` |
| `mergeable` | MERGEABLE | MERGEABLE |
| `mergeStateStatus` | **BLOCKED** | CLEAN |
| Reviews | `REVIEW_REQUIRED`, cero | ninguna pedida |

**El `BLOCKED` de #156 no es CI.** El *ruleset* de la organización sobre la rama por defecto
(`Branch protection`, id 248328) tiene tres reglas: `deletion`, `non_fast_forward` y
`pull_request` con `required_approving_review_count: 1`. **No declara ningún status check
requerido.** En este repositorio el CI es informativo: lo único que bloquea un merge a `main` es
la aprobación que falta. #164 sale `CLEAN` porque su base no es la rama por defecto y el ruleset
no la alcanza.

También está activo el ruleset `Force commit signing`; los cuatro commits de este trabajo están
firmados (`%G? = G`).

## 8 · Veredicto

**Ninguno de los dos está listo para QA sin salvedades**, y las salvedades no son fallas de la
rama:

- el `@slow` y las baselines visuales **nunca corrieron** en ningún PR, porque falta la etiqueta
  `run-e2e`. Cualquier afirmación sobre el modelo de 408 barras en CI sería sobre algo que no se
  ejecutó;
- **no hay job de typecheck ni de `svelte-check`** en el CI, así que los dos gates que este
  trabajo usó localmente no existen del lado remoto;
- `@perf` y `basic-selection-permutations` no los mira nadie;
- M1 tiene un rojo real sobre su sha actual. Es *flakiness* demostrada, no rotura — pero mientras
  no haya `concurrency`, `gh pr checks` lo va a seguir tapando.

---

# Parte II · Las tres decisiones

Cada una en su propio commit. Antes: un cuarto commit, que es un defecto que la decisión 1
destapó y sin el cual no se podía avanzar.

## 0 · `806e1289` — una sección construida por el modal no tenía geometría

**Prerrequisito de la decisión 1**, medido antes de borrar nada.

`computeSectionProperties` devuelve `tw`, `tf`, `t` y `tl`. La rama `built` de `toSectionFields`
copiaba `a`, `iy`, `iz`, `j`, `b`, `h` y `shape` y ahí terminaba: `SectionFields` no tenía campos
de espesor. Para una pieza de catálogo eso está bien —`resolveCanonicalSection` encuentra la
entrada por el nombre y lee los espesores publicados— pero una sección construida no tiene
entrada, así que el resolvedor va por `shape` y llama `need('b','h','tw','tf')` sobre la sección
misma.

Medido, mismo perfil por los dos caminos:

| Camino | Estado canónico |
|---|---|
| Modal (`toSectionFields`) | `properties-only`, `missing: ['tw','tf']` |
| Formulario inline | `geometry-backed` |

Sin dibujo, sin extrusión y fuera de todo helper de cláusula que despache por forma. Falla ya en
`hollow-rect`, la primera plantilla de la lista. No lo detectó nada porque las propiedades son
idénticas por los dos caminos: el área, la inercia, la masa y todo resultado del solver
coincidían, y sólo difería la geometría.

## 1 · `4a458b39` — un solo catálogo para un perfil

`ProSectionsTab` pasó de 724 a 205 líneas. Se fueron la tira de familias, el buscador, la tabla
con `<tr onclick>` y el formulario de construcción inline.

Verificado **antes** de borrar:

- inventariados los consumidores. `.profile-row`, `.profile-table` y `.confirm-btn` son nombres
  de clase compartidos con Básico; el E2E que los clickea (`commercial-grade.spec.ts`) entra por
  `/app/basic`, que es `SectionChanger`, no esta pestaña;
- los generadores llegan al mismo modal por `ProfilePicker`, y la pestaña PRO por el mismo botón;
- **las 15 familias** siguen creando sección con área y con `profileFamily`, recorridas desde
  `FAMILY_LIST` y no desde un número escrito a mano;
- composición, huelgo, rotación, `ProfileSpec` y el camino de teclado están en la superficie que
  queda, y son justamente lo que la borrada nunca tuvo;
- no se toca solver ni modelo de cálculo. `toSectionFields` y `composeBuiltUp` ya eran dueños de
  cada número.

**`ColdFormedPanel` queda intacto a propósito.** También crea secciones, pero el catálogo
paramétrico C/Z no es una de las quince y no tiene equivalente en el modal: sacarlo perdería una
capacidad, no un duplicado. Es un tercer camino de alta y sigue siéndolo.

> **Divergencia con `m1-m2-open-findings-proposals.md`.** La propuesta escrita decía «no se toca
> el modal, ni `ProfilePicker`, ni **el builder**». Acá el builder también se fue, porque la
> instrucción de hoy es «el modal como única fuente de **creación**» y dejarlo habría dejado una
> segunda fuente de alta. Es la divergencia de mayor alcance de este trabajo y se señala para que
> revertirla sea una decisión y no un descubrimiento: `BuiltSectionPanel` lee exactamente
> `SECTION_SHAPES`, `THIN_SHAPES` y `SOLID_SHAPES`, las mismas listas que leía el formulario
> inline.

## 2 · `8e538631` — el cálculo auxiliar deja de dar un veredicto

La tilde estaba en **dos** lugares, y encontrar el segundo es lo que hizo que valiera la pena
arreglar el primero:

- **la ficha de resultado**: `conn-status-icon` mapeaba `ok` a `✓` sobre `--st-ok`, y la ficha de
  soldadura agregaba dos más en el rango de tamaño y en `L ≥ 4a`;
- **el encabezado de la sección**: `StageSection` pinta `done` como `✓` en `--st-ok`, y las dos
  secciones llegaban a `done` **apenas existía un objeto resultado**. No cuando el resultado era
  bueno: cuando existía. Un grupo de bulones por encima de su capacidad ponía su propio encabezado
  en verde — y también lo hacía apretar «Verify» con los valores por defecto, donde Vu y Tu son 0
  y la utilización da 0 % porque no se le pidió nada al nudo.

Sacar el glifo de la ficha y dejarlo en el encabezado de la ficha habría mudado la afirmación, no
retirado.

Se convirtió en vez de borrarse: vocabulario propio (`within / near the limit / over the limit`),
nunca el canónico `adequate` —en español la colisión está a una palabra: `conn.checkState.adequate`
es «cumple»—, sin tono de éxito en el mapeo, con etiqueta de control auxiliar antes de cualquier
número, y apuntando a §1 para el estado que cuenta. Las secciones son `optional`, nunca `done`.

**§1, la detección de nudos, conserva su `done` a propósito**: significa que el detector corrió y
encontró nudos. Un hecho sobre un paso, sin decir nada sobre si algún nudo es adecuado.

> **Divergencia con la propuesta.** Decía «reemplazar `✓ / ⚠ / ✗` por el badge de estado
> metálico». No se hizo: los cuatro estados metálicos (`NOT_DESIGNED`, `EXPERIMENTAL`,
> `DEMAND_UNAVAILABLE`, `NOT_APPLICABLE`) describen el estado de diseño de una barra, no un ratio
> de utilización, y mapear «0,4» a alguno de ellos es un error de categoría. La instrucción de hoy
> además pide explícitamente **no mezclar estados**, que es lo que reusar el badge canónico haría.

## 3 · `4b0afd2b` — la figura entra al sistema de tokens

Los cuatro literales, con el número de cada elección:

| Qué | Antes | Ahora | Medición |
|---|---|---|---|
| Pozo y relleno de vacío | `#071322` ×2 | `var(--st-bg)` | 1,14 → 1,11 contra la fila; `#071322` vs `--st-bg` = **1,02** |
| Marco | `#24486e` | `var(--st-hair-strong)` | 1,74 → **2,03** contra la fila; 1,98 → 2,07 contra el pozo |
| Guión del vacío | `#566` | `var(--st-text-2)` | **3,02 → 7,00**, cierra una falla AA preexistente |

**`--st-hair` era la lectura obvia y era la equivocada**: da 1,48, *por debajo* del 1,74 del
literal. El marco habría quedado más tenue que antes. Además, dentro del modal esta figura vive
adentro de un pozo `.preview` que ya es `--st-hair`, y un marco anidado del mismo token que el de
su contenedor es un marco que nadie ve.

Ningún token nuevo: `tokens.css` es de H1 y así lo registra
`m1-token-proposal-reconciliation.md`.

**No se actualizó ningún snapshot, y no hacía falta.** Las dos únicas baselines commiteadas son
`overlay-legend` y `batch-dialog`, las dos de superficies de hormigón en `rc-design-visual.spec.ts`,
y ninguna renderiza este componente. Tampoco hay dos temas que comparar: `tokens.css` no tiene
`prefers-color-scheme` ni `data-theme`. Seguir el tema es una propiedad que este cambio **habilita**,
no una que hoy se pueda testear.

## Gates, con exit code real

| Puerta | Resultado |
|---|---|
| Unitarios | **7977 pasan**, 12 saltados, 1 todo — `EXIT=0` |
| Build tests | 14 pasan |
| Typecheck | 473 / baseline 473, sin errores nuevos |
| Build de producción | `EXIT=0` |
| i18n es/en/pt + tokens | 180 pasan, 1 todo |
| `svelte-check` sobre las superficies tocadas | `ProSectionsTab` y `SectionFigure`: sin diagnósticos |
| E2E M1+M2, decisión 1 | **237 pasan**, 0 fallan |
| E2E M1+M2, decisión 2 | 236 pasan, 1 falla — **contención mía**: había otro Playwright y un vitest corriendo a la vez. El fallo es `locator.click` esperando `pr-stage-model`, no una aserción. Reejecutado aislado: `m2-steel-workflow` **34/34** |
| E2E `metallic-joints` | 25/25 |
| E2E `m2-section-modal` | 19/19 |

Puerto dedicado en todas las corridas; nunca 4173.

---

# Parte III · Lo que queda abierto

Ninguno se cerró. Cada uno tiene la evidencia para decidir.

## 3.1 · `.conn-ratio-badge`: CSS que main borró y la unión revivió

`main` eliminó las reglas en `2c79ed52`, un commit cuyo asunto es literalmente *«review fixes: no
green tick for steel»*. El merge de main en M1 (`9883e2bd`) resolvió el conflicto de
`ProConnectionsTab.svelte` conservando ambos lados, y con eso las revivió.

Censo sobre el archivo, en cada ref:

| Ref | `conn-ratio-badge` | `class="conn-ratio-badge` |
|---|---|---|
| `origin/main` | 0 | 0 |
| `f936f29c` (M1 antes del merge) | 4 | **0** |
| `9883e2bd` (el merge) | 4 | **0** |
| `origin/feat/pro-steel-m2` | 4 | **0** |

Es decir: **ninguna plantilla, en ninguna rama, aplica jamás esa clase**. M1 gastó un commit
(`851fd57b`) arreglando el contraste de reglas que el navegador no pinta, y
`steel-surface-colour-rules.test.ts` las fija leyendo el texto del CSS, así que el test pasa sobre
código muerto.

**Es producto, no limpieza**: main decidió que el panel de nudos no lleva badges de ratio y M1
decidió mejorarlos. Borrarlos acá tiraría el trabajo de contraste de M1 sin plantear la pregunta;
dejarlos le devuelve a main, en el merge, un CSS que sacó a propósito.

## 3.2 · `svelte-check` no ve `ProConnectionsTab.svelte`

Medido: se le agregó `.zz-probe-unused { color: red; }`, un selector deliberadamente muerto, y
`svelte-check --output human` devolvió **0** menciones de `zz-probe` y **0** de
`ProConnectionsTab`, contra **9** de `ProVerificationTab` en la misma corrida (558 errores y 287
warnings en 148 archivos). El componente no produce diagnóstico alguno.

Es la explicación de cómo 3.1 pasó inadvertido. No se diagnosticó la causa: se deja el hecho
reproducible.

## 3.3 · `TopologyPreview.svelte`: nueve literales

Es la única superficie metálica que queda con hex, y uno de ellos es **el mismo `#071322`** que
usaba la figura. Las dos previsualizaciones conviven en el panel de generadores, así que mover una
sin la otra es una decisión sobre cómo deben relacionarse, no una limpieza. Ahora está afirmado por
lista invertida: si una superficie metálica nueva trae un literal, el test falla salvo que se lo
escriba en `LITERALS_REMAIN`.

## 3.4 · `.banner-block`, todavía abierta

`components/pro/design/DesignToolbar.svelte` sigue con `border: 1px solid var(--st-accent)` sobre
`rgba(238,34,34,0.14)`. Superficie de hormigón y territorio del contrato de H1; se reafirma como
abierta en `m1-token-proposal-reconciliation.md` §343.

## 3.5 · Los huecos de CI de la Parte I

`concurrency`, el job de typecheck/`svelte-check`, la etiqueta `run-e2e`, y las tres suites que no
mira nadie (`@slow`, `@perf`, `basic-selection-permutations`). Ninguno es de estas ramas y los
cuatro cambian lo que un verde significa.
