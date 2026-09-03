# M3 · Bloque 1 — visualización 3-D de uniones abulonadas

**Rama:** `feat/pro-steel-m3`, basada en el HEAD de `feat/pro-steel-m2` (`14c10a2e`).
**Alcance:** **sólo** abulonado. No se tocaron soldaduras, presillas, verificaciones nuevas ni
solver/Rust/WASM.
**Worktree y puerto propios:** `stabileo-m3/` en **4005**. El **4004** sigue sirviendo M1+M2 desde
`stabileo-steel/`, sin tocar.

---

# 1 · Auditoría de lo que ya existía

## 1.1 · La cadena, y que la fuente única ya estaba bien

```
JointDesign  ──►  jointSceneLayout()  ──►  (antes) mallas inline en Viewport3D
 (diseño)          (colocación pura)          (ahora) buildJointMeshes()
```

**Confirmado: no hay modelo visual paralelo.** Sólo dos consumidores de producción llaman a
`jointDesignStore.designFor()` — `Viewport3D.svelte` y `ProConnectionsTab.svelte` — y los dos leen
el mismo `JointDesign`. `plateForLayout` vive únicamente en la capa de diseño. No existe ningún
tipo de «vista de unión» que duplique la chapa.

**Lo que sí faltaba era el otro extremo del contrato**, y ahí estaba el defecto: `jointSceneLayout`
calculaba el marco de la chapa, colocaba los bulones en él, y **no exportaba ni el marco ni los
agujeros**. El viewport recibía centros correctos y no tenía con qué orientar nada.

## 1.2 · Qué se dibujaba

| Pieza | Antes |
|---|---|
| Chapa | `BoxGeometry(L, W, t)` — **con** espesor, pero **sin rotación**: caja alineada a los ejes globales |
| Agujeros | **ninguno**. La chapa era una losa maciza |
| Bulón | un `CylinderGeometry` por agujero — **sólo vástago**, sin cabeza, sobre el eje Y por defecto de three.js y con longitud `t × 2` |
| Presillas | colocadas por el layout, **no dibujadas** (fuera de alcance de este bloque) |

## 1.3 · Estados que ya soportaba, y bien

`JointDesignState` = `notDesigned · incomplete · notVerifiable · designed · exceeded` (+ `verified`,
que está en la unión y **nada produce**).

La regla de dibujo ya era la correcta y **no se cambió**: sólo la **ausencia de geometría** frena el
dibujo, nunca el veredicto.

- `plate.state !== 'available'` → nada, con `emptyReasonKeys`;
- `state === 'notDesigned'` → nada, con motivo;
- **`exceeded` dibuja**, porque una unión que falla tiene geometría y esconderla sería esconder
  justo lo que hay que mirar.

## 1.4 · Información que ya estaba disponible y se descartaba

| Dato | Dónde vivía | Qué pasaba |
|---|---|---|
| Marco `u, v, n` | calculado dentro de `jointSceneLayout` | **no se exportaba** |
| `holesM` (posiciones `u,v`) | `PlateGeometry` | se usaba para bulones y **se tiraba** |
| `holeDiameterM` (Tabla J.3.3) | `PlateGeometry` | **nunca salía de la capa de diseño** |
| `boltAreaCm2` | `BoltedJointDesign` | sí se usaba — el diámetro nominal ya era correcto |
| `emptyReasonKeys` | salida del layout | el viewport hacía `return` y **los tiraba** |
| `userData.type` de las mallas | se escribía | **nadie lo leía**: sin picking |

## 1.5 · Medición sobre una unión real de la nave

`generateShed(DEFAULT_SHED_PARAMS)` → **300 nudos, 625 barras, 300 uniones**. Nudo **9**, 5 barras
concurrentes, primera barra `(0,3, 0, 0) → (0,3, 0, 1)`, o sea **eje unitario `(0, 0, 1)`**:

```
design.state = incomplete      bolts.state = incomplete     plate.state = available
CHAPA  L=190,0 mm  W=130,0 mm  t=12,0 mm
AGUJEROS  n=6  ø=22,0 mm   uv = (-60,-30) (0,-30) (60,-30) (-60,30) (0,30) (60,30)
boltAreaCm2 = 3,14159…  →  vástago ø = 20,00 mm exactos
```

