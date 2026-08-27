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

Ninguno se cerró **al escribirse esta parte**. Cada uno tiene la evidencia para decidir. Los dos
primeros se cerraron después, en la **Parte VI**: §3.1 se borró (§31) y §3.2 resultó ser el
compilador y no el checker (§32). Se conservan como estaban para que se vea qué se sabía antes de
buscar la causa.

## 3.1 · `.conn-ratio-badge`: CSS que main borró y la unión revivió

> **Cerrado en §31 — borrado en `6448e89d`, sobre M1.** La atribución de abajo está incompleta: el
> huerfanato es de `b71432cd`, un commit de M1, dos días anterior al de main.

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

> **Diagnosticado en §32, y el título es engañoso.** `svelte-check` sí revisa el archivo: una sonda
> de tipos inyectada se reporta en `2:9`. Lo que no existe es la advertencia de CSS, porque
> `css-prune` deja de podar en cuanto un componente tiene un `class` que no puede leer estáticamente
> — 30 de 169 componentes del repositorio, 24 bajo `pro/`.

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

---

# Parte IV · El CI real de estas cuatro correcciones

Dos *pushes*, dos corridas, y entre ellas la prueba que la Parte I sólo tenía prestada de M1.

| Run | SHA | Contenido | `e2e` | Resto |
|---|---|---|---|---|
| `33008435572` | `4b0afd2b` | **las tres decisiones** + el prerrequisito | **success** | los 6 en verde |
| `33008828740` · intento 1 | `8e6cc467` | lo mismo **+ un commit de sólo documentación** | **failure** | los 6 en verde |
| `33008828740` · intento 2 | `8e6cc467` | idéntico, relanzado | **success** | los 6 en verde |

El diff entre `4b0afd2b` y `8e6cc467` es **un archivo markdown, 335 líneas insertadas**, que no
entra en ningún *bundle*. No puede cambiar el comportamiento de `basic-demos`.

Y el fallo del intento 1 fue **exactamente el mismo test** que dejó a M1 en rojo sobre su sha
duplicado: `basic-demos.spec.ts:285 › the section walkthrough`, `Expected: "sliders" / Received:
"pick"`, con `prerender.spec.ts:240` marcado *flaky* al lado, igual que allá.

Así que ahora hay **tres** demostraciones independientes de que el `e2e` de este repositorio
produce verde y rojo sobre el mismo código:

1. M1, dos corridas sobre `9883e2bd` con un segundo de diferencia — una verde, una roja;
2. M2, `4b0afd2b` verde contra `8e6cc467` rojo, separados sólo por documentación;
3. M2, `8e6cc467` intento 1 rojo e intento 2 verde — **el mismo sha, el mismo workflow**.

`gh pr checks 164` hoy da los siete en verde, porque muestra el último intento. Ése es el
comportamiento que la Parte I §3 señala: sin `concurrency` y sin distinguir intentos, la lista de
checks de un PR informa el último resultado, no el conjunto.

## Jobs, verificados de nuevo sobre estas corridas

| Job | Esperado | Obtenido |
|---|---|---|
| `lint` | sí | pass |
| `test` | sí | pass |
| `suite (1)` / `suite (2)` | sí | pass |
| `web` (build + vitest) | sí | pass |
| `e2e` (`--grep @smoke`) | sí | pass en el segundo intento |
| `bench` | **no** (`if: ref == main`) | skipping |
| typecheck / `svelte-check` | **no existe job** | — |
| E2E `@slow` y baselines visuales | **no** (sin etiqueta `run-e2e`) | no corrieron |

Rama base de #164: `feat/pro-steel-m1`, sin cambios. Conflictos: `git merge-tree` limpio contra su
base y contra `main`. Ningún job ausente que no esté explicado arriba.

## CI contra ejecución local

| | CI (Linux, `--grep @smoke`) | Local (darwin, suite completa) |
|---|---|---|
| Alcance | 340 tests | **800 pasan / 5 fallan / 1 flaky**, 67 specs, 43,2 min |
| `basic-demos:285` | **falla** (intento 1), pasa en el 2 | pasa |
| `basic-demos:160` | pasa | *flaky* — falla el 1.er intento, pasa el reintento |
| `basic-selection-permutations` | **no corre** (sin etiqueta) | falla — igual en main limpio |
| `viewport-perf @perf` | **no corre** | falla — igual en main limpio |
| `rc-design-visual` baselines | **no corre** (sin `run-e2e`) | falla 1 px — igual en main limpio |

