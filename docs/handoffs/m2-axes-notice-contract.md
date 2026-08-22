# Contrato del aviso de ejes no principales — patch listo, **sin aplicar**

**Rama:** `feat/pro-steel-m2` · **Estado:** la regla está **implementada y testeada**; los
consumidores **no están tocados**.

**El resultado que hay que leer primero:** **ninguna** de las superficies donde el aviso
corresponde es de M2. Todas son compartidas con hormigón o son de modo Básico. Así que M2 hizo lo
único que le tocaba —la regla, pura y verificada— y frenó antes de montarla, salvo en su propio
panel metálico.

---

## 1. Lo que M2 ya entregó

| | |
|---|---|
| **La regla** | `web/src/lib/section/axes.ts` — pura, sobre `Section.shape` y nada más |
| **API** | `axesSymmetryOf(shape)` → `'principal' \| 'notPrincipal' \| 'unknown'`; `warnsAboutAxes(shape)` → boolean; `axesNoticeKeyFor(shape)` → clave i18n o `null` |
| **Textos** | `section.axes.notPrincipal.angle` y `section.axes.notPrincipal.zed`, en es/en/pt |
| **Tests** | 20 casos en dos archivos: cobertura, presencia, ausencia, catálogo real, y que no se mueve ningún número |
| **Consumidor** | uno solo: `ColdFormedPanel.svelte`, que es de M2 |

**Exhaustividad garantizada por el compilador.** La tabla es un `Record<Shape, AxesSymmetry>`: si
alguien agrega un literal a `Section['shape']` y no lo clasifica, **el módulo deja de compilar**. El
test lo repite en runtime para quien sólo corra la suite.

**Corrección de mi propuesta anterior.** `nonprincipal-axes-warning-proposal.md` recomendaba empezar
por `PropertyPanel.svelte`. **Estaba mal, y lo verifiqué al implementar:** `PropertyPanel` no muestra
inercias —cero apariciones de `.iz`— y `property/SectionDetails.svelte`, que parecía la ficha de la
sección, es un **placeholder vacío de 8 líneas sin markup**. La superficie real es
`SectionEditor.svelte`. La lista de abajo reemplaza la del §7 de esa propuesta.

---

## 2. Las superficies reales, y quién es dueño de cada una

| Superficie | Archivo | Qué pasa por ahí | Dueño / estado |
|---|---|---|---|
| **Editor de sección** | `components/SectionEditor.svelte` (301 líneas) | Es **donde un usuario lee y edita `A` e `Iz`**. Montado desde `App.svelte` como modal global. Sin contenido de hormigón propio, pero **toda** sección pasa por él, incluidas las de hormigón. | **compartido — frenado** |
| **Selector de perfiles** | `components/ProfileSelector.svelte` | Donde se **elige** un ángulo del catálogo. Montado dentro de `SectionEditor` y dentro de `pro/generators/ProfilePicker.svelte`. | **compartido — frenado** |
| **Pestaña de secciones PRO** | `components/pro/ProSectionsTab.svelte` | Sirve las plantillas, arranca en `activeShape = 'concrete-rect'`. | **compartido — frenado** |
| **Panel de tensiones** | `components/SectionStressPanel.svelte` (1819 líneas) | **La superficie más consecuente**: es donde se muestra el resultado de la Navier biaxial desacoplada, que es la que no vale fuera de ejes principales. Montado desde `ribbon/BasicPanel.svelte`. | **modo Básico — prohibido por restricción explícita** |
| **Cambiador de sección** | `components/SectionChanger.svelte` | Picker de Básico. | **modo Básico — prohibido** |
| **Panel conformado en frío** | `pro/steel/ColdFormedPanel.svelte` | | **M2 — ya lo hace** |

**Cero superficies disponibles para M2.** No es una queja: es el motivo por el que este documento
existe en vez de un commit.

---

## 3. El patch propuesto, superficie por superficie

