# `SectionShapeBuilder.svelte` — dónde está, qué duplica, qué decisión falta

**Rama:** `feat/pro-steel-m1` · **Estado:** documentado, **no** borrado y **no** montado.

No es una limpieza. Es un componente completo de 500 líneas que nadie importa, con claves de
traducción vivas en catorce idiomas, y **dos capacidades que no existen en ningún otro lado**. Por
eso la decisión es de producto y no de mantenimiento, y por eso queda acá en vez de en un `git rm`.

---

## 1. Dónde está

| | |
|---|---|
| **Archivo** | `web/src/components/SectionShapeBuilder.svelte`, 500 líneas |
| **Contrato** | `{ open: boolean; onselect: (name: string, props: SectionProperties) => void; onclose: () => void }` — un diálogo que devuelve una sección y no escribe en el store |
| **Importadores en código** | **ninguno.** Ni estático ni dinámico: la única mención fuera de los diccionarios es un comentario en `lib/utils/section-drawing.ts:2` («Extracted from SectionStressPanel to be reusable in SectionShapeBuilder preview») |
| **Último commit que lo tocó** | `d65cd01b`, 12-ago-2026, 53 inserciones / 51 borrados |

El detalle que importa de `d65cd01b`: ese commit lo editó **como si estuviera vivo**. El mensaje
dice «*Both dialogs are now free of hard-coded colour*» y toca `SectionChanger.svelte` y
`SectionShapeBuilder.svelte` en la misma pasada. Es decir, se le sacó el color duro, se lo migró de
la taxonomía Acero/Hormigón a Delgado/Macizo —usa `THIN_SHAPES`/`SOLID_SHAPES` y
`MaterialCategory`— y nadie notó que no está montado. **No quedó colgado por olvido de una
refactorización: sobrevivió a una refactorización que lo trató como pantalla activa.**

No hay evidencia de que haya estado montado nunca: `git log -S SectionShapeBuilder` sobre los
`.svelte` no devuelve ningún commit que agregue o quite un import.

---

## 2. Qué duplica, y qué no

Comparado contra los dos caminos que **sí** están montados —`SectionChanger.svelte` (Basic) y
`components/pro/ProSectionsTab.svelte` (PRO):

### Duplicado (los tres hacen lo mismo, desde la misma fuente)

- **Las plantillas y el cálculo.** Los tres importan `SECTION_SHAPES`, `THIN_SHAPES`/`SOLID_SHAPES`,
  `computeSectionProperties` y `generateSectionName` de `lib/data/section-shapes.ts`. No hay
  catálogo paralelo ni segunda fórmula: la duplicación es de **interfaz**, no de ingeniería.
- **El dibujo del contorno.** `crossSectionPath` de `lib/utils/section-drawing.ts` lo consumen los
  tres, más `stress/CrossSectionDrawing.svelte` y `lib/section/outline.ts`. La previsualización no
  es exclusiva del huérfano.

### **No** duplicado — sólo existe acá

1. **El selector de unidades m ↔ cm.** `displayUnit` con factores para longitud, área e inercia
   (`cm²`, `cm⁴`). `grep -c displayUnit` da **0** en `ProSectionsTab.svelte` y **0** en
   `SectionChanger.svelte`. Los dos caminos vivos piden metros y nada más. No es cosmético para
   este dominio: las tablas IRAM-IAS, CIRSOC y ASTM publican en mm y cm, y un usuario que tiene un
   ala de 9 mm delante tiene que tipear `0.009` sin ninguna confirmación de que acertó los ceros.
2. **La explicación de por qué la distinción delgado/macizo importa.** `shapeBuilder.thinHelp` y
   `shapeBuilder.solidHelp` se usan **sólo** acá. Es exactamente el argumento que `d65cd01b` dio
   para reemplazar Acero/Hormigón por Delgado/Macizo —«*thin walls buckle locally, carry shear as a
   flow and twist by Saint-Venant or Bredt; solid ones do none of that*»— y el texto que lo dice
   está en la pantalla que no se puede abrir.

---

## 3. Lo que cuesta tenerlo así

- **Once claves en catorce idiomas.** Los diccionarios traen un bloque rotulado
  `─── SectionShapeBuilder.svelte ───` en `es, en, pt, de, fr, it, ru, zh, ja, ko, ar, hi, id, tr`.
