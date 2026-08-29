# Inventario de terminología metálica — decisiones pendientes antes de traducir

**Desde:** `feat/pro-steel-m1@135e3a3d`. **Ningún texto publicado.**
**Para qué sirve:** las 96 claves prioritarias del namespace metálico (advertencias, hipótesis y
estados — ver `m1-steel-i18n-audit.md` §3) contienen once términos cuya traducción **es una
decisión y no una búsqueda**. Este documento las enumera con alternativas y con el criterio que
haría falta para elegir, para que el día que se ofrezca un cuarto idioma la traducción sea trabajo
mecánico.

**Nada de esto se decide desde M1.** Cada entrada necesita un ingeniero que valide contra la
literatura del idioma de destino.

---

## Cómo leer una entrada

| Campo | Qué es |
|---|---|
| **Dónde aparece** | La clave o familia de claves que lo usa |
| **Por qué importa** | Qué se malinterpreta si se elige mal |
| **Alternativas** | Las opciones reales, con quién las usa |
| **Criterio** | Qué habría que verificar para decidir |

Los idiomas de referencia son `de` / `fr` / `it`, que son los candidatos más plausibles a un cuarto
ofrecido y donde existe literatura estructural comparable. Para `ja`, `ko`, `zh`, `ru`, `ar`, `hi`,
`tr` e `id` no propongo alternativas: no tengo base para hacerlo y proponerlas sería inventar.

---

## 1. Módulo resistente elástico (`Wy`, `Wz`)

- **Dónde aparece:** `steel.props.label.wy`, `.wz`, y las notas
  `steel.props.note.minimumModulus` y `steel.props.unavailable.centroidUnknown`.
- **Por qué importa:** es la propiedad que M1 deriva y refusa según la simetría. La nota explica
  que se muestra el **mínimo** de dos; si el término elegido ya significa «módulo mínimo» en el
  idioma de destino, la nota es redundante, y si significa el elástico genérico, es imprescindible.
- **Alternativas:**
  - `de` — **Widerstandsmoment** es unívoco y estándar (DIN/EN). Sin ambigüedad real.
  - `fr` — **module de flexion** frente a **module d'inertie** frente a **module de résistance**.
    Los tres circulan; EN 1993 en francés usa *module de flexion* para `W`, pero la literatura
    francesa antigua usa *module d'inertie* para lo mismo, y *module de résistance* aparece en
    textos belgas y canadienses. **Ésta es la decisión más consecuente de la lista.**
  - `it` — **modulo di resistenza** es el estándar (CNR/NTC).
- **Criterio:** qué usa la versión oficial del Eurocódigo 3 en ese idioma, no qué usa el manual más
  común.

## 2. Radio de giro (`ry`, `rz`)

- **Dónde aparece:** `steel.props.label.ry`, `.rz`, `steel.props.unavailable.noArea`.
- **Por qué importa:** poco margen de error, pero el símbolo cambia según la fuente (`i` en la
  tradición europea, `r` en la americana) y la etiqueta lleva el símbolo pegado al nombre.
- **Alternativas:**
  - `de` — **Trägheitsradius**, símbolo `i`.
  - `fr` — **rayon de giration**, símbolo `i`.
  - `it` — **raggio d'inerzia** o **raggio di girazione**; el primero es más frecuente.
- **Criterio:** decidir de una vez si el **símbolo** se traduce junto con el nombre. Hoy el
  catálogo usa `r` (americano) porque las tablas IRAM lo usan. Cambiarlo por idioma haría que el
  mismo perfil se lea `r` en una pantalla e `i` en otra.
  **Recomendación de M1: no traducir símbolos.** Es la misma regla que ya se aplica a las
  designaciones de norma.

## 3. Radio de acuerdo (`r`)

- **Dónde aparece:** `steel.props.label.rootRadius` y **las cuatro** razones de su ausencia
  (`rootRadiusByRule`, `rootRadiusSharp`, `rootRadiusNotPublished`, `note.rootRadiusInverted`).
- **Por qué importa:** cuatro textos distintos que explican por qué un radio no está. Si el término
  es ambiguo, las cuatro razones se vuelven indistinguibles.
- **Alternativas:**
  - `de` — **Ausrundungsradius** (el del acuerdo alma-ala) frente a **Kehlradius**. El primero es
    el de las tablas de perfiles.
  - `fr` — **rayon de congé** frente a **rayon de raccordement**. El primero es el habitual en
    tablas de perfiles laminados.
  - `it` — **raggio di raccordo**.
- **Criterio:** que el término elegido sea el que usa la tabla dimensional del idioma, porque el
  texto dice explícitamente si la norma lo tabula o no.

