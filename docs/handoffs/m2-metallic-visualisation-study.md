# M2 — visualización estructural metálica: investigación por fases

**Rama:** `feat/pro-steel-m2` · **Estado:** investigación y contratos. **Nada implementado.**

Cinco fases (A–E), precedidas por la auditoría que era precondición. Cada afirmación de acá sale de
leer o medir el código, y donde no pude medir lo digo.

---

# §0 — Auditoría de `connection-design.ts` (precondición)

**307 líneas, JS puro, sin WASM.** Lo que hace, exactamente:

| Exporta | Qué es |
|---|---|
| `BOLT_TABLE` | 4 grados (4.6, 5.6, 8.8, 10.9) con `Ft`, `FvIncl`, `FvExcl`. De CIRSOC 301 Tabla J.3.2 |
| `MIN_FILLET_SIZE` | 4 tramos de espesor → lado mínimo de filete. Tabla J.2.4 |
| `checkBoltGroup` | corte, tracción, aplastamiento e interacción, con φ = 0,75 |
| `checkFilletWeld` | filete con φ = 0,60 |
| `detectJoints` | **topología**: nodos con ≥2 barras, con clasificación metálica inyectada |
| `getJointForces` | los esfuerzos en un nodo |

**Lo que NO hace, y es el hallazgo que gobierna todo lo demás:**

> **No hay geometría de unión en ninguna parte.** Ni chapas, ni posiciones de bulones, ni pasos,
> ni gramiles, ni cordones, ni espesores de material de unión. `plateThickness` entra como
> **escalar** para el aplastamiento y para el límite de tamaño del filete, no como una chapa.

Las únicas coordenadas del módulo son `x, y, z` del **nodo** en `JointInfo` — un punto y una lista
de barras. Eso es conectividad, no detalle.

**Y no hay entidad de unión en el modelo.** `model.connectors` existe pero es otra cosa:
`ConnectorElement` en `types-3d.ts` lleva **sólo rigideces** (`kAxial`, `kShear`, `kMoment`,
`kShearZ`, `kBendY`, `kBendZ`) y su comentario lo dice — «*sliders, bearings, isolators, point
springs, joint flexibility*». Es un primitivo de rigidez para el solver, no una unión abulonada.

**Lo que M1 ya había auditado**, y que conviene no rehacer: cinco huecos declarados en
`conn.gap.*`, cada uno con qué existe / qué falta / alcance / nota. El más relevante acá:

> `conn.gap.boltGeometry` — existe «la capacidad de un bulón multiplicada por la cantidad
> declarada»; falta «**la disposición del grupo: filas, pasos, gramiles y excentricidad de la carga
> respecto del baricentro**». Y la nota: «la capacidad informada es **un techo**».

Los otros cuatro: `baseMetal` (el cordón no se compara contra el Fu de la chapa), `fvExcl` (4.6 y
5.6 sin valor de roscas excluidas), `torsion`, `aluminium`.

**Conclusión de la auditoría:** cubre grupos de bulones y soldaduras **como capacidades a partir de
escalares que el usuario tipea**, en un nodo detectado topológicamente. **No implica geometría
detallada ni verificación normativa completa** — exactamente la sospecha del pedido, confirmada.
Cualquier visualización de uniones parte de que **el dato no existe**, no de que está y falta
dibujarlo.

---

# §1 — M2-A: la visualización macro de secciones

## 1.1 Por qué aparecen esferas gigantes

Medido, no estimado. `three/nodes-instanced.ts:12`:

```ts
const DEFAULT_RADIUS = 0.07;
```

**Radio fijo en metros**, y `Viewport3D.svelte:46` construye `new NodesInstanced()` **sin opciones**,
así que nunca se escala. Diámetro: **140 mm**, siempre, sea el modelo una nave de 40 m o una viga de
2 m.

Contra el catálogo real (99 perfiles):

| | |
|---|---|
| Perfiles **más bajos que la esfera** | **23 de 99 (23 %)** |
| Perfiles donde la esfera pasa el **50 % del canto** | **59 de 99 (60 %)** |
| Perfil mediano (IPE 240) | la esfera es el **58 % del canto** |
| Peor caso: `L 30x30x3` | la esfera es **4,7×** el canto |

