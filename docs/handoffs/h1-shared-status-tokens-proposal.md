# Propuesta para M1 — tres tokens de estado que faltan en `tokens.css`

**Origen:** H1 (`feat/pro-concrete-h1`), tokenización de la cubeta 1 de hormigón.
**Estado: el contrato está IMPLEMENTADO.** H1 es el dueño único de la implementación física.
M1 no debe editar `tokens.css` ni los consumidores mientras el bloque esté en curso.

---

## 0. Estado de implementación

| | Commit | Qué |
|---|---|---|
| ✅ | **1 — contrato** | los cinco tokens en `tokens.css` + `shared-status-tokens.test.ts` (25 aserciones). **Ningún consumidor tocado.** Esto es lo que M1 tiene que verificar. |
| ⏳ | 2 — consumidores | `FloorFamilyStateCard`, `ProvisionalBanner`, `OutcomeBadge`, `DesignToolbar` |
| ⏳ | 3 — cubeta 1 restante | los 14 literales de hormigón puro |

### Los valores finales, y los dos deltas contra §2

Se adoptaron **los valores medidos por M1**, con dos diferencias respecto de lo que este
documento proponía originalmente. Las dos son de M1 y las dos verifiqué antes de escribirlas:

| Token | Valor final | Delta vs propuesta original |
|---|---|---|
| `--st-danger-bg` | `rgba(192, 57, 43, 0.14)` | igual |
| `--st-warn-bg` | `rgba(184, 134, 11, **0.14**)` | era 0.16. **Un solo alfa para las dos** superficies es más simple y el peor caso sigue en 4.76 (`--st-text-2` sobre `--st-surface-3`). |
| `--st-provisional` | `#a066d3` | igual |
| `--st-provisional-text` | **`#d8b4ff`** | era `#c08ae6`. Da **9.58** sobre `--st-surface` en vez de 6.46, y es **el valor que `OutcomeBadge.badge-provisional` ya usa**, así que adoptarlo no cambia un píxel ahí. Mejor elección que la mía. |
| `--st-provisional-bg` | `rgba(160, 102, 211, 0.16)` | igual |

**Verificado, no copiado.** Las 36 combinaciones (3 superficies × 4 fondos × 3 colores de texto)
pasan ≥ 4.5:1. El peor caso es `--st-danger` sobre `--st-danger-bg` compuesto sobre
`--st-surface-3`: **4.54**, con 0.04 de margen. El test lo fija explícitamente para que un
retoque de `--st-surface-3` o de `--st-red` lo rompa y lo diga.

### Una corrección al pedido: el umbral de 3:1

El pedido decía «bordes y elementos no textuales ≥ 3:1». Aplicado a los **trazos** —dots,
bordes, mallas— se cumple: el mínimo del conjunto es `--st-provisional` con 3.77 sobre
`--st-surface-3`.

Aplicado al **tinte mismo** contra el fondo que tiene debajo, da **1.09–1.21**, y ningún alfa lo
arregla: un tinte que llegara a 3:1 contra su propio fondo dejaría de ser un tinte. WCAG 2.1
§1.4.11 habla del *borde de un control* y de *gráficos con significado* —los dos cubiertos— no
del relleno decorativo que va detrás de un texto cuyo contraste ya se mide aparte. El test
**assert­a que los tres tintes están por debajo de 1.5**, para que nadie los "arregle"
oscureciéndolos.

---

---

## 1. El problema, medido

`tokens.css` define **cuatro matices de estado** —`--st-ok`, `--st-warn`, `--st-danger`,
`--st-info`— todos pensados como **color de texto o de trazo**. No define ninguna **superficie**
de estado, y no define violeta.

Consecuencia observable: cada componente que necesitó una banda de estado se mezcló la suya a
mano. Inventario real, contado sobre el árbol en `d7143687`:

