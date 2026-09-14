# Exportaciones — qué está verificado, qué no, y el contrato que falta

**Rama:** `feat/pro-concrete-h1` · **PR:** [#161](https://github.com/lambdaclass/stabileo/pull/161) (draft)
**Estado: reporte y contrato. Nada implementado por este documento.**

Reemplaza y corrige lo que dije en el cierre de H1-C, donde escribí que *"el contenido de los
archivos está sin verificar"*. Eso es cierto **del camino de navegador** y falso de los
renderers, que tienen cobertura unitaria sustancial. La distinción importa y la aclaro abajo.

---

## 1. Las tres rutas

| | qué hace | cómo sale |
|---|---|---|
| **XLSX** | `renderSchedule(doc)` → `exportToExcel({ extraSheets })` | descarga, `detailing-rev{n}.xlsx` |
| **DXF** | `renderDrawings(doc)` → `downloadBlob(..., 'application/dxf')` | descarga, `detailing-rev{n}.dxf` |
| **Reporte** | `renderReportHtml(doc)` → `window.open` + `print()` | **ventana**, no archivo |

Las tres pasan por `currentDoc()`, así que **consumen la misma instancia del modelo y la misma
revisión**: un reporte, un juego de planos y una planilla del mismo piso no pueden discrepar sobre
la revisión, los conflictos o el acero.

---

## 2. XLSX — qué se verificó y qué no

### Verificado en navegador (`h1c-documents-flow.spec.ts`)

- que la descarga **ocurre**;
- que el nombre es `detailing-rev{n}.xlsx` con la revisión correcta;
- que el panel pasa de `doc-none` a `doc-readiness` con "Revision 1" — o sea que **la exportación
  es lo que construye el documento**.

### Verificado en unidad (`document-render.test.ts` y 12 archivos más)

`renderSchedule` está ejercitado por **trece** archivos de test. Ejemplo del tipo de aserción:
la planilla aplanada contiene `NOT FOR CONSTRUCTION` y `prohibitedOverlap` cuando corresponde, y
el número de hojas es el esperado.

### **No** verificado

- **Nadie abre el `.xlsx` producido.** `exportToExcel` recibe las filas como `aoa` y la conversión
  a workbook —la librería, las hojas, los nombres de solapa, el encoding— no se lee de vuelta en
  ningún test. Se verifica lo que entra, no lo que sale.
- No hay aserción de que `onlyExtras: true` haga lo que promete: que el archivo contenga **sólo**
  las hojas del despiece y ninguna del exportador general.

**Qué haría falta:** leer el blob descargado con la misma librería y comprobar nombres de hoja y
un puñado de celdas. Playwright entrega el `Download`; es un test, no un cambio de producción.

---

## 3. DXF — ruta completa, inspección ausente

### Verificado en unidad

`renderDrawings(doc).dxf` se asserta en `document-render.test.ts`:

    contiene 'SECTION' · 'ENTITIES' · 'EOF' · 'ARC'
    contiene 'NOT FOR CONSTRUCTION' y 'CONFLICT' cuando corresponde
    longitud > 1000

Y el generador documenta su formato: **R12 (AC1009)**, polilíneas de barra como
`POLYLINE`/`VERTEX`/`SEQEND`, secciones de barra como `CIRCLE`, arcos reales como `ARC`
(`drawings.ts:497-513`).

### **No** verificado

- **La descarga nunca se ejercitó en navegador.** `h1c-documents-flow` descarga el XLSX; el DXF no
  tiene ni siquiera la aserción de nombre de archivo.
- **Nadie parsea el DXF producido.** Hay un parser en el árbol —`parseCadDxf`, usado por
  `cad-classify.test.ts` para la IMPORTACIÓN— y no se lo usa nunca sobre la salida. Un test que
  exporte y vuelva a parsear cerraría el ciclo con código que ya existe.
- Que el archivo sea **R12 válido** está afirmado por el generador y no comprobado: `AC1009`
  aparece en el fuente, no en una aserción.

---

## 4. Reporte — popup, y ningún PDF que inspeccionar

`exportReport` no descarga nada:

```ts
const w = window.open('', '_blank');
if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
else downloadBlob(`detailing-rev${n}.html`, 'text/html', html);
```

Impreso por el navegador y no por un escritor de PDF empaquetado — mejor tipografía, sin
dependencia, y el usuario elige el papel. La consecuencia para las pruebas es directa:

- **verificado**: la ventana se abre (`popups: 1`, medido);
- **no verificado**: el contenido de esa ventana, y **no hay PDF alguno que inspeccionar** —
  `print()` entrega al diálogo del sistema operativo.
- El **fallback** a `.html` cuando el popup se bloquea **nunca se ejercitó**. Es la única rama que
  produce un archivo, y es la que ningún test toca.

**Qué haría falta:** capturar el `popup` en Playwright y asertar sobre su DOM — el HTML es del
mismo `renderReportHtml` que ya tiene cobertura unitaria, así que lo que faltaría probar es el
transporte, no el contenido. Y forzar el bloqueo de popups para el fallback.

**Corrección a un reporte mío anterior:** dije que `doc-report` era *"un no-op silencioso"*. No lo
es — mi sonda esperaba una descarga de una acción que abre una ventana.

---

## 5. `ExportRecord` — el contrato que falta

**El store no registra nada.** No hay `lastExport`, `exports` ni equivalente: las tres funciones
llaman a `currentDoc()`, escriben un blob y no informan a nadie.

**Lo que eso cuesta:** quien exportó el DXF, editó una zapata y volvió a Documentos no tiene forma
de saber que el archivo en su carpeta ya no corresponde. El modelo **sí** sabe que hubo
supersesión —`supersededBy`, `supersededDocuments`— y nada conecta eso con los archivos que
salieron.

```ts
export interface ExportRecord {
  kind: 'report' | 'dxf' | 'xlsx';   // cerrado: un cuarto es una decisión
  revision: number;                   // de qué revisión salió — la clave de todo esto
  seriesId: string;                   // para que un proyecto con varias series no las mezcle
  at: string;                         // ISO-8601, provisto por el LLAMADOR
  filename: string;                   // el nombre ofrecido al navegador
  error: string | null;               // null si salió bien; el mensaje ya traducido si no
}
```

```ts
recordExport(r: Omit<ExportRecord, 'seriesId'>): ExportRecord | null;
get exports(): readonly ExportRecord[];
get staleExports(): readonly ExportRecord[];   // revision !== document.revision.number
```

`at` lo provee el llamador, **nunca el reloj del store** — la regla que `detailing.svelte.ts` ya
enuncia sobre sí mismo: *"The store never reads the clock itself; the timestamp comes from the
action."*

`recordExport` devuelve `null` si no hay documento, mismo patrón que `buildDocument`, para que no
exista un registro sin serie a la que pertenecer.

**Registrar también los fallos.** Un export que falló es exactamente lo que el usuario no
recuerda.

---

## 6. Compatibilidad con documentos antiguos

Ésta es la decisión de la que depende que el contrato sea barato o caro.

**`ExportRecord` es estado SEPARADO, no un campo de `DocumentModel`.** Tres razones:

1. `DocumentModel` se serializa dentro del modelo y lo leen tres renderers. Agregarle un campo
   obliga a versionar el modelo y a decidir qué hace un `.ded` viejo al abrirse.
2. Un registro de exportaciones **no pertenece al documento**: pertenece al proyecto. El mismo
   documento puede emitirse tres veces y seguir siendo el mismo documento.
3. `supersede()` mueve documentos a `supersededDocs` sin tocar los registros, así que un registro
   puede **sobrevivir** a su documento — que es precisamente lo que hace útil a `staleExports`.

**Migración: ninguna.** Un proyecto guardado sin `exports` se lee con la lista vacía, y una lista
vacía significa *"no sabemos qué se exportó"*, que es la verdad para todo proyecto anterior.

**Explícitamente prohibido: inventar un registro retroactivo.** Que exista un documento **no
prueba** que se haya exportado. Derivar registros de la existencia de un `DocumentModel` produciría
una lista de emisiones que nunca ocurrieron, en la única superficie del producto cuyo propósito es
decir qué salió realmente.

**Persistencia: decisión abierta.** Si va al `.ded` hay que versionar; si vive sólo en memoria se
pierde al recargar, justo cuando el aviso de obsolescencia más sirve. Recomiendo persistir con el
campo **opcional** y ausencia = lista vacía, lo que evita el bump de versión.

---

## 7. Qué debería mostrar la UI

- **qué se emitió y de qué revisión** — una línea por registro, con el nombre del archivo;
- **cuáles quedaron viejos** — `staleExports`, con la revisión que tienen contra la vigente;
- **los fallos**, que hoy desaparecen apenas se cierra el diálogo.

Y va donde ya está el resto del contenido: la etapa de Documentos hoy muestra readiness, revisión,
madurez, conjuntos, certificados, cláusulas y reglamentos (`doc-contents`). Un bloque de emisiones
es la pieza que falta al lado de ésos.

---

## 8. Qué NO puede afirmar el navegador

Conviene dejarlo escrito antes de que alguien lo pida:

- **que el archivo siga existiendo en el disco del usuario.** El navegador entrega el blob y
  pierde de vista el archivo. "Exportado" significa "se ofreció la descarga", no "está ahí".
- **que el usuario lo haya guardado.** Puede haber cancelado el diálogo. Un `Download` de
  Playwright tampoco prueba lo contrario.
- **que el PDF se haya impreso.** `print()` entrega al sistema operativo y no devuelve nada.
- **que el archivo no haya sido modificado.** No hay hash de lo que salió, y agregarlo no ayudaría:
  el hash sería del blob generado, no del archivo en el disco.

De ahí que el campo se llame *export* y no *delivery*, y de ahí que **una exportación vieja no sea
un error**: exportar y después seguir editando es un flujo de trabajo normal. `staleExports` es
información, no un defecto.

Y una que es de producto, no técnica: **"exportado" no es "emitido para construcción"**.
`issue-submit` y su cadena de bloqueos existen para lo segundo y deben seguir siendo lo único que
lo afirme.

---

## 9. Alcance y dueño

`lib/store/detailing.svelte.ts` lo leen **14 componentes**. Agregar tres miembros de sólo lectura
más un método no rompe a ninguno —nadie los consume todavía— pero es superficie de store, y H1 no
la toca por su cuenta más allá de la corrección de `retireDocument()` que estaba autorizada.

`DocumentsSection.svelte` **no** es compartido: lo montan `ProRcWorkflowTab` y `DetailingWorkflow`,
los dos de hormigón. La parte de UI es de H1 en cuanto el contrato exista.

---

## 10. Orden sugerido

1. El tipo y los tres miembros del store, **sin consumidor**.
2. Las tres llamadas a `recordExport` en `DocumentsSection`, incluida la rama de error.
3. La lista y el aviso de obsolescencia en la etapa.
4. Los tests: necesitan un modelo que supersede un documento **después** de exportar, y
   `rc-design-qa-8` más una edición de geometría ya lo produce, según
   `footing-document-slice.test.ts`.

Y en paralelo, independientes del contrato y baratos:

- leer el `.xlsx` descargado y comprobar hojas y celdas;
- **exportar el DXF y volver a parsearlo con `parseCadDxf`**, que ya está en el árbol;
- capturar el popup del reporte y asertar sobre su DOM;
- forzar el bloqueo de popups y ejercitar el fallback a `.html`.

Los cuatro son tests, no cambios de producción.
