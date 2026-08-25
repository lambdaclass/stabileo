# M2 — pase a QA

**Rama:** `feat/pro-steel-m2` · **PR #164, draft** · **base:** `feat/pro-steel-m1` (apilada, sin
rebase, `merge-base` en `f936f29c`).

**M2 se detiene acá.** No se abrieron áreas nuevas de uniones ni de visualización.

---

## 1. Qué probar, y qué debería ver QA

### 1.1 El workflow metálico (lo nuevo principal)

**Cómo llegar:** PRO → cinta, etapa **Diseño** → comando **Acero**.

Ocho etapas. Las dos que abren solas son las que tienen contenido: **verificación** (sus bloqueos
son la respuesta a «por qué no hay resultado») y **límites** (que contiene el inventario metálico,
que antes *era* toda la pestaña).

| Etapa | Qué debería verse |
|---|---|
| 1 · Reglamento | `elegido` si el proyecto declara CIRSOC 301; si no, `actual` |
| 2 · Material y grado | **una fila por miembro**: id, sección, familia, grado declarado, norma de producto, espesor, estado |
| 3 · Sección y perfil | **una fila por miembro**: origen, ID de catálogo, propiedades ausentes **por nombre**, y si el bloqueo es geométrico o de autoridad |
| 4 · Geometría | **bloqueada**, sobre el dato de arriostramiento |
| 5 · Hipótesis | las siete hipótesis del verificador, más **`Lb` por miembro con su fuente**, más lo no inferible |
| 7 bis · Cláusulas auditadas | **Cb** (F.1.1) calculado del diagrama o en 1 con su razón; **§E.4** con sus cuatro faltantes nombrados; **§F.6.2** con λf y Fcr calculados y la rama sin determinar |
| 6 · Análisis | `elegido` con resultados y combinaciones; `actual` sin ellos |
| 7 · Verificación | **`actual`** cuando hay esfuerzos y datos completos; **bloqueada** sólo si el cálculo no puede correr. **Nunca `hecho`.** Con siete limitaciones, ocho explicaciones y el estado de revisión |
| 8 · Límites y autoridad | el inventario metálico completo |

### 1.2 Lo que **no** debe pasar, y es lo que más importa mirar

- **Ningún tilde verde** en la etapa 7. Su estado ya **no** es la constante `'blocked'` —eso confundía
  «el cálculo no puede correr» con «nadie lo revisó»— pero `'done'` no está entre sus salidas
  posibles, y un test lo asevera. La firma profesional es **metadata de revisión**, no bloqueo.
- **Ninguna palabra de aprobación** afirmada. Las frases que dicen «verificado» o «aprobado» son
  todas **negaciones** («ninguno se presenta como aprobado»). Si QA encuentra una afirmación, es un
  bug de primera prioridad.
- **Ningún grado inventado.** Un miembro sin grado declarado muestra una raya (`—`), nunca una
  designación deducida de `fy`.
- **Ninguna barra de progreso ni porcentaje.** No hay un total del que ser fracción.

### 1.3 El selector de conformados en frío

**Cómo llegar:** misma pestaña, etapa 8 (límites) → panel metálico → sección de conformados.

- Tipear `C 100x50x15x2` o `Z 200x75x20x2.5` debe resolver. También `c 100 × 50 × 15 × 2,0`.
- **La lista de la serie está vacía a propósito** y lo dice: no hay catálogo comercial con fuente.
- Cinco hechos de alcance arriba, el **primero** es una capacidad (geometría paramétrica
  disponible) y los otros cuatro límites. Si los cinco se ven como refutaciones, es un bug.
- Un **Z** muestra el aviso de ejes rotados con el ángulo medido; un **C** no.

### 1.4 Regresiones a vigilar

| Área | Por qué |
|---|---|
| **Selección de nodos en 3D** | no se tocó `nodes-instanced.ts`, pero se midió mucho. El gizmo **no** se implementó: las esferas siguen a 0,07 m fijos |
| **La pestaña de secciones PRO** | `handleShapeConfirm` pasa dos campos más (`tl` y `built`). Ninguna sección de hormigón debería cambiar |
| **Visor 3D con secciones** | un perfil Z ahora se dibuja; antes no existía |
| **Panel de tensiones (Basic)** | un Z ya **no** se dibuja como rectángulo en 2D |
| **Propiedades de un canal C paramétrico** | cambiaron: el labio se mide desde la cara exterior, así que el área baja `2t²` (~1,8 %) |

