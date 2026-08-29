# M2 — candidatos, con lo que cada uno necesita antes de empezar

**Escrito desde:** `feat/pro-steel-m1` (PR #156).
**Estado: nada de esto está iniciado en M1**, y es deliberado. Cada entrada dice qué haría falta,
qué NO se puede hacer sin más, y cuál es el criterio de aceptación — para que M2 no empiece por
descubrir de nuevo lo que M1 ya midió.

La continuidad es M1 → M2 → M3. Este documento es la parte de M1 que le habla a M2.

---

## 0. Lo que M2 hereda y no debería re-descubrir

| Hecho | Dónde está |
|---|---|
| Las tablas no publican módulo resistente; `c` sale del contorno canónico | `lib/profiles/properties.ts` |
| Cada cantidad lleva su base, y una ausencia lleva su motivo | mismo archivo, `PROPERTY_BASES` |
| La torsión es tabulada para tubos IRAM y ausente en todo lo demás | `steel-profiles.ts` header, `properties.ts` |
| La nave no tenía camino de carga longitudinal; tres miembros lo hacen | `m1-purlins-false-investigation.md` |
| `isFinite` no es aserción de solvencia; **una dirección de carga tampoco** | `shed-bracing.test.ts` |
| El namespace metálico está en es/en/pt y cae a inglés en los otros 12 | `locales/steel/*` |
| Nada metálico puede mostrarse como verificado, y hay red que lo fija | `steel-never-verified.test.ts` |

---

## 1. Módulo plástico (`Wpl`)

### Problema

La ficha muestra el módulo **elástico**. Un chequeo de flexión bajo CIRSOC 301 / AISC 360 usa el
**plástico** para secciones compactas, así que la ficha muestra hoy la mitad de la historia que
importa para dimensionar.

### Por qué no se hizo en M1

`Wpl = Σ A_i · d_i` medido desde el **eje neutro plástico** — el que divide el área en dos mitades
iguales, no el centroide. Para una sección doblemente simétrica coinciden; para un ángulo, una T o
un canal en su eje débil, no. Y las tablas no publican ninguno de los dos: el centroide se obtiene
del contorno canónico, y el eje neutro plástico habría que resolverlo.

M1 no lo derivó porque derivarlo mal es exactamente el error que `properties.ts` existe para
evitar: `Wpl` de un perfil I calculado con el centroide en vez del ENP da un número plausible y
equivocado para toda sección asimétrica.

### Lo que M2 necesita

1. **Resolver el ENP desde el contorno canónico.** `resolveProfile` ya devuelve los polígonos
   referidos al centroide; hace falta una bisección sobre el área acumulada. Es un problema
   cerrado y verificable.
2. **Contrastar contra valores publicados.** Es la condición: EN 10365 tabula `Wpl,y` y `Wpl,z`
   para IPE/HEA/HEB, así que hay ~56 perfiles con respuesta conocida antes de aplicar el método a
   una familia que no la tenga.
3. **Una base nueva o la reutilización de `derivedFromGeometry`.** Si el ENP sale del contorno
   verificado, la base es la misma que ya usa el módulo elástico; si sale de otra vía, necesita su
   propia etiqueta.
4. **Refusal explícito para properties-only.** MC no tiene contorno: `Wpl` tiene que ser
   `unavailable` con motivo, igual que su `Wz`.

### Lo que M2 NO debe hacer

Aproximar `Wpl ≈ 1,15 · Wel`. Es la regla de bolsillo para perfiles I y es falsa para todo lo
demás; y un número aproximado sin etiqueta es lo que este catálogo no hace.

### Aceptación

Los 56 perfiles europeos reproducen `Wpl` publicado dentro del redondeo de tabla (~0,5 %), y
toda familia sin contorno lo declara ausente.

---

## 2. Torsión de secciones cerradas (Bredt)

### Problema

`j: null` para todo lo que no sea un tubo IRAM, y `null` también para cualquier sección compuesta
cerrada — una caja de dos canales espalda contra espalda tiene rigidez torsional real y el modelo
la trata como si no la tuviera.

### Por qué no se hizo en M1

PR21 lo dejó fuera de alcance explícitamente y M1 lo respetó. La prohibición vigente es que un
valor derivado del polígono **no es J** para una sección abierta delgada — la aproximación de Routh
no lo es — y levantarla para el caso cerrado requiere distinguir los dos casos con criterio, no
con una excepción.

### Lo que M2 necesita

1. **La vía de validación que PR21 ya identificó:** el catálogo IRAM publica `j` para RHS/SHS, así
   que una implementación de Bredt se contrasta contra **más de 100 valores tabulados** antes de
   aplicarse a una sección compuesta. Ese contraste es la razón por la que este ítem es viable y
   el módulo plástico también.
2. **Detectar la celda cerrada.** `built-up-section.ts` ya sabe qué disposiciones son cerradas
   (`isClosedArrangement`) y el generador ya avisa
   `generator.builtUp.torsion.closedCellNotComputed`. El aviso es el lugar donde aparecería el
   número.
3. **Mantener la prohibición para abiertas.** Bredt vale para la celda cerrada; una sección
   abierta sigue sin J derivable, y las dos tienen que quedar distinguidas en el tipo, no en un
   comentario.

### Lo que M2 NO debe hacer

Aplicar Bredt a una sección abierta, ni rellenar `j` de un perfil laminado abierto por analogía.

### Aceptación

Los tubos IRAM reproducen su `j` tabulado; una disposición cerrada devuelve un valor con base
declarada; una abierta sigue devolviendo `unavailable` con su motivo.

---

## 3. Comparación con resaltado del valor gobernante

### Problema

La comparación muestra tres columnas de números y no dice cuál gana. Un ingeniero espera que el
mejor de cada fila esté marcado.

### Por qué no se hizo en M1

Porque «mejor» no es una propiedad de la fila. Más `Iy` es mejor para flexión en el plano fuerte;
más masa es **peor** para costo y peso propio; más `ry` es mejor para pandeo alrededor de ese eje
pero la que gobierna es la del eje **débil**; y `Wz` de una sección asimétrica ya es el mínimo de
dos. Resaltar por «el número más grande» sería una recomendación de diseño disfrazada de formato,
que es la clase de cosa que esta rama no hace.

### Lo que M2 necesita

1. **Declarar el sentido por fila**: para qué propiedad más es mejor, para cuál menos, y para cuál
   no hay respuesta sin conocer el eje que gobierna. Es una tabla chica y es una decisión de
   producto, no de implementación.
2. **Decidir si el resaltado es relativo o absoluto.** «El mayor de los tres» es distinto de «el
   que cumple»; lo segundo necesita una demanda, y no hay autoridad metálica que la produzca.
3. **Que no lea como aprobación.** Un tilde verde en la comparación sería exactamente lo que
   `steel-never-verified.test.ts` prohíbe en el resto de la superficie. Un marcador neutro —negrita
   o un signo— y nunca un tono de «pasa».

### Aceptación

El resaltado tiene sentido declarado por fila, `steel-never-verified` sigue verde, y la marca no
usa color como única señal.

---

## 4. Dimensionamiento de arriostramientos

### Problema

M1 coloca arriostramiento de cubierta, de fachada y vertical entre cerchas, y **no dimensiona
ninguno**. El generador pide un perfil para el rol `bracing` y que ese perfil resista es una
pregunta que nadie contesta.

### Por qué no se hizo en M1

Dimensionar es verificar, y no hay autoridad de cálculo metálico. Cualquier número de M1 sobre la
capacidad de una diagonal habría sido `EXPERIMENTAL` en el mejor caso e inventado en el peor.

### Lo que M2 necesita — y el orden importa

1. **Una demanda.** Los modelos generados salen sin casos de carga a propósito. Dimensionar un
   arriostramiento longitudinal requiere **viento longitudinal**, que es trabajo de CIRSOC 101/102
   y no de acero. Sin eso, no hay nada que dimensionar.
2. **Una autoridad de cálculo.** Tracción es el caso simple —una diagonal en cruz trabaja a
   tracción— pero incluso eso necesita un factor de resistencia y una cláusula, y CIRSOC 301 en
   esta app no tiene ni mapa de cláusulas ni benchmark.
3. **La relación de esbeltez**, que es lo que gobierna una diagonal en la práctica y es
   comprobable **sin** una autoridad: `L/r` contra un límite declarado es geometría, no
   verificación. Es el escalón intermedio honesto: informar la esbeltez, decir de dónde sale el
   límite y no llamarlo un chequeo.

### Lo que M2 NO debe hacer

Emitir una utilización de arriostramiento. Sería el primer número metálico presentado como
capacidad, y toda la arquitectura de estados existe para que eso no pase por accidente.

### Aceptación

Si M2 llega hasta la esbeltez: el número aparece con su base y su límite citado, y no cuenta como
verificación. Si llega hasta la capacidad: pasa por el camino normal — cláusulas, benchmark,
matriz de capacidades — y no por una excepción.

---

## 5. Más idiomas del namespace metálico

### Problema

Las 314 claves de `locales/steel/*` están en es/en/pt. Los otros 12 idiomas que la app ofrece
caen a inglés — igual que casi todos los namespaces fuera de `design.*`, pero con una diferencia:
este namespace contiene **declaraciones de limitación**, y una advertencia que aparece en un
idioma que el usuario no lee es una advertencia que no está.

### Por qué no se hizo en M1

Porque el pedido fijaba tres idiomas y porque traducir 314 claves a 12 idiomas no es trabajo de
esta rama. Lo que M1 sí hizo es dejar la infraestructura lista: los tres diccionarios se fusionan
en `store.svelte.ts` sin tocarlo, y la puerta de paridad exige el mismo conjunto de claves en los
tres.

### Lo que M2 necesita

1. **Decidir el alcance.** No los 12 de una vez: los que tengan usuarios. La prioridad razonable
   es el que más se parezca a un mercado real antes que la lista completa.
2. **Extender la puerta.** `steel-keys.test.ts` compara es/en/pt; agregar un idioma es agregarlo
   ahí, y el test es lo que evita que se embarque a medias.
3. **Una regla para las designaciones.** `EN 10365`, `IRAM-IAS U 500-215-6`, `F-24` son nombres
   propios y no se traducen. Ya está respetado y el e2e lo verifica en los tres idiomas; con más
   idiomas la regla necesita quedar escrita.
4. **Traducir las limitaciones primero.** Si hay que priorizar dentro del namespace, las cinco
   limitaciones de uniones y los cuatro estados metálicos van antes que las etiquetas de la ficha:
   una etiqueta en inglés es una molestia, una limitación en inglés es un riesgo.

### Aceptación

El idioma agregado tiene las 314 claves, la puerta lo cubre, las designaciones no se traducen, y
`steel-never-verified` pasa sobre el diccionario nuevo — la regla de que ninguna palabra de
aprobación aparezca fuera de una negación vale en todo idioma.

---

## 6. También en la lista, con menos peso

- **Bases articuladas de columna reticulada.** Documentado aparte con las cuatro cosas que
  necesitaría una reapertura: §6 de `m1-purlins-false-investigation.md`. M1 no cambió la
  idealización y no agregó ninguna hipótesis lateral sin medición.
- **Cargas de viento sobre la nave.** Es la precondición del punto 4 y es trabajo de CIRSOC
  101/102.
- **Arriostramiento longitudinal como default.** Hoy los tres arriostramientos arrancan apagados
  para que la nave generada sea la que PR21 midió. Cuando exista una demanda longitudinal, la
  pregunta «¿cuál debería ser el default?» se vuelve contestable con una medición en vez de con
  una opinión.
- **Los cuatro puntos de coordinación con H1**, si la integración no los absorbió:
  `m1-h1-coordination.md`.
