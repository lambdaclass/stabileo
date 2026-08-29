# `purlins: false` — la investigación, y qué quedó demostrado

**Rama:** `feat/pro-steel-m1` (PR [#156](https://github.com/lambdaclass/stabileo/pull/156), draft)
**Documento propio de M1.** No modifica ningún documento de PR21.

---

## 0. Por qué existe este archivo

El §8 de `pr21-lattice-cap-idealisation.md` dice:

> Configuraciones con `purlins: false` siguen siendo mecanismo. La causa **no está demostrada**:
> una cercha plana sin restricción fuera de plano lo explicaría, pero eso es una hipótesis, no un
> hallazgo. **Ver el documento de esa investigación.**

Ese documento no existe. Busqué en `docs/` por `purlin` y por `correas`: los únicos resultados
son códigos CIRSOC, `BENCHMARKS.md`, y los propios handoffs de PR21 y M1. La remisión apunta a
nada.

Y hay una segunda cosa: **la causa sí quedó demostrada, en PR21 misma**, después de que se
escribiera ese párrafo. El commit `606ca6e4` dejó en `shed.ts` un comentario que la mide. Así que
el §8 quedó desactualizado por el trabajo de su propia rama, y el lector que siga la remisión no
encuentra ni el documento ni la corrección.

Este archivo es el documento que faltaba. No corrige el §8 — `pr21-lattice-cap-idealisation.md`
pertenece a PR21, que está en revisión en #135, y M1 sólo corrige documentación propia. Lo que
hace es dejar en un solo lugar la evidencia completa, atribuyendo cada mitad a quien la midió.

---

## 1. El síntoma

Con `roof: true` y `purlins: false`, la nave generada devuelve **matriz de rigidez singular** —
el solver la rechaza como mecanismo. Medido con `longitudinalBeams: true`, que es el arreglo
obvio y no arregla nada, y a 3 y a 6 pórticos.

```
generateShed({ ...DEFAULT_SHED_PARAMS, frames: 3, purlins: false, longitudinalBeams: true })
  → Error solving 3D: Singular stiffness matrix — structure is a mechanism
```

El modelo lo declara antes que el solver: la hipótesis `generator.assume.roofWithoutPurlins`
viaja con él, y el panel lo dice antes de apretar Generar.

## 2. La primera mitad de la demostración — PR21, commit `606ca6e4`

El instrumento es agregar una clase de restricción a la vez, sobre los nudos generados, y ver
cuál quita la singularidad. Sobre una nave de 3 pórticos, 33 nudos de cubierta:

| Restricción agregada en los nudos de cubierta | Resultado |
|---|---|
| `ty` — traslación a lo largo del edificio | resuelve, 4,0 mm |
| `rx` | sigue singular |
| `ry` | sigue singular |
| `rz` | sigue singular |
| `rx + ry + rz` | sigue singular |

La mitad positiva y la mitad negativa. Falta **restricción traslacional fuera del plano** en los
nudos de la cercha, y **no** es rotacional: las cerchas no se plieguen alrededor de una línea de
articulaciones, se mueven de costado en bloque.

Las vigas de alero no pueden aportarla, y por eso encenderlas no cambia nada: atan las cabezas de
columna, y todo nudo de cercha está por encima de ellas.

Eso está en el comentario de `shed.ts` (líneas ~336–348) y en
`shed-default-solves.test.ts › a roof with no purlins, and what is actually missing`, con los
cinco casos de la tabla como tests. **La causa estaba demostrada al cerrarse PR21.** El §8 quedó
viejo, no equivocado en su cautela — equivocado en los hechos, y por su propia rama.

## 3. La segunda mitad — M1

PR21 midió todo bajo **carga vertical**. M1 cargó también **a lo largo del edificio**, y ahí
aparece algo que ninguna de las mediciones anteriores podía ver.

### 3.1 La nave por defecto no tiene camino de carga longitudinal

```
nave por defecto (correas puestas, bases empotradas), 20 kN a lo largo del edificio
  → 2,393·10¹¹ m
```

No es singular. Devuelve números, y toda comprobación `Number.isFinite` sobre ellos pasa: es
exactamente el modo de falla que el §7 de `pr21-lattice-cap-idealisation.md` documenta, en una
dirección que nadie había cargado. La nave que PR21 declaró correcta —y que lo es bajo carga
vertical— no resiste nada en el eje del edificio.

### 3.2 Qué es el cuerpo libre

Mismo instrumento, sobre la nave por defecto y con carga longitudinal:

| Restricción agregada | Resultado |
|---|---|
| `ty` en todos los nudos **por encima del alero** | **0,000 m** — respuesta exactamente nula |
| `ty` en la **línea de aleros** (z = altura libre) | 1,925·10¹¹ m — no cambia nada |

La primera fila es más fuerte que «resuelve»: la respuesta es cero, o sea que la carga se va
íntegra por esas restricciones y nada más se mueve. **El cuerpo libre es la cubierta.**

Y la razón es estructural, no incidental: una cercha plana con alma articulada no tiene rigidez
fuera de su plano. El cordón superior entero, atado pórtico a pórtico por las correas, se
traslada de costado como una sola pieza. Las correas dan restricción **entre** cerchas; no atan
la cubierta a nada que llegue al suelo.

Ubicación del nudo peor, para que se pueda reproducir: `x = 0`, `z = 6,6` m — el primer nudo del
cordón superior sobre el alero — con `uy` idéntico en los seis pórticos (`y = 0, 5, 10, 15, 20,
25`), que es la firma de un deslizamiento de cuerpo rígido y no de una deformación.

### 3.3 Arriostrar el plano de cubierta no alcanza

Es el arreglo obvio y es el segundo arreglo obvio que no funciona:

| Configuración, 20 kN longitudinales | Resultado |
|---|---|
| + arriostramiento de cubierta y de fachada, vanos extremos | 1,653·10¹¹ m |
| + los mismos, todos los vanos | 9,012·10¹⁰ m |

Diagonales entre nudos del cordón superior **triangulan una placa que sigue deslizando**. Nada
de lo que une nudos de cubierta con nudos de cubierta la baja al suelo.

### 3.4 El elemento que faltaba, y la medición de cada uno

Lo que ancla la placa es un miembro que va del cordón superior de un pórtico a la **línea de
apoyo** del siguiente, en un plano vertical a lo largo del edificio: el arriostramiento vertical
entre cerchas. Con los tres miembros el camino se cierra:

```
plano de cubierta → arriostramiento vertical entre cerchas → línea de aleros
                  → vigas de alero → fachada arriostrada → suelo
```

| Configuración | Desplazamiento máximo |
|---|---|
| nave por defecto | 2,393·10¹¹ m |
| cubierta + fachada, sin arriostramiento vertical | 1,653·10¹¹ m |
| arriostramiento vertical + vigas de alero, sin fachada | 1,948 m |
| **sistema completo, vanos extremos** | **4,426 mm** |
| **sistema completo, todos los vanos** | **2,337 mm** |
| sistema completo sin vigas de alero | 32,8 mm |

Once órdenes de magnitud. Cada quita degrada de una manera que explica el rol del miembro
quitado: sin fachada arriostrada el vertical ata la cubierta a una línea que sólo sostiene la
flexión débil de las columnas (1,9 m); sin vigas de alero la reacción llega al suelo únicamente
en los vanos arriostrados (33 mm en vez de 4,4).

### 3.5 Y entonces, `purlins: false`

Las dos mitades, y las dos importan:

| Configuración | Carga vertical |
|---|---|
| sin correas, 6 pórticos, arriostramiento de cubierta en vanos extremos | **sigue siendo mecanismo** |
| sin correas, 6 pórticos, arriostramiento de cubierta en **todos** los vanos | resuelve, 3,997 mm |
| sin correas, 3 pórticos, arriostramiento de cubierta en vanos extremos | resuelve, 4,798 mm |

La tercera fila no contradice la primera: con 3 pórticos hay 2 vanos, y «vanos extremos» son los
dos, así que todos los pórticos quedan arriostrados. Con 6 pórticos los interiores no están en un
vano arriostrado y no hay nada que los sostenga de costado.

**Arriostrar todos los vanos aporta la restricción que aportaban las correas.** Eso es una
afirmación sobre cuál restricción faltaba. **No** es una recomendación de omitir correas: una
cubierta necesita algo que sostenga la chapa, y la hipótesis `roofWithoutPurlins` sigue viajando
con el modelo con cualquier arriostramiento, porque habla de las correas y no de la rigidez.

Y sigue sin haber camino longitudinal hasta que se agrega el vertical: sin correas, con
arriostramiento de cubierta en todos los vanos, la carga longitudinal da 1,601·10¹¹ m.

---

## 4. Lo que esto no autoriza a afirmar

- **Nada metálico queda verificado.** Los arriostramientos colocan geometría y declaran su
  hipótesis. Ninguna autoridad metálica los dimensiona, como nada metálico se dimensiona acá.
  Los cuatro estados siguen intactos.
- **Ninguna sección de arriostramiento está justificada.** El generador coloca barras y pide un
  perfil para el rol `bracing`; que ese perfil resista es una pregunta que nadie contesta.
- **Una sola hipótesis de carga por dirección.** Las tablas de arriba son una carga nodal en un
  nudo. Sirven para distinguir un camino de carga de un mecanismo — que es de lo que se trata —
  y no son un análisis de viento longitudinal.
- **No se tocó el solver, ni Rust, ni Cargo, ni el WASM.** El mecanismo estaba en la geometría
  que se le entregaba, y el solver tuvo razón las dos veces: cuando informó singular y cuando
  devolvió 10¹¹.

## 5. La regla que este episodio confirma

El §7 de `pr21-lattice-cap-idealisation.md` dice que `isFinite` no es una aserción de solvencia.
Este episodio agrega el corolario: **una dirección de carga no es una aserción de solvencia
tampoco.** La nave por defecto pasó todos los tests de PR21 —cota absoluta, contraste entre dos
familias de columna, todos los conteos de pórticos— y era libre en el eje del edificio.

`shed-bracing.test.ts` afirma cotas de desplazamiento en las dos direcciones, y sus casos
negativos afirman valores lo bastante grandes como para que nadie los lea como una flecha.

---

## 6. Deuda que queda

- **El §8 de `pr21-lattice-cap-idealisation.md` sigue diciendo que la causa no está demostrada** y
  sigue remitiendo a un documento que no existía. Este archivo es ese documento. La corrección
  del §8 pertenece a #135; propuesta: reemplazar el párrafo por una remisión a este archivo y a
  `shed-bracing.test.ts`.
- **Arriostramiento longitudinal y bases articuladas.** El §7 de `pr21-integration.md` dice que la
  ausencia de arriostramiento longitudinal es la razón por la que las bases de columna reticulada
  van empotradas por defecto, y que generarlo permitiría volver a articularlas. Medido, y el
  resultado no es el esperado en ninguna de las dos direcciones:

  | Bases articuladas (`fixedBase: false` en la nave y en la columna) | Vertical | Longitudinal |
  |---|---|---|
  | sin arriostramiento | 3,969 mm | 2,847·10¹¹ m |
  | + fachada arriostrada, vanos extremos | 3,971 mm | 1,850·10¹¹ m |
  | + fachada y cubierta, todos los vanos | 3,916 mm | 1,617·10¹¹ m |

  O sea: bajo carga vertical las bases articuladas **ya resolvían antes de cualquier
  arriostramiento** — es el efecto del cabezal rígido que documenta el §4.1 de
  `pr21-lattice-cap-idealisation.md`, no un efecto de la fachada. Y bajo carga longitudinal
  ninguna de las tres configuraciones sirve, porque a las tres les falta el arriostramiento
  vertical entre cerchas.

  **Volver al default articulado sigue sin justificación**, y el argumento del §7 —«generar el
  arriostramiento longitudinal lo permitiría»— resulta insuficiente tal como está escrito: el
  miembro que faltaba no era el de fachada.

  **Candidato a M2, explícitamente fuera de alcance de M1.** M1 no abre esa investigación, no
  cambia la idealización actual —bases empotradas por defecto en la nave, articuladas en la
  columna suelta— y no agrega ninguna hipótesis lateral sin medición. Lo que haría falta para
  reabrirla, anotado para que M2 no empiece de cero:

  1. una hipótesis de carga **lateral** en el plano del pórtico, que es donde la fijeza de base se
     gana o se pierde, y que ninguna de las mediciones de arriba tocó;
  2. el sistema de arriostramiento completo puesto, porque sin el vertical entre cerchas cualquier
     comparación articulado/empotrado se hace sobre un modelo que no tiene camino longitudinal;
  3. el contraste contra columna de alma llena, que es la red que ya usa
     `shed-default-solves.test.ts` para distinguir rigidez de coincidencia;
  4. y una cota de desplazamiento, nunca `isFinite`, por la razón del §5.

  Hasta que eso exista, el default empotrado se queda, y la hipótesis
  `generator.assume.latticeBasesPinnedNoOutOfPlane` sigue viajando con el modelo cuando alguien
  elige articulado — que es la parte honesta de la situación actual y no se toca.
- **Cargas de viento longitudinal.** El generador sigue emitiendo modelos sin casos de carga. Un
  generador de viento sobre la nave es trabajo de las autoridades CIRSOC 101/102, no de acero, y
  es lo que convertiría estas mediciones en una verificación de servicio.