**Por eso se nota recién en «Modelo con secciones»:** en wireframe las barras son líneas y una
esfera de 140 mm lee como marcador de nudo; con secciones las barras tienen espesor real y la
esfera **se las come**. Y los peores casos son los ángulos — que son justamente barras de cabriada,
donde los nudos se agolpan.

## 1.2 Qué representan hoy los nodos

Tres cosas a la vez, y conviene separarlas porque no se ocultan igual:

1. **Grados de libertad / conectividad.** Un nodo es donde el solver pone incógnitas.
2. **El blanco de selección.** `NodesInstanced` es un `InstancedMesh` que se raycastea nativo y
   devuelve `instanceId`, resuelto a `nodeId` por `nodeIdAt()`. **Es el único blanco de picking de
   nodos.**
3. **Referencia visual de extremo de barra**, que es lo que un usuario percibe.

## 1.3 ¿Son necesarios para leer la estructura?

**Para leer, no.** Con secciones activadas, el extremo de una barra ya se ve: es donde termina la
extrusión. La esfera no agrega información geométrica — agrega un marcador de que ahí hay un nodo,
que en secciones es redundante salvo cuando hay **más de una barra** llegando y el usuario quiere
ver que **comparten** el nodo (o que no lo comparten, que es un error de modelado real).

**Para operar, sí.** Sin blanco no hay selección de nodo, y de la selección de nodo dependen apoyos,
cargas nodales y aislamiento.

## 1.4 Qué ocurre al ocultarlos

**Se rompe el picking de nodos.** Three.js excluye del raycast los objetos con `visible = false`, así
que ocultar `nodesParent` deja el modelo sin forma de seleccionar un nodo. No es teórico: la
infraestructura de ocultamiento **ya existe** —`viewport3d/lod.ts:77`, `g.nodesParent.visible =
!hideDecor`— pero hoy sólo la usa el **fallback de LOD durante el orbitado de modelos pesados**, o
sea un estado transitorio en el que nadie está clickeando.

Lo que **no** se rompe: apoyos (gizmos propios, `create-support-gizmo.ts`), cargas
(`load-arrows-batched.ts`) y la geometría de barras. Son grupos separados.

## 1.5 Las cuatro alternativas, medidas

| | Alternativa | Rompe picking | Costo | Lectura estructural |
|---|---|:---:|---|---|
| 1 | **Ocultar nodos al activar secciones** | **sí** | nulo (una línea; el grupo ya se togglea) | limpia, pero el usuario pierde selección de nodo justo en el modo donde arma la estructura |
| 2 | **Mostrar sólo al seleccionar** | **sí, en frío** | bajo | paradoja: para seleccionar hay que ver, y para ver hay que seleccionar |
| 3 | **Reducir a gizmo contextual** | no | medio | la esfera se escala al canto de la barra más chica que llega, o se vuelve un marcador de tamaño en pantalla |
| 4 | **Sólo en modo diagnóstico** | **sí** fuera de diagnóstico | bajo | correcto para revisar, inútil para modelar |

**Recomendación: la 3, y no por conservadurismo.** Es la única que no rompe nada y la única que
ataca la causa medida: el problema no es que los nodos existan, es que su **tamaño no tiene relación
con el modelo**. Dos variantes, en orden de preferencia:

- **3a — radio en espacio de pantalla.** Un marcador de N píxeles, constante al zoom. Es lo que el
  resto de la app ya hace para las barras: `Line2`/`LineMaterial` existen precisamente para dar
  ancho en pantalla. Coherente, y elimina la dependencia de la escala del modelo de una vez.
- **3b — radio derivado de la geometría vecina.** `radius = k · min(canto de las barras que llegan)`,
  con un piso. Más simple, pero necesita recalcular al cambiar secciones.

**Lo que hay que verificar antes de tocar nada** (el pedido lo exige y es correcto):

1. **Picking** — que `nodeIdAt()` siga resolviendo con el radio nuevo. Un marcador de 4 px es un
   blanco de 4 px: hay que medir la tasa de acierto, no suponerla.
2. **Aislamiento** — qué hace el modo aislar/ocultar con `nodesParent`.
3. **Accesibilidad** — un marcador chico es peor para motricidad fina. Conviene un radio de
   **picking** mayor que el de **dibujo** (el patrón que `create-element-mesh.ts:242` ya usa: una
   esfera invisible de ayuda al raycast).