---

## 2. Estado de las puertas

| Puerta | Resultado |
|---|---|
| `npm run test:unit` | **7316 pasan**, 12 saltados, 1 todo |
| `npm run test:build` | **14 pasan** |
| `npm run typecheck` | **473**, sin errores nuevos; la base bajó de 479 (seis ocurrencias eliminadas, enumeradas en `170064c8`) |
| E2E del workflow | **26 pasan** (aislado) |
| E2E metálicos (todos los specs que tocan acero) | **107 pasan** (aislado) |
| **E2E completa del repo** | **4 fallidos, 613 pasados**, 1,0 h — ver §2 bis |
| i18n es/en/pt | **316 claves, en paridad** |

### 2 bis · Los cuatro fallos de la suite completa

Corrida del 22-ago 19:57 → 20:59, 52 specs, `workers: 1`. **No clasificados todavía**: los
dos de temporización no se pueden juzgar con la máquina cargada, y la comparación visual necesita
una corrida aislada.

| Hora | Spec / test | Error | Qué se sabe |
|---|---|---|---|
| 20:11 | `m2-steel-workflow` → «no progress bar or percentage» | `not.toMatch(/\d+\s?%/)` | **Bug del test, no del producto.** Baneaba cualquier `NN %`, y el panel muestra legítimamente `0,76 %` — la sobrestimación por esquinas vivas del conformado en frío, que es una **medición**, dentro de `SteelPanel` en la etapa 8, que abre por defecto. Aserción corregida |
| 20:29 | `project-restore` → restore/design/3-D/reload | timeout de 900 000 ms | temporización, sin aserción equivocada |
| 20:29 | `rc-design-visual` → overlay legend | esperaba 696×34, recibió **697×34**; 645 px distintos (ratio 0,03) | 1 px de ancho. El describe se llama `@slow visual baselines (non-blocking)`. La baseline `darwin` es de **2026-07-25**, nunca actualizada, y **M2 no tocó ninguna** |
| 20:46 | `ded-roundtrip` → «7-storey page» | solve no terminó en 480 s; el test informa **«fell back to sequential: no»** | por la regla del propio test, sin fallback debe tratarse como regresión. Pendiente de corrida aislada |

**Contexto de carga:** al cerrar la suite el promedio era **20,73 / 27,77 / 18,30**, con 17 procesos
node de otros worktrees vivos. Los dos timeouts ocurrieron dentro de esa ventana.

### 2 ter · Clasificación, después de repetir cada uno aislado

Todas las repeticiones con **una sola suite**, puerto dedicado **6211**, sin actualizar snapshots,
sin tocar timeouts y sin `force`.

| Test | Aislado | Duración | Carga | Clasificación |
|---|---|---|---|---|
| `m2-steel-workflow` → percentage | **27 pasan** | 58 s | 9,7 | **Bug de mi test, corregido.** Ver abajo |
| `project-restore` → restore/reload | **pasa** | **104 s** | 2,8 → 3,7 | **Saturación.** Venció los 900 s con carga 20+; corre en 104 s con carga 3. Factor **> 8** contra el propio deadline |
| `ded-roundtrip` → 7-storey | **pasa** | **65 s** | 3,1 → **18,1** | **Saturación.** «Solve no terminó en 480 s» con carga 20+; el test completo tarda 65 s con la máquina libre |
| `rc-design-visual` → overlay legend | **falla** | 23 s / 20 s | 12,0 → 9,0 | **Preexistente, no es regresión de M2** |

**`rc-design-visual`, con la evidencia completa:**

1. reproduce aislado en M2 — determinista, no saturación;
2. la baseline `darwin` mide **696 × 34**, coincide con el «expected», y es del **2026-07-25**
   (commit `15c74e18`), **nunca actualizada**;
3. **M2 no tocó ninguna baseline**, ni `Viewport3D.svelte` —donde la leyenda es markup fijo de
   verificación RC— ni las tres claves del diccionario general que usa;