Un patrón, tres aplicaciones. **Una sola regla**, la del módulo: ninguna superficie decide por sí
misma cuándo avisar.

### 3.1 `SectionEditor.svelte` — el más importante

Es donde el número está a la vista, así que es donde el aviso vale más.

```diff
   import { t } from '../lib/i18n';
+  import { axesNoticeKeyFor } from '../lib/section/axes';
   …
+  /*
+   * Whether this section's stored axes are its principal ones.
+   *
+   * Asked, never decided here: the rule is `section/axes.ts`, so this surface and every other one
+   * warn on the same predicate. `pendingShape` rather than the saved shape, so choosing an angle
+   * from the profile selector shows the notice before the edit is committed.
+   */
+  const axesNoticeKey = $derived(axesNoticeKeyFor(pendingShape));
```

```diff
     <div class="field">
       <span>{t('secEdit.iz')}</span>
       <input
         type="number"
         step="0.000001"
         bind:value={localIz}
         onkeydown={handleKeydown}
       />
     </div>
+    <!--
+      The axes notice sits immediately under the inertia it qualifies. A number and its caveat in
+      two different places is a caveat nobody reads.
+
+      Plain text, no badge: this is a statement about how the app REPRESENTS the section, not a
+      design outcome. See §4.
+    -->
+    {#if axesNoticeKey}
+      <p class="axes-notice" data-testid="section-axes-notice">{t(axesNoticeKey)}</p>
+    {/if}
```

```diff
+  /* Neutral, never `--st-ok`. Contrast measured composited over the real surface. */
+  .axes-notice {
+    font-size: 0.7rem;
+    color: var(--st-warn);
+    margin: 0.25rem 0 0;
+  }
```

### 3.2 `ProfileSelector.svelte` — al elegir, que es cuando se puede cambiar de opinión

Una marca por fila, no una oración: es una lista. Y el texto completo una sola vez, cuando la
selección actual es asimétrica.

```diff
+  import { warnsAboutAxes, axesNoticeKeyFor } from '../lib/section/axes';
+  import { familyToShape } from '../lib/data/steel-profiles';
   …
+  // A dagger on the row, the sentence once below the list. Reused rule, no second predicate.
+  const rowWarns = (family: ProfileFamily) => warnsAboutAxes(familyToShape(family));
```

### 3.3 `ProSectionsTab.svelte` — al construir una

Ya recibe `computed.shape` de `computeSectionProperties`, así que el aviso sale de lo que la
plantilla declara:

```diff
+  import { axesNoticeKeyFor } from '../../lib/section/axes';
   …
+  const axesNoticeKey = $derived(computed ? axesNoticeKeyFor(computed.shape as never) : null);
```

Y en el bloque de propiedades derivadas, el mismo `{#if}` de §3.1. **La plantilla `invL` (ángulo
desigual) es la que lo dispara acá**, y hoy no dice nada.

### 3.4 `SectionStressPanel.svelte` — el que M2 no puede tocar

Es el único donde el aviso no es informativo sino **correctivo**: la tensión que muestra viene de
`σ = N/A + Mz·y/Iz + My·z/Iy`, válida sólo respecto de ejes principales. Para un ángulo o un Z **el
número en pantalla es el afectado.**

Está en modo Básico, que esta rama tiene prohibido tocar. **Lo dejo señalado para quien sea dueño de
Básico, y es la aplicación más urgente de las cuatro.**

---

## 4. Cómo no presentarlo como verificación

El riesgo real: un aviso con forma de resultado se lee como un resultado.

**Prohibido, y el patch lo cumple:**
- pasar por `OutcomeBadge`, `SteelStatusBadge` ni ningún componente de estado de diseño;
- `--st-ok` o cualquier tratamiento verde;
- mostrar ratio, aprovechamiento, capacidad o porcentaje;
- las palabras verificado / aprobado / certificado / apto / cumple / no cumple — **aseverado por
  test sobre los dos textos en los tres idiomas**;