**Perfiles simples, compuestos y generadores:** los compuestos (`composition`) se dibujan por
`createSectionShapes` y tienen el mismo problema agravado —dos perfiles con separación son más
anchos pero no más altos—. Los generadores (cabriada, columna reticulada, nave) son el peor caso
porque **concentran nodos**: una cabriada de 10 m tiene decenas de nodos a menos de 1 m entre sí,
cada uno con su esfera de 140 mm. **Es ahí donde hay que medir, no en un pórtico de dos barras.**

---

# §2 — M2-B: uniones macro, inventario honesto

Las siete preguntas del pedido, por elemento. **`—` significa que no existe nada.**

| Elemento | ¿En el modelo? | ¿Sólo cálculo? | ¿Geometría? | ¿Dimensiones? | ¿CIRSOC 301? | Falta para **ver** | Falta para **exportar** |
|---|---|---|---|---|---|---|---|
| **Chapas de unión (nudo/extremo)** | — | — | — | — | J (indirecto: `plateThickness` como escalar) | todo: entidad, contorno, espesor, posición | lo anterior + capas y cotas |
| **Placas de empalme** | — | — | — | — | — | ídem, más el eje del empalme | ídem |
| **Presillas (perfiles combinados)** | — | — | — | — | — | la separación **está implícita** en `composition.gapMm`, sin la presilla que la mantiene | ídem |
| **Unión espalda con espalda** | **parcial**: `composition.arrangement` la nombra | no es cálculo | la sección compuesta **sí** se dibuja | `gapMm` sí | — | los medios de unión entre los dos perfiles | ídem |
| **Uniones abulonadas** | — como objeto | **sí**: `checkBoltGroup` | **no** | sólo `diameter`, `count`, `plateThickness` como escalares | **J3**, con `BOLT_TABLE` de Tabla J.3.2 | disposición: filas, pasos, gramiles — el hueco ya declarado en `conn.gap.boltGeometry` | ídem + normalización de la designación |
| **Soldaduras** | — como objeto | **sí**: `checkFilletWeld` | **no** | lado del filete `a` y espesor de chapa | **J2**, con `MIN_FILLET_SIZE` de Tabla J.2.4 | trazas de cordón: dónde empieza, dónde termina, en qué cara | ídem + simbología de soldadura |
| **Rigidizadores / chapas auxiliares** | — | — | — | — | — | todo | todo |
| **Conexiones viga-columna** | **sólo como nodo**: `detectJoints` | los esfuerzos sí (`getJointForces`) | el punto | — | — | la tipología (ala, alma, con/sin chapa) | ídem |
| **Uniones de cabriada** | sólo como nodo | ídem | el punto | — | — | ídem, y el nudo de cabriada suele ser chapa + varias barras concurrentes | ídem |
| **Uniones de columna reticulada** | sólo como nodo | ídem | el punto | — | — | ídem, más las diagonales/presillas | ídem |
| **Uniones de nave** | sólo como nodo | ídem | el punto | — | — | ídem | ídem |

## 2.1 Lo que sale de la tabla

**Tres niveles, y sólo el primero existe:**

1. **Topología** — `detectJoints` da el punto y qué barras llegan. **Existe y es sólido.**
2. **Capacidad** — dos cálculos, con tablas de CIRSOC 301 J2/J3, a partir de escalares tipeados.
   **Existe, con cinco huecos declarados**, y la capacidad de bulones es explícitamente **un techo**.
3. **Geometría** — **no existe nada.** Ni una chapa, ni un bulón posicionado, ni un cordón.

**El único elemento con geometría real es la sección compuesta espalda-con-espalda**, y sólo porque
`composition` la describe y `built-up-section.ts` la compone. Pero **los medios de unión que la
hacen posible —las presillas— no están**: el modelo declara una separación de `gapMm` sostenida por
nada.

## 2.2 La regla que no se negocia

**No inventar chapas, bulones ni soldaduras.** Donde el modelo no tiene datos, la respuesta es un
estado declarado y no un dibujo plausible. Y el estado correcto **no** es `DEMAND_UNAVAILABLE`: ése
está documentado en `steel-status.ts` como «*the forces are not there — no solve*», con remedio del
usuario. Acá las fuerzas pueden estar; lo que falta es **el dato geométrico**. Hace falta un estado
propio, del tipo `GEOMETRY_UNAVAILABLE`, con el motivo escrito — o reusar `NOT_DESIGNED` con una
razón específica, que es lo que M2 ya hizo para los conformados en frío
(`steel.reason.coldFormedOutOfScope`).