4. **corrido sobre `feat/pro-steel-m1` falla igual**: mismo 696→697 px, mismos 645 píxeles.

El describe se declara `@slow visual baselines (non-blocking)`. Queda para quien mantenga las
baselines: 1 px de ancho, consistente con deriva de fuente o de versión de Chromium.

**Un matiz sobre `ded-roundtrip`:** el mensaje del propio test dice que sin fallback a secuencial
«debe tratarse como regresión». Esa regla no contempla carga externa — el solve **sí** termina
holgadamente con la máquina libre, así que la premisa no aplica acá. Vale revisar la redacción de
ese test, no el solver.

**El fallo mío, para que QA no lo busque:** la aserción baneaba cualquier `NN %`, y el panel muestra
legítimamente `0,77 %` —la sobrestimación por esquinas vivas, una **medición**— desde
`ColdFormedPanel`, dentro de `SteelPanel` en la etapa 8, que abre por defecto. Verificado con una
sonda, no razonado. Corregido: se chequea `progressbar`, porcentaje-como-completitud y
estado-como-fracción, no el signo `%`.

---

## 3. Lo que M2 entregó

**Conformados en frío C/Z** — geometría (el Z no existía en la app), catálogo paramétrico,
designación como especificación, renderizadores 2D y 3D, y la convención del labio unificada por
integración con `120f15cc` de H1, validada de forma independiente.

**Aviso de ejes no principales** — regla pura sobre `Section.shape`, que alcanza a los **37 ángulos
catalogados** además del Z. Consumidores compartidos **no** editados; contrato y patch preparados.

**Workflow CIRSOC 301** — ocho etapas montadas y alcanzables, con detalle por miembro en 2, 3 y 5, y
contenido explicativo en 7.

**Selector PRO de secciones** — modal con **dos** divisiones (estándar y construida), diálogo
centrado con trampa de foco y restauración, composición + huelgo + rotación, y ficha completa con
la procedencia de cada número. La composición ahora es alcanzable **fuera** de un generador, que es
lo que no se podía antes. Sin sección amorfa, y hay un test que falla si aparece.

**Selector PRO de materiales** — el mismo diálogo, sobre el catálogo de Basic sin duplicarlo.
Seis categorías (no sólo metales), filtro por procedencia que Basic no puede expresar, búsqueda,
teclado completo, y ficha con **tres normas separadas**: la de producto, los reglamentos de diseño y
la que publica las bandas de espesor.

Y el defecto que cerró, medido: `ProMaterialsTab.addPreset` escribía cinco campos y descartaba
`gradeId`, `standard`, `region` y `fu`. Como `materialFamilyOf` prefiere el grado declarado y si no
cae en `fy > 80`, **el aluminio 5052-H32 (fy = 195) entraba clasificado como acero** y aparecía en
el inventario metálico. Con su `gradeId` vuelve `aluminium` / `declaredGrade`. 27 de los 28 presets
de acero traían un id que se estaba tirando en el momento de la selección.

**Presillas, según §E.6 y sólo hasta donde el reglamento llega.** La auditoría del texto embarcado
encontró bastante más de lo esperado: §E.6.1 clasifica las barras armadas en cinco grupos, y el
Grupo V es «cordones unidos por presillas a intervalos regulares». De ahí salen reglas que **sí** se
pueden modelar y se modelan, cada una con su cláusula punteada:

| Dato | Cláusula | Estado |
|---|---|---|
| Tramos mínimos = 3 | E.6.3.2(b)(2) | modelado |
| Presillas intermedias iguales y uniformemente espaciadas | E.6.3.2(b)(2) | modelado |
| Presillas en los extremos, lo más próximas posibles | E.6.3.2(b)(1) | modelado |
| Con planos paralelos, enfrentadas | E.6.3.2(b)(3) | modelado |
| Cordón verificado con longitud no arriostrada = `a`, k = 1 | E.6.3.1(b)(1) | modelado |
| `a/ri ≤ 3/4` de la esbeltez gobernante | E.6.2.2(a)(3) | **calculado** |
| **Espesor, ancho y altura de la chapa** | — | **`GEOMETRY_UNAVAILABLE`** |

