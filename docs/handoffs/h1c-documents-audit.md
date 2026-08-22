# H1-C — auditoría real del flujo de documentos y planos

**Rama:** `feat/pro-concrete-h1` · **PR:** [#161](https://github.com/lambdaclass/stabileo/pull/161) (draft)
**Arnés:** `web/e2e/h1c-documents-flow.spec.ts` — 17 corridas, 3 idiomas × 2 anchos.

---

## 0. H1-A había reportado esta etapa como limpia. No la había mirado

H1-A midió `documents` con el selector `.documents`, que es **una tarjeta** dentro de la etapa: 8
nodos. El contenedor real es `documents-stage`. Y nunca construyó un documento, así que midió el
estado vacío y lo reportó sin defectos.

Con el contenedor correcto y un documento construido son **18 nodos de texto**, y aparecen cuatro
hallazgos, uno de ellos con pérdida de datos.

---

## 1. La cadena, medida

**estado → exportación → revisión → aceptación → emisión**, y funciona así:

| Paso | testid | Qué se midió |
|---|---|---|
| estado sin documento | `doc-none` | "No document built yet" · los 4 exports **habilitados** |
| exportación | `doc-xlsx` | descarga real: **`detailing-rev1.xlsx`** |
| | `doc-report` | abre 1 ventana (`window.open` + `print()`), no descarga |
| estado con documento | `doc-readiness` `doc-revision` `doc-maturity` | "Revision 1" |
| aceptación | `ack-*` | 1 cálculo provisorio en este fixture |
| revisión | `review-submit` | ver §3 |
| emisión | `issue-submit` + `issue-blockers` | deshabilitado, con el motivo en texto |

**El documento se construye de forma perezosa: lo construye la primera exportación.** Antes de
eso la etapa dice "aún no hay documento" y ofrece los tres exports habilitados. Es deliberado y
funciona.

### Una corrección a mi propia primera lectura

Reporté un "no-op silencioso" en `doc-report`. **Estaba equivocado.** Mi sonda esperaba una
descarga, y `exportReport` usa `window.open` + `print()`. Y leí el estado del panel *antes* de
exportar, así que vi `doc-none` y concluí que exportar no hacía nada. Medido bien: `doc-xlsx`
descarga el archivo, el panel pasa a `doc-readiness` y `doc-revision` dice "Revision 1". El
código además tiene su rama de error (`docError = t('detailing.doc.noCoordinated')`), que yo
había leído como ausente.

---

## 2. Qué pasa cuando no hay planos

`documents-empty` — "emptyStage" — cuando no hay conjunto seleccionado, con un comentario en el
fuente que dice lo correcto: *"Not a blank stage: the reason there is nothing to export, and where
to get one."* Y `doc-none` cuando hay conjunto pero no documento.

Los dos son estados honestos. **No hay cero fabricado en esta etapa.**

---

## 3. El defecto con pérdida de datos — `retireDocument` antes de validar

### El mecanismo

`src/lib/store/detailing.svelte.ts:1379-1396`:

```ts
review(record) {
  if (!selected) return false;
  retireDocument();                       // ← 1380: incondicional
  const r = applyReview(selected, record, provisionalKeys(selected));
  if (!r.ok || !r.assembly) {
    lastError = …;                        // ← el motivo del rechazo
    return false;                         // ← y el documento ya fue retirado
  }
  …
}
```

`retireDocument()` incrementa la revisión, mueve el documento a `supersededDocs` y pone
`currentDocument = null`. Se ejecuta **antes** de que `applyReview` decida.

### Medido

Con el `Record review` original —sin `disabled` y sin explicación— y un cálculo provisorio sin
aceptar:

    antes:   doc-readiness = 1, doc-revision = "Revision 1"
    click:   review-error = "There are provisional calculations without express acceptance…"
    después: doc-readiness = 0, doc-maturity ausente, superseded-docs = 1

**Un click que no logró nada supersedió el documento que el usuario acababa de construir.** Tiene
que volver a exportar para recuperarlo.

Aclaración importante: un `review` **exitoso** también retira el documento, y eso **es correcto** —
el comentario del store lo dice: *"A review changes the readiness a document may claim, so the
previous one is no longer current."* El defecto es el camino del rechazo, no el del éxito.

### Lo que H1 hizo, y lo que NO

**Hecho, a nivel componente:** `review-submit` ahora está `disabled` mientras haya un motivo, y
los motivos se muestran en `review-blockers` — **con las mismas tres frases que el store diría
después**, desde las mismas claves de i18n:

    detailing.review.notConstructible       ← espeja assembly.ts:481
    detailing.review.engineerRequired
    detailing.review.provisionalOutstanding

No es un juego de reglas nuevo: son las mismas, dichas antes del click. Que es el principio que la
nota bajo `issue-submit` ya enunciaba — *"a control that governs a construction issue and explains
itself with nothing but grey is the one place in this panel where silence is least excusable"*—
aplicado al control que se había olvidado.

Medido después: `disabled` con dos motivos → nombre → un motivo → aceptaciones → **habilitado**, el
documento intacto, y la revisión **tiene éxito** con `issue-submit` habilitado.

**NO hecho: el orden en el store.** `detailing.svelte.ts` lo importan **14 componentes**, cuatro
de ellos congelados (`ProRibbon`, `WorkflowStages`, `DesignOverview`, `StageSection`). Ningún
archivo de acero lo usa, pero reordenar `review()` cambia el comportamiento para todos los
consumidores.

**Contrato:** `review()` promete devolver `false` y poblar `lastError` cuando el motor rechaza. Hoy
también supersede el documento en ese camino. **Cambio mínimo:** mover `retireDocument()` después
del `if (!r.ok)`. **Dueño:** quien sea dueño del store de detallado. **Tests afectados:** cualquiera
que dependa de que un `review` rechazado incremente la revisión — hay que buscarlos antes de
mover la línea.

Con el gating del componente, el camino del rechazo **no es alcanzable desde este panel**. El
defecto sigue existiendo para cualquier otro llamador.

---

## 4. Un hueco de i18n que mi propio cambio dejó a la vista

Al mostrar los motivos **antes** del click, el tripwire de idioma del spec falló en portugués:

    pt · review-blockers → "The reviewing engineer must be named. There are provisional…"

Las cinco claves `detailing.review.*` existían en `en` y `es`. **En `pt` había una de cinco.** Un
usuario en portugués era rechazado en inglés.

### Por qué ningún gate lo cazó

Dos causas, las dos mecánicas:

- `locale-parity.test.ts:63` filtra `k.startsWith('design.')`. El namespace `detailing.` no está
  vigilado.
- `pro-flow-coverage.test.ts` escanea componentes y `lib/engine/detailing`. Estas claves las emite
  el **store**, y los stores no están en su lista de escaneo — el propio store lo dice: *"The store
  is the locale boundary, so the engine's refusal is translated HERE."*

### Y el alcance real, que desborda H1-C

Contando las claves que **`en` y `es` tienen y `pt` no**:

| prefijo | faltantes en `pt` |
|---|---:|
| `landing.` | 317 |
| `cad.` | 254 |
| `detailing.` | 158 |
| `footing.` | 99 |
| `loads.` | 90 |
| `report.` | 52 |
| `codes.` | 48 |
| `pro.` | 33 |
| **total** | **1176** |

`pt` es uno de los tres idiomas ofrecidos. **1176 claves faltantes es un problema de proyecto, no
de esta rama**, y no lo toco.

**Hecho:** las cuatro `detailing.review.*` que faltaban, porque mi cambio las pone en pantalla en
un archivo que poseo. 5 de 5 en los tres idiomas ofrecidos.

**Recomendación:** extender `locale-parity` de `design.` a todos los namespaces, o al menos
agregar `detailing.` y `footing.`; y agregar `lib/store` al escaneo de `pro-flow-coverage`. Las dos
son de una línea y las dos van a fallar fuerte la primera vez. Merece su propio bloque.

---

## 5. Legibilidad y encaje — dos afirmaciones distintas

18 nodos de texto medidos en `documents-stage`, en `en`/`es`/`pt` a 1280×720 y 1024×700:

- **desborde horizontal: 0** en las seis combinaciones;
- **contraste: ningún texto bajo su umbral** — ni uno.

Es un resultado limpio y lo digo con la misma claridad que los defectos. Pero encajar no es
informar: con un documento construido la etapa muestra readiness, revisión, madurez, cuatro
botones y el formulario de revisión. **No muestra qué se exportó, ni la lista de planos, ni una
vista previa.** El contenedor entra y la información es legible; lo que falta es información, y eso
no lo detecta ninguna medición de layout.

---

## 6. Lo que esta auditoría NO cubrió

- **Exportación incompleta y error.** No conseguí que `buildDocument` devuelva `null` en este
  fixture, así que `doc-error` y `detailing.doc.noCoordinated` **no se ejercitaron en navegador**.
  Hace falta un modelo sin conjuntos coordinados.
- **DXF y XLSX como contenido.** Verifiqué que el XLSX se descarga con el nombre correcto; **no
  abrí el archivo**. Que el DXF sea R12 válido y que el XLSX tenga las hojas esperadas son
  aserciones que faltan.
- **`superseded-docs`** aparece y no medí su contenido ni su orden.
- **Foco y retorno.** El foco al abrir y cerrar el visor está fijado en H1-B. El foco **dentro** de
  la etapa —después de exportar, después de una revisión— no se midió.
- **Estados de carga.** No encontré ninguno: las exportaciones son sincrónicas en este fixture.
  Con un edificio de 7 pisos podría no serlo, y no lo probé.
- **`SheetPreview`.** El componente existe (271 líneas) y no aparece en esta etapa. No averigüé
  desde dónde se alcanza.

---

## 7. Frontera de archivos compartidos

| Archivo · líneas | Contrato | Dueño |
|---|---|---|
| `lib/store/detailing.svelte.ts:1380` | `retireDocument()` antes de validar. 14 componentes leen este store. | **Store compartido.** §3. |
| `lib/i18n/__tests__/locale-parity.test.ts:63` | Vigila sólo `design.`. | Compartido — la extensión afecta a las dos ramas y a `edu`. |
| `lib/i18n/__tests__/pro-flow-coverage.test.ts:50` | Escanea componentes y el motor, no los stores. | Compartido. |
| `lib/i18n/locales/pt.ts` | 1176 claves faltantes. | Proyecto. H1 agregó 4. |

`DocumentsSection.svelte` **no** es compartido: lo montan `ProRcWorkflowTab` y `DetailingWorkflow`,
los dos de hormigón.