## 4. «Contorno canónico» y «geometry-backed»

- **Dónde aparece:** `steel.props.basis.derivedFromGeometry` y su `title`,
  `steel.props.basis.title.derivedFromTable`.
- **Por qué importa:** es la distinción entre un número derivado del contorno verificado y uno
  derivado sólo de la tabla. Es **vocabulario propio de esta app**, no un término de la norma.
- **Alternativas:** traducirlo literalmente, o acuñar un término y documentarlo en el idioma de
  destino como se documentó en español.
- **Criterio:** decidir si es vocabulario de producto (se traduce libremente y se explica) o
  jerga técnica (se deja en inglés). **Recomendación de M1: producto**, y explicarlo en el tooltip,
  que es lo que ya hace en los tres idiomas.

## 5. Los cuatro estados metálicos

- **Dónde aparece:** `steel.status.NOT_DESIGNED`, `EXPERIMENTAL`, `DEMAND_UNAVAILABLE`,
  `NOT_APPLICABLE`, más sus `.desc`.
- **Por qué importa:** es el conjunto que **no puede** contener nada que se lea como aprobación, y
  la distinción entre «nadie lo intentó» y «se calculó algo sin autoridad detrás» es la que sostiene
  toda la superficie.
- **Alternativas:** el riesgo no es la palabra, es el **registro**. En alemán *nicht bemessen* es
  neutro; *nicht nachgewiesen* suena a «no verificado», que es más fuerte y podría leerse como un
  rechazo. En francés *non dimensionné* frente a *non vérifié*: lo mismo.
- **Criterio:** el identificador (`NOT_DESIGNED`) **no** se traduce nunca — es la clave y el valor
  de la unión de tipos. Se traduce la etiqueta. Y la etiqueta elegida tiene que pasar la regla de
  `steel-never-verified`: ninguna palabra de aprobación fuera de una negación, en ese idioma.
  **Ésa regla necesita las listas de palabras del idioma nuevo**, y hoy sólo tiene es/en/pt.

## 6. «Experimental»

- **Dónde aparece:** `steel.status.EXPERIMENTAL`, `steel.panel.experimentalBanner`,
  `conn.experimentalBanner`, `conn.experimentalCalc`, `regulations.problem.experimentalAdapter`.
- **Por qué importa:** es la palabra que sostiene el compromiso entero. Tiene que decir «hay un
  número y no hay autoridad detrás», no «está en pruebas» ni «es una versión beta».
- **Alternativas:** `de` *experimentell* / *nicht abgesichert*; `fr` *expérimental* / *non
  validé*; `it` *sperimentale* / *non validato*. Las segundas son más precisas y más duras.
- **Criterio:** que no se pueda leer como «funciona pero es nuevo». **Es el término más importante
  de la lista** y el que menos margen tiene.

## 7. «Procedencia» / «norma de producto» frente a «código de diseño»

- **Dónde aparece:** todo el selector de grados —
  `steel.grades.basis.productStandard`, `.designCode`, `steel.grades.bandsBy`, `.regions` — y el
  encabezado de grupo del selector de perfiles.
- **Por qué importa:** es **la** distinción que sostiene `structural-grades.ts`: lo que certifica
  la acería frente a lo que aplica el ingeniero. Un idioma que use la misma palabra para las dos
  cosas destruye la distinción en pantalla.
- **Alternativas:**
  - `de` — **Werkstoffnorm** / **Produktnorm** frente a **Bemessungsnorm**. Distinción clara.
  - `fr` — **norme produit** frente a **norme de calcul** o **code de calcul**. Clara.
  - `it` — **norma di prodotto** frente a **norma di calcolo**. Clara.
- **Criterio:** ninguno especial; es el término mejor resuelto de la lista en los tres idiomas de
  referencia. Se documenta porque en otros idiomas puede no serlo.

## 8. «Combinación inusual» (perfil / grado)

- **Dónde aparece:** `steel.grades.pairing.unusual`, `.ordinary`, `.notRecorded`.
- **Por qué importa:** el texto dice que es **costo y plazo, no corrección**. Un término que suene
  a error convierte una nota comercial en una advertencia técnica.
- **Alternativas:** `de` *unüblich* frente a *unzulässig* — la segunda significa «no admisible» y
  sería falsa. `fr` *inhabituel* frente a *non conforme*: lo mismo. `it` *inusuale* frente a *non
  conforme*.
- **Criterio:** que la palabra no exista en el vocabulario normativo del idioma como «no
  admisible». Es una trampa fácil.

## 9. Los tres arriostramientos

- **Dónde aparece:** `generator.ui.wallBracing`, `.roofBracing`, `.trussBracing`,
  `generator.bracingBays.*`, y las tres hipótesis
  `generator.assume.*Bracing*`.