| Archivo | Literales | Qué son | Dueño |
|---|---:|---|---|
| `OutcomeBadge.svelte` | 14 | `rgba(221,170,0,.16)`, `rgba(255,102,0,.16)`, … rellenos de badge | **compartido** (`SteelStatusBadge` lo referencia) |
| `DesignToolbar.svelte` | 12 | `rgba(255,102,0,.13)` en `.banner-warn`, … | **compartido** (fila de comandos PRO) |
| `ProvisionalBanner.svelte` | 4 | `rgba(160,102,211,.16)`, `#e2d3f5`, `#d8b4ff` | hormigón |
| `VerificationDetail.svelte` | 3 | `rgba(255,102,0,.08)` | hormigón |
| `FootingMatPhysicalPanel.svelte` | ~~8~~ 0 | `#5c1a1a`/`#ffe4e4`, `#7a5b00`/`#fff6dd` | **ya resuelto en H1** sin token nuevo |

Los cuatro naranjas `rgba(255,102,0, α)` de `DesignToolbar`, `OutcomeBadge` y
`VerificationDetail` son **el mismo color a tres alfas distintas**, y ninguno de los tres es
`--st-amber` (`#b8860b`) ni `--st-warn` (`#d9a441`). Es una quinta familia de ámbar que existe
sólo en esos archivos.

### Por qué H1 no lo necesitó, y por qué eso no escala

`FootingMatPhysicalPanel` resolvió sus ocho bandas **sin token nuevo**: pozo `--st-surface-3` +
regla izquierda con el matiz + texto en `--st-text`. Medido: el párrafo pasó de **10.80:1** a
**14.43:1**. Funciona, y es la forma que `DesignToolbar.banner-warn` ya usaba.

Lo que **no** cubre es el *badge*, donde el relleno teñido es la señal (no hay espacio para una
regla de 3 px en un chip de 0.68 rem). Ahí `OutcomeBadge` seguirá mezclando `rgba()` a mano
mientras no exista una superficie de estado.

---

## 2. Los tres tokens

Valores **derivados de la paleta existente**, no inventados: el matiz base ya está en
`tokens.css` y el alfa copia el único precedente que hay, `--st-vermillion-dim` a `0.14`.

```css
/* ── Superficies de estado ────────────────────────────────────────────
   El mismo patrón que --st-vermillion-dim / --st-selected-bg: el matiz
   base de la paleta, a un alfa bajo, para que el fondo del panel siga
   leyéndose debajo. */
--st-danger-bg: rgba(192, 57, 43, 0.14);    /* = --st-red   #c0392b */
--st-warn-bg:   rgba(184, 134, 11, 0.16);   /* = --st-amber #b8860b */

/* ── Provisional ──────────────────────────────────────────────────────
   Dos fuerzas, igual que el resto de la paleta: el matiz para rellenos y
   figuras, la variante -text para etiquetas chicas. */
--st-provisional:      #a066d3;                    /* = 0xa066d3, el valor de Three.js */
--st-provisional-text: #c08ae6;                    /* 6.46 sobre --st-surface */
--st-provisional-bg:   rgba(160, 102, 211, 0.16);  /* lo que ProvisionalBanner ya usa */
```

### Contraste calculado

Composite del rgba sobre cada fondo real, y después el contraste de lo que va encima.
Todos los números salen de `concrete-status-tokens.test.ts`, que hace esta misma aritmética
siguiendo los alias de `tokens.css` hasta el literal.

| Token | Composite sobre `--st-surface` | `--st-text` encima | `--st-text-2` encima | El matiz `-text` encima |
|---|---|---:|---:|---:|
| `--st-danger-bg` | `#28222b` | **14.43** | 5.95 | 5.11 (`--st-danger`) |
| `--st-warn-bg` | `#2a2f26` | **12.74** | 5.26 | 6.09 (`--st-warn`) |
| `--st-provisional-bg` | `#262a46` | **13.00** | 5.36 | 5.34 (`--st-provisional-text`) |

Los tres pasan AA con cualquiera de las tres combinaciones. Ninguno obliga a elegir entre
legibilidad y matiz, que es exactamente el canje que `FootingMatPhysicalPanel` tuvo que medir
por no tener estos tokens.

### La corrección a la recomendación de producto

**La recomendación se sostiene, con una salvedad que hay que dejar escrita.**

Alinear *provisional* con el violeta de Three.js (`0xa066d3`) es correcto: hoy el mismo estado
tiene **dos significados visuales** —`ProvisionalBanner` y `RebarStatusPanel` lo pintan violeta,
`FloorFamilyStateCard` lo manda a `--st-warn`— y eso es peor que cualquiera de los dos.