**Decisión pendiente**, y es de integración común porque toca el vocabulario de estados.

---

# §3 — M2-C: contrato del visor de detalle

El pedido dice «similar al visor de armaduras». Leí ese visor —`three/rebar-scene.ts`, 1319
líneas— y el molde es bueno. Estos son los seis patrones que hay que copiar, con la razón:

1. **Una función de construcción que devuelve una escena, no un componente.**
   `build(document, options) → RebarScene` con `group: THREE.Group` más lotes. El visor es
   reemplazable; la escena es testeable sin DOM.
2. **Lotes por familia y color, con mapa de vuelta a la entidad.** `BarRange { barId, firstTri,
   triCount }`. Un draw call por familia y aun así «qué barra toqué» es respondible.
3. **Picking como contrato explícito y separado.** `pickable()`, `barIdAt(mesh, faceIndex)` — y
   `pickableConflicts()` **aparte**, con el motivo escrito: los marcadores son chicos y están
   dentro de la jaula, así que si compitieran por distancia «le sacarían clicks a las barras». Para
   uniones esto es idéntico: un bulón es chico y está dentro de la chapa.
4. **Visibilidad como filtro sobre UNA escena construida, no como reconstrucción** — y usando **los
   mismos predicados** que el panel usa para su tally, porque «una imagen que no coincida con el
   número al lado sería peor que una lenta».
5. **`stats` fijas en la construcción.** «*The whole point is that it does not move.*»
6. **Firma de escena que sigue el contenido, no la identidad de objetos** — hay tests con ese
   nombre exacto para las armaduras.

## 3.1 El contrato propuesto

```ts
/** Todo lo que un detalle de unión necesita para dibujarse. Nada de esto existe hoy. */
export interface JointDetailDocument {
  jointId: number;                   // el nodeId de detectJoints
  members: JointMember[];            // barra, sección, orientación, y su recorte
  plates: DetailPlate[];             // contorno, espesor, material, posición
  bolts: DetailBolt[];               // posición, diámetro, grado, longitud de agarre
  welds: DetailWeld[];               // traza, lado, garganta, electrodo
  stiffeners: DetailPlate[];
  /** Los esfuerzos que el detalle tiene que resistir, y de qué combinación salen. */
  demand: JointDemand | { unavailable: true; reason: string };
  /** Hipótesis declaradas: excentricidad considerada, rigidez supuesta, etc. */
  assumptions: readonly AssumptionNote[];
  /** Qué NO se verificó y por qué. Los cinco `conn.gap.*` entran acá. */
  limitations: readonly LimitationNote[];
  /** Estado del cálculo. Nunca `verified`. */
  state: JointDetailState;
}
```

**La propiedad que hace honesto al contrato:** cada uno de `plates`, `bolts`, `welds`, `stiffeners`
puede estar **vacío**, y vacío **no es cero** — es «no hay dato». El visor tiene que distinguir «esta
unión no lleva rigidizadores» de «no sabemos si lleva», igual que `axesSymmetryOf` distingue
`principal` de `unknown`. Sin eso, un detalle vacío se lee como un detalle simple.

## 3.2 Las tres vistas, y por qué deben ser distintas

| Vista | Qué muestra | Qué NO debe hacer |
|---|---|---|
| **Macro del edificio** | la estructura, y **dónde** hay uniones | no insinuar detalle: un marcador no es una chapa |
| **Detalle de una unión** | geometría exacta, cotas, materiales, estado | no parecer un plano: es un modelo 3D interrogable |
| **Documento exportable** | plano con cortes, cotas, lista de materiales, notas | no ser una captura del visor: es un documento con revisión |

**La confusión a evitar es la del medio hacia abajo:** un visor 3D bonito que se exporta como PNG y
alguien lo usa como plano de taller. La diferencia tiene que ser **estructural**, no de estilo: el
documento lleva **revisión, fecha y estado**, y el visor no.

---

# §4 — M2-D: exportación

**No implementar hasta definir el modelo de datos y el contrato de revisión** — de acuerdo, y hay
motivo técnico además del prudencial: sin `JointDetailDocument` no hay nada que exportar.

**Lo que ya existe y sirve de base:**