- **Por qué importa:** M1 los distingue por lo que **restringen**, y el aviso de camino incompleto
  nombra los tres en orden. Si dos comparten nombre en el idioma de destino, el aviso deja de
  poder explicar la diferencia.
- **Alternativas:**
  - `de` — **Wandverband** / **Dachverband** / **Vertikalverband** (o *Binderverband* para el que
    va entre cerchas). Distinción disponible.
  - `fr` — **palée de stabilité** (fachada) / **poutre au vent** (cubierta) / **contreventement
    vertical entre fermes**. El de cubierta es el que menos margen tiene: *poutre au vent* es
    específicamente la viga de contraviento, que es exactamente lo que es.
  - `it` — **controvento di parete** / **controvento di falda** / **controvento verticale tra
    capriate**.
- **Criterio:** que los tres queden distinguibles **en el mismo aviso**, leídos uno detrás del otro.

## 10. «Correa» (purlin)

- **Dónde aparece:** `generator.role.purlin`, `generator.ui.purlins`,
  `generator.assume.purlinsRolledToPitch`, `generator.assume.roofWithoutPurlins`,
  `generator.notice.roofWithoutPurlins`.
- **Por qué importa:** la hipótesis del rolado y el aviso de mecanismo dependen de que se entienda
  qué miembro es.
- **Alternativas:** `de` **Pfette**; `fr` **panne**; `it` **arcareccio**. Los tres unívocos.
- **Criterio:** ninguno; se documenta por completitud, porque aparece en cinco textos de riesgo.

## 11. «Cabezal de columna reticulada» y la continuidad de momento

- **Dónde aparece:** `generator.assume.columnCapSharesReaction`,
  `generator.assume.latticeBasesPinnedNoOutOfPlane`.
- **Por qué importa:** son las dos hipótesis más delicadas del generador — una declara una
  idealización de unión rígida, la otra declara la ausencia de arriostramiento. Viajan con el
  modelo a informes.
- **Alternativas:** el problema no es «cabezal» (`de` *Kopfplatte*, `fr` *platine de tête*, `it`
  *piastra di testa*) sino **«continuidad de momento»** frente a «empotramiento». El texto español
  dice *continuidad de momento*, que es más preciso que *empotrado* y es deliberado: la placa
  transmite momento, no está empotrada contra un apoyo.
- **Criterio:** que el término elegido no se lea como «apoyo empotrado», porque eso es una
  afirmación sobre la fundación y no sobre la unión. Es la distinción que el §2 del handoff del
  cabezal defiende explícitamente.

---

## Resumen de lo que hay que decidir

| # | Término | Riesgo si se elige mal | Margen |
|---|---|---|---|
| 6 | «Experimental» | Se lee como «beta» y el compromiso entero se cae | **ninguno** |
| 1 | Módulo resistente (`fr`) | Tres términos en circulación | **poco** |
| 5 | Los cuatro estados | Registro demasiado fuerte o demasiado débil | **poco** |
| 8 | «Combinación inusual» | Nota comercial leída como error normativo | **poco** |
| 11 | Continuidad de momento | Se lee como empotramiento de base | **poco** |
| 9 | Los tres arriostramientos | Dos comparten nombre y el aviso deja de explicar | medio |
| 3 | Radio de acuerdo | Las cuatro razones se vuelven indistinguibles | medio |
| 7 | Norma de producto / código | Se destruye la distinción central del catálogo | medio |
| 2 | Radio de giro | Símbolo `r` frente a `i` | bajo |
| 4 | Contorno canónico | Vocabulario de producto sin equivalente | bajo |
| 10 | Correa | — | ninguno, unívoco |

**Once decisiones, cinco de ellas con poco o ningún margen.** Ése es el trabajo previo, y es por
qué M1 no publicó ni una línea traducida.

## Dos reglas que M1 recomienda fijar antes de traducir

1. **Las designaciones de norma y los símbolos no se traducen.** `EN 10365`, `IRAM-IAS U 500-215-6`,
   `F-24`, `S355`, `IPE 200`, `Wy`, `ry`, `fy` se leen igual en los tres idiomas ofrecidos y hay un
   test e2e que lo verifica. La regla debería escribirse antes de agregar un cuarto idioma, no
   después.
2. **La regla de no-aprobación necesita su lista de palabras por idioma.**
   `steel-never-verified.test.ts` busca las palabras de aprobación fuera de una negación, y sus
   listas cubren es/en/pt. Un idioma nuevo sin su lista pasaría la puerta sin ser revisado, que es
   la peor forma de pasarla.
