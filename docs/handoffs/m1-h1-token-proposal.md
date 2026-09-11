# Propuesta conjunta M1 ↔ H1 — fondos de estado y el token provisional

**Desde:** `feat/pro-steel-m1@f154cc8f`. **Nada implementado.** `tokens.css` y los seis
consumidores están sin tocar, y siguen así hasta que H1 y M1 acuerden el contrato.
**Contra:** `origin/feat/pro-concrete-h1@23ce3e34`, leída de sólo lectura.

Todos los contrastes de abajo están **calculados**, no estimados: WCAG 2.1 relative luminance,
compuesto el fondo teñido sobre la superficie real antes de medir. El script está en §9 para que
cualquiera los reproduzca.

---

## 1. El estado actual, en una tabla

Los tres tokens de los que habla el pedido **no existen**:

```
--st-danger-bg      no definido
--st-warn-bg        no definido
--st-provisional    no definido   ← y OutcomeBadge.svelte:82 dice literalmente
                                    «`--st-provisional` is owed»
```

Lo que existe son los colores de **texto** (`--st-ok`, `--st-warn`, `--st-danger`, `--st-info`) y
un único fondo teñido tokenizado, `--st-selected-bg`. Todos los demás fondos de estado son
`rgba()` escritos a mano en cada componente, y **no coinciden entre sí**:

| Rol | Consumidor | Valor hoy |
|---|---|---|
| fail / danger | `OutcomeBadge` `.badge-fail` | `rgba(238, 34, 34, 0.16)` |
| fail / danger | `DesignToolbar` `.banner-block` | `rgba(238, 34, 34, 0.14)` |
| warn | `OutcomeBadge` `.badge-warn` | `rgba(221, 170, 0, 0.16)` |
| warn | `DesignToolbar` `.banner-warn` | `rgba(255, 102, 0, 0.13)` ← **naranja, no ámbar** |
| warn | `ProConnectionsTab` `.conn-banner` | `rgba(221, 170, 0, 0.10)` |
| info | `DesignToolbar` `.banner-info` | `rgba(127, 212, 204, 0.11)` |
| info | `SteelStatusBadge` `.tone-info` | `rgba(70, 120, 180, 0.16)` |
| neutral | `OutcomeBadge`, `SteelStatusBadge` | `rgba(136, 136, 136, 0.16)` (coinciden) |
| provisional | `OutcomeBadge` `.badge-provisional` | `rgba(160, 102, 211, 0.16)` + texto `#d8b4ff` + borde `#6b4a8f` |
| provisional | `ProvisionalBanner` | `rgba(160, 102, 211, 0.16)` + borde `#a066d3` + texto `#e2d3f5` |
| provisional | `DesignToolbar` `.c-prov` | `#a066d3` |
| provisional | `RebarStatusPanel` `.st-provisional .dot` | `#a066d3` |
| provisional | `three/rebar-scene.ts` | `0xa066d3` ← **la autoridad** |

**Tres valores distintos y dos matices distintos para «warn».** Dos alfas para «danger». Seis
literales para «provisional».

## 2. El defecto que apareció midiendo

`OutcomeBadge .badge-fail` y `DesignToolbar .banner-block` ponen **`--st-accent`** (el vermellón de
marca, `#e5482a`) como texto sobre el fondo rojo teñido:

```
#e5482a sobre rgba(238,34,34,0.16) compuesto en --st-surface → 3.86 : 1   FALLA AA
#e5482a sobre rgba(238,34,34,0.14) compuesto en --st-surface → 3.93 : 1   FALLA AA
```

AA para texto chico pide 4.5. **Los dos fallan**, y el arreglo no es tocar el fondo: es usar el
token que existe para eso.

```
--st-danger  #e8705f  sobre el mismo fondo → 5.05 : 1   AA ✓
```

El propio encabezado de la paleta lo dice: «las variantes `-text` son las que pasan WCAG AA como
texto chico de UI; las planas son para rellenos, reglas y figuras». `.badge-fail` alcanza el color
de **marca** donde le corresponde el de **estado**. Es un defecto de la superficie de hormigón, no
del token, y va en la propuesta porque el mismo commit que cree `--st-danger-bg` es el que lo
arregla.

## 3. Contrato propuesto

### 3.1 Los dos fondos