Las tres últimas filas son la razón por la que un verde de CI en este repositorio no es una
afirmación sobre la suite: tres de los cinco fallos locales viven en specs que el CI no ejecuta.

---

# Parte V · Por qué #156 aparecía sin pasar CI, y qué era en realidad

`gh pr checks 156` daba los siete en verde y salía con código 0. La interfaz de GitHub mostraba el
PR como no aprobado. **Las dos cosas eran ciertas**, y la diferencia es lo que el comando no
muestra.

## 23 · El rojo, localizado

Sobre `9883e2bd` —la cabeza de M1, que es el propio merge de main— viven **14 check runs**, no
siete, porque hay **dos check suites de github-actions**:

| Suite | Run | Conclusión |
|---|---|---|
| `89180668079` | `32921288831` | success |
| `89180668976` | `32921289231` | **failure** |

De los 14, exactamente **uno** era rojo: `e2e` del run `32921289231`. Todo lo demás, en las dos
suites, success o skipped. `gh pr checks` imprime **una fila por nombre de check y muestra la
última**, así que el rojo no aparecía ahí; el rollup de suites y la interfaz sí lo cuentan.

Comparación que lo cierra: sobre la cabeza de M2 hay **una sola** suite de github-actions, success.
La diferencia entre los dos PR no era el código, era el número de suites.

## 24 · Por qué hubo dos corridas sobre el mismo sha

La línea de tiempo del PR lo fecha:

```
02:03:28Z   base_ref_changed        ← #156 reapuntado de feat/pro-steel-family a main
02:03:30Z   run 32921288831 creado  ← success
02:03:31Z   run 32921289231 creado  ← failure
```

Las dos con `event=pull_request`, `run_attempt=1`, el mismo `head_sha`, el mismo actor y el mismo
PR. El *push* del merge y el cambio de rama base ocurrieron con dos segundos de diferencia y
GitHub encoló **dos** corridas sobre la misma cabeza. Sin bloque `concurrency`, ninguna canceló a
la otra: las dos corrieron los ~28 minutos completos, y una de las dos pisó el *flake*.

**Clasificación: job mal configurado.** El cambio de base era legítimo y necesario —
`feat/pro-steel-family` ya estaba contenida en main — y la duplicación es del workflow, no de la
rama.

## 25 · La suite `render`, que no era el problema

Hay una tercera suite sobre el sha, de la app **`render`**, en estado `queued` con **0 check
runs**, y por eso el *status* combinado del commit da `pending`. Aparece igual sobre M1, sobre M2
y **sobre `main`**, así que no distingue nada y no explica el rojo. Es una integración dormida.
Se anota para que nadie la persiga como causa.

## 26 · Reproducción local

Worktree de `origin/feat/pro-steel-m1` con `node_modules` enlazado y el WASM copiado — `engine/` y
`package-lock.json` son idénticos entre M1 y M2, así que la única variable es el fuente de `web/`.

| Condición | Resultado |
|---|---|
| `basic-demos.spec.ts` completo ×3, `--retries=0` | `:285` **pasa 3/3** — 3,3 s · 8,0 s · 3,4 s |
| `--grep @smoke` completo, **lo mismo que corre el CI** | **336 pasan, 0 fallan, 1 flaky, 4 saltados** — 10,5 min |

El `1 flaky` es `:160`, el de siempre. La forma es **idéntica a la de la corrida verde de CI**
(336 pasan / 1 flaky / 4 saltados). **`:285` no reproduce en darwin.**

Y el número que da el mecanismo: **CI tarda 25,4 min para la misma suite que localmente tarda
10,5 — 2,4×**. El test hace cuatro clics sintéticos sobre un canvas y espera que uno impacte un
miembro; en un runner de 2 núcleos con GL por software, ese margen es otro.

## 27 · La asimetría de reintentos, que es lo que hace que este test pueda enrojecer

`basic-demos.spec.ts:159` declara `test.describe.configure({ retries: 2 })` **sólo** para
`@smoke drawing a beam` (`:160`), con su propio comentario explicando que aterrizar un clic
sintético sobre un blanco en movimiento no es determinista.

`@smoke the section walkthrough` (`:285`) hace exactamente lo mismo —`page.mouse.click` sobre el
canvas, en cuatro fracciones verticales— y **no tiene presupuesto propio**: sólo el del config,
`CI ? 1 : 0`. Por eso `:160` sale *flaky* y `:285` sale **rojo**.