| Base | Qué es | Reutilizable para |
|---|---|---|
| `lib/cad/` (13 módulos: `draft.ts`, `draft-build.ts`, `geometry.ts`, `specs.ts`…) | el sistema de láminas existente | planta, elevación, cortes, cotas |
| `engine/reinforcement-svg.ts` (1504 líneas) | el despiece de armaduras en SVG | **el precedente más cercano**: ya resuelve cotas, capas y notas para un detalle |
| `engine/calc-report.ts` (524 líneas) | memoria de cálculo | notas normativas y estado |
| `engine/bar-marks.ts` | marcas y pesos de barras | lista de materiales |
| DXF R12 (`lib/dxf/`) | export CAD | entrega a taller |

**Lo que falta, en orden:** el documento (§3.1) → la proyección (qué cortes, definidos por la
tipología de la unión) → las cotas (qué se cota y desde dónde, que es una convención de taller, no
una decisión de software) → la revisión.

**El contrato de revisión es el que menos se puede improvisar.** Un plano de unión sin revisión es
un plano que alguien va a fabricar mal. Mínimo: identificador, revisión, fecha, autor, estado
(borrador / para revisión / emitido), y **qué cambió respecto de la revisión anterior**.

---

# §5 — M2-E: vista global

El flujo pedido: diseñar → ver todas las uniones en una escena → filtrar por tipo → seleccionar →
abrir detalle → volver → exportar.

**Qué de esto es barato hoy:**

- **«Ver dónde hay uniones»** — `detectJoints` ya las devuelve, ordenadas por cantidad de barras.
  Un marcador por nudo es directo, y **`ProConnectionsTab` ya lista los nudos** con su clasificación
  metálica.
- **«Filtrar por tipo»** — necesita una **tipología**, que no existe. Clasificar un nudo por
  cantidad y orientación de barras (viga-columna, cabriada, base, empalme) es geometría pura y
  **acotado**; clasificarlo por *cómo se resuelve* (con chapa, con angular, soldado) requiere el
  dato que no está.
- **«Volver a la vista global»** — patrón de navegación, barato.

**Qué es caro:**

- **«Seleccionar una unión y abrir su detalle»** — el detalle no existe (§2).
- **«Exportar el detalle»** — §4.

**Mi lectura:** M2-E **no es una fase, es la consecuencia** de B, C y D. Intentarla antes produciría
una vista global de marcadores que al hacer click no muestran nada — peor que no tenerla, porque
promete.

**Lo que sí se puede hacer ya y es útil solo:** los marcadores de nudo en la escena macro, con la
clasificación **geométrica** (cuántas barras, si tiene apoyo, si es metálico), filtrables. Eso no
promete detalle porque no lo insinúa, y le da al usuario algo que hoy sólo puede ver en una tabla.

---

# §6 — Reparto: investigación, contrato, implementación, autoridad

| Fase | Investigación | Contrato | Implementación | Autoridad normativa |
|---|---|---|---|---|
| **A** esferas | ✅ **hecha acá**, con medición | pendiente (radio pantalla vs vecindad) | **acotada, M2** — un archivo (`nodes-instanced.ts`) + verificar picking/aislamiento/accesibilidad | ninguna |
| **B** inventario | ✅ **hecho acá** | falta: entidad de unión + estado `GEOMETRY_UNAVAILABLE` | **M3**: entidad nueva en el store | **sí** para tipologías y para qué se verifica |
| **C** visor de detalle | ✅ molde leído | ✅ **esbozado acá** (§3.1) | **M3** | **sí** |
| **D** exportación | ✅ bases identificadas | pendiente: documento + revisión | **M3 o posterior** | **sí** (simbología, cotas, notas) |
| **E** vista global | ✅ **hecha acá** | depende de B y C | **M3+** | depende |

**Lo único que M2 puede cerrar sin nadie:** la fase **A**, y sólo la variante 3 (gizmo contextual),
porque las otras tres rompen picking.

**Lo que necesita un PR M3:** B, C, D y E. Toca el store (entidad de unión nueva), la geometría, y
el vocabulario de estados. **No lo abro todavía** — el pedido dice documentarlo antes, y esto es esa
documentación.

**Lo que necesita firma humana antes de cualquier línea:** la tipología de uniones, qué se verifica
de cada una, y la simbología del documento. Nada de eso lo puede decidir un agente, y sin eso el
visor de detalle dibujaría una unión que nadie certificó.
