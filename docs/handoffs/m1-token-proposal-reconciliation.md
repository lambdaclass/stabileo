# Reconciliación de las dos propuestas de tokens de estado

**M1** (`m1-h1-token-proposal.md`, `f154cc8f`) frente a **H1**
(`h1-shared-status-tokens-proposal.md`, publicada en `54ba5023`).
Escritas por separado y sin verse. **Convergen en casi todo**, y las diferencias son cuatro.

**El contrato todavía no está implementado:** `tokens.css` no está tocado en ninguna de las dos
ramas. Verificado en las dos.

**M1 concede una de las cuatro** y pide corregir dos de las otras tres. Ninguna es un
desacuerdo de fondo.

---

## 1. Lo acordado, sin diferencias

Coinciden **al valor**, no sólo en la idea:

| | Las dos proponen |
|---|---|
| `--st-danger-bg` | `rgba(192, 57, 43, 0.14)` — `--st-red` al 14 % |
| `--st-provisional` | `#a066d3` — el valor de Three.js |
| `--st-provisional-bg` | `rgba(160, 102, 211, 0.16)` |
| Estructura de *provisional* | **tres** tokens: relleno, texto y fondo |
| La razón de los tres | medida y **la misma en las dos**: `#a066d3` como texto sobre su propio fondo da 3.55 y falla AA |
| Three.js | el `0x` sigue siendo la autoridad; los dots de los paneles **no** se tokenizan; un test compara los dos valores |
| Orden de migración | token → test de espejo → consumidores, con `OutcomeBadge` al final por ser el único compartido |
| Vocabulario de estados | no se amplía; estos tokens no habilitan ningún estado de aprobación |
| `--st-ok-bg` / `--st-info-bg` | ninguna de las dos los propone |

Dos ramas midiendo por separado y llegando al mismo alfa, al mismo matiz y al mismo desdoblamiento
es la señal de que el contrato es el correcto.

## 2. Diferencia 1 — el alfa de `--st-warn-bg`: **M1 concede a medias, y pide coherencia**

| | Valor |
|---|---|
| M1 | `rgba(184, 134, 11, 0.14)` |
| H1 | `rgba(184, 134, 11, 0.16)` |

Mismo matiz. Medido, **los dos pasan AA en todas las combinaciones**:

| Alfa | Sobre `surface` | `surface-2` | `surface-3` |
|---|---|---|---|
| 0.14 | `--st-warn` 6.26 · `--st-text` 13.10 | 6.08 · 12.72 | 5.52 · 11.55 |
| 0.16 | `--st-warn` 6.09 · `--st-text` 12.74 | 5.90 · 12.35 | 5.36 · 11.21 |

La diferencia es 0.17 de ratio. **No es una decisión de accesibilidad**, así que M1 no insiste por
ahí. Insiste por otra razón, y es interna a la propuesta de H1:

> «el alfa copia el único precedente que hay, `--st-vermillion-dim` a `0.14`»
> — H1, §2

Y después usa 0.14 para danger y **0.16 para warn**. El precedente que H1 misma invoca dice 0.14
para los dos. **Propuesta: `0.14` en los dos, por la regla que H1 escribió.** Si H1 prefiere 0.16,
también sirve — pero entonces conviene borrar la frase del precedente, porque el token no la
cumple.

## 3. Diferencia 2 — `--st-provisional-text`: **M1 concede. La de H1 es mejor**

| | Valor | Sobre el fondo provisional | Sobre `--st-surface` |
|---|---|---:|---:|
| M1 | `#d8b4ff` | 7.92 | 9.58 |
| H1 | `#c08ae6` | 5.34 | 6.46 |

El argumento de M1 era «es lo que `OutcomeBadge` ya usa, así que no cambia nada en pantalla». El de
H1 es que los `-text` existentes viven en una banda y el nuevo debería entrar en ella. Medido, H1
tiene razón:

```
amber-text 7.52 · red-text 5.57 · green-text 5.56 · blue-text 4.97   (sobre --st-surface)
#c08ae6    6.46  ← dentro de la banda
#d8b4ff    9.58  ← por encima de todos
```

Y el argumento de M1 era más débil de lo que parecía: `ProvisionalBanner` usa **dos** violetas de
texto —`#e2d3f5` (9.90) en el cuerpo y `#d8b4ff` (7.92) en el `strong`— así que no hay un valor
canónico que preservar. «No cambia nada» era falso: cambiaba uno de los dos igual.

**M1 acepta `#c08ae6`.** Con una salvedad que H1 ya anotó y conviene dejar decidida: en
`ProvisionalBanner` el cuerpo del párrafo pasaría de 9.90 a 5.34, que sigue siendo AA. Si a alguien
le parece demasiada pérdida en un banner de cuerpo entero, la salida es dejar ese párrafo en
`--st-text` (13.00 sobre el fondo propuesto) y usar `--st-provisional-text` sólo en el `strong`.
Es una decisión de H1, es su archivo.

## 4. Diferencia 3 — `FloorFamilyStateCard` necesita **los dos** tokens

La propuesta de H1 se contradice consigo misma:

| Dónde | Qué dice |
|---|---|
| §3, tabla de usos | `provisional` → **`--st-provisional`** |
| §5, paso 4 | `provisional` de `--st-warn` a **`--st-provisional-text`** |

Las dos son incompletas, porque la tarjeta usa el matiz en **dos roles distintos**:

```
FloorFamilyStateCard.svelte:105   .fam-state[data-state='provisional'] { border-left-color: … }   ← borde, piso 3.0
FloorFamilyStateCard.svelte:116   .st-badge[data-state='provisional']  { color: … }               ← texto, piso 4.5
```

Medido: `--st-provisional` (`#a066d3`) sobre `--st-surface` da **4.30** — pasa como borde y **no**
como texto. Así que:

- **borde** (`:105`) → `--st-provisional`
- **etiqueta** (`:116`) → `--st-provisional-text`

Es el desdoblamiento que las dos propuestas defienden; sólo hay que aplicarlo dentro de este
archivo. Es la corrección de M1 al plan de H1, y es de una línea en cada lugar.

## 5. Diferencia 4 — **el fallo de AA no está en la propuesta de H1**, y es lo más importante

La propuesta de H1 mide los tokens **nuevos** con `--st-text`, `--st-text-2` y el `-text` del rol
encima, y los tres pasan. Lo que no menciona es que **cuatro reglas que existen hoy ponen `--st-accent` —el vermellón de
marca— como texto sobre un fondo teñido, y las cuatro fallan AA**. Tres son de hormigón:

| Regla | Archivo | Fondo compuesto | `--st-accent` encima |
|---|---|---|---:|
| `.badge-fail` | `OutcomeBadge` | `#331f2a` | **3.86** ✗ |
| `.banner-block` | `DesignToolbar` | `#2e1f2a` | **3.93** ✗ |
| `.badge-outcome-SECTION_INADEQUATE` | `OutcomeBadge` | `#352a24` | **3.51** ✗ |

M1 había encontrado las dos primeras. La tercera apareció al reconciliar, contando la familia
naranja que H1 aportó al inventario. Y **hay una cuarta, en superficie metálica y es de M1**:

| Regla | Archivo | Fondo compuesto | `--st-accent` encima |
|---|---|---|---:|
| `.conn-ratio-badge.st-fail` | `ProConnectionsTab` (PR21) | `#3a262b` | **3.55** ✗ |

La encontró el test que M1 escribió para prohibir exactamente eso en superficie metálica
(`steel-surface-colour-rules.test.ts`), escrito esperando que pasara: falló contra el propio
archivo de PR21. Sus dos hermanas lo hacen bien —`.st-ok` con `--st-ok`, `.st-warn` con
`--st-warn`— y sólo la de fallo alcanzó el color de marca.

**No está arreglada**, y el motivo es que interactúa con el contrato: al 20 % de alfa incluso
`--st-danger` llega a 4.46 sobre `--st-surface-2`, que **también** falla. Ese badge necesita un
alfa más bajo —el 14 % de `--st-danger-bg` da 4.96— o `--st-text`. Elegir hoy sería adelantarse al
contrato, así que queda nombrada y medida, y M1 la arregla en el mismo movimiento en que adopte los
tokens.

**Son cuatro, no dos ni tres.** Tres de hormigón y una metálica.

El arreglo no es un color nuevo. Sobre los mismos fondos:

```
.badge-fail / .banner-block   con --st-danger #e8705f  → 5.05 / 5.11   AA ✓
SECTION_INADEQUATE            con --st-warn   #d9a441  → 6.19          AA ✓
                              con --st-danger #e8705f  → 4.58          AA ✓ (justo)
```

`--st-warn` es la mejor opción para `SECTION_INADEQUATE`: el fondo es ámbar y el borde ya es
`--st-warn`, así que el texto en vermellón era además el único elemento fuera de tono.

**Esto importa porque los tres archivos son de H1** y la migración los va a tocar. Si no está en el
plan, el fallo sobrevive la tokenización: cambiar el fondo de `rgba(238,34,34,0.16)` a
`--st-danger-bg` mueve el ratio de 3.86 a 3.84 — no lo arregla. **Lo que lo arregla es el color de
texto**, y es el mismo commit donde conviene hacerlo.

## 6. Corrección a la propuesta de M1 — el inventario estaba corto

H1 aportó `VerificationDetail.svelte` (`rgba(255,102,0,0.08)`), que M1 no había contado. Contando
de nuevo, la familia ámbar está **peor** de lo que decía M1 («tres valores y dos matices»):

**Fondos teñidos de advertencia, hoy:**

| Matiz | Alfa | Archivo | Regla |
|---|---|---|---|
| `rgba(221,170,0)` | 0.16 | `OutcomeBadge` | `.badge-warn` |
| `rgba(221,170,0)` | 0.10 | `ProConnectionsTab` | `.conn-banner` (M1/PR21) |
| `rgba(221,170,0)` | 0.08 | `ProConnectionsTab` | secundario (M1/PR21) |
| `rgba(255,102,0)` | 0.16 | `OutcomeBadge` | `.badge-outcome-SECTION_INADEQUATE` |
| `rgba(255,102,0)` | 0.13 | `DesignToolbar` | `.banner-warn` |
| `rgba(255,102,0)` | 0.08 | `VerificationDetail` | `.advice` |