**No se corrigió acá, a propósito.** `basic-demos.spec.ts` es **idéntico byte a byte entre M1 y
main**: es un spec del modo Básico que ni M1 ni M2 tocan. Cambiarlo desde una rama de acero le
daría a M1 la propiedad de un archivo que no le corresponde y crearía una superficie de merge con
main sin razón de producto. La corrección pertenece a main.

## 28 · Clasificación

| Hallazgo | Clasificación |
|---|---|
| `e2e` rojo del run `32921289231` (`basic-demos:285`) | **Flakiness**, dependiente de plataforma: sólo en el runner de CI |
| Dos corridas sobre el mismo sha | **Job mal configurado** — falta `concurrency`, disparado por un `base_ref_changed` legítimo |
| `gh pr checks` en verde con un rojo vivo | **Job mal configurado** — deduplica por nombre y muestra el último intento |
| Suite `render` en `queued` | **Entorno** — integración dormida, igual en main; no es causa |
| `mergeStateStatus: BLOCKED` | **Branch protection** — falta la aprobación; el ruleset **no declara ningún status check requerido** |
| Rama base / conflictos | **Sin problema** — `merge-tree` limpio contra main y contra M2 |
| Código de M1 | **Sin problema** — 74 archivos difieren de main y **cero** son del modo Básico |

## 29 · CI relanzado

`gh run rerun 32921289231 --failed`, sobre el **mismo sha**, sin tocar una línea:

| Run | Intento | `e2e` | Suite |
|---|---|---|---|
| `32921288831` | 1 | success | success |
| `32921289231` | 1 | **failure** | failure |
| `32921289231` | **2** | **success** | **success** |

Ahora los 14 check runs sobre `9883e2bd` son success o skipped y **las dos suites concluyen
success**. #156 dejó de aparecer en rojo sin que cambiara el código, que es la definición del
*flake* y la cuarta demostración del mismo sha con dos colores.

M2 sigue con los siete en verde sobre su cabeza.

## 30 · Lo que NO se hizo, y por qué

**No se agregó `concurrency` a `ci.yml`.** Es la corrección real del §24 y no es maquillaje, pero
`.github/workflows/ci.yml` es infraestructura de main: aplicarla desde una rama de acero le hace
cargar a M1 o M2 una política de CI de todo el repositorio, ajena al alcance metálico, que sólo
llegaría a main cuando el PR de acero se integre. Además hay un matiz que conviene decidir con la
cabeza fría y no de paso: con `cancel-in-progress: true` la primera corrida se cancela a mitad, y
una corrida cancelada tampoco es un verde — cambia un rojo por un cancelado salvo que el grupo se
elija con cuidado. El parche que corresponde, para quien sea dueño de main:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

**No se commiteó nada sobre M1.** Cualquier commit movería su cabeza fuera de `9883e2bd` y dejaría
sin efecto el verde que se acaba de obtener: haría falta otra corrida de 28 minutos para volver al
mismo punto. M1 queda intacta, en su sha verde, y todo esto se documenta desde M2, que es donde ya
vive la auditoría.

**No se tocó `basic-demos.spec.ts`** (§27), ni snapshots, ni timeouts, ni solver, Rust, Cargo o
WASM.

---

# Parte VI · Los dos hallazgos que quedaban, cerrados

La Parte III dejó `.conn-ratio-badge` (§3.1) y la ceguera de `svelte-check` (§3.2) abiertos con la
evidencia a la vista. Los dos se auditaron hasta la causa. Uno se borró; el otro resultó no ser lo
que parecía y no se toca.

## 31 · `.conn-ratio-badge` — CSS muerto, borrado

### El censo, en las tres direcciones

| Ref | `conn-ratio-badge` | `class="conn-ratio-badge` |
|---|---|---|
| `origin/main` | 0 | 0 |
| `origin/feat/pro-steel-m1` (antes de este trabajo) | 4 | **0** |
| `origin/feat/pro-steel-m2` (antes de este trabajo) | 4 | **0** |

Las cuatro apariciones estaban **todas dentro de `<style>`** — en M1, entre las líneas 587 y 632 de
un bloque que empieza en la 472. Ninguna plantilla, en ninguna rama, aplicaba jamás la clase, y
`statusClass()`, el helper que elegía entre `st-ok`, `st-warn` y `st-fail`, tampoco existe ya.

### Quién la dejó huérfana — y no fue main

La Parte III atribuía el huerfanato a `2c79ed52` de main y a la resolución por unión del merge
`9883e2bd`. Eso explica cómo **volvió**, no cómo murió. `git log -S 'class="conn-ratio-badge'`
señala a **`b71432cd`**, del 2026-08-19, que es un commit **de M1**: el que parte *Metallic joints*
en cuatro `StageSection`. Ahí el ratio se mudó al `badge` neutro del shell —

