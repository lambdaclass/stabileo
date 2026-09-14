# H1 — QA manual en `http://127.0.0.1:4003`

**Rama:** `feat/pro-concrete-h1` · **PR:** [#161](https://github.com/lambdaclass/stabileo/pull/161) (draft)
**Estado: detenida y lista para QA.** Sin trabajo de producto en curso.

Automatizado ya: **683 tests E2E en 61 archivos** y **7029 unitarios**. Lo que sigue es lo que un
navegador automatizado **no** puede juzgar — que la pantalla se lea bien, que el orden tenga
sentido, y que un ingeniero entienda qué le están diciendo.

---

## 0. Antes de empezar

```
http://127.0.0.1:4003
```

Probá en **1280×720** y en **1024×700**, y en **es / en / pt**. Son los tres idiomas ofrecidos; los
otros once diccionarios están incompletos a propósito y **no** son parte de este QA.

Modelos que uso abajo, por lo que producen:

| modelo | qué tiene |
|---|---|
| `rc-design-qa-8` | 8 miembros, todo verifica. El caso limpio. |
| `rc-qa-diagnostic` | **68 conflictos**, 5 provisorios, y levanta los banners de provisional y torsión. |
| `pro-edificio-7p` | 7 pisos, **1310 marcadores** de conflicto, 6 fallados. Tarda ~20 s en detallar. |

---

## 1. Diseño de armaduras — el panel derecho

**Recorrido:** cargar `rc-design-qa-8` → resolver → *Diseño* → *Diseñar todo*.

Mirá:

- **La franja de etapas.** Envuelve en dos filas y la última etapa queda sola abajo. **Es un
  defecto conocido y no es de H1** — `WorkflowStages` es cromática compartida con la rama
  metálica, y el arreglo está propuesto en `h1-shared-chrome-proposal.md`. **No lo reportes de
  nuevo.**
- **Las familias de pisos.** Antes de correr la pasada de pisos, cada pestaña debe mostrar un
  **guion**, no un cero. Un cero ahí diría "tu edificio no tiene losas", que es una afirmación
  sobre el edificio y era una afirmación sobre el botón.
- **El bloque de estado** debajo: tiene que decir **por qué** no hay dato y **qué hacer**. Si
  alguna de las dos frases falta o suena a relleno, reportalo.
- **Contraste.** Toda la copia secundaria debería leerse sin esfuerzo. Si algo se te pierde,
  anotá el texto exacto: puede ser uno de los 462 sitios de `--st-text-3` que quedaron fuera del
  alcance de H1 (`h1-text-3-contrast-proposal.md`).

---

## 2. Detallado

**Recorrido:** abrir el disclosure *Detallado* → *Generar detallado coordinado*.

- **La vista previa del plano** vive acá, no en Documentos. Es un hallazgo abierto: quien está en
  Documentos decidiendo si exportar **no tiene el plano a la vista**. Está en
  `h1c-documents-audit.md` §8 y es una decisión de flujo, no un bug.
- El grupo *Hoja* debería verse como los demás grupos de controles del panel, no como un
  `<fieldset>` nativo.

---

## 3. Documentos

**Recorrido:** *Documentos*.

- Antes de exportar dice **"aún no hay documento"** y **los tres exports están habilitados**. Eso
  es deliberado: **la primera exportación es la que construye el documento**. Si te parece
  confuso, ese juicio es exactamente lo que este QA busca — reportalo como claridad, no como bug.
- Después de exportar el XLSX: se descarga `detailing-rev1.xlsx`, y el panel debe mostrar
  revisión, madurez, **conjuntos, certificados, cláusulas** y los **reglamentos con su edición**.
- **Abrí el XLSX.** Ningún test lo hace: se verifica lo que entra, no lo que sale. Mirá nombres de
  solapa y un puñado de celdas.
- **Abrí el DXF en un CAD.** Tampoco lo verifica nadie. Debería ser R12 y las barras polilíneas.
- **El reporte abre una ventana** y manda a imprimir. No hay PDF que inspeccionar; mirá la ventana.
- **Registrar revisión** está deshabilitado hasta que pongas tu nombre y aceptes los cálculos
  provisorios, **y los motivos están escritos al lado**. Si el botón está gris sin explicación,
  eso sí es un bug.
- La lista de **superseded** conserva las revisiones retiradas, nombradas. No las borra.

Lo que **no** vas a encontrar y no es un olvido: **qué se exportó y cuándo**. El store no lo
registra y agregarlo necesita un contrato — `h1-export-coverage-and-contract.md`.

---

## 4. Visor 3-D

**Recorrido:** *Documentos* → *Ver en 3D*. Usá `rc-qa-diagnostic` para tener conflictos.

- **La tipografía.** El visor debe verse en la misma fuente que el resto de la app. Si te parece
  que "cambia de programa" al abrirlo, reportalo con captura — eso era el defecto y debería estar
  cerrado.
- **Las cifras** del rail deberían tener ancho fijo: no tienen que bailar al cambiar un filtro.
- **Capas y familias.** Apagá barras, hormigón, conflictos. Cada una debe cambiar el dibujo.
- Las **familias vacías** se nombran en vez de desaparecer.
- **Clickeá un marcador de conflicto** (una esfera chica dentro de la jaula). Debe abrir el
  inspector con las dos barras nombradas por separado, la separación medida contra la requerida, y
  botones de centrar y aislar.
- **Aislar y limpiar**: el foco no debe saltar al principio del documento. Probalo **con teclado**.
- **Corte por sección**: elegí un eje, movelo. El deslizador recorre el modelo, no un 0..1.
- **A 1024 px o menos** aparece el botón ☰: colapsa el rail y lo devuelve. A 1280 **no existe**, y
  eso es deliberado.
- **`Escape`** cierra y te devuelve al botón que abriste. **`Escape` no cierra una sección
  desplegable** del panel — es lo estándar para un `<details>` y no es un bug.

---

## 5. Estados que hay que provocar

Con `rc-qa-diagnostic`:

- **Provisorio** — banner violeta arriba del visor. El violeta es el mismo que la escena pinta;
  si ves dos violetas distintos para el mismo estado, reportalo.
- **Conflictos** — 68 marcadores, y el documento cae a *borrador de revisión* diciendo cuántos.

Con `pro-edificio-7p`:

- **Fallado** — 6 miembros en rojo, con la palabra al lado. Paciencia: ~20 s de detallado.

**Rechazado** no lo produce ningún modelo del árbol. Se alcanza sólo desde un test. Si en tu QA
aparece un miembro *Rechazado*, **es información nueva y vale reportarla**.

---

## 6. Lo que NO hay que reportar

Son decisiones tomadas y documentadas. Reportarlas otra vez cuesta tiempo a todos:

| | por qué |
|---|---|
| el chevron colgado de la franja de etapas | archivo compartido con la rama metálica; propuesta escrita |
| `Escape` no cierra un `<details>` | comportamiento estándar; el overlay cierra porque **es** modal |
| los exports habilitados sin documento | la primera exportación es la que lo construye |
| el rail sin botón ☰ a 1280 | el rail no se colapsa en escritorio, a propósito |
| que Documentos no muestre el plano | está en Detallado; mover una vista previa es cambio de flujo |
| que no diga qué se exportó | necesita un contrato de store, no está inventado |
| textos en inglés en idiomas **no** ofrecidos | los otros once diccionarios están incompletos a propósito |

---

## 6 bis. Dos cosas que cambiaron al integrar la base (2026-08-26)

`feat/pro-steel-family` avanzó 44 commits mientras H1 estaba cerrada, y el merge trajo dos
cambios **visibles** que la guía escrita antes no describe. No son defectos: mirálos y confirmá
que se comportan así.

| qué | antes en H1 | ahora | por qué |
|---|---|---|---|
| la barra de progreso de una corrida | invisible — `background: none` | se llena con el color de acción de la app | la base restauró un relleno que la base común había dejado vacío. Al lado sigue el contador en texto: el porcentaje **no** se lee del color |
| el chip de propuestas en el resumen de diseño | tono ámbar, igual que una advertencia | tono violeta propio | una propuesta no es algo que salió mal. Es el mismo violeta que el visor 3-D le pone al acero provisional y que el badge de `OutcomeBadge` ya usaba |

Lo que **sí** hay que reportar de estos dos: que el violeta del chip y el del visor 3-D se vean
distintos entre sí. Están atados por un test que compara el color resuelto, así que si a ojo no
coinciden, hay algo real que mirar.

---

## 7. Lo que ningún test cubre — mirá acá primero

Por orden de probabilidad de encontrar algo:

1. **El contenido del XLSX y del DXF.** Verificados por nombre de archivo, nunca abiertos.
2. **El HTML del reporte.** Se verifica que la ventana abre, no lo que dice.
3. **El fallback a `.html`** cuando el navegador bloquea el popup. Nunca corrió.
4. **`pt` en superficies fuera de hormigón** — 1172 claves faltantes, sobre todo `landing.` y
   `cad.` (`i18n-coverage-gap.md`).
5. **Contenido largo real**: nombres de miembro de 60+ caracteres, muchos pisos, muchas familias.
6. **El visor con el edificio de 7 pisos** durante un rato: órbita, zoom, filtros encadenados.

---

## 8. Cómo reportar

Para que sirva, cada reporte necesita: **modelo**, **ancho**, **idioma**, **la ruta de clicks**, y
**el texto exacto** de lo que se lee mal. Una captura sin el ancho no se puede reproducir.

Y una distinción que este QA sí puede hacer y los tests no: **"entra en pantalla" no es "se
entiende"**. La etapa de Documentos encaja perfecto en los seis casos medidos y sigue sin decirte
qué exportaste. Ese tipo de hallazgo es el más valioso acá.