Lo último no es una omisión de la app: **§E.6 no da ninguna dimensión de presilla**. La única
propiedad que nombra es `Ip`, su momento de inercia en el plano, y sólo dentro de la condición
`np·Ip/h ≥ 10·I1/a` (E.6.19); el dimensionamiento se remite al Capítulo F para la chapa y al J para
sus uniones. Así que se muestra el estado y la condición, no una chapa inventada.

Y una limitación que conviene leer dos veces: **la separación `a` queda en `—` dentro del selector**,
porque una sección no tiene longitud. `a = L/3` recién existe cuando la sección está sobre un
miembro. Mostrar `L/3` contra una longitud supuesta sería exactamente la geometría ficticia que el
alcance prohíbe.

**Geometría de cabriadas** — Pratt y Howe estaban intercambiados, verificado por estática y
corregido en el generador y en las etiquetas es/en/pt. Warren nuevo, sin montantes interiores.
Subdivisión de diagonales opcional, que **parte** la diagonal y el cordón en lugar de cruzarlos.

**Del verificador**, tres de cuatro bloqueos atendidos: 18 tests de referencia, el fin de siete
valores inventados (y un **defecto de inversión de ejes** que nadie había nombrado), y el mapa de
cláusulas citado del texto embarcado.

---

## 3 bis · El workflow metálico, en cinco etapas

Eran ocho y son cinco. Las ocho no estaban mal: eran **las piezas en el orden en que se
construyeron**, no un recorrido. Y cuatro de ellas —grado, sección, geometría, hipótesis— más
verificación son **una sola pregunta hecha sobre cinco entradas**: «¿son adecuadas las secciones
que elegí?».

| # | Etapa | Qué contiene |
|---|---|---|
| 1 | Modelado | qué hay modelado en acero y si ya se calculó |
| 2 | Reglamentos | cuál se declara, y que declarar no es certificar |
| 3 | Secciones, hipótesis y verificación | las cinco ex-etapas, **cada una con su propio estado** |
| 4 | Uniones | los nudos reales y qué se puede definir de cada uno |
| 5 | Documentos | qué llevará un documento |

Lo que QA debería mirar con atención en la etapa 3: **fusionar cinco etapas en una no fusionó
cinco respuestas en una.** Cada sub-sección muestra su estado, así que se sigue viendo *cuál* de
las cinco bloquea. Si eso se pierde, la etapa 3 se vuelve una caja negra.

`limits` dejó de ser etapa y es pie de página: aplica a todas las de arriba, así que numerarla
después de la última implicaba que llegaba al final.

**La compuerta del reglamento cambió de pregunta.** `roleUsable` devuelve `false` en cuanto la
madurez es `UNSUPPORTED`, y CIRSOC 301 lo es —correctamente, no hay adaptador—, así que
condicionar el avance a `usable` significaba que elegir un reglamento no destrabara nada nunca.
Ahora avanzar depende de `steelCodeDeclared`; sólo un resultado certificado depende de `usable`.
La madurez no se tocó.

**La firma humana es metadata**, no bloqueo. Estaba listada como sexto bloqueante, lo que
confundía dos cosas distintas: si el cálculo puede correr —pregunta de desarrollo, con respuesta
fáctica— y si una persona lo revisó —estado de revisión que llega después—.

### 3 ter · Uniones: qué se calcula y qué no

La etapa nombra las dos mitades en vez de dejarlas inferir de un campo vacío:

| Dato | Estado | Cláusula |
|---|---|---|
| Separación mínima entre bulones | **calculado** | J.3.3 |
| Distancia mínima al borde | **de tabla** | Tabla J.3.4 |
| Distancia y separación máximas | **calculado** | J.3.5 |
| Agujero normal | **de tabla** | Tabla J.3.3 |
| Dimensiones de chapa | `GEOMETRY_UNAVAILABLE` | se dimensiona desde una solicitación que la etapa no tiene |
| Tamaño de soldadura | `GEOMETRY_UNAVAILABLE` | requiere solicitación y espesores |
| Dimensiones de presilla | `GEOMETRY_UNAVAILABLE` | §E.6 no da ninguna; sólo `np·Ip/h ≥ 10·I1/a` (E.6.19) |

### 3 quater · Visualización 3D

