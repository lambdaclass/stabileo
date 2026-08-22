# Contrato necesario para registrar las exportaciones

**Origen:** H1-C (`feat/pro-concrete-h1`, [PR #161](https://github.com/lambdaclass/stabileo/pull/161)).
**Estado: propuesta de contrato. Nada implementado.**
La etapa de Documentos no registra qué se exportó, y agregarlo exige estado nuevo en el store —
que no invento sin una decisión.

---

## 1. El hueco, medido

La etapa muestra readiness, revisión, madurez, el contenido del documento y los reglamentos.
**No muestra ni una sola exportación.** Medido en `e2e/h1c-documents-flow.spec.ts`: después de
descargar `detailing-rev1.xlsx` el panel se actualiza con la revisión, y no queda rastro de que
ese archivo se haya emitido.

Búsqueda en el store: no hay `lastExport`, `exports`, `exportRecord` ni equivalente.
`exportReport`, `exportDxf` y `exportXlsx` son funciones del componente que llaman a
`currentDoc()` y escriben un blob. No informan a nadie.

**Consecuencia práctica:** un usuario que exportó el DXF hace diez minutos, cambió una zapata y
volvió a Documentos no tiene forma de saber que el DXF que tiene en su carpeta ya no corresponde
a la revisión actual. El modelo de documento **sí** sabe que hubo supersesión —`supersededBy`,
`supersededDocuments`— pero nadie relaciona eso con los archivos que salieron.

---

## 2. El contrato mínimo

```ts
/** Una emisión de archivo, tal como ocurrió. */
export interface ExportRecord {
  /** Qué se emitió. Cerrado a propósito: si aparece un cuarto, es una decisión. */
  kind: 'report' | 'dxf' | 'xlsx';
  /** La revisión del documento del que salió. La clave de toda la utilidad de esto. */
  revision: number;
  /** La serie, para que un proyecto con varios documentos no mezcle revisiones. */
  seriesId: string;
  /**
   * ISO-8601. Provisto por el LLAMADOR, nunca leído del reloj por el store — es la regla que
   * `detailing.svelte.ts` ya sigue: "The store never reads the clock itself; the timestamp comes
   * from the action."
   */
  at: string;
  /** Nombre sugerido del archivo, tal como se ofreció al navegador. */
  filename: string;
  /** `null` si salió bien; el mensaje ya traducido si no. */
  error: string | null;
}
```

### Superficie del store

```ts
/** Registrar una emisión. Devuelve el registro escrito. */
recordExport(r: Omit<ExportRecord, 'seriesId'>): ExportRecord | null;

/** Emisiones de la serie actual, más reciente primero. */
get exports(): readonly ExportRecord[];

/** Emisiones que ya no corresponden a la revisión vigente. */
get staleExports(): readonly ExportRecord[];
```

`recordExport` devuelve `null` si no hay documento — mismo patrón que `buildDocument`, y evita
que un registro exista sin serie a la que pertenecer.

`staleExports` es la razón de ser de todo esto: `exports.filter(e => e.revision !== document?.revision.number)`.
Es lo que permite decir *"el DXF que descargaste es de la revisión 1; el documento vigente es la
3"*.

---

## 3. Los cuatro puntos pedidos, resueltos

| Pedido | Cómo |
|---|---|
| exportación realizada | `recordExport` llamado desde las tres funciones de `DocumentsSection`, después de que el blob se escribió |
| tipo de archivo | `kind`, cerrado a tres valores |
| revisión | `revision` + `seriesId`, tomados del `DocumentModel` que la exportación usó |
| timestamp | `at`, provisto por el llamador (regla existente del store) |
| error | `error: string \| null`. **Registrar también los fallos**: un export que falló es exactamente lo que el usuario no recuerda |

### Compatibilidad con documentos existentes

Éste es el punto que decide si el contrato es barato o caro.

`ExportRecord` es **estado nuevo y separado**, no un campo de `DocumentModel`. Eso importa porque:

- `DocumentModel` se serializa dentro del modelo y lo leen el renderer del reporte, el DXF y el
  XLSX. Agregarle un campo obliga a versionar el modelo y a decidir qué hace un `.ded` viejo al
  abrirse.
- Un registro de exportaciones **no pertenece al documento**: pertenece al proyecto. El mismo
  documento puede emitirse tres veces y seguir siendo el mismo documento.
- `supersede()` mueve documentos a `supersededDocs` sin tocar los registros, así que un registro
  puede sobrevivir a su documento — que es precisamente lo que hace útil a `staleExports`.

**Migración:** ninguna. Un proyecto guardado sin `exports` se lee con la lista vacía, y una lista
vacía significa "no sabemos qué se exportó", que es la verdad para todo proyecto anterior a esto.
**No inventar un registro retroactivo** a partir de la existencia de un documento: que exista un
documento no prueba que se haya exportado.

**Persistencia:** decisión abierta. Si va al `.ded` hay que versionar; si vive sólo en memoria, se
pierde al recargar y el aviso de obsolescencia desaparece justo cuando más sirve. Mi recomendación
es persistir, con el campo opcional y ausencia = lista vacía, lo que evita el bump de versión.

---

## 4. Lo que la UI podría decir, y lo que no

Con el contrato puesto, la etapa puede mostrar:

- **qué se emitió y de qué revisión** — una línea por registro;
- **cuáles quedaron viejos** — `staleExports`, con la revisión que tienen contra la vigente;
- **los fallos**, que hoy desaparecen apenas se cierra el diálogo.

Lo que **no** debe hacer, y conviene dejarlo escrito antes de que alguien lo pida:

- **no** afirmar que el archivo sigue existiendo en el disco del usuario — el navegador no lo
  sabe;
- **no** inferir "documento entregado" de "documento exportado". Emitir un archivo no es emitir
  para construcción; `issue-submit` y su cadena de bloqueos son otra cosa y deben seguir siéndolo;
- **no** convertir `staleExports` en un estado de error. Es información, no un defecto: exportar
  y después seguir editando es un flujo de trabajo normal.

---

## 5. Alcance y dueño

`lib/store/detailing.svelte.ts` lo leen **14 componentes**. Agregar tres miembros de sólo lectura
más un método no rompe a ninguno —nadie los consume todavía—, pero es superficie de store y no la
toco por mi cuenta más allá de la corrección de `retireDocument()` que estaba autorizada.

`DocumentsSection.svelte` es de hormigón (lo montan `ProRcWorkflowTab` y `DetailingWorkflow`), así
que la parte de UI es de H1 en cuanto el contrato exista.

**Orden sugerido:** (1) el tipo y los tres miembros del store, sin consumidor; (2) las tres
llamadas a `recordExport` en `DocumentsSection`; (3) la lista y el aviso de obsolescencia; (4) los
tests, que necesitan un modelo que supersede un documento después de exportar — `rc-design-qa-8`
más una edición de geometría ya lo produce, según `footing-document-slice.test.ts`.