Pero **`#a066d3` no pasa AA como texto**:

| `#a066d3` sobre | Contraste | ¿AA texto chico? |
|---|---:|---|
| `--st-bg` `#0c1620` | 4.63 | apenas |
| `--st-surface` `#0f1e2b` | **4.30** | **no** |
| `--st-surface-3` `#17293a` | **3.77** | **no** |
| `--st-provisional-bg` | **3.55** | **no** |

Así que la alineación tiene que ser **por identidad, no por valor literal en todos los roles**:
`--st-provisional` = `#a066d3` para el **dot, el relleno y la malla** (que es donde Three.js
manda, y donde el área carga el significado), y `--st-provisional-text` = `#c08ae6` para las
**etiquetas**. Es el mismo desdoblamiento que `tokens.css` ya documenta para los otros cuatro
matices, en sus propias palabras: *"the `-text` variants are the ones that clear WCAG AA as
small UI text on the dark ground; the plain ones are for fills, rules and figures, where area
carries the meaning."*

Nota: `ProvisionalBanner` hoy usa `#e2d3f5` (9.90) y `#d8b4ff` (7.92), los dos **más claros** que
`#c08ae6`. Si se prefiere no perder ese contraste, `--st-provisional-text: #d8b4ff` también
sirve y da 7.92 sobre la superficie propuesta. `#c08ae6` está elegido por coherencia con el
resto de la paleta (los `-text` viven entre 5.3 y 7.3), no por ser el máximo.

---

## 3. Usos concretos

### En H1 (hormigón)

| Archivo | Hoy | Con los tokens |
|---|---|---|
| `ProvisionalBanner.svelte` | 4 literales | 0 — es el uso canónico de los tres provisional |
| `VerificationDetail.svelte` | `rgba(255,102,0,.08)` | `--st-warn-bg` |
| `FloorFamilyStateCard.svelte` | `provisional` → `--st-warn` | → `--st-provisional`, y se cierra la discrepancia |
| `RebarStatusPanel.svelte` | `.st-provisional` `#a066d3` literal | **sigue literal** (ver §4) |
| `FootingMatPhysicalPanel.svelte` | ya tokenizado sin ellos | sin cambios; los badges *podrían* pasar a `--st-danger-bg` |

### En M1 (metálicas) — a confirmar con Diego

| Archivo | Hoy | Con los tokens |
|---|---|---|
| `OutcomeBadge.svelte` | 14 literales, incluidos 2 rellenos teñidos | los rellenos → `--st-warn-bg` / `--st-danger-bg` |
| `SteelStatusBadge.svelte` | referencia `OutcomeBadge` | hereda sin editarse |
| `DesignToolbar.svelte` | 12, incluido `.banner-warn` | `.banner-warn` → `--st-warn-bg` |

`OutcomeBadge` es el único archivo que **las dos ramas** necesitan editar. Es la razón por la que
H1 no lo tocó y por la que esto es una propuesta y no un commit.

---

## 4. Impacto sobre Three.js

**Ninguno, si se respeta una regla: el número sigue siendo la autoridad.**

`src/lib/three/rebar-scene.ts` alimenta materiales con hex numéricos y **no puede leer una custom
property**. Los valores que espeja hoy:

```
conflicted:  0xe0444a      unreinforced: 0xd4762a
selected:    0xffd400      provisional:  0xa066d3
```