- **Y son obligatorias.** `basic-mode-coverage.test.ts` recorre el árbol de fuentes
  (`SKIP_DIRS = ['__tests__','locales','pro','edu']`, así que `components/` entra), junta cada
  `t('...')` literal y exige que es/en/pt respondan. El huérfano está dentro de ese barrido: **sus
  claves son requeridas por un test porque el archivo existe, no porque alguien las vea.**
- **Dos ya están muertas.** `shapeBuilder.steel` y `shapeBuilder.concrete` no las usa **nadie** —
  ni el huérfano, que ya migró a delgado/macizo. Son restos de la taxonomía que `d65cd01b`
  abandonó, traducidos a catorce idiomas. De las once claves del bloque, tres
  (`thin`, `solid`, `invalidDimensions`) las comparten los diálogos montados y sobreviven a
  cualquier decisión; seis son exclusivas y vivas dentro del huérfano; dos son basura hoy.

---

## 4. La decisión de producto que hace falta

No es «borrar o no borrar». Es: **¿el constructor de secciones lleva selector de unidades y texto
que explique la distinción delgado/macizo?**

- **Si la respuesta es sí** → no se borra: se porta el `displayUnit` y los dos textos de ayuda a
  `SectionChanger` y `ProSectionsTab`, y **después** se borra el huérfano. El trabajo real es el
  port; el `git rm` es la última línea.
- **Si la respuesta es no** → se borra el componente y las ocho claves exclusivas de los catorce
  diccionarios, se conservan las tres compartidas, y queda anotado que la app pide metros siempre.
- **Si la respuesta es «montarlo»** → hay que decir desde dónde se abre y en qué modo, y ahí choca
  con `StageSection` y el workflow común, que **son de H1**. Deja de ser acotado.

Las dos claves muertas (`shapeBuilder.steel`, `shapeBuilder.concrete`) se pueden borrar en
cualquiera de los tres caminos: no dependen de la decisión.

**Recomendación:** la primera. El selector de unidades es la capacidad más barata de portar y la
que más se nota, y hay una razón de dominio para ella —los perfiles conformados en frío que M2 va a
cargar se publican en mm— así que conviene decidirla antes de M2 y no después.

**Qué NO hacer ahora, y por qué:** montarlo. Un tercer diálogo de secciones alcanzable duplicaría
la interfaz en vez de consolidarla, y tocaría el andamiaje compartido en paralelo con H1.

---

## 4 bis. Las once claves, una por una

Para que la decisión del §4 se pueda ejecutar sin volver a averiguar esto:

| Clave | Usada por | Qué pasa en cada camino |
|---|---|---|
| `shapeBuilder.thin` | huérfano **+ los dos diálogos montados** | **se queda**, decida lo que se decida |
| `shapeBuilder.solid` | huérfano **+ los dos montados** | **se queda** |
| `shapeBuilder.invalidDimensions` | huérfano **+ los dos montados** | **se queda** |
| `shapeBuilder.thinHelp` | sólo el huérfano | **se porta** si la respuesta es «sí»; se borra si es «no» |
| `shapeBuilder.solidHelp` | sólo el huérfano | idem |
| `shapeBuilder.units` | sólo el huérfano | idem (es la del selector m↔cm) |
| `shapeBuilder.title` | sólo el huérfano | se borra salvo que se monte |
| `shapeBuilder.name` | sólo el huérfano | idem |
| `shapeBuilder.applySection` | sólo el huérfano | idem |
| `shapeBuilder.steel` | **nadie** | **se borra ya**, no depende de la decisión |
| `shapeBuilder.concrete` | **nadie** | **se borra ya** |

Multiplicado por los catorce diccionarios que traen el bloque
(`es en pt de fr it ru zh ja ko ar hi id tr`): tres claves que sobreviven siempre, seis en juego, y
**veintiocho entradas que hoy no las lee nadie** (las dos muertas × catorce).

Las dos muertas son restos de la taxonomía Acero/Hormigón que `d65cd01b` reemplazó por
Delgado/Macizo: el huérfano ya migró y dejó las claves atrás.

## 5. Estado

- **No se borró** y **no se montó**, según lo pedido.
- **No se tocó** el archivo en esta rama. Lo único que se editó del entorno de secciones fue
  `ProSectionsTab.handleShapeConfirm()`, en el commit del contrato `built` (`ae3a6186`), que es un
  camino montado y distinto.
- Queda como decisión posterior. Nada de M1 depende de ella.