**Los nodos ahora se dimensionan según el modelo.** Eran una esfera fija de 0,07 m — un tercio de
una barra en un modelo de 2 m, una mota en una nave de 30 m. El banco de picking de esta misma
rama midió la consecuencia en pantalla: **8 px en un extremo y 144 px en el otro**, para el mismo
marcador.

El radio es una fracción de la diagonal del modelo, **acotada arriba y abajo**. Y el piso no es
estético: `NodesInstanced` hace raycast sobre la malla visible, así que **el marcador ES el
blanco de click**. Achicarlo para que se vea prolijo achica lo que se puede seleccionar. En el
modo secciones se reduce a la mitad —para no tapar los perfiles extruidos— pero nunca por debajo
de ese piso: un nodo clickeable en un modo y no en otro es peor que uno grande.

De paso apareció un defecto latente: el caché de geometría de esferas **ignoraba el radio que
recibía**, así que el primero que se pidiera ganaba para toda la sesión. No se notaba mientras el
radio era una constante.

**La selección va en las dos direcciones.** Lista → escena ya funcionaba. Escena → lista no:
`selectedJointId` era local, así que clickear un nodo en el visor lo resaltaba y el panel seguía
describiendo otro nudo, sin que nada lo dijera. Sólo cuenta una selección de **un** nodo: un
box-select de cuarenta no tiene un nudo que describir.

**Nada queda certificado por dibujarse.** Un nudo renderizado en 3D parece terminado y no lo
está: chapa, soldadura y presilla siguen sin geometría, y dibujar las barras que concurren a un
nodo no dice nada sobre si la unión entre ellas fue verificada.

---

## 4. Lo que M2 **no** entregó, y por qué

| Pendiente | Por qué |
|---|---|
| **Verificación metálica habilitada** | falta la firma de alguien con competencia normativa. Ningún trabajo de código la reemplaza |
| **Validación del mapa de cláusulas** | las 15 entradas están en `unvalidated`. Y **aun firmadas** no resuelven `Lb`, ni la geometría de bulones, ni §E.4. **No bloquea el desarrollo**: es estado de revisión |
| **Clasificación de sección (B.4.1)** | **imposible desde este repositorio**: las Tablas B.4.1a/b son **imágenes** en el PDF fuente. Arrastra que F.2 pueda estar aplicándose fuera de su alcance declarado |
| **§E.4** | **auditado y bloqueado por un dato**: `Cw`, el módulo de alabeo, no lo declara **ninguna** sección de la app, y E.4.9 lo exige. Más `kz` (condición de borde no modelada), la clasificación de E.4.2(a) y la longitud no arriostrada torsional. La app **sí** tiene `G`, `xo`, `yo` (vía `shearCentreWorking`), `Ag`, `Ix`, `Iy` y a veces `J` |
| **§F.6.2** | **auditado y medio calculable**: `λf = bf/tf`, `Sy` y `Fcr = 138000/(bf/tf)²` se calculan; **la rama no se puede elegir** porque λpf y λrf son la Tabla B.4.1b caso 14, imagen |
| **§H.3** | torsión en la interacción, definida en el texto y no implementada |
| **`Cb`** | **implementado** (F.1.1) desde el diagrama de momentos, dentro del alcance que la cláusula declara. Calcularlo **no certifica el arriostramiento** |
| **La fuente de `Lb`** | el modelo no tiene dónde registrar un arriostramiento. Tres caminos en `m2-lb-assumption.md`; el más barato es que el generador conserve las riostras que ya coloca |
| ~~El tope `1,5·My` de F.2.1~~ | **cerrado.** Implementado en los dos ejes (F.2.1 y F.6.1) tras leer el texto embarcado; no necesitaba ningún dato nuevo |
| **`Ae = Ag`** | necesita la geometría del grupo de bulones, que no existe |
| **§E.4** | pandeo torsional, que gobierna en ángulos, tes y cruciformes — justamente las secciones cuyos ejes M2 ya advierte |
| **Serie tabulada C/Z** | falta una fuente citable de acería o norma dimensional |
| **Gizmo de nodos** | medido y seguro, no implementado: es cosmético y quedó después del workflow |
| **Uniones y visualización** | investigado y documentado, sin implementar. No hay geometría de unión en el modelo |
| **Consumidores compartidos del aviso de ejes** | `SectionEditor`, `ProfileSelector`, `ProSectionsTab` son de hormigón también; `SectionStressPanel` es de Basic |