Dos tests ya fijan ese espejo —`viewer-design-system.test.ts` (*"leaves the state colours alone,
because Three.js owns them"*) y `run-summary-reported.test.ts`— y H1 agregó
`concrete-status-tokens.test.ts`, que lo asserta **en las dos direcciones** y en tres paneles.

Por eso:

- `--st-provisional: #a066d3` **duplica** el valor de la escena en CSS. Eso es aceptable **sólo
  si un test lo mantiene igualado**. Ver §5.
- Los dots de `RebarStatusPanel` y `RebarScenePanel` **no se tokenizan** aunque el token exista.
  Un `var()` en el CSS y un `0x` en el material se pueden separar en silencio; un literal
  duplicado con un test que los compara, no.
- La alternativa —que `rebar-scene.ts` lea el token en runtime con
  `getComputedStyle(document.documentElement)`— es posible pero **no la recomiendo acá**:
  agrega una dependencia del DOM a un módulo que hoy es puro y testeable sin navegador.

---

## 5. Migración y tests

**Orden propuesto. Cada paso deja el árbol verde.**

1. **`tokens.css`** — agregar los cinco tokens. Sin cambiar ningún componente.
   `design-tokens-resolve.test.ts` sigue pasando (sólo verifica que lo referenciado exista);
   los techos de colores crudos no se mueven.
2. **El test del espejo, antes de usarlos.** Extender `concrete-status-tokens.test.ts` con:
   `--st-provisional` resuelto === `0xa066d3` de `rebar-scene.ts`, comparado como valor. Si
   alguien cambia uno de los dos, falla y dice cuál.
3. **`ProvisionalBanner`** — el uso canónico, y hormigón puro. 4 → 0. Baja el techo.
4. **`FloorFamilyStateCard`** — `provisional` de `--st-warn` a `--st-provisional-text`. Cierra
   la discrepancia. Tocar acá los siete estados exige re-verificar
   `floor-family-states.spec.ts`, que ya mide el par glifo + palabra en tres idiomas.
5. **`VerificationDetail`** — 3 → 0 o casi.
6. **`OutcomeBadge` + `DesignToolbar`** — **coordinado con M1.** Último, porque es el único paso
   que las dos ramas ven.

**Tests que tiene que traer cada paso**, con la estrategia que H1 ya aplicó cuatro veces:

- **Techo por archivo** en `concrete-design-raw-colours.test.ts`: baja, nunca sube; un archivo
  ausente del mapa tiene techo cero.
- **Contraste calculado** desde `tokens.css`, no a ojo — la tabla de §2 es la salida de ese test,
  no una nota al pie. Y medido sobre el **composite** del rgba sobre el fondo real, porque el
  contraste de un rgba contra nada no significa nada.
- **Token resuelto por el navegador** contra el color resuelto del elemento, más la **negativa**
  contra el literal viejo: sobre fondo oscuro, `#5c1a1a` y un pozo `--st-surface-3` se parecen lo
  suficiente como para que un screenshot acepte cualquiera de los dos.
- **1280×720** y **en/es/pt** donde el texto pueda cambiar el layout.
- **Cobertura declarada, no implícita.** Si el fixture no produce el estado, decirlo en el test
  —H1 tuvo dos casos así, `advisory` en el mat de bases y la banda de conflicto— en vez de dejar
  una aserción condicional que se lee como si hubiera medido.

**Lo que ninguno de estos pasos debe hacer:** ampliar el vocabulario de estados. Estos tokens
existen para que los estados que ya hay dejen de mezclarse el color a mano. No habilitan un
`VERIFIED` nuevo ni un estado de aprobación.

---

## 6. Lo que queda abierto y no propongo resolver acá

- **`--st-warn` para dos estados distintos.** `RebarStatusPanel` distingue `refused` de
  `designed-not-modelled` sólo por matiz, y los dos son "advertencia". Con `--st-warn` y
  `--st-danger` como único vocabulario, tokenizarlos los fusionaría. Por eso los nueve literales
  que quedan en ese archivo están congelados, no pendientes. Un `--st-warn-2` resolvería esto,
  pero **no lo propongo**: seis matices de estado es más de lo que un lector distingue, y la
  salida honesta es que la palabra ya lleva el estado y el matiz es soporte.
- **`blocking` vs `advisory` se distinguen sólo por color** en `FootingMatPhysicalPanel`, y ya era
  así antes de tokenizarlo. Un glifo lo arreglaría; es cambio de contenido, no de token.
- **`#6fa8ff` sigue en `RebarWorkspace.svelte`** (borde del spinner) mientras los tres paneles
  hijos pasaron a `--st-interactive`. `RebarWorkspace` está fuera de alcance. Nota medida:
  `--st-interactive` sobre `--st-surface-3` da **4.36**, que pasa el 3:1 de WCAG 1.4.11 para un
  borde y **no** el 4.5 para texto — por eso en los tres paneles va como `border-color` con
  `--st-text` al lado, nunca como color de etiqueta.
