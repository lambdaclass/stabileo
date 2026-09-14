# Propuesta para M1 — `--st-text-3` no pasa AA como texto, en ningún fondo

**Origen:** H1-A (`feat/pro-concrete-h1`, [PR #161](https://github.com/lambdaclass/stabileo/pull/161)).
**Estado: propuesta. `tokens.css` sin tocar.** Ningún consumidor migrado.
**Decisión pendiente:** de Bauti y Diego.

---

## 1. La medición

`--st-text-3` es `#64798a`. Contra los cuatro fondos opacos que un panel puede tener:

| | `--st-bg` | `--st-surface` | `--st-surface-2` | `--st-surface-3` |
|---|---:|---:|---:|---:|
| `--st-text` `#f4f7fa` | 16.97 | 15.74 | 15.22 | 13.81 |
| `--st-text-2` `#8fa3b3` | 7.00 | 6.49 | 6.28 | 5.70 |
| **`--st-text-3` `#64798a`** | **4.03** | **3.74** | **3.62** | **3.28** |

**Ninguno de los cuatro llega a 4.5:1.** El más estricto es `--st-surface-3` —el pozo, el
fondo más claro de los cuatro— con 3.28.

Confirmado en navegador por `e2e/h1a-audit.spec.ts`: en la etapa de diseño aparecen a 10.6–11.2 px
con ratio **3.74** medido sobre el fondo real, no calculado.

## 2. El alcance

| Área | Usos |
|---|---:|
`components/pro/` (todo) | 152
`components/` raíz | 80
`components/edu/` | 33
`App.svelte` | 9
`components/landing/` | 0
| **total** | **489** |
| de los cuales `color:` | **462** |
| `border-color` | 11 |
| otros (rellenos, tramas) | 16 |

En la superficie de hormigón: **40 usos, 35 como `color:`**.
**M1 lo usa en 3**, los tres como `color:`: `SteelStatusBadge.svelte:59` (`.tone-neutral`),
`SteelPanel.svelte:187` (`.muted`) y `:214` (`.refs`).

## 3. El token alternativo — y por qué la respuesta obvia no sirve

Para que el ratio llegue a 4.5:1 hace falta una luminancia relativa mínima:

| sobre | L mínima | `--st-text-3` tiene |
|---|---:|---:|
| `--st-bg` | 0.2090 | 0.1822 |
| `--st-surface` | 0.2292 | 0.1822 |
| `--st-surface-2` | 0.2387 | 0.1822 |
| `--st-surface-3` | **0.2683** | 0.1822 |

Candidatos preservando el matiz (H 207°, S 16%):

| Lightness HSL | valor | bg | surface | surface-2 | surface-3 | ¿AA en los 4? |
|---:|---|---:|---:|---:|---:|---|
| 47 % *(hoy)* | `#64798a` | 4.03 | 3.74 | 3.62 | 3.28 | no |
| 50 % | `#6b8294` | 4.56 | 4.23 | 4.09 | 3.71 | no |
| 54 % | `#778c9c` | 5.23 | 4.85 | 4.69 | 4.25 | no |
| **58 %** | **`#8396a5`** | 5.97 | 5.54 | 5.35 | **4.86** | **sí** |
| 62 % | `#8fa0ae` | 6.78 | 6.29 | 6.08 | 5.52 | sí |

**Y acá está el problema real: `--st-text-2` está en lightness 63 %.**

Para que `--st-text-3` sea un color de texto legal tiene que aterrizar a **5 puntos de
lightness** de `--st-text-2` — 5.54 contra 6.49 sobre `--st-surface`. En ese punto el tercer
nivel deja de ser un nivel. No es que el valor esté mal elegido: **esta paleta no tiene lugar
para tres niveles de texto sobre fondo oscuro, y el tercero está ocupando un lugar que no
existe.**

## 4. Tres caminos, y el que recomiendo

### (A) Redefinir `--st-text-3` a `#8396a5` — **no lo recomiendo**

Pasa AA en los cuatro fondos con una línea. Pero:

- cambia la apariencia de **489 sitios de una vez**, en `pro/`, componentes raíz, `edu` y
  `App.svelte`, incluidas superficies que ni H1 ni M1 revisan;
- colapsa la jerarquía de tres niveles a dos y medio, así que la distinción que el token existe
  para expresar se pierde igual;
- y no arregla nada conceptual: el token seguiría llamándose "tercer nivel de texto" siendo
  casi el segundo.

### (B) Redefinir el SIGNIFICADO: `--st-text-3` es deshabilitado e inactivo — **la dirección correcta**

WCAG 2.1 §1.4.3 exime explícitamente el texto de componentes **inactivos**. `--st-text-3` a
`#64798a` es un color de deshabilitado perfectamente defendible; lo que no es defendible es que
lleve oraciones.

Eso pide documentar el token como tal en `tokens.css` y migrar los **462 usos `color:`** que
llevan copia real a `--st-text-2`. Es correcto y es demasiado para una rama: toca `pro/`,
componentes raíz, `edu` y `App.svelte`.

Usos que **ya** son legítimos bajo (B), sólo en la superficie de hormigón:

    DesignTable:77,78       relleno de barra y trama          → gráfico, umbral 3:1
    DesignTable:227         .caret                            → glifo de affordance
    OutcomeBadge:93,96,110,113   bordes y etiqueta de badge
    VerificationDetail:219,222   bordes
    DesignToolbar:460       .banner-stale, borde
    WorkflowStages:229      .stage-blocked button             → etapa BLOQUEADA, inactiva
    DesignFamilyPanel:336   .frow[data-state='skipped']       → estado omitido

### (C) Acotado a H1 ahora, (B) como dirección — **lo que recomiendo**

Migrar a `--st-text-2` sólo las oraciones y etiquetas de la superficie de hormigón, dejar
`tokens.css` intacto, y documentar en el token que no es AA para texto. Son ~24 sitios, y **17 de
ellos son archivos que H1 posee**:

    ChangedMembersPanel:102,103      .muted · .empty
    BatchEditDialog:322,341,342
    DesignFamilyPanel:328,352,373,387  .census · .hint · .note/.cols · td.state
    DesignTable:233                  .empty
    DesignFilterBar:202,206          .lbl · .refused
    FloorFamilyStateCard:132,136     .fam-scope dt · .no-n
    ProjectRegulationsPanel:347,384  .role-purpose ×8 · .note
    RebarEditorColumn:137            .sub
    RebarEditorBeam:145,146,154
    RebarSchematics:131              .dim
    VerificationDetail:211,244       .muted · .desc

`ProjectRegulationsPanel` **no es compartido**: sólo lo monta `ProRcWorkflowTab`, que es la
pestaña de hormigón armado. Concentra 9 de los sitios que la auditoría vio en pantalla.

## 5. Impacto en H1 y M1

**H1** — 24 sitios de oración, 17 en archivos propios. Efecto visible: la copia secundaria de los
paneles de hormigón sube de 3.74 a 6.49 sobre `--st-surface`. Sin cambio de layout: mismo tamaño,
mismo peso.

**M1** — 3 sitios. `SteelPanel.muted` y `.refs` son copia secundaria y caen bajo (B) o (C) según
lo que M1 decida; `SteelStatusBadge.tone-neutral` es la etiqueta de un badge **neutral**, que es
más cerca de "inactivo" que de oración y puede quedarse.

**Si se elige (A)**, el impacto es de las dos ramas más `edu`, componentes raíz y la app entera, y
debería ir en un commit propio, antes que cualquier migración, con capturas de las superficies que
ninguna de las dos ramas mira.

## 6. Archivos compartidos — freno acá

| Archivo · líneas | Contrato | Dueño |
|---|---|---|
| `tokens.css` `--st-text-3` | Tercer nivel de texto de toda la aplicación. 489 usos. | **Compartido.** Igual que las cinco superficies de estado: propuesta medida primero. |
| `WorkflowStages.svelte:186,229` | Franja de etapas — cromática común del workflow PRO; el flujo metálico se renderiza dentro. `:229` es una etapa **bloqueada** y probablemente ya es legítima. | **Compartido.** |
| `DesignOverview.svelte:286` `.tone-muted` | Censo de resultados, usado por el censo metálico. | **Compartido.** |
| `DesignToolbar.svelte:341,437,460` | Fila de comandos PRO. | **Compartido.** |
| `OutcomeBadge.svelte:93,96,110,113` | Referenciado por `SteelStatusBadge`. Los cuatro son bordes o etiqueta de badge; probablemente ya legítimos bajo (B). | **Compartido.** |

## 7. Un hallazgo aparte, del mismo bloque y más grande

Al arreglar la tipografía del visor apareció que **los controles de formulario no heredan la
fuente**: dentro de `.app-container` hay **489 botones y 23 inputs en Arial**, contra 15 y 13 en
IBM Plex. `.app-container` declara `font-family: var(--st-sans)` con el comentario *"One
declaration here reaches every descendant that does not override it"* — cierto para la herencia,
falso para `button`, `input`, `select` y `textarea`, a los que cada navegador les da su propia
fuente.

El arreglo es **una regla**:

```css
button, input, select, textarea { font-family: inherit; }
```

Su lugar natural es `tokens.css` o `App.svelte`, de los que dependen todas las pestañas PRO y la
superficie metálica. H1 ya lo resolvió **dentro del overlay** con un `:global()` acotado a
`.workspace` (12 botones y 13 inputs), precisamente para no tomar la decisión global por su
cuenta. **Contrato:** la app declara su tipografía una vez y espera que alcance todo.
**Dueño:** quien sea dueño de la hoja global.