---

## 4 bis · Las dos causas que la auditoría trazó a una línea

**El reglamento no puede destrabar nada.** `roleUsable` (`lib/codes/roles.ts:570`) devuelve `false`
en cuanto la madurez es `UNSUPPORTED`, y CIRSOC 301 está declarado `UNSUPPORTED` — con razón, no
existe adaptador. Así que `regulationsStore.usable('steel')` **es falso por construcción** y elegir
el reglamento no habilita ninguna etapa. La madurez se queda; lo que cambia es que avanzar dependa
de `steelCodeDeclared` y sólo certificar dependa de `usable`. **Pendiente de implementar.**

**Los nudos: diagnosticado.** Ver §4 ter. La sospecha inicial — que el problema estaba por encima
de `detectJoints` — era correcta, pero el lugar no era la UI sino el **fixture**.

---

## 4 ter · Los nudos de la nave: causa raíz, medida

El síntoma era «la app no detecta nudos». Dos rondas de tests puros y de store decían que la
tubería estaba bien — y tenían razón sobre el modelo que usaban, una nave **generada**: 300 nudos,
625 miembros metálicos, nada filtrado. El **ejemplo embarcado** es otro modelo y estaba en un
estado que ninguno generado alcanza.

`3d-nave-industrial.json` traía **dos materiales llamados «Acero A36»**: el id 1 con `fy: 250`, y el
id 2 **sin `fy`**. Los **633 elementos apuntan al 2**; el 1 quedó huérfano.

| Capa | Antes | Ahora |
|---|---|---|
| `detectJoints` sin filtro | 226 nudos | 226 nudos |
| `materialFamilyOf` | `unknown` / `noData` | `steel` / `declaredGrade` |
| Inventario metálico | **0 de 633** | 633 de 633 |
| `detectJoints` filtrado | **0** | 226 |

El arreglo va en el dato, no en el filtro: relajar el predicado para admitir un material sin
resistencia haría metálicos los nudos de cualquier modelo de hormigón, que es el defecto que ese
predicado cierra. El material ahora declara `fy`, `fu` y **`gradeId: 'astm-a36'`**, así que la
clasificación descansa en una declaración y no en `fy > 80`.

**Y el panel ya no miente sobre la ausencia.** Tres estados separados: `noModel` («no hay nudos»),
`noneMetallic` («el modelo tiene N nudos y ninguno se puede mostrar», con cuántos miembros quedaron
sin clasificar y qué hacer) y `hasJoints`. Un modelo de hormigón cae en el segundo, que es lo
correcto: tiene nudos, ninguno es metálico.

---

## 4 quater · Capítulo J, auditado

Resultó mucho más legible que B.4.1: **las Tablas J.3.3 y J.3.4 son texto transcribible**, no
imágenes. Así que la geometría de bulones se calcula, con la cláusula en cada número:

| Regla | Cláusula |
|---|---|
| `s ≥ 3·d` entre centros de agujeros | J.3.3 |
| Distancia mínima al borde, por diámetro y tipo de borde | Tabla J.3.4 |
| `1,75·d` / `1,25·d` por encima de 30 mm | Tabla J.3.4, su propia regla |
| `12·t`, sin exceder 150 mm | J.3.5 |
| `24·t ≤ 300 mm` pintado · `14·t ≤ 180 mm` intemperie | J.3.5 |
| Agujero normal por diámetro, `d+3` sobre 28 mm | Tabla J.3.3 |

Dos cosas que conviene que QA sepa. **El agujero de J.3.2 no es la deducción de §B.4.2**: un bulón
de 20 mm tiene agujero de 22 mm y descuenta 24. Y un diámetro **entre** dos filas de la tabla
devuelve `—`, no un valor interpolado: interpolar una tabla de reglamento es inventar un límite que
no fija. Sólo *por encima* de la tabla hay una regla, y ésa sí se aplica.

---

## 5. Los tres defectos con consecuencia que M2 encontró

Vale que QA los conozca, porque dos siguen abiertos.