**Seis fondos, dos matices, cinco alfas** — y ninguno de los dos matices es `--st-amber` (`#b8860b`)
ni `--st-warn` (`#d9a441`). H1 lo llamó «una quinta familia de ámbar que existe sólo en esos
archivos» y tiene razón.

Aparte, y **no** son fondos de estado: tres rayados diagonales de la superficie metálica
(`SteelPanel`, `SteelExperimentalBanner`, `SteelStatusBadge`) usan `rgba(221,170,0,·)` como una de
las dos bandas del patrón. Son deliberados —distinguibles sin matiz— y quedan fuera del contrato,
como dicen las dos propuestas.

`m1-h1-token-proposal.md` §1 queda corregido por este documento.

## 7. Corrección al inventario de H1 — `SteelStatusBadge` no hereda nada

La tabla de H1 dice:

> `SteelStatusBadge.svelte` | referencia `OutcomeBadge` | **hereda sin editarse**

Verificado en `feat/pro-steel-m1`: **no hereda nada.** `SteelStatusBadge.svelte` importa
únicamente `i18n` y `steel-status`, y define sus propias cuatro clases de tono. La única relación
con `OutcomeBadge` es una frase en su comentario de encabezado —«shown the way `OutcomeBadge` shows
a concrete one»— que describe una intención de diseño, no una dependencia de CSS.

**La conclusión de H1 es la correcta por otra razón**, y conviene que quede escrita bien: no hay
que editarlo **porque no tiene ningún fondo teñido de danger ni de warn**. Su tono `warn` es un
rayado diagonal, su `info` y su `neutral` no están en el alcance del contrato, y ninguno de los
cuatro usa `--st-accent` como texto.

## 8. Contrato resultante, si se aceptan las cuatro resoluciones

```css
--st-danger-bg: rgba(192, 57, 43, 0.14);    /* --st-red   — las dos coinciden */
--st-warn-bg:   rgba(184, 134, 11, 0.14);   /* --st-amber — 0.14 por el precedente que H1 invoca */

--st-provisional:      #a066d3;                     /* = 0xa066d3, las dos coinciden */
--st-provisional-text: #c08ae6;                     /* de H1; M1 concede */
--st-provisional-bg:   rgba(160, 102, 211, 0.16);   /* las dos coinciden */
```

Más tres arreglos de texto en el mismo commit que migre esos archivos:

```
OutcomeBadge  .badge-fail                        --st-accent → --st-danger
OutcomeBadge  .badge-outcome-SECTION_INADEQUATE  --st-accent → --st-warn
DesignToolbar .banner-block                      --st-accent → --st-danger
```

Y en `FloorFamilyStateCard`, los dos tokens según el rol (§4).

## 9. Tests: las dos listas se complementan

| Test | Propuesto por | Estado |
|---|---|---|
| Todo `--st-*` referenciado existe | ya existía | `design-tokens-resolve.test.ts` ✓ |
| Espejo del violeta por **valor** | las dos | pendiente del paso 2 de la migración |
| Techo de colores crudos por archivo | **H1** | `concrete-design-raw-colours.test.ts` ✓ |
| Contraste calculado sobre el composite | las dos | `concrete-status-tokens.test.ts` (H1) + `state-background-contrast.test.ts` (M1) |
| Token resuelto por el navegador vs literal viejo | **H1** | `viewer-panel-tokens.spec.ts` ✓ |
| 1280×720 y en/es/pt donde el texto mueva el layout | **H1** | ✓ |
| Cobertura declarada cuando el fixture no produce el estado | **H1** | ✓ |
| Ningún fondo teñido a mano con matiz de un rol tokenizado | **M1** | pendiente, necesita la lista de exenciones |
| Ninguna superficie **metálica** usa `--st-accent` como texto sobre fondo de error | **M1** | agregado en este commit |

Los dos tests de contraste hacen la misma aritmética sobre los mismos valores y llegan a los
mismos números, lo cual es en sí mismo una verificación cruzada. Conviene **conservar los dos**: el
de H1 sigue los alias de `tokens.css` hasta el literal, el de M1 fija los tres fallos de AA como
fallos hasta que se arreglen.

## 10. Qué falta para cerrar

1. H1 decide el alfa de `--st-warn-bg` (§2) y si acepta la corrección de `FloorFamilyStateCard`
   (§4).
2. **H1 confirma que los tres arreglos de `--st-accent` entran en la migración** (§5). Es el punto
   con consecuencia real.
3. Se acuerda la lista de exenciones del test de fondos a mano (§9), donde entran los tres rayados
   metálicos.
4. Queda sin decidir si el cuerpo de `ProvisionalBanner` va a `--st-provisional-text` o a
   `--st-text` (§3).

M1 no toca ninguno de esos archivos. Cuando H1 publique el commit del contrato, M1 verifica el
diff contra este documento y corre los tests metálicos.