```
badge={boltResult ? `${(boltResult.governingRatio * 100).toFixed(0)}%` : undefined}
badge={weldResult ? `${(weldResult.ratio  * 100).toFixed(0)}%` : undefined}
```

— y los dos `<span class="conn-ratio-badge {statusClass(...)}">` se borraron con él. Las cuatro
reglas quedaron.

**Dos días después, `851fd57b` midió el contraste de esas reglas y reescribió los tres estados**, y
`steel-surface-colour-rules.test.ts` fijó el resultado en cinco aserciones. Un commit entero y una
suite sobre CSS que el navegador nunca pintó. `2c79ed52` de main llegó a la misma conclusión por su
cuenta y borró el bloque; el merge lo revivió.

El orden importa para la pregunta de producto que la Parte III dejó planteada. No hay dos
decisiones enfrentadas —«main dice que no van badges, M1 dice que sí»—: **M1 ya los había sacado de
la pantalla antes que main**, y lo que main borró después fue el resto. Borrarlas no tira el trabajo
de contraste de M1: ese trabajo se hizo sobre reglas que M1 misma había dejado sin consumidor.

### Qué se borró, y qué guarda quedó en su lugar

`6448e89d`, sobre **M1**, sin ninguna otra cosa adentro: 47 líneas de CSS y las cinco aserciones que
las fijaban. Y en su lugar, escritas a mano porque el compilador no las escribe (§32):

1. la hoja del panel no contiene `conn-ratio-badge` — un merge por unión no las revive una segunda
   vez sin que algo lo diga;
2. las dos sub-secciones siguen pasándole el porcentaje a `StageSection` — el número que los badges
   llevaban sigue en pantalla;
3. ningún elemento del panel lleva `st-ok` / `st-warn` / `st-fail` — un ratio no recibe **ningún**
   matiz de estado, y el vocabulario propio del bloque auxiliar (`within / near the limit / over the
   limit`, de `8e538631`) sigue siendo lo único con derecho a opinar sobre él.

La lista vacía de `--st-accent`-sobre-tinte-rojo **se conserva**: la forma del defecto sobrevive a
la única regla que la tenía. La aserción de que la selección puede seguir usando `--st-accent` se
copió textual.

Ni `✓` ni veredicto normativo volvieron por accidente: la tercera guarda es exactamente eso, y
`metallic-joints.spec.ts` sigue afirmando que con las dos calculadoras corridas ninguna sub-sección
muestra una tilde.

### Por qué sobre M1 y no sobre M2

Contradice el §30, que dejó M1 intacta para no perder su verde de 28 minutos. La razón para
cambiar de criterio es que **el CSS es de M1**: dejarlo ahí significa que #156, al integrarse,
le devuelve a main precisamente el bloque que main borró a propósito, y que el próximo merge de M1
en M2 lo revive de nuevo. El commit va a M1 y baja a M2 por merge (`--no-ff`, sin conflictos: el
bloque era idéntico carácter por carácter en las dos ramas). El costo es una corrida nueva de CI
sobre M1, que se verificó verde.

## 32 · `svelte-check` — el archivo sí se revisa; lo que no se revisa es su CSS

### Qué cubre hoy, medido

| | Alcance | Corre en CI |
|---|---|---|
| `npm run check` | `svelte-check --tsconfig ./tsconfig.json`; `include: ["src/**/*.ts", "src/**/*.svelte"]` → **1694 archivos** | **no** |
| `npm run check:gate` | la misma corrida; sólo **falla** por errores en 11 rutas de `GUARDED_PATHS` | **no** |
| `npm run typecheck` | `tsc` contra una baseline de 473 errores | **no** |

`ProConnectionsTab.svelte` **está** dentro de `src/**/*.svelte`. No es un problema de configuración
ni de alcance.

### La prueba que separa las cuatro hipótesis

Se le inyectaron **dos** sondas al archivo y se corrió `svelte-check` una vez:

```
const zzProbeType: number = 'not a number';   // sonda de tipos
.zz-probe-unused { color: red; }              // sonda de selector muerto
```

Resultado:

```
ERROR "src/components/pro/ProConnectionsTab.svelte" 2:9 "Type 'string' is not assignable to type 'number'."
COMPLETED 1694 FILES 559 ERRORS 287 WARNINGS 149 FILES_WITH_PROBLEMS
```