1. **Inversión de ejes en el camino de flexión** — `SteelDesignParams` documenta `Iz` como eje
   fuerte y la app usa `iz` como débil. `checkSteelFlexure` toma `ry = √(Iy/A)` como radio del eje
   **débil**; alimentado con el fuerte, `ry` salía ≈3,7× grande en un IPE 200 y una viga que
   necesitaba reducción por pandeo lateral-torsional se juzgaba dentro de la plataforma.
   **Arreglado.** Compresión no se afectaba (toma `max` de las dos esbelteces).
2. **El tope de flexión faltante** — **abierto.** Necesita calcular `My`.
3. **Los ángulos se analizan respecto de ejes no principales** — **abierto y preexistente.** La
   inercia mínima real de un ángulo de alas iguales es ~40 % de la que la app guarda como eje débil:
   el valor almacenado es ~2,4× demasiado alto, del lado **inseguro**. La advertencia está
   implementada como regla pura y **no montada**, porque todas las superficies donde va son
   compartidas con hormigón o de Basic.

---

### 5 bis · Un cuarto, del selector PRO

`ProSectionsTab` mapeaba familia → forma con una función local que conocía **seis** familias y
devolvía `'CHS'` — tubo redondo — para el resto. Medido sobre las quince: **ocho divergían del mapa
del catálogo, siete de ellas a CHS**, incluyendo todo perfil W, los dos canales americanos, las tees
y los tubos cuadrados. La octava, HEA, daba `'H'` donde el catálogo dice `'I'`.

La rigidez **no** se veía afectada — `a`, `iy` e `iz` se escriben de los números del propio perfil, y
el resolvedor canónico devolvía lo mismo con cualquiera de las dos formas, cosa que verifiqué antes
de afirmar lo contrario. Lo que sí afecta es todo lo que **despacha** por `shape`: el contorno
dibujado, el camino de flujo de corte, la extrusión 3D, y los ayudantes de cláusula que preguntan
qué forma tiene un miembro — `flangeWidthForSlenderness` responde `null` para un CHS, así que §F.6.2
habría reportado fuera de alcance una viga de perfil W.

`familyToShape`, que es exhaustivo por construcción, ya estaba importado en ese archivo y
simplemente nunca se llamaba.

---

## 6. Documentos para revisar junto al código

| Documento | Qué decide |
|---|---|
| **`m2-cirsoc301-normative-audit.md`** | **la auditoría del texto embarcado, cláusula por cláusula. Cuatro huecos que declaré y no eran huecos** |
| `m2-cirsoc301-workflow-roadmap.md` | el reordenamiento de M2 y la auditoría de los nueve puntos |
| `nonprincipal-axes-warning-proposal.md` | los 37 ángulos, con la medición validada contra el catálogo |
| `m2-axes-notice-contract.md` | el handoff de integración del aviso, con diff por archivo |
| `m2-lb-assumption.md` | de dónde debería venir `Lb`, y por qué no se reemplaza |
| `m2-lip-convention-proposal.md` + `-validation.md` | la decisión del labio y su validación independiente |
| `m2-metallic-visualisation-study.md` | uniones y visualización: la auditoría y las cinco fases |
| `m2-ixy-integration-handoff.md` | el producto de inercia: dónde falta y por qué no derivarlo |
| `share-codec-fields.md` | los cuatro campos que pierde un link compartido |
| `m1-section-shape-builder.md` | el componente huérfano y su decisión de producto pendiente |

---

## 7. Lo que necesito de una persona, no de más código

1. **La firma del mapa de cláusulas.** 14 entradas, cada una con expresión, cláusula, entradas,
   hipótesis y limitación. Están citadas del texto embarcado con la numeración **con puntos** de
   CIRSOC, no la de AISC. Lo que falta es que alguien competente confirme que cada expresión
   implementa la cláusula que dice.
2. **La decisión sobre `Lb`.** Cuál de los tres caminos, y quién toca el generador.
3. **El aviso de ejes en superficies compartidas.** Aprobarlo o rechazarlo, y definir quién escribe
   los tres patches. `SectionStressPanel` no lo puede tomar ninguna de las dos ramas.
4. **La fuente de la serie C/Z**, si existe.

**Nada de lo anterior hace que un miembro metálico aparezca como verificado.**
`steelCountsAsVerified()` sigue devolviendo el literal `false`.