- entrar en censos, conteos o resúmenes de verificación;
- aparecer en un certificado o export como si fuera un chequeo.

**Qué es:** una nota sobre **cómo la app representa la sección**. No dice que la barra falle ni que
pase. Dice que los números mostrados son respecto de ejes que no son los principales, y qué haría
falta para que eso estuviera justificado.

**Contraste:** si va sobre fondo teñido, medirlo **compuesto** sobre la superficie real, como quedó
fijado en `state-background-contrast.test.ts`. El patch usa texto sobre el fondo del panel, sin
teñir, para no abrir esa pregunta.

---

## 5. Una sola regla, y cómo se garantiza

El pedido explícito era no duplicar el aviso en dos componentes con reglas distintas. **Ya había una
duplicación y la removí en esta rama**: `ColdFormedPanel` avisaba con su propio predicado
(`shape === 'Z'`) y su propia frase (`COLD_FORMED_ZED_AXES_KEY`). Las dos se fueron; el panel ahora
llama `axesNoticeKeyFor()` como cualquier otra superficie.

Lo que queda fijado por test:
- `cold-formed-scope.test.ts` asevera que el módulo de alcance **no exporta ninguna clave de ejes**
  —`expect(Object.keys(scope).some(k => /axes/i.test(k))).toBe(false)`— así que la duplicación no
  puede volver en silencio;
- `axes.test.ts` asevera la tabla completa contra una segunda opinión escrita a mano, no importada.

**Lo que el panel de conformados agrega y ninguna otra superficie puede:** el **ángulo medido**.
Tiene la geometría a mano, así que dice «ejes principales rotados 23,4°» donde una superficie general
sólo puede decir «rotados». Es un dato extra sobre la misma regla, no una regla distinta.

---

## 6. Que no se mueve ningún número — y cómo lo probé

Dos argumentos, los dos aseverados en `axes-changes-no-results.test.ts`:

1. **Estructural.** La regla recibe `Section.shape` y nada más, así que no hay nada más en lo que
   pueda influir. Probado llamándola con una sección despojada de todos los campos menos la forma,
   y con secciones cuyas inercias difieren en órdenes de magnitud: misma respuesta.
2. **Empírico.** Un voladizo con sección `'L'` sigue dando `PL³/3EI` sobre la inercia **almacenada**
   — porque el aviso **no corrige** el número, que es la posición honesta: la app dice que los ejes
   no son principales y sigue analizando respecto de ellos, en vez de sustituir en silencio un valor
   que nadie citó. Y el mismo voladizo con `shape` en `'I'`, `'L'`, `'invL'`, `'Z'` y `'generic'` da
   **desplazamientos y reacciones idénticos bit a bit**.

El segundo es el que atraparía una implementación futura que empezara a realimentar el predicado
hacia un resolvedor.

---

## 7. Qué le pido a H1

1. **Aprobar o rechazar** el patch de §3.1 (`SectionEditor`), que es el de mayor rendimiento por
   línea.
2. **Decidir quién escribe** §3.1, §3.2 y §3.3. El precedente que funcionó es el bloque de tokens:
   el dueño del archivo compartido escribe, M2 verifica y ajusta lo suyo.
3. **Escalar §3.4** a quien sea dueño de modo Básico. Es la única de las cuatro donde el aviso no es
   informativo sino correctivo, y ninguna de las dos ramas puede tocarla.
4. Confirmar que ninguna sección de hormigón queda con aviso: **ninguna plantilla de hormigón
   produce `L`, `invL` ni `Z`** —las de hormigón son `rect` y las macizas— así que el aviso es
   invisible para hormigón. Aseverado en `axes.test.ts` por la vía de que sólo esas tres formas
   avisan.

**Lo que no pido:** agregar `Ixy`. Sigue siendo M3 o posterior, y sigue documentado en
`m2-ixy-integration-handoff.md`.