**El error de tipos aparece. El selector muerto no.** Contra las cuatro hipótesis del encargo:

- *ausencia de configuración* — **no** para este archivo; sí como hueco de CI, que es otra cosa y
  está abajo;
- *componente no alcanzable* — **no**: se compila, se revisa y reporta;
- *selector/test muerto* — **sí**, y es §31;
- *error real no detectado* — **sí**, pero acotado a `css_unused_selector` y con la causa **aguas
  arriba de `svelte-check`**, en el compilador.

### La causa

`svelte/compiler`, fase 2, `analyze_component`: las reglas se marcan usadas recorriendo los
elementos, y `css-prune` es **conservador por diseño** — si un elemento tiene un atributo `class`
que el compilador no puede leer estáticamente, no puede saber qué clases lleva y deja de podar.
Reproducción mínima, sin nada del repositorio:

```svelte
<div class="a">{x}</div>       <style>.zz-dead { color: red; }</style>   → Unused CSS selector ".zz-dead"
<div class="a {x}">hi</div>    <style>.zz-dead { color: red; }</style>   → sin advertencias
```

`ProConnectionsTab.svelte` tiene cuatro atributos de esa forma, todos de `8e538631`:
`class="conn-result-card {auxTone(...)}"` y `class="conn-aux-state {auxTone(...)}"`. Con uno solo
alcanza.

No es un defecto de este componente. Medido sobre el árbol entero —una sonda muerta agregada a cada
componente y compilado— **30 de los 169 componentes con `<style>` son ciegos igual, y 24 de ellos
están bajo `components/pro/`**: `ProVerificationTab`, `ProAutoLoadsDialog`, `DesignTable`,
`OutcomeBadge`, `GradePickerPanel`, `ProfileSelectorPanel`, `SteelStatusBadge`, entre otros. Los 139
restantes sí reportan, y de hecho la corrida base trae 116 `Unused CSS selector` de otros archivos:
el mecanismo funciona, y donde no funciona es por esta razón.

Es decir: la medición de la Parte III era correcta y la lectura que insinuaba —«`svelte-check` no
mira este archivo»— era falsa. Lo mira. Lo que no existe es la advertencia.

### Lo que NO se hizo, y el cambio propuesto para quien sea dueño de main

**No se agregó ningún job a CI.** La razón principal no es el costo: es que **no habría servido**.
Un job de `svelte-check` sobre `9883e2bd` habría dado exactamente 0 menciones de
`ProConnectionsTab.svelte`, igual que a mano. El hallazgo §31 no lo encuentra ninguna configuración
de CI, porque el compilador no lo emite.

Dicho eso, el hueco de CI de §2 de la Parte I es real e independiente, y ahora está costeado:

| | Medido acá |
|---|---|
| `npm run check:gate` de punta a punta | **14,4 s** |
| Errores en rutas guardadas hoy | 0 |
| Errores en `pro/steel`, `pro/generators`, `pro/section`, `pro/material`, `lib/connection`, `lib/section` | **0** |
| Errores repo-wide (informativos, no fallan) | 558, de los cuales **429 en `src/lib/engine`** |

- **Archivos:** `.github/workflows/ci.yml` — un paso más en el job `web` que ya existe, después de
  `npm ci`, no un job nuevo: no hay checkout ni instalación extra, el costo marginal es esa cadena
  de 15 s. Y `web/scripts/svelte-check-gate.mjs`, agregando a `GUARDED_PATHS` las rutas metálicas,
  que hoy están en cero y por lo tanto entran gratis.
- **Impacto:** cero sobre las corridas actuales, porque el gate ya pasa. Convierte en rojo cualquier
  error de tipos **nuevo** en superficie metálica; deja los 429 de `lib/engine` como backlog
  informativo, que es el diseño explícito del script.
- **Tests:** los que ya tiene — el gate es su propio test. Corresponde además una aserción de
  contrato de que las rutas metálicas figuran en `GUARDED_PATHS`, para que una limpieza futura no
  las saque en silencio.

No se aplica desde acá por lo mismo que el `concurrency` del §30: `ci.yml` es infraestructura de
main y una rama de acero no es el lugar para cambiar la política de CI de todo el repositorio.

**La limitación que queda documentada**, y que ningún job arregla: `css_unused_selector` no cubre
30 de los 169 componentes con estilos, 24 de ellos en `pro/`. Mientras eso siga así, el CSS muerto
en esas superficies **sólo lo encuentra un censo a mano**, del tipo que encontró §31 — o una
aserción escrita a mano, del tipo que lo reemplazó.
