# 6. Fundamentos teóricos

Este capítulo explica **qué calcula el programa y cómo**, con la teoría que usa cada parte. Se
puede leer solo, como un apunte de análisis matricial y elementos finitos aplicado a la
herramienta.

- [Unidades y convenciones](#unidades-y-convenciones)
- [El método de las rigideces](#el-método-de-las-rigideces)
- [La barra de Euler-Bernoulli](#la-barra-de-euler-bernoulli)
- [De los esfuerzos a los diagramas](#de-los-esfuerzos-a-los-diagramas)
- [Tensiones en la sección](#tensiones-en-la-sección)
- [Estabilidad y dinámica](#estabilidad-y-dinámica)
- [Plasticidad](#plasticidad)
- [Elementos finitos: placas y cáscaras](#elementos-finitos-placas-y-cáscaras)

---

## Unidades y convenciones

**Unidades.** Sistema internacional: longitudes en **m**, fuerzas en **kN**, momentos en
**kN·m**, módulos elásticos y tensiones en barras en **MPa**, pesos específicos en **kN/m³**. En
las placas, las tensiones se informan en **kN/m²** y los momentos por unidad de ancho en
**kN·m/m**.

**Ejes globales.** **Z es vertical, hacia arriba**; X e Y son horizontales. La gravedad actúa
en −Z. Un modelo 2D vive en el plano **XZ**, así que sus grados de libertad son **ux**, **uz** y
el giro **θy**, y sus esfuerzos son **N**, **Vz** y **My**. En el plano, los giros se toman
positivos en sentido antihorario, mirando la estructura con X hacia la derecha y Z hacia arriba:
es la convención habitual del plano, aunque los nombres θy y My vengan del eje Y del espacio.

**Ejes locales de una barra.** x local va del nodo I al nodo J; z local es la vertical global
proyectada perpendicular a la barra; y local completa la terna. En barras verticales se usa X
global como referencia. En una viga horizontal cargada por gravedad, el momento principal es
**My**.

**Signos.** Esfuerzo axil positivo en tracción. Momento dibujado del lado traccionado. Reacciones y
desplazamientos en ejes globales.

---

## El método de las rigideces

Todo el cálculo de barras —en Básico y en PRO— usa el **método de las rigideces** (también
llamado método directo de la rigidez). La idea: en vez de buscar las fuerzas, se buscan los
**desplazamientos de los nodos**, porque con ellos todo lo demás sale por cálculo directo.

La ecuación de todo el método es

```math
[K]\,\{u\} = \{F\}
```

donde **[K]** es la matriz de rigidez de la estructura, **{u}** los desplazamientos de los nodos y
**{F}** las cargas. Son los nueve pasos que muestra el
[paso a paso](04-funciones-avanzadas.md#paso-a-paso-método-de-las-rigideces).

### La matriz de una barra

Cada barra relaciona las fuerzas en sus extremos con los desplazamientos de sus extremos. Para una
barra de pórtico en el plano, en sus ejes locales (axial u, transversal w, giro θ en cada extremo,
con θ positivo antihorario):

```math
[k] = \begin{bmatrix}
\frac{EA}{L} & 0 & 0 & -\frac{EA}{L} & 0 & 0 \\
0 & \frac{12EI}{L^3} & \frac{6EI}{L^2} & 0 & -\frac{12EI}{L^3} & \frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{4EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{2EI}{L} \\
-\frac{EA}{L} & 0 & 0 & \frac{EA}{L} & 0 & 0 \\
0 & -\frac{12EI}{L^3} & -\frac{6EI}{L^2} & 0 & \frac{12EI}{L^3} & -\frac{6EI}{L^2} \\
0 & \frac{6EI}{L^2} & \frac{2EI}{L} & 0 & -\frac{6EI}{L^2} & \frac{4EI}{L}
\end{bmatrix}
```

Cada columna es la fuerza que aparece en los extremos cuando se impone un desplazamiento unitario
en un grado de libertad con todos los demás fijos. Una barra de reticulado conserva sólo los
términos axiales (EA/L). En 3D la matriz es de 12 × 12: se suman la flexión en el otro plano
(con la otra inercia) y la torsión (GJ/L).

### Transformación

La matriz anterior está en ejes locales. Para ensamblar hay que llevarla a ejes globales con la
matriz de rotación **[T]** de la barra:

```math
[K]_e = [T]^T\,[k]\,[T]
```

### Ensamblaje

La matriz de la estructura se arma sumando la contribución de cada barra en las posiciones de sus
grados de libertad. Donde dos barras comparten un nodo, sus rigideces se suman: esa suma es la
compatibilidad (el nodo se mueve igual para las dos) y el equilibrio del nodo, escritos a la vez.

### El vector de cargas

Las cargas en los nodos entran directamente. Las cargas **sobre las barras** (distribuidas,
puntuales, térmicas) se reemplazan por **cargas nodales equivalentes**: las reacciones que
tendría la barra si tuviera los dos extremos empotrados, cambiadas de signo. Para una carga
uniforme q sobre una barra de longitud L, son q·L/2 de fuerza y q·L²/12 de momento en cada
extremo.

### Condiciones de borde y solución

Los grados de libertad se separan en **libres (f)** y **restringidos (r)**:

```math
\begin{bmatrix} K_{ff} & K_{fr} \\ K_{rf} & K_{rr} \end{bmatrix}
\begin{Bmatrix} u_f \\ u_r \end{Bmatrix}
=
\begin{Bmatrix} F_f \\ F_r + R \end{Bmatrix}
```

Los desplazamientos restringidos $u_r$ son conocidos: cero, o el valor impuesto si hay un
asentamiento. Se resuelve la primera fila para los desplazamientos libres:

```math
\{u_f\} = [K_{ff}]^{-1}\left(\{F_f\} - [K_{fr}]\{u_r\}\right)
```

y la segunda da las **reacciones**:

```math
\{R\} = [K_{rf}]\{u_f\} + [K_{rr}]\{u_r\} - \{F_r\}
```

Si $[K_{ff}]$ no se puede invertir —es singular—, la estructura es un **mecanismo**: hay un
movimiento que no requiere fuerza. Es lo que detecta el paso 3 del
[análisis cinemático](04-funciones-avanzadas.md#análisis-cinemático).

### Esfuerzos en las barras

Con los desplazamientos resueltos, se toman los de cada barra, se llevan a ejes locales y se
multiplican por su [k]. A eso se le suman las fuerzas de empotramiento de las cargas del tramo:

```math
\{f\} = [k]\,[T]\,\{u\}_e + \{f_{emp}\}
```

---

## La barra de Euler-Bernoulli

Las barras de Stabileo siguen la teoría de **Euler-Bernoulli**: las secciones planas se mantienen
planas y **perpendiculares al eje** después de deformarse. Eso equivale a despreciar la
deformación por corte.

**Por qué una barra recta no necesita malla.** La ecuación de la viga de Euler-Bernoulli sin carga
en el tramo, EI·w'''' = 0, tiene como solución un polinomio cúbico. La matriz de arriba se deduce
justamente con desplazamientos cúbicos (las funciones de Hermite), así que es **exacta**: dividir
una barra prismática en más elementos no cambia el resultado en los nodos. Con cargas en el tramo
pasa lo mismo, siempre que se usen las cargas nodales equivalentes.

**Cuándo deja de alcanzar.** Como desprecia el corte, la barra de Euler-Bernoulli siempre resulta
**más rígida** que la pieza real. En una viga esbelta la diferencia es despreciable; en una de
gran altura, no. Para una viga simplemente apoyada con carga uniforme, el error en la flecha es de
alrededor del 2 % con L/h = 10, del 8 % con L/h = 5 y del 19 % con L/h = 3. Ahí conviene modelar
la pieza como placa, en PRO. La nota [¿barras o elementos
finitos?](https://stabileo.com/es/blog/bars-or-finite-elements/) lo desarrolla con los números.

### Articulaciones

Una articulación en el extremo de una barra libera un grado de libertad —por ejemplo, el giro—. La
matriz de la barra articulada es la que resulta de eliminar ese grado de la matriz rígida por
**condensación estática**. Si **a** son los grados que se conservan y **b** los liberados:

```math
[k^*] = [k_{aa}] - [k_{ab}]\,[k_{bb}]^{-1}\,[k_{ba}]
```

Para una barra con un extremo articulado, eso convierte los coeficientes 12EI/L³, 6EI/L² y 4EI/L
en 3EI/L³, 3EI/L² y 3EI/L. El motor usa directamente esos coeficientes ya condensados, y corrige
las fuerzas de empotramiento con la misma operación.

---

## De los esfuerzos a los diagramas

El método de las rigideces da los esfuerzos **en los extremos** de cada barra. Adentro de la
barra, los diagramas se obtienen **por equilibrio**, cortando la barra en cada punto e integrando
las cargas del tramo:

```math
V(x) = V_i + \int_0^x q\,d\xi + \sum P
```

```math
M(x) = M_i - V_i\,x - \int_0^x q\,(x-\xi)\,d\xi - \sum P\,(x-a) - \sum M_0
```

$V_i$ y $M_i$ son los esfuerzos en el extremo inicial, q la carga distribuida, P las cargas
puntuales en las posiciones a y $M_0$ los momentos concentrados. Los signos siguen la convención interna del
programa, en la que dM/dx = −V; el diagrama que se dibuja respeta la convención de la
[sección de convenciones](#unidades-y-convenciones).

Por eso el momento de una carga uniforme sale parabólico sin dividir la barra. La deformada se
dibuja con las funciones de Hermite.

---

## Tensiones en la sección

El [análisis de sección](04-funciones-avanzadas.md#análisis-de-sección) calcula las tensiones con
las teorías clásicas de resistencia de materiales.

**Tensión normal (Navier).** En 3D, con flexión en los dos planos, la tensión en un punto (y, z)
de la sección suma el efecto del esfuerzo axil y el de cada momento:

```math
\sigma = \frac{N}{A} \pm \frac{M_y\,z}{I_y} \pm \frac{M_z\,y}{I_z}
```

donde cada término es positivo del lado que ese momento tracciona. La línea donde σ = 0 es el
**eje neutro**. Si la carga es excéntrica, que la resultante caiga
adentro o afuera del **núcleo central** decide si toda la sección trabaja con el mismo signo.

**Tensión tangencial por corte (Jourawski).**

```math
\tau = \frac{V\,Q}{I\,b}
```

donde **Q** es el momento estático de la parte de la sección que queda de un lado de la fibra y
**b** el ancho en esa fibra. En perfiles de pared delgada el programa dibuja el **flujo de corte**
recorriendo las paredes.

**Torsión.** La teoría depende de la forma de la sección:

| Sección | Teoría | Tensión |
|---|---|---|
| Circular (maciza o hueca) | Cauchy (exacta) | τ = T·r / Iₚ |
| Pared delgada **cerrada** | Bredt | τ = T / (2·Aₘ·t) |
| Pared delgada **abierta** | Saint-Venant | $\tau_{\text{máx}} = T \cdot t_{\text{máx}} / J$, con J = ⅓·Σ b·t³ |
| Maciza no circular (por ejemplo, rectangular) | Saint-Venant | J y τ de la solución de Saint-Venant para esa forma |

Aₘ es el área encerrada por la **línea media** de la pared. Abrir una pared cerrada cambia la
rigidez a torsión en órdenes de magnitud. La nota [Bredt o
Saint-Venant](https://stabileo.com/es/blog/torsion-bredt-saint-venant/) muestra cuánto difieren.

**Estado tensional y falla.** Con σ y τ el programa arma el tensor de tensiones, las tensiones
principales y el **círculo de Mohr**, y evalúa tres criterios, cada uno comparado con fy:
**Von Mises** ($\sigma_{vm} = \sqrt{\sigma^2 + 3\tau^2}$), **Tresca**
($\tau_{\text{máx}} = \sqrt{(\sigma/2)^2 + \tau^2}$) y **Rankine** (la mayor tensión principal en valor
absoluto).

---

## Estabilidad y dinámica

**Segundo orden (P-Δ).** El equilibrio se plantea en la geometría deformada. Se suma a la rigidez
elástica una **rigidez geométrica** $[K_G]$, que depende de los esfuerzos axiales (con compresión,
resta rigidez), y se itera hasta que los desplazamientos convergen:

```math
\left([K] + [K_G(N)]\right)\{u\} = \{F\}
```

**Pandeo lineal.** Se busca el factor λ que hace singular la rigidez total:

```math
\left([K] + \lambda\,[K_G]\right)\{\phi\} = 0
```

La carga crítica es λ veces la carga aplicada, y φ es la forma de pandeo.

**Análisis modal.** Las vibraciones libres sin amortiguamiento cumplen

```math
\left([K] - \omega^2\,[M]\right)\{\phi\} = 0
```

con **[M]** la matriz de masa, armada a partir del peso específico de los materiales:
**consistente** (repartida con las mismas funciones que la rigidez) en las barras sin
articulaciones y en las de reticulado, y **concentrada** en los nodos (la mitad de la masa en cada
extremo) en las barras que tienen alguna articulación.
Cada ω es una frecuencia propia (f = ω / 2π, T = 1/f) y cada φ una forma modal. La **masa
efectiva** de cada modo dice qué fracción de la masa total moviliza en cada dirección.

**Análisis espectral (PRO).** Combina la respuesta máxima de cada modo, leída de un espectro de
diseño, con las reglas CQC (combinación cuadrática completa) o SRSS (raíz cuadrada de la suma de
los cuadrados).

---

## Plasticidad

El **colapso plástico** se calcula de manera incremental. Se aumenta la carga hasta que el momento
en el extremo de una barra alcanza el momento plástico Mp = Zp·fy, con Zp tomado como b·h²/4 a
partir del ancho y la altura de la sección; ahí se coloca una rótula plástica, que gira sin
tomar más momento, y se sigue cargando la estructura modificada. El proceso termina cuando las
rótulas forman un **mecanismo**. El factor de carga acumulado en ese momento es el **factor de
colapso**.

---

## Elementos finitos: placas y cáscaras

Una barra resume una pieza en su eje: es un modelo **unidimensional**. Una losa o un tabique no se
pueden resumir así, porque trabajan en dos direcciones. PRO los modela como **placas**: se divide
la superficie en elementos pequeños (la **malla**), dentro de cada uno se aproximan los
desplazamientos con funciones simples y se ensamblan igual que las barras.

El método de las rigideces es, en el fondo, el caso particular del método de los elementos finitos
en que el elemento es una barra. La diferencia es que en una barra la aproximación es exacta, y en
una placa no: **el resultado mejora al refinar la malla** y converge a la solución del problema
continuo. Por eso vale la pena verificar que la malla sea suficientemente fina: si al refinarla el
resultado todavía cambia, la malla no alcanzaba.

**Flexión y membrana.** Una placa trabaja de dos maneras: **flexión** (cargas perpendiculares a su
plano, como una losa) y **membrana** (cargas en su plano, como un tabique que toma viento). Los
elementos de Stabileo combinan las dos.

**Placa delgada o gruesa.** Hay dos teorías de placa. La de **Kirchhoff**, para placas delgadas,
desprecia la deformación por corte (como Euler-Bernoulli en las vigas). La de **Mindlin-Reissner**
la incluye, y sirve para placas gruesas.

- **DKT** (triángulos): aplica la hipótesis de Kirchhoff en puntos discretos del elemento, así que
  es una placa delgada, sin deformación por corte. Su membrana es un triángulo de deformación
  constante, pobre para la flexión en el plano.
- **MITC4** (cuadriláteros): parte de Mindlin-Reissner, así que vale para placas gruesas y
  delgadas.

**El bloqueo por corte (*shear locking*).** Un cuadrilátero de Mindlin formulado de manera ingenua
se vuelve muchísimo más rígido de lo que corresponde cuando la placa es delgada: la losa responde
como si fuera más gruesa. **MITC4** (*Mixed Interpolation of Tensorial Components*) existe para
evitarlo: interpola las deformaciones por corte de otra manera, de modo que el elemento no se
trabe. Stabileo le suma a la membrana un refuerzo de deformaciones (EAS) que mejora su respuesta a
flexión en el plano.

**Conexión con las barras.** Placas y barras comparten grados de libertad sólo en los **nodos
comunes**. Para que una viga trabaje junto con la losa, tienen que compartir nodos a lo largo del
borde.

**Calidad de la malla.** Elementos muy alargados, con ángulos muy chicos o con los cuatro nodos
fuera de un mismo plano dan resultados peores. El motor los informa después de resolver.

---

## Para profundizar

- **El blog** desarrolla temas puntuales con números calculados por el programa:
  [stabileo.com/es/blog](https://stabileo.com/es/blog/).
- **La verificación del motor** contra soluciones analíticas y problemas de referencia está en
  [BENCHMARKS.md](../../BENCHMARKS.md) (en inglés).

---

[← Modo PRO](05-pro.md) · [Índice](README.md)