```css
/* ── Semantic: fondos de estado ───────────────────────────────────────────
   Un fondo teñido por rol, definido una vez. Los alfas de abajo se eligieron
   midiendo: con el matiz PLANO (no el `-text`) al 14 %, el color de texto del
   mismo rol pasa AA sobre las dos superficies donde estos fondos aparecen,
   `--st-surface` y `--st-surface-2`.
   ──────────────────────────────────────────────────────────────────────── */

--st-danger-bg: rgba(192, 57, 43, 0.14);   /* --st-red   al 14 % */
--st-warn-bg:   rgba(184, 134, 11, 0.14);  /* --st-amber al 14 % */
```

Medido, con el texto del rol encima:

| Fondo | Sobre `--st-surface` | Sobre `--st-surface-2` |
|---|---|---|
| `--st-danger-bg` + `--st-danger` | **5.11** ✓ | **4.96** ✓ |
| `--st-warn-bg` + `--st-warn` | **6.26** ✓ | ~6.1 ✓ |

**Por qué el matiz plano y no el `-text`:** un fondo es área, y la paleta ya separa los dos usos.
Teñir con `--st-red` en vez de con `--st-red-text` deja más margen para el texto encima, que es
justamente lo que rescata a `.badge-fail`.

**Por qué 14 % y no 16 %:** al 16 % el `danger` sobre `surface-2` cae a 4.86, todavía AA pero con
0.36 de margen. Al 14 % queda 4.96. Es el alfa que más aguanta un cambio futuro de superficie, y
es el que ya usa `DesignToolbar`.

**Deliberadamente NO se propone `--st-ok-bg` ni `--st-info-bg`** en este contrato. `ok` no
divergió —`rgba(34,204,102,0.16)` es el único valor— e `info` divergió pero ninguno de sus dos
usos es un banner de riesgo. Meterlos ahora amplía la superficie compartida sin cerrar un defecto.
Quedan para un segundo paso si el primero funciona.

### 3.2 El token provisional, con el split que la paleta ya usa

```css
--st-provisional:      #a066d3;                     /* relleno, borde, figura */
--st-provisional-text: #d8b4ff;                     /* etiqueta sobre el fondo teñido */
--st-provisional-bg:   rgba(160, 102, 211, 0.16);   /* el valor que ya usan los dos */
```

Tres tokens y no uno, y la razón es medida:

```
#a066d3 como TEXTO sobre el fondo provisional → 3.55 : 1   FALLA AA
#a066d3 como borde/figura sobre --st-surface  → 4.30 : 1   ✓ (no-texto pide 3.0)
#d8b4ff como texto sobre el fondo provisional → 7.92 : 1   AA ✓
```

`0xa066d3` **es** el color correcto —es la autoridad y no se toca— pero es un color de relleno,
exactamente como `--st-amber` frente a `--st-amber-text`. Un solo token provisional invitaría a
usarlo como texto, que es lo que falla.

El alfa se queda en **16 %**, no en 14 %: es el valor que `OutcomeBadge` y `ProvisionalBanner` ya
comparten, y el texto encima tiene 7.92 de margen, así que no hay nada que rescatar. Bajarlo sería
cambiar dos superficies sin motivo.

### 3.3 La restricción que hace esto delicado

`three/rebar-scene.ts` alimenta `0xa066d3` a un material de Three.js y **no puede leer una custom
property**. Eso ya está documentado en tres comentarios y, más importante, **fijado por dos tests
que existen**:

```
run-summary-reported.test.ts:122   expect(toolbarSrc).toContain('#a066d3')
viewer-design-system.test.ts:79    expect(scene).toContain('0xa066d3')
viewer-design-system.test.ts:81    expect(read('RebarStatusPanel.svelte')).toContain('#a066d3')
```

**Tokenizar ingenuamente rompe dos de esos tres.** Si `DesignToolbar` pasa a
`color: var(--st-provisional)`, el primero falla; si `RebarStatusPanel` hace lo mismo, el tercero
también. Y romperlos borraría la garantía que dan: que el violeta del visor 3D y el de los paneles
son el mismo color.

**La propuesta es no romperlos, sino moverlos de nivel.** El acuerdo que reemplaza «los dos
archivos contienen el mismo literal» es «los dos resuelven al mismo valor»:

1. `tokens.css` define `--st-provisional: #a066d3`, **con el literal presente en el archivo**, así
   que sigue habiendo un lugar donde el valor está escrito y es grepeable;
2. un test nuevo afirma que el literal de `tokens.css` y el `0x` de `rebar-scene.ts` son el mismo
   número — que es la aserción que hoy está repartida en tres archivos;
3. y sólo entonces los consumidores pasan a `var()`, migrando las dos aserciones de «contiene el
   literal» a «usa el token», en el mismo commit.

Ese orden importa: al revés hay una ventana donde nada verifica que los dos violetas coincidan.

### 3.4 `FloorFamilyStateCard`

Hoy usa `--st-warn` para el estado `provisional`, en dos lugares:

```
FloorFamilyStateCard.svelte:105   .fam-state[data-state='provisional'] { border-left-color: var(--st-warn); }
FloorFamilyStateCard.svelte:116   .st-badge[data-state='provisional']  { color: var(--st-warn); }
```

Es la única superficie que llama «ámbar» a lo que las otras cinco llaman «violeta». La
recomendación es que pase a `--st-provisional`, **y no antes de que el token y sus tests existan** —
si migra primero, queda referenciando un token indefinido, que es el modo de falla silencioso que
`design-tokens-resolve.test.ts` fue escrito para atrapar.

Nota sobre el contraste: `--st-warn` sobre `--st-surface` da 7.52 y `--st-provisional` da 4.30. Los
dos usos son **borde y etiqueta chica**. El borde no es texto y 4.30 le sobra; la etiqueta sí lo es,
así que en `.st-badge` corresponde `--st-provisional-text` (que sobre `--st-surface` da 9.58) y no
`--st-provisional`. Es exactamente la distinción del §3.2, y es la razón por la que la migración de
esta tarjeta no es un reemplazo de una palabra.

## 4. Los seis consumidores, y qué le toca a cada uno

| Consumidor | Rama | Cambio | Riesgo |
|---|---|---|---|
| `OutcomeBadge` | hormigón | `.badge-fail` → `--st-danger-bg` **y texto `--st-danger`** (arregla el fallo de AA); `.badge-warn` → `--st-warn-bg`; `.badge-provisional` → los tres tokens | **el único con cambio visible**: el texto del badge fail pasa de vermellón a rojo-texto |
| `DesignToolbar` | hormigón | `.banner-block` → `--st-danger-bg` + texto `--st-danger`; `.banner-warn` → `--st-warn-bg` (**cambia de matiz**: naranja → ámbar); `.c-prov` → `--st-provisional` | el banner warn cambia de matiz; hay un test que lo referencia por literal |
| `SteelStatusBadge` | **acero (M1)** | ninguno en este contrato. No usa fondo danger ni warn teñido: su tono `warn` es un rayado diagonal deliberado, y su `info` y `neutral` no están en el alcance | ninguno |
| `ProvisionalBanner` | hormigón | los tres tokens provisional | ninguno, mismos valores |
| `FloorFamilyStateCard` | **hormigón (H1)** | `--st-warn` → `--st-provisional` (borde) y `--st-provisional-text` (etiqueta) | cambia de matiz, a propósito |
| overlays de armaduras (`RebarStatusPanel`, `three/rebar-scene.ts`) | hormigón | el panel a `var(--st-provisional)`; **la escena queda con `0xa066d3`** | migrar el test que hoy compara literales |

**Cinco de los seis son de hormigón.** El único de acero no necesita cambios en este contrato, y eso
es un argumento sobre quién debería implementarlo (§7).

## 5. Tests necesarios para que no vuelva a divergir

Cuatro, y el primero ya existe:

1. **`design-tokens-resolve.test.ts` — ya está.** Todo `--st-*` referenciado tiene que estar
   definido. Es lo que hace obligatorio el orden del §3.3: migrar un consumidor antes de definir
   el token lo pone rojo.

2. **Un solo violeta, verificado por valor y no por literal repetido.** Reemplaza las tres
   aserciones actuales de «contiene `#a066d3`»:
   ```
   el literal de --st-provisional en tokens.css === el 0x de three/rebar-scene.ts
   ```
   Un test que lea los dos archivos y compare los números. Sobrevive a que los consumidores pasen a
   `var()`, que es lo que las tres aserciones actuales no hacen.

