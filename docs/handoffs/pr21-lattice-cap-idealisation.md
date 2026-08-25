# PR21 — La idealización del cabezal de columna reticulada

**Rama:** `feat/pro-steel-family` · **Aceptado provisionalmente** por Bauti
**Archivo que cambia:** `web/src/lib/engine/generators/lattice-column.ts`

Este documento existe porque el cambio se aceptó **con condiciones**, y las condiciones son
sobre lo que puede afirmarse, no sobre el código. Están enumeradas en §6.

---

## 1. Qué se cambió, exactamente

Dos miembros del cabezal pasaron de `truss` a `frame`:

```ts
members.push({ a: left[n],  b: cap, role: 'post', type: 'frame' });
members.push({ a: right[n], b: cap, role: 'post', type: 'frame' });
```

**No se agregó ninguna barra. No se movió ningún nodo. No se tocó el solver, ni Rust, ni
Cargo, ni el WASM fuente.** Cambió la continuidad declarada de dos miembros que ya existían.

---

## 2. Qué modela ahora el generador — dicho explícitamente

El generador modela el cabezal de la columna reticulada como una **unión de continuidad
rígida**: los dos miembros cortos que van de cada cordón al nodo del eje transmiten momento.

Es una **idealización**, y se declara como tal. Un cabezal real es una placa soldada o
abulonada cuya rigidez rotacional depende de su espesor, de sus rigidizadores y de la
soldadura. El generador no dimensiona ninguna de esas cosas y no puede, así que asume el
extremo rígido en vez del extremo articulado. La hipótesis viaja con el modelo en
`generator.assume.columnCapSharesReaction`, en los tres idiomas ofrecidos:

> El cabezal de columna es una placa rígida: reparte la reacción a los dos cordones y se
> modela con continuidad de momento con ellos.

Quien quiera un cabezal flexible tiene que modelarlo a mano. El generador no ofrece esa
opción y no finge ofrecerla.

---

## 3. Por qué esto corrige una idealización geométrica y NO el solver

La distinción importa y es la razón de que el cambio se haya aceptado.

Los dos miembros del cabezal son **colineales**: cordón izquierdo, nodo del eje, cordón
derecho, los tres a `z = heightM`. Un par de barras biarticuladas colineales restringe su
nodo compartido **a lo largo de esa única recta** y en ninguna otra dirección: sin rigidez
transversal, sin rigidez rotacional.

Eso no es una opinión sobre el modelo: es una propiedad de la matriz de rigidez de una barra
articulada en 3D. El nodo del cabezal tenía grados de libertad libres, y una estructura con
grados de libertad libres es un mecanismo. **El solver estaba en lo correcto al informarlo.**

Lo que estaba mal era la geometría idealizada que se le entregaba. El mensaje del solver era
verdadero; lo que se corrigió es el modelo que lo provocaba.

---

## 4. Lo que este cambio NO autoriza a afirmar

### 4.1 No es una equivalencia entre bases articuladas y empotradas

Con el cabezal rígido, la configuración de bases articuladas deja de ser un mecanismo y
resuelve con 2,0 mm contra 1,99 mm de la empotrada. **Eso no dice que articulado equivalga a
empotrado.**

Lo medido es **una sola hipótesis de carga vertical**, y la fijeza de base se gana o se pierde
por comportamiento lateral, que nada de esto midió. Bajo carga vertical en la cumbrera la
flecha máxima está gobernada por la flexibilidad de la cercha, no por el empotramiento — que
los dos números casi coincidan es lo esperable y **no** es evidencia de equivalencia.

El default de la nave sigue siendo base empotrada. La hipótesis
`generator.assume.latticeBasesPinnedNoOutOfPlane` sigue viajando con el modelo cuando se
eligen bases articuladas, y su texto se corrigió: antes afirmaba que la configuración «es un
mecanismo», lo que ya no es cierto; ahora dice que resuelve y que no está arriostrada.

### 4.2 Nada metálico queda verificado

El cambio hace que un modelo **resuelva**. No lo diseña, no lo verifica y no lo certifica.
Todos los resultados metálicos siguen siendo experimentales / no verificados, con los cuatro
estados intactos: `NOT_DESIGNED`, `EXPERIMENTAL`, `DEMAND_UNAVAILABLE`, `NOT_APPLICABLE`.
Que la nave por defecto ahora dé 4 mm no la acerca un paso a ser construible.

---

## 5. Alcance auditado: qué otras familias toca

**Ninguna.** El bloque del cabezal está detrás de `if (p.capTop)`, y:

| | `capTop` | ¿lo alcanza? |
|---|---|---|
| `generateLatticeColumn()` suelta | `false` por defecto | **no** — no genera cabezal |
| `generateTruss()` | no usa el módulo | **no** — `truss-topology.ts` no menciona `cap` |
| `built-up-section.ts` | no usa el módulo | **no** |
| `generateShed()` con `columnKind: 'lattice'` | `true` (`shed.ts:258`) | **sí — el único** |

`grep -rn "capTop" src/lib` da un solo activador en producción. La columna reticulada
generada por sí sola sigue saliendo exactamente igual que antes del cambio.

---

## 6. Las condiciones de la aceptación, y dónde se cumplen

| Condición | Dónde |
|---|---|
| Documentar que se modela continuidad rígida | §2, y `generator.assume.columnCapSharesReaction` en en/es/pt |
| No presentarlo como equivalencia articulado/empotrado | §4.1, y el comentario del test reescrito en `generated-models-solve.test.ts` |
| Mantener todo lo metálico como experimental/no verificado | §4.2 |
| Conservar el test de desplazamiento físico | `shed-default-solves.test.ts` — cota `< 0.05 m`, más el contraste reticulada/alma llena |
| No volver a aceptar sólo `isFinite` | §7 |
| Explicar que corrige la idealización geométrica y no el solver | §3 |

---

## 7. La regla que deja este episodio: `isFinite` no es una aserción de solvencia

El estado intermedio —nave con vigas longitudinales, antes del arreglo— devolvía
**2,0·10¹¹ m** de desplazamiento. No era singular, así que devolvía números, y **todas** las
comprobaciones `Number.isFinite` sobre él pasaban. Un mecanismo disfrazado de resultado.

Por eso, en esta rama, un test que resuelve una geometría generada **debe asertar una cota de
desplazamiento**, no finitud. `shed-default-solves.test.ts` lo hace de dos maneras
independientes:

1. una cota absoluta (`< 0.05 m` para 20 kN sobre una nave de 10 m de luz);
2. un contraste entre dos familias de columna generadas por caminos distintos —reticulada y
   alma llena— exigiendo que el cociente de flechas quede entre 0,2 y 5. Dos generadores
   independientes coincidiendo en orden de magnitud es lo que produce una rigidez real y lo
   que un casi-mecanismo no puede fingir.

Si alguien agrega un caso de solvencia y sólo comprueba `isFinite`, está reintroduciendo
exactamente el agujero por el que esto pasó.

---

## 8. Lo que sigue abierto

- **Configuraciones con `purlins: false`** siguen siendo mecanismo. La causa **no está
  demostrada**: una cercha plana sin restricción fuera de plano lo explicaría, pero eso es una
  hipótesis, no un hallazgo. Ver el documento de esa investigación.
- **Ninguna otra hipótesis de conexión se agregó.** El pedido fue explícito: no introducir una
  segunda idealización de unión sin documentarla, y no se introdujo.