**El hallazgo:**

```
>>> bulones FUERA de la caja alineada que dibujaba el viewport:  4 / 6
    bulón en (0,300, -0,030, -0,060)   centro (0,300, 0,000, 0,000)   semiejes (0,095, 0,065, 0,006)
```

La chapa se dibujaba 190 mm **sobre X** cuando la barra corre **sobre Z**. Cuatro de seis bulones
flotaban afuera. Es visible sólo en barras que no van sobre X global — y por eso nadie lo vio.

Después de exportar el marco y aplicarlo: **0 / 6**. Marco ortonormal exacto
(`|u|=|v|=|n|=1`, `u·v = u·n = v·n = 0`, `u × v = n`).

---

# 2 · Qué se implementó

## 2.1 · `joint-layout.ts` — se extendió, no se reemplazó

Los 14 tests que ya tenía siguen pasando sin tocarlos.

- **`JointFrame { u, v, n }` exportado.** `n = u × v`, derecho, para que la base sea una rotación
  y no una reflexión — una base reflejada espejaría el patrón de agujeros de un armado asimétrico.
- **`PlacedPlate.holes`**: cada agujero con su centro en coordenadas de modelo, su par `uv` en el
  marco de la chapa, y su diámetro de Tabla J.3.3.
- **`PlacedBolt.axis`**: la normal de la chapa. Un bulón pasa **a través** de la chapa, así que su
  eje es la normal y no la dirección de la barra.
- **`PlacedBolt.head`**: ver §3.1 — **es convención de dibujo, declarada como tal**.
- **`frame: null`** en un layout vacío, no una identidad: una identidad sería un marco que el
  llamador podría usar para orientar una malla que no existe.

## 2.2 · `joint-meshes.ts` — nuevo

Construir las mallas salió del componente. `Viewport3D.svelte` ya está marcado P3 por tamaño en
`CLAUDE.md`, y era justo el lugar donde la geometría se rompía.

- **Chapa orientada**: `Matrix4.makeBasis(u, v, n)` → cuaternión. Base directa, sin convención de
  orden de rotaciones que equivocar.
- **Agujeros reales**: `THREE.Shape` con `holes` + `ExtrudeGeometry`. Perforación de verdad, **sin
  dependencia de CSG**. Importa más que la estética: la verificación §J.3.10 es sobre el
  aplastamiento **del agujero**, y una losa maciza con bulones apoyados es el dibujo de otra unión.
  Ahora se ve el vástago de 20 mm dentro del agujero de 22 mm.
- **`side: DoubleSide`**: con culling de caras traseras el interior de cada agujero faltaría y la
  chapa se leería como círculos pintados.
- **Extrusión centrada**: `translate(0, 0, -t/2)`, porque `ExtrudeGeometry` crece hacia `+z` y la
  chapa habría quedado corrida media pulgada de sus propios bulones.
- **Bulón = vástago + cabeza**, dos mallas: el vástago sobre la normal, la cabeza despejada en la
  cara `+n`, hexagonal (6 segmentos radiales).
- **`boundingRadiusM`** medido de las piezas **con las cabezas incluidas**, para que encuadrar no
  recorte una cabeza.

## 2.3 · Viewport, panel y selección

- **Picking, que no existía.** Las mallas viven en `jointsParent`, que **ningún raycast
  consultaba**. Consecuencia real: clicquear la chapa caía en «sin impacto → limpiar selección», y
  las mallas —que existen sólo para el nudo seleccionado— **desaparecían**. Inspeccionar una unión
  clicqueándola era el único gesto garantizado para cerrarla. Ahora un clic sobre su acero
  reselecciona el nudo, honrando shift/ctrl.
- **Motivos de vacío publicados**: `uiStore.jointSceneEmptyReasons`, renderizados por el panel. Un
  visor vacío ahora explica por qué, en lugar de parecer roto.
- **`zoomToJoint()`**: encuadra por el radio propio de la unión. Es un **comando** (botón
  *Encuadrar la unión*), no un re-encuadre automático: mover la cámara porque alguien clicqueó una
  fila no es ayuda.
- **`__jointScene`** publicado para los specs: composición real de la escena, incluida
  `boltsInsidePlate` calculada contra el marco.

## 2.4 · i18n