3. **Ningún fondo de estado teñido escrito a mano.** Un test que recorra los componentes y falle
   ante un `background: rgba(...)` cuyo matiz coincida con un rol que ya tiene token. Es el que
   evita que aparezca un cuarto valor de «warn» dentro de seis meses. Necesita una lista de
   exenciones deliberadas —el rayado de `SteelStatusBadge`, el `--st-selected-bg`— y esa lista es
   parte del contrato, no un detalle de implementación.

4. **Contraste calculado, no revisado a ojo.** Un test que, para cada par (fondo de estado, color
   de texto del rol), componga el fondo sobre `--st-surface` y `--st-surface-2` y exija ≥ 4.5 para
   texto y ≥ 3.0 para borde. Es el que habría atrapado el 3.86 de `.badge-fail` el día que se
   escribió, y es el que hace que los alfas del §3.1 sean una decisión verificable en vez de un
   gusto.

M1 puede escribir el 4 **hoy**, como test aislado sobre los valores propuestos, sin tocar
`tokens.css`. Está en `web/src/lib/__tests__/state-background-contrast.test.ts` y acompaña a este
documento: hoy documenta los números de la propuesta y el fallo de AA que existe; el día que el
contrato se implemente, deja de ser documentación y pasa a ser la puerta.

## 6. Lo que esta propuesta NO incluye

- `--st-ok-bg` y `--st-info-bg` (§3.1).
- Tocar `--st-warn`, `--st-danger`, `--st-ok` o `--st-info`: los cuatro pasan AA sobre las tres
  superficies y no hay nada que arreglar.
- Modo claro. `tokens.css` define una sola paleta oscura; si alguna vez hay un tema claro, los
  alfas del §3.1 hay que recalcularlos y el test del §5.4 es el que lo dirá.
- El rayado diagonal de `SteelStatusBadge`, que es una decisión de accesibilidad —distinguible sin
  matiz— y no un fondo de estado.

## 7. Dueño propuesto

**Implementación: H1.** Cinco de los seis consumidores son de hormigón, el defecto de AA está en
`OutcomeBadge` y `DesignToolbar`, y `FloorFamilyStateCard` es suya y es la que motivó el pedido.

**`tokens.css`: integración común**, o H1 con el visto bueno de M1 sobre el §3.2 — el split
fill/text es lo único que afecta a acero, y afecta poco: `SteelStatusBadge` no cambia.

**M1 aporta y no implementa:** este contrato, los números, y el test de contraste del §5.4 como
artefacto aislado. Si el contrato se acuerda distinto, el test se ajusta a lo acordado antes de que
se implemente nada.

## 8. Qué hace falta para cerrarlo

1. H1 confirma los tres tokens del §3.2 y los dos alfas del §3.1.
2. Se acuerda el orden del §3.3 — token primero, test de equivalencia después, consumidores al
   final — porque al revés hay una ventana sin garantía.
3. Se acuerda la lista de exenciones del test 3 del §5.
4. Se decide si el cambio de matiz de `.banner-warn` (naranja → ámbar) es aceptable, porque es el
   único cambio visible que no es un arreglo.

Nada de eso lo decide M1 solo, y nada se toca hasta que esté acordado.

## 9. Reproducir los números

```python
def lin(c):
    c = c/255
    return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
def L(h):
    h = h.lstrip('#')
    r, g, b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def ratio(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la,lb), min(la,lb)
    return (hi+0.05)/(lo+0.05)
def over(fg, alpha, bg):           # compositar antes de medir
    F = [int(fg.lstrip('#')[i:i+2],16) for i in (0,2,4)]
    B = [int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4)]
    return '#%02x%02x%02x' % tuple(round(F[i]*alpha + B[i]*(1-alpha)) for i in range(3))

SURFACE = '#0f1e2b'   # --st-surface = --st-ink-2
ratio('#e5482a', over('#ee2222', 0.16, SURFACE))   # 3.86 — el defecto
ratio('#e8705f', over('#c0392b', 0.14, SURFACE))   # 5.11 — la propuesta
```

El mismo cálculo está en `state-background-contrast.test.ts`, que es donde conviene mirarlo porque
ahí corre.