**Hallazgo:** `joint.scene.notDesigned` la **emitía el layout desde M2 y no tenía traducción en
ningún idioma** — nadie la renderizaba, así que nadie lo notó. Habría salido como clave cruda al
primer render. Agregada en **es/en/pt**, junto con las tres nuevas de la sección de escena. Las
cinco claves `plate.missing.*` ya estaban traducidas en los tres idiomas.

---

# 3 · Limitaciones que siguen

## 3.1 · La cabeza del bulón es convención de dibujo, no dimensión

**El repositorio no tiene datos de cabeza, tuerca ni arandela**: no hay tabla de entrecaras en
`connection/` ni en `data/`, y CIRSOC 301 §J.3 no la da — dimensiona el bulón por su **área nominal
del cuerpo**, que es lo que usa el vástago y sobre lo que corren las verificaciones.

Entonces la cabeza **no se puede derivar; sólo se puede dibujar**. Está declarada en **un** lugar
(`HEAD_DIAMETER_FACTOR = 1,6`, `HEAD_HEIGHT_FACTOR = 0,65`), documentada como convención, y **nada
calcula con ella**: ninguna verificación, ninguna capacidad, ninguna exportación la lee. Si algún
día entra una tabla real, esa constante es lo único que cambia y el vástago no se mueve.

**El vástago sí es real:** 20,00 mm exactos, del `boltAreaCm2` con que corrieron las
verificaciones.

## 3.2 · Lo que este bloque deliberadamente no hizo

- **Soldaduras y presillas no se dibujan.** Las presillas ya las coloca el layout; dibujarlas es
  otro bloque. Fuera de alcance por instrucción.
- **`exceeded` no cambia de color.** El vocabulario de veredicto es del panel
  (`within / near the limit / over the limit`) y recolorear el acero sería un segundo sistema de
  veredicto en un tercer lugar — exactamente lo que la decisión 2 de M2 evitó. La geometría de una
  unión que falla se dibuja igual que la de una que cumple, **porque es la misma geometría**.
- **Ningún documento tabula uniones** (I-09: no hay exportación metálica). Por eso el test de
  «misma entidad» afirma **panel + visor + store** y **no** documentos: un test que dijera que tres
  consumidores coinciden estaría afirmando sobre un consumidor que no existe.
- **El marco sale de la primera barra** que llega al nudo, como antes. Para un nudo con cinco
  barras eso es una elección, no una derivación; cambiarla es una decisión de producto.
- **Sin baselines visuales nuevas.** No se actualizó ni se agregó ningún snapshot.

---

# 4 · Impacto en rendimiento, medido

La chapa perforada es geometría real, así que cuesta más que una caja. Medido, no supuesto:

| | Antes | Después |
|---|---|---|
| Vértices de la chapa | **24** (caja) | **1836** (extrusión perforada) |
| Vértices totales de la unión | **408** | **2532** — ×6,2 |
| Mallas | **7** (1 chapa + 6 vástagos) | **13** (+ 6 cabezas) |
| Construir la unión | — | **0,280 ms** por reconstrucción |
| Grupo de 24 bulones | — | **0,918 ms**, 49 mallas, 10 020 vértices |

**Por qué esto no mueve la aguja, con el número al lado.** La nave que se usa para medir dibuja
**102 000 triángulos** y **138 draw calls** por frame (de `viewport-perf`); la unión aporta 2532
vértices y 13 draw calls. Es ~1 % de los triángulos de la escena y ~9 % de sus draw calls, y sólo
mientras hay **una** unión seleccionada — nunca hay dos.

**Y no está en el camino del frame.** La reconstrucción corre en el `$effect` de selección, no en
el bucle de render: 0,28 ms una vez al elegir un nudo, contra 16,7 ms de presupuesto por frame a
60 fps. El peor caso realista, 24 bulones, sigue bajo el milisegundo.

**Lo que se aceptó a cambio:** las mallas se reconstruyen enteras en cada cambio, sin diffing —la
decisión ya estaba y sigue siendo correcta a este costo—, y hay 6 mallas más por las cabezas. Con
un grupo de 24 bulones son 49 mallas, que sigue siendo despreciable contra la escena pero es el
número a mirar si alguna vez se dibujan varias uniones a la vez.
