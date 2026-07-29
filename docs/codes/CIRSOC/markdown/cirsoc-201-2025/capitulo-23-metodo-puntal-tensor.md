# CIRSOC 201 (2025) — CAPÍTULO 23. MÉTODO PUNTAL-TENSOR

> Source: `CIRSOC 201-2025.pdf` · PDF pages 443–460
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c23.1"></a>
### 23.1 ALCANCE                                                   C 23.1. ALCANCE  <sub>p.443</sub>



<a id="c23.1.1"></a>
### 23.1.1 Este capítulo se aplica al diseño de                    Una discontinuidad en la distribución de tensiones se  <sub>p.443</sub>

elementos de hormigón estructural, o regiones de                produce en un cambio de geometría de un elemento
estos elementos, donde la carga o discontinuidad                estructural o en una carga o reacción concentrada. El
geométrica provoca una distribución no lineal de la             principio de Saint Venant señala que las tensiones debidas
deformación unitaria dentro de la sección transversal.          a cargas axiales y flexión se acercan a una distribución
                                                                lineal a una distancia aproximadamente igual a la altura
                                                                total del elemento, h , lejos de la discontinuidad. Por esta
                                                                razón, se supone que las discontinuidades se extienden una
                                                                distancia h medida desde la sección donde se produce la
                                                                carga o el cambio de geometría.

                                                                Las zonas sombreadas en la Figura C 23.1(a) y (b)
                                                                muestran las discontinuidades geométricas típicas en
                                                                Regiones-D (Schlaich et al., 1987). La hipótesis que las
                                                                secciones planas permanecen planas presentada en el
                                                                artículo 22.2.1.2 no es aplicable en estas regiones. En
                                                                general, cualquier parte de un elemento localizada por
                                                                fuera de una Región-D se denomina una Región-B donde
                                                                la hipótesis de secciones planas permaneciendo planas de
                                                                la teoría de flexión puede ser aplicada. El método de
                                                                diseño de puntal-tensor, como se describe en este capítulo,
                                                                se basa en la hipótesis que las Regiones-D pueden
                                                                analizarse y diseñarse utilizando un reticulado ideal con
                                                                uniones articuladas compuesto por puntales y tensores
                                                                conectados en los nodos.

                                                                El reticulado ideal especificado en el artículo 23.2.1, que
                                                                conforma la base del método de puntal-tensor, no se
                                                                desarrolló para ser utilizado en reticulados como tales
                                                                debido a los efectos secundarios, como momentos, que no
                                                                se incluyen en el modelo.

                                                                Figura C 23.1(a). Regiones-D y discontinuidades.


<!-- page 443 -->

                   REGLAMENTO                                                COMENTARIO

                                                         Figura C 23.1(b). Regiones-D y discontinuidades.


<a id="c23.1.2"></a>
### 23.1.2 Cualquier elemento de hormigón estructural,  <sub>p.444</sub>

o región de discontinuidad en un elemento, se puede
diseñar modelando el elemento o región como un
reticulado idealizado de acuerdo con los requisitos de
este capítulo.


<a id="c23.2"></a>
### 23.2 GENERALIDADES                                      C 23.2. GENERALIDADES  <sub>p.444</sub>



<a id="c23.2.1"></a>
### 23.2.1 Los modelos puntal-tensor deben consistir en     C 23.2.1. En el reticulado ideal, los puntales son los  <sub>p.444</sub>

puntales y tensores conectados en zonas nodales          elementos a compresión, los tensores son los elementos a
para formar un reticulado ideal en dos o tres dimen-     tracción y los nodos son las uniones del reticulado. Las
siones.                                                  cargas uniformemente distribuidas se idealizan como una
                                                         serie de cargas concentradas aplicadas en los nodos. De
                                                         igual forma, la armadura distribuida generalmente se
                                                         idealiza como unidades de tensores representando grupos
                                                         de barras o alambres individuales. Los detalles del uso de
                                                         los modelos puntal-tensor se encuentran en Schlaich et al.
                                                         (1987), Collins and Mitchell (1991), MacGregor (1997),
                                                         FIP (1999), Menn (1986), Muttoni et al. (1997), y ACI
                                                         445R. En las publicaciones ACI SP-208 (Reineck, 2002) y
                                                         ACI SP-273 (Reineck and Novak, 2010) se dan ejemplos
                                                         de diseño de modelos puntal-tensor. El proceso de diseño
                                                         por el método de puntal-tensor para resistir las fuerzas
                                                         impuestas que actúan sobre y dentro de una Región-D se
                                                         denomina método del puntal-tensor y consta de los
                                                         siguientes cuatro pasos:

                                                         (1) Definir y aislar cada Región-D.

                                                         (2) Calcular las fuerzas resultantes en las fronteras de
                                                             cada Región-D.

                                                         (3) Seleccionar un modelo y calcular las fuerzas
                                                             resultantes en los puntales y tensores para transferir
                                                             estas fuerzas resultantes a través de la Región-D. Los
                                                             ejes de los puntales y tensores se seleccionan para que
                                                             coincidan aproximadamente con los ejes de los
                                                             campos de compresión y de tracción, respectivamente.

Reglamento CIRSOC 201-25                                                                               Cap. 23 - 412


<!-- page 444 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                (4) Diseñar los puntales, tensores y zonas nodales de tal
                                                                    manera que tengan resistencia suficiente. Los anchos
                                                                    efectivos de los puntales y zonas nodales se
                                                                    determinan considerando las resistencias efectivas del
                                                                    hormigón definidas en los artículos 23.4.3 y 23.9.2.
                                                                    Se dimensiona la armadura para los tensores
                                                                    considerando las resistencias del acero definidas en
                                                                    los artículos 23.7.2. La armadura debería anclarse en
                                                                    o más allá de las zonas nodales.

                                                                Los componentes de un modelo puntal-tensor de una viga
                                                                de gran altura simplemente apoyada sobre la que actúa una
                                                                carga concentrada se presentan en la Figura C 23.2.1. Las
                                                                dimensiones de la sección transversal de un puntal o tensor
                                                                se designan espesor y ancho y ambos son perpendiculares
                                                                al eje del puntal o tensor. El espesor es perpendicular al
                                                                plano del modelo tensor-puntal y el ancho está contenido
                                                                dentro del plano del modelo puntal-tensor. Un tensor
                                                                consiste en armadura pretensada o no pretensada más una
                                                                porción del hormigón que lo circunda concéntrica con el
                                                                eje del tensor. El hormigón que lo circunda se incluye para
                                                                definir la zona donde deben anclarse las fuerzas de los
                                                                tensores. El hormigón de un tensor no se usa para resistir la
                                                                fuerza axial del tensor. Aunque no se considera de manera
                                                                explícita en el diseño, el hormigón circundante reducirá las
                                                                elongaciones del tensor, especialmente bajo cargas de
                                                                servicio.

                                                                Figura 23.2.1. Descripción del modelo puntal-tensor.


<a id="c23.2.2"></a>
### 23.2.2 Para determinar la geometría del reticulado             C 23.2.2. Los puntales, tensores y zonas nodales que  <sub>p.445</sub>

ideal, se deben considerar las dimensiones de los               conforman el modelo puntal-tensor tienen todos anchos
puntales, tensores, zonas nodales, áreas de reacción            finitos, típicamente en el plano del modelo, y espesores,
y apoyos.                                                       típicamente en la dimensión fuera del plano de la
                                                                estructura, los cuales deberían tenerse en cuenta al
                                                                seleccionar las dimensiones del reticulado. Las Figuras
                                                                C 23.2.2(a) y (b) muestran un nodo y su zona nodal
                                                                correspondiente. Las fuerzas verticales y horizontales
                                                                equilibran la fuerza en el puntal inclinado.

                                                                Si más de tres fuerzas actúan en una zona nodal, en un
                                                                modelo puntal-tensor bidimensional, como se aprecia en la
                                                                Figura C 23.2.2(a), se sugiere resolver algunas de las
                                                                fuerzas en una sola resultante de tal manera que se cuente
                                                                solo con tres fuerzas que se intersectan. Las fuerzas de los
                                                                puntales que actúan sobre las caras A-E y C-E en la
                                                                Figura C 23.2.2(a) pueden ser reemplazadas por una sola
                                                                fuerza que actúa sobre la cara A-C, como se muestra en la
                                                                Figura C 23.2.2(b). Esta fuerza pasa a través del nodo en
                                                                D.


<!-- page 445 -->

                   REGLAMENTO                                              COMENTARIO

                                                      Alternativamente, el modelo puntal-tensor puede ser
                                                      analizado suponiendo que las fuerzas de los puntales
                                                      actúan a través del nodo en D, como se muestra en la
                                                      Figura C 23.2.2(c). En este caso, las fuerzas en los dos
                                                      puntales del lado derecho del nodo D pueden ser resueltas
                                                      en una sola fuerza que actúe a través del punto D, como se
                                                      aprecia en la Figura C 23.2.2(d).

                                                      Si el ancho del apoyo en la dirección perpendicular al
                                                      elemento es menor que el ancho del elemento, se puede
                                                      requerir armadura transversal para evitar la falla por
                                                      hendimiento vertical en el plano del nodo. Esto puede ser
                                                      modelado usando un modelo puntal-tensor transversal.

                                                      Figura C 23.2.2. Resolución de las fuerzas en una zona
                                                      nodal.


<a id="c23.2.3"></a>
### 23.2.3 Los modelos puntal-tensor deben ser           C 23.2.3. Los resultados de un análisis por el método de  <sub>p.446</sub>

capaces de transferir todas las cargas mayoradas a    puntal-tensor representan la frontera inferior de los estados
los apoyos o Regiones-B adyacentes.                   límites de resistencia. El artículo 23.5.1 requiere armaduras
                                                      distribuidas en las Regiones D diseñadas por medio de este
                                                      capítulo, a menos que los puntales estén restringidos
                                                      lateralmente. El uso de armadura distribuida para
                                                      Regiones-D mejora el comportamiento en servicio.
                                                      Además, el ancho de las fisuras en un tensor puede
                                                      controlarse usando los requisitos del artículo 24.3.2,
                                                      suponiendo que el tensor está embebido en un prisma de
                                                      hormigón correspondiente al área del tensor definido en el
                                                      artículo C 23.8.1.


<a id="c23.2.4"></a>
### 23.2.4 Las fuerzas internas en el modelo puntal-  <sub>p.446</sub>

tensor deben estar en equilibrio con las cargas
aplicadas y las reacciones.


<a id="c23.2.5"></a>
### 23.2.5 Se permite que los tensores atraviesen los  <sub>p.446</sub>

puntales y otros tensores.


<a id="c23.2.6"></a>
### 23.2.6 Los puntales deben intersectarse o superpo-   C 23.2.6. Por definición, una zona nodal hidrostática  <sub>p.446</sub>

nerse sólo en los nodos.                              presenta tensiones iguales en las caras cargadas y estas
                                                      caras son perpendiculares al eje de los puntales y tensores
                                                      que actúan en el nodo. Este tipo de nodo se considera una
                                                      zona nodal hidrostática porque las tensiones en el plano

Reglamento CIRSOC 201-25                                                                              Cap. 23 - 414


<!-- page 446 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                son iguales en todas direcciones. Estrictamente hablando,
                                                                esta terminología es incorrecta porque las tensiones en el
                                                                plano no son iguales a las tensiones fuera del plano.

                                                                La parte (i) de la Figura C 23.2.6a muestra una zona nodal
                                                                C-C-C. Si las tensiones en las caras de la zona nodal son
                                                                iguales en los tres puntales, la relación de las longitudes de
                                                                los lados de la zona nodal, wn1 : wn2 : wn3 tiene las
                                                                mismas proporciones que las tres fuerzas C1 : C2 : C3 .

                                                                Una zona nodal C-C-T puede ser representada como una
                                                                zona nodal hidrostática si se supone que el tensor se
                                                                extiende a través del nodo para ser anclado mediante una
                                                                placa en el lado más alejado del nodo, como lo muestra en
                                                                la Figura C 23.2.6a(ii), siempre y cuando el tamaño de la
                                                                placa lleve a tensiones de aplastamiento iguales a las
                                                                tensiones en los puntales. La placa de apoyo del lado
                                                                izquierdo de la Figura C 23.2.6a(ii) corresponde a un
                                                                anclaje de tensor real. La fuerza del tensor puede ser
                                                                anclada a una placa o por medio de elementos embebidos
                                                                tales como barras rectas [Figura C 23.2.6a(iii)], barras con
                                                                cabeza o con gancho. Para nodos que no sean hidrostáticos,
                                                                la cara con las mayores tensiones controlará las
                                                                dimensiones del nodo.

                                                                Las áreas con sombreado claro en la Figura C 23.2.6b
                                                                corresponden a zonas nodales extendidas. Una zona nodal
                                                                extendida es aquella parte de un elemento circunscrita por
                                                                la intersección del ancho efectivo del puntal, ws , y el
                                                                ancho efectivo del tensor, wt .

                                                                Para satisfacer el equilibrio en el modelo puntal-tensor,
                                                                deberían actuar al menos tres fuerzas en cada nodo, como
                                                                se aprecia en la Figura C 23.2.6c. Los nodos se clasifican
                                                                de acuerdo con los signos de estas fuerzas. Un nodo C-C-C
                                                                resiste tres fuerzas de compresión, un nodo C-C-T resiste
                                                                dos fuerzas de compresión y una fuerza de tracción, y un
                                                                nodo C-T-T resiste una fuerza de compresión y dos fuerzas
                                                                de tracción.

                                                                Figura C 23.2.6a. Nodos hidrostáticos.


<!-- page 447 -->

                   REGLAMENTO                                                COMENTARIO

                                                         Figura C 23.2.6b. Zona nodal extendida que muestra los
                                                         efectos de la distribución de la fuerza.

                                                         Figura C 23.2.6c. Clasificación de nodos.


<a id="c23.2.7"></a>
### 23.2.7 El ángulo entre los ejes de cualquier puntal y   C 23.2.7. El ángulo entre los ejes de un puntal y un tensor  <sub>p.448</sub>

de cualquier tensor entrando al mismo nodo debe ser      que actúa en un nodo debería ser lo suficientemente grande
al menos 25º.                                            para mitigar la fisuración y evitar las incompatibilidades
                                                         debidas al acortamiento de los puntales y alargamiento de
                                                         los tensores que ocurren aproximadamente en la misma
                                                         dirección. Esta limitación del ángulo impide modelar el
                                                         corte en vigas esbeltas usando puntales inclinados a menos
                                                         de 25º con respecto al acero longitudinal (Muttoni et al.,
                                                         1997).

                                                         En algunos casos, los modelos puntal-tensor pueden
                                                         ajustarse para cumplir este requisito sin excluir la
                                                         armadura transversal ubicada cerca de cargas concentradas

Reglamento CIRSOC 201-25                                                                               Cap. 23 - 416


<!-- page 448 -->

                     REGLAMENTO                                                      COMENTARIO

                                                                o reacciones como se ilustra en la Figura C 23.2.7.

                                                                Figura C 23.2.7. Modelo puntal-tensor de una entalladura
                                                                ilustrando el ajuste requerido para cumplir con el artículo
                                                                23.2.7.


<a id="c23.2.8"></a>
### 23.2.8 Los efectos de pretensado deben incluirse en            C 23.2.8. El flujo de las fuerzas en el modelo puntal-tensor  <sub>p.449</sub>

los modelos puntal-tensor como cargas externas con              no es realista si los efectos del pretensado no se consideran
factores de carga de acuerdo con el artículo 5.3.11.            como cargas externas. El incluir los efectos del pretensado
Para elementos pretesados, se permite suponer que               como cargas externas se requiere para identificar regiones
la fuerza de pretensado se aplica al final de la                donde los efectos de otras cargas externas exceden las
longitud de transferencia del cordón.                           fuerzas de precompresión y viceversa. Los efectos del
                                                                pretensado se simulan por medio de cargas concentradas
                                                                en los anclajes y cargas transversales equivalentes al efecto
                                                                de desviación y curvatura de los cordones. Se requieren
                                                                diferentes factores de carga, de acuerdo con el artículo
                                                                5.3.11, dependiendo de los efectos de pretensado en el
                                                                modelo puntal-tensor. La aplicación de la fuerza de
                                                                pretensado al final de la longitud de transferencia podría
                                                                requerir un estribo de barra corrugada donde la fuerza de
                                                                pretensado se transfiere.


<a id="c23.2.9"></a>
### 23.2.9 Las vigas de gran altura diseñadas usando el  <sub>p.449</sub>

método puntal-tensor deben cumplir con los artículos
9.9.2.1, 9.9.3.1 y 9.9.4.


<a id="c23.2.10"></a>
### 23.2.10 Las ménsulas y cartelas con una relación de  <sub>p.449</sub>

luz de corte a altura av / d < 2,0, diseñadas usando el
método puntal-tensor, deben cumplir con los artículos
16.5.2, 16.5.6 y la ecuación (23.2.10).

          Asc ≥ 0,04 (f´c / fy) (bw d)           (23.2.10)


<a id="c23.2.11"></a>
### 23.2.11 Los requisitos de corte por fricción del               C 23.2.11. Una junta de construcción entre una ménsula y  <sub>p.449</sub>

artículo 22.9 deben aplicar solo donde sea apropiado            la cara de la columna es un ejemplo de una interfaz donde
considerar transferencia de corte a través de                   los requisitos de corte por fricción del artículo 22.9 son
cualquier plano dado, tal como una fisura existente o           aplicables.
potencial, una interfaz entre materiales disímiles, o
una interfaz entre dos hormigones construidos en
diferente momento.


<a id="c23.2.12"></a>
### 23.2.12 Los elementos diseñados utilizando modelos  <sub>p.449</sub>

puntal-tensor que son parte del sistema de
resistencia ante fuerzas sísmicas deben cumplir los
requisitos adicionales del artículo 23.11, en caso de


<!-- page 449 -->

                     REGLAMENTO                                                COMENTARIO

que sea aplicable.


<a id="c23.3"></a>
### 23.3 RESISTENCIA DE CÁLCULO                              C 23.3. RESISTENCIA DE CÁLCULO  <sub>p.450</sub>



<a id="c23.3.1"></a>
### 23.3.1 Para cada combinación de mayoración de            C 23.3.1. Las cargas mayoradas se aplican al modelo  <sub>p.450</sub>

carga aplicable, la resistencia de cálculo de los         puntal-tensor, y luego se calculan las fuerzas en todos los
puntales, tensores y zonas nodales en un modelo           puntales, tensores y zonas nodales. Si existen varias
puntal-tensor debe cumplir con Sn ≥ U, incluyendo        combinaciones de carga, cada una debería ser analizada
(a) hasta (c):                                            por separado. Para un puntal, tensor o zona nodal dado,
                                                          Fus , Fut o Fun es la mayor fuerza en ese elemento para
(a) Puntales: Fns ≥ Fus                                  todos los casos de carga considerados.

(b) Tensores: Fnt ≥ Fut

(c) Zonas nodales: Fnn ≥ Fun


<a id="c23.3.2"></a>
### 23.3.2 El factor  debe cumplir con el artículo 21.2.  <sub>p.450</sub>



<a id="c23.4"></a>
### 23.4 RESISTENCIA DE LOS PUNTALES                         C 23.4. RESISTENCIA DE LOS PUNTALES  <sub>p.450</sub>



<a id="c23.4.1"></a>
### 23.4.1 La resistencia nominal a la compresión de un      C 23.4.1. El ancho de un puntal, ws , usado para calcular  <sub>p.450</sub>

puntal, Fns , debe calcularse por medio de (a) o (b):     Acs es la dimensión perpendicular al eje del puntal en sus
                                                          extremos. Este ancho del puntal se encuentra ilustrado en
(a) Puntal sin armadura longitudinal                      la Figura C 23.2.6a(i) y en la Figura C 23.2.6b. En las
                                                          estructuras de dos dimensiones, como vigas de gran altura,
        Fns = fce Acs                      (23.4.1a)      el espesor de los puntales puede ser tomado como el
                                                          espesor del elemento, excepto en los soportes de apoyo
(b) Puntal con armadura longitudinal                      donde el espesor del puntal debe ser igual al menor espesor
                                                          del elemento o del elemento soportante.
        Fns = fce Acs + A´s f´s            (23.4.1b)
                                                          La contribución de la armadura a la resistencia del puntal
donde Fns debe ser evaluado en los dos extremos           está dada por el último término de la ecuación (23.4.1b).
del puntal y tomarse como el menor valor; Acs es el       La tensión f´s en la armadura en un puntal en el estado de
área de la sección transversal en el extremo del          resistencia nominal puede obtenerse de las deformaciones
puntal bajo consideración; fce está dado en el            específicas cuando el puntal se aplasta. Se deben cumplir
                                                          los requisitos de detallado del artículo 23.6, incluyendo la
artículo 23.4.3; A´s es el área efectiva de la arma-
                                                          armadura de confinamiento para prevenir el pandeo de la
dura a compresión a lo largo del puntal y f´s es la       armadura del puntal.
tensión en la armadura de compresión al nivel de
resistencia nominal axial del puntal. Se puede tomar
f´s igual a fy para armadura con fy igual a 280 ó
420 MPa.


<a id="c23.4.2"></a>
### 23.4.2 La resistencia efectiva a la compresión del       C 23.4.2. En el diseño, los puntales normalmente son  <sub>p.450</sub>

hormigón, fce , en un puntal debe calcularse de           idealizados como elementos prismáticos en compresión.
acuerdo con el artículo 23.4.3.                           Cuando el área de un puntal difiere en sus extremos, ya sea
                                                          por la diferencia de las resistencias de las zonas nodales en
                                                          ambos extremos o por la diferencia de las longitudes de
                                                          apoyo, el puntal se idealiza como un elemento trapezoidal
                                                          en compresión.


<a id="c23.4.3"></a>
### 23.4.3 La resistencia efectiva a la compresión del       C 23.4.3. El coeficiente de resistencia 0,85 f´c en la  <sub>p.450</sub>

hormigón, fce , en un puntal se debe calcular por         ecuación (23.4.3) representa la resistencia efectiva del
medio de:                                                 hormigón bajo compresión sostenida, similar a la usada en
                                                          las ecuaciones (22.4.2.2) y (22.4.2.3).
          fce = 0,85 c s f´c                 (23.4.3)
                                                          El valor de  s en la expresión (a) de la Tabla 23.4.3(a)
donde    s     debe estar de acuerdo con Tabla           aplica, por ejemplo, al modelo transversal de una viga con

Reglamento CIRSOC 201-25                                                                                  Cap. 23 - 418


<!-- page 450 -->

                        REGLAMENTO                                                           COMENTARIO

23.4.3(a) y c debe estar de acuerdo con la Tabla                       ménsula lateral en la zona inferior, utilizado para
23.4.3(b).                                                              dimensionar la armadura de suspensión y de la ménsula
                                                                        lateral en la zona inferior, donde la tracción longitudinal en
                                                                        el ala reduce la resistencia de los puntales transversales. El
Tabla 23.4.3(a). Coeficiente de puntal  s                              valor bajo de s refleja que estos puntales necesitan
                                                                        transferir compresión en una zona donde las tensiones de
                                                                        tracción actúan perpendicularmente al plano del modelo
Ubicación        Tipo de                                                puntal-tensor.
                                      Criterio            s
del puntal       puntal
Elementos a                                                             El valor de s en la expresión (b) de la Tabla 23.4.3(a)
 tracción o
  zonas a                                                               aplica a los puntales de borde y resulta en un estado de
                Cualquiera    Todos los casos            0,40     (a)
  tracción                                                              tensiones que es comparable al bloque de compresiones
dentro de los                                                           rectangular en la zona de compresión de una viga o
 elementos
                Puntales de
                                                                        columna. Los puntales de borde no están sometidos a
                              Todos los casos            1,00     (b)   tracción transversal y por lo tanto tienen una resistencia
                  borde
                              Armadura que cumple                       efectiva fce más alta que los puntales interiores (Figura
                              con (a) o (b) de la        0,75     (c)   C 23.2.1).
                              Tabla 23.5.1
 Todos los
                              Localizados en
otros casos      Puntales                                               El valor de  s en la expresión (c) de la Tabla 23.4.3(a)
                              regiones que cumplen       0,75     (d)
                 interiores   con 23.4.4                                refleja el efecto benéfico de la armadura distribuida.
                              Nudos viga-columna         0,75     (e)
                              Todos los otros casos      0,40     (f)   El valor de s en la expresión (d) de la Tabla 23.4.3(a)
                                                                        aplica a puntales interiores en regiones con suficiente
                                                                        resistencia a la tracción diagonal para cumplir con la
Tabla 23.4.3(b). Factor de modificación                         para    ecuación (23.4.4).
confinamiento de puntales y nodos  c
                                                                        El valor de  s en la expresión (e) de la Tabla 23.4.3(a)
                                                                        refleja los requisitos para armadura o confinamiento en
      Ubicación                             c                          nudos viga-columna del Capítulo 15.
 Extremo de un puntal                 √A2 ⁄A1 donde A1 se
  conectado a un nodo                                             (a)
                                                                        El valor de  s en la expresión (f) de la Tabla 23.4.3(a) se
                                       define por la superficie
  que incluye una             Menor
                                              de apoyo                  redujo para inhibir una falla de tracción diagonal en
  superficie de apoyo          de                                       regiones sin armadura transversal que no cumplen o no se
 Nodo que incluye una                            2,0             (b)
  superficie de apoyo
                                                                        evalúan bajo el artículo 23.4.4. La evaluación de los
Otros casos                                 1,0                   (c)
                                                                        resultados de ensayos en la base de datos de corte del ACI
                                                                        en elementos sin armadura transversal indica que las fallas
                                                                        por tracción diagonal se pueden evitar si los puntales se
                                                                        dimensionan con base en un  s de 0,4 (Reineck and
                                                                        Todisco, 2014). La base de datos de ACI para corte incluye
                                                                        resultados de ensayos de especímenes con un d promedio
                                                                        de 380 mm y que no exceden 960 mm; por lo tanto, el
                                                                        efecto de tamaño no se esperaría que reduzca
                                                                        significativamente la resistencia de elementos de este
                                                                        tamaño. Debido a que el efecto de tamaño podría ser
                                                                        significativo para elementos de mayor altura sin armadura
                                                                        transversal, se consideró apropiado exigir la evaluación por
                                                                        medio de la ecuación (23.4.4).

                                                                        La influencia del confinamiento del hormigón en la
                                                                        resistencia efectiva a compresión de un puntal o nodo se
                                                                        tiene en cuenta por medio de c . La superficie de apoyo
                                                                        puede ser una placa de apoyo o el área de una carga de
                                                                        compresión bien definida de otro elemento, como puede
                                                                        ser una columna. Es el mismo efecto de confinamiento que
                                                                        se utiliza en zonas de apoyo en el artículo 22.8.3. El
                                                                        incremento en la resistencia a la compresión asociado con
                                                                        el confinamiento generado por el hormigón circundante en
                                                                        un modelo puntal-tensor está descrito por Tuchscherer et
                                                                        al. (2010) y Breen et al. (1994).


<!-- page 451 -->

                        REGLAMENTO                                                           COMENTARIO


<a id="c23.4.4"></a>
### 23.4.4 Si el uso de  s de 0,75 está basado en la fila              C 23.4.4. La ecuación (23.4.4) tiene como intención  <sub>p.452</sub>

(d) de la Tabla 23.4.3(a), las dimensiones del                       inhibir una falla por tracción diagonal. En regiones de
elemento deben definirse para cumplir con la                         discontinuidad, la resistencia a tracción diagonal aumenta
ecuación (23.4.4), donde s se define en el artículo                 en la medida que el ángulo del puntal aumenta. Para
                                                                     puntales muy inclinados Vu podría exceder:
23.4.4.1.
                                                                     0,85s √f´c bw d
    Vu ≤  0,42 tan()  s √f´c bw d                   (23.4.4)


<a id="c23.4.4.1"></a>
### 23.4.4.1 El factor de modificación por efecto de  <sub>p.452</sub>

tamaño s , debe determinarse por medio de (a) o
(b) según aplique:

(a) Si la armadura distribuida se coloca de acuerdo
    con el artículo 23.5, s , debe tomarse como 1,0.

(b) Si la armadura distribuida no se coloca de
    acuerdo con el artículo 23.5, s , debe tomarse
    de acuerdo con la ecuación (23.4.4.1).

                        2
         s = √                                         (23.4.4.1)
                   (1 + 0,004 d)

    donde d está en mm.


<a id="c23.5"></a>
### 23.5 ARMADURA DISTRIBUIDA MÍNIMA                                    C 23.5. ARMADURA DISTRIBUIDA MÍNIMA  <sub>p.452</sub>



<a id="c23.5.1"></a>
### 23.5.1 En regiones D diseñadas utilizando el método                 El método puntal tensor se deriva del teorema del límite  <sub>p.452</sub>

de puntal-tensor, debe colocarse una armadura                        inferior de plasticidad; por lo tanto, un elemento diseñado
mínima distribuida atravesando los ejes de puntales                  utilizando este método requiere suficiente armadura para
interiores de acuerdo con la Tabla 23.5.1.                           promover una redistribución de las fuerzas internas en el
                                                                     estado fisurado (Marti, 1985). Además de permitir la
                                                                     redistribución de fuerzas, la armadura distribuida controla
Tabla 23.5.1. Armadura distribuida mínima                            la fisuración ante cargas de servicio y conduce a un
                                                                     comportamiento dúctil (Smith and Vantsiotis, 1982;
                                            Cuantía                  Rogoswky et al., 1986, Tan et al., 1977).
 Restricción
                     Configuración        mínima de la
  lateral del                                                        Los puntales interiores usualmente se orientan paralelos a
                     de la armadura        armadura
    puntal
                                           distribuida               los campos de tensiones de compresión y están, por esta
                        Disposición       0,0025 en cada             razón, orientados perpendicularmente a los campos de
                                                              (a)
                         ortogonal           dirección               tensiones de tracción. Pueden desarrollarse tensiones de
 Sin restricción     Armadura en una                                 tracción a través del puntal donde las tensiones de
                         dirección            0,0025                 compresión se esparcen hacia afuera a lo largo de la
                     cruzando el puntal                       (b)
                                              sen2 1                longitud del puntal. La armadura distribuida mínima ayuda
                     con un ángulo 1
                                                                     a controlar la fisuración causada por estas tensiones de
  Restringido         No se requiere armadura distribuida     (c)    tracción.

                                                                     La cuantía de armadura distribuida requerida por el
                                                                     artículo 23.5.1 es el total en ambas caras además de
                                                                     cualquier capa interior colocada en elementos más anchos.
                                                                     La Figura C 23.5.1 ilustra la armadura distribuida
                                                                     unidireccional atravesando puntales interiores a un ángulo
                                                                     1 .

                                                                     Aunque la armadura distribuida mínima no se requiere
                                                                     donde los puntales interiores están restringidos
                                                                     lateralmente, la armadura distribuida es benéfica en
                                                                     regiones de discontinuidad grande. Una ménsula continua
                                                                     que apoya una losa es un ejemplo de una región de
                                                                     discontinuidad que incluye puntales que están restringidos
                                                                     lateralmente de acuerdo   con el artículo 23.5.3(a). Los

Reglamento CIRSOC 201-25                                                                                           Cap. 23 - 420


<!-- page 452 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                cabezales de pilotes y vigas repisa que sostienen cargas
                                                                concentradas son ejemplos de regiones de discontinuidad
                                                                que incluyen puntales que están restringidos lateralmente
                                                                de acuerdo con el artículo 23.5.3(b). Las caras laterales del
                                                                puntal en el artículo 23.5.3(b) son las caras paralelas al
                                                                plano del modelo. En cabezales de pilotes evaluados
                                                                utilizando modelos puntal-tensor tridimensionales, el plano
                                                                del modelo en el artículo 23.5.3 se define por medio del
                                                                puntal bajo estudio y el pilote a que se conecta.

                                                                Figura C 23.5.1. Armadura distribuida cruzando puntales
                                                                interiores.


<a id="c23.5.2"></a>
### 23.5.2 La armadura distribuida requerida por el  <sub>p.453</sub>

artículo 23.5.1 debe cumplir con (a) y (b):

(a) La separación no debe exceder 300 mm.

(b) El ángulo 1 no debe ser menor de 40º.


<a id="c23.5.3"></a>
### 23.5.3 Los puntales se consideran restringidos  <sub>p.453</sub>

lateralmente si están restringidos perpendicularmente
al plano del modelo puntal-tensor de acuerdo con (a),
(b) o (c):

(a) La región de discontinuidad es continua en el
    plano perpendicular al modelo puntal-tensor.

(b) El hormigón que restringe al puntal se extiende
    más allá de la cara del puntal a cada lado una
    distancia no menor a la mitad del ancho del
    puntal.

(c) El puntal está en un nudo que está restringido de
    acuerdo con el artículo 15.2.8.


<a id="c23.5.4"></a>
### 23.5.4 La armadura requerida en el artículo 23.5.1  <sub>p.453</sub>

debe anclarse más allá de la extensión del puntal de
acuerdo con el artículo 25.4.


<!-- page 453 -->

                   REGLAMENTO                                                   COMENTARIO


<a id="c23.6"></a>
### 23.6 DETALLADO         DE    LA      ARMADURA     DEL     C 23.6. DETALLADO DE LA ARMADURA DEL  <sub>p.454</sub>

      PUNTAL                                                       PUNTAL


<a id="c23.6.1"></a>
### 23.6.1 La armadura a compresión en el puntal debe         C 23.6.1. Ver artículo C 23.4.1.  <sub>p.454</sub>

colocarse paralela al eje de éste y debe estar
confinada por estribos cerrados que cumplan con el
artículo 23.6.3 ó por zunchos en espiral de acuerdo
con el artículo 23.6.4.


<a id="c23.6.2"></a>
### 23.6.2 La armadura de compresión en los puntales  <sub>p.454</sub>

debe anclarse para desarrollar f´s en la cara de la
zona nodal donde f´s se calcula de acuerdo con el
artículo 23.4.1.


<a id="c23.6.3"></a>
### 23.6.3 Los estribos cerrados que envuelven a la  <sub>p.454</sub>

armadura a compresión en los puntales debe cumplir
con los requisitos de detallado del artículo 25.7.2 y
con los requisitos de los artículos 23.6.3.1 a 23.6.3.3.


<a id="c23.6.3.1"></a>
### 23.6.3.1 La separación de los estribos cerrados, s , a  <sub>p.454</sub>

lo largo del puntal no debe exceder el menor de (a)
hasta (c):

(a) La menor dimensión de la sección transversal
    del puntal.

(b) 48db de la barra o alambre de los estribos
    cerrados.

(c) 16db de la armadura sometida a compresión.


<a id="c23.6.3.2"></a>
### 23.6.3.2 El primer estribo cerrado debe colocarse a  <sub>p.454</sub>

no más de 0,5 s desde la cara de la zona nodal en
cada extremo del puntal.


<a id="c23.6.3.3"></a>
### 23.6.3.3 Los estribos cerrados deben disponerse de        C 23.6.3.3. Ver artículo C 25.7.2.3.  <sub>p.454</sub>

tal forma que cada barra longitudinal de esquina y
barra alterna tenga arriostramiento lateral aportado
por ganchos suplementarios o por la esquina de un
estribo cerrado con ganchos de un ángulo no mayor
de 135º. Ninguna barra longitudinal debe estar
separada a más de 15dbe o 150 mm libres medidos a
lo largo del estribo a cada lado de la barra arriostrada
lateralmente.


<a id="c23.6.4"></a>
### 23.6.4 Los zunchos en espiral que envuelven la  <sub>p.454</sub>

armadura a compresión en los puntales deben
cumplir con los requisitos del artículo 25.7.3.


<a id="c23.7"></a>
### 23.7 RESISTENCIA DE LOS TENSORES                          C 23.7. RESISTENCIA DE LOS TENSORES  <sub>p.454</sub>



<a id="c23.7.1"></a>
### 23.7.1 La armadura de los tensores puede ser  <sub>p.454</sub>

pretensada o no pretensada.


<a id="c23.7.2"></a>
### 23.7.2 La resistencia nominal a tracción de un            C 23.7.2. La resistencia del tensor del artículo 23.7.2 se  <sub>p.454</sub>

tensor, Fnt , debe calcularse como:                        basa en que cualquier efecto del pretensado se trata como
                                                           una carga externa de acuerdo con lo requerido en el
             Fnt = Ats fy + Atp fp           (23.7.2)     artículo 23.2.8. La resistencia total de un tensor pretensado
                                                           es Atp (fse + fp) .

Reglamento CIRSOC 201-25                                                                                   Cap. 23 - 422


<!-- page 454 -->

                    REGLAMENTO                                                       COMENTARIO

donde Atp es igual a cero para los elementos no
pretensados.


<a id="c23.7.2.1"></a>
### 23.7.2.1 En la ecuación (23.7.2), se permite tomar  <sub>p.455</sub>

fp igual a 420 MPa para la armadura pretensada
adherente e igual a 70 MPa para la armadura
pretensada no adherente. Se permiten otros valores
de fp cuando se justifiquen por medio de análisis,
pero fp no debe tomarse mayor que (fpy - fse) .


<a id="c23.8"></a>
### 23.8 DETALLADO DE LA ARMADURA DE LOS                           C 23.8. DETALLADO DE LA ARMADURA DE LOS  <sub>p.455</sub>

      TENSORES                                                          TENSORES


<a id="c23.8.1"></a>
### 23.8.1 En el modelo puntal-tensor, el eje del centro           C 23.8.1. El ancho efectivo del tensor supuesto en el  <sub>p.455</sub>

de gravedad de la armadura en un tensor debe                    diseño, wt , puede variar entre los límites siguientes,
coincidir con el eje del tensor supuesto.                       dependiendo de la distribución de la armadura del tensor:

                                                                (a) Si las barras en el tensor están colocadas en una sola
                                                                    capa, el ancho efectivo del tensor puede ser tomado
                                                                    como el diámetro de las barras en el tensor más dos
                                                                    veces el recubrimiento medido con respecto a la
                                                                    superficie de las barras, como se aprecia en la Figura
                                                                    C 23.2.6b(i).

                                                                (b) Un límite superior práctico del ancho del tensor puede
                                                                    tomarse como el ancho correspondiente a una zona
                                                                    nodal hidrostática, calculado como:
                                                                    wt,max = Fnt / (fce bs) , donde fce se calcula para la
                                                                    zona nodal de acuerdo con el artículo 23.9.2.

                                                                Si el ancho del tensor excede el valor de (a), la armadura
                                                                del tensor debería distribuirse de forma aproximadamente
                                                                uniforme sobre el ancho y espesor del tensor, como se ve
                                                                en la Figura C 23.2.6b(ii).


<a id="c23.8.2"></a>
### 23.8.2 La armadura del tensor debe anclarse                    C 23.8.2. Con frecuencia, el anclaje de los tensores  <sub>p.455</sub>

mediante dispositivos mecánicos, anclajes de                    requiere una atención especial en las zonas de nodos de
postesado, ganchos estándar o mediante el anclaje               ménsulas o en las zonas nodales adyacentes a los apoyos
de barras rectas, de acuerdo con el artículo 23.8.3,            exteriores de vigas de gran altura. La armadura en un
excepto en tensores extendiéndose desde nodos de                tensor debería anclarse antes de que salga de la zona nodal
barra curva diseñados de acuerdo con el artículo                extendida en el punto definido por la intersección del
23.10.                                                          centro de gravedad de las barras del tensor y las
                                                                extensiones del contorno, ya sea del puntal o del área de
                                                                apoyo. Esta longitud es anc . En la Figura C 23.2.6b,
                                                                esto ocurre donde el contorno de la zona nodal extendida
                                                                es atravesado por el centro de gravedad de la armadura del
                                                                tensor. Parte del anclaje puede lograrse extendiendo la
                                                                armadura a través de la zona nodal como lo muestra la
                                                                Figura C 23.2.6a(iii) y la Figura C 23.2.6b, y anclándolo
                                                                más allá de la zona nodal. Si el tensor se ancla usando
                                                                ganchos de 90º, los ganchos deberían estar confinados
                                                                dentro de armadura para evitar la fisuración a lo largo de la
                                                                parte externa de los ganchos en la región de apoyo.

                                                                En las vigas de gran altura, barras en forma de horquilla
                                                                empalmadas con la armadura del tensor pueden ser
                                                                empleadas para anclar las fuerzas de tracción en el tensor
                                                                en los apoyos exteriores, siempre que el ancho de la viga
                                                                sea lo suficientemente grande para acomodar dichas barras.


<!-- page 455 -->

                   REGLAMENTO                                               COMENTARIO

                                                        La Figura C 23.8.2 muestra dos tensores anclados a una
                                                        zona nodal. Se requiere anclarlos a partir de donde el
                                                        centro de gravedad del tensor atraviesa el contorno de la
                                                        zona nodal extendida.

                                                        La longitud de anclaje de la armadura del tensor puede ser
                                                        reducida por medio de ganchos, barras con cabeza,
                                                        dispositivos mecánicos, confinamiento adicional o
                                                        empalmándola con varias capas de barras más pequeñas.

                                                        Figura C 23.8.2. Zona nodal extendida de anclaje de dos
                                                        tensores.


<a id="c23.8.3"></a>
### 23.8.3 La fuerza en el tensor debe anclarse en cada  <sub>p.456</sub>

dirección en el punto donde el centro de gravedad de
la armadura del tensor sale de la zona nodal
extendida.


<a id="c23.9"></a>
### 23.9 RESISTENCIA DE LAS ZONAS NODALES                  C 23.9. RESISTENCIA DE LAS ZONAS NODALES  <sub>p.456</sub>



<a id="c23.9.1"></a>
### 23.9.1 La resistencia nominal a la compresión de  <sub>p.456</sub>

una zona nodal, Fnn , debe calcularse por medio de:

        Fnn = fce Anz                        (23.9.1)

donde fce se encuentra definido en el artículo 23.9.2
ó el artículo 23.9.3 y Anz se encuentra dado en el
artículo 23.9.4 ó el artículo 23.9.5.


<a id="c23.9.2"></a>
### 23.9.2 La resistencia efectiva a la compresión del     C 23.9.2. Los nodos en los modelos en dos dimensiones  <sub>p.456</sub>

hormigón en la cara de una zona nodal, fce , debe       pueden clasificarse como se muestra en la Figura C
calcularse con:                                         23.2.6c. La resistencia efectiva a la compresión de una
                                                        zona nodal está dada por la ecuación (23.9.2), donde el
        fce = 0,85 c n f´c                 (23.9.2)   valor n se da en la Tabla 23.9.2.

donde el valor de  n está dado en la Tabla 23.9.2 y    Los valores menores de  n reflejan el creciente grado de
c está de acuerdo con la Tabla 23.4.3(b).              perturbación de las zonas nodales debido a la
                                                        incompatibilidad de las deformaciones unitarias de
                                                        tracción en los tensores y deformaciones unitarias de
                                                        compresión en los puntales. La tensión en cualquier cara
                                                        de la zona nodal o en cualquier sección a través de la zona
                                                        nodal no debería exceder el valor dado por la ecuación
                                                        (23.9.2).

Reglamento CIRSOC 201-25                                                                              Cap. 23 - 424


<!-- page 456 -->

                     REGLAMENTO                                                      COMENTARIO

Tabla 23.9.2. Coeficiente n para zonas nodales                 Como se describe en el artículo C 23.4.3, c tiene en
                                                                cuenta el efecto del confinamiento del hormigón en la
                                                                resistencia efectiva a compresión de un nodo que tenga una
 Configuración de la zona nodal                  n
                                                                superficie de apoyo. c es el mismo para el nodo como
     Zonas nodales limitadas por                                para la interfaz nodo-puntal.
                                           1,0         (a)
  puntales, áreas de apoyo, o ambas
 Zonas nodales que anclan un tensor       0,80         (b)
 Zonas nodales que anclan dos o más
                                          0,60         (c)
              tensores


<a id="c23.9.3"></a>
### 23.9.3 Cuando se coloque armadura de  <sub>p.457</sub>

confinamiento dentro de la zona nodal y sus efectos
estén respaldados por ensayos y análisis, al calcular
Fnn se permite usar un valor incrementado de fce .


<a id="c23.9.4"></a>
### 23.9.4 El área de cada cara de una zona nodal, Anz ,           C 23.9.4. Si las tensiones en todos los puntales que se  <sub>p.457</sub>

debe tomarse como la menor de (a) y (b):                        encuentran en una zona nodal son iguales, se puede utilizar
                                                                una zona nodal hidrostática. Las caras de esa zona nodal
(a) El área de la cara de la zona nodal perpendicular           son perpendiculares a los ejes de los puntales, y los anchos
    a la línea de acción de Fus .                               de las caras de la zona nodal son proporcionales a las
                                                                fuerzas en los puntales.
(b) El área de una sección a través de la zona
    nodal, tomada en forma perpendicular a la línea             Suponiendo que las tensiones principales en los puntales y
    de acción de la fuerza resultante en la sección.            tensores actúan paralelamente a sus ejes, las tensiones en
                                                                las caras perpendiculares de esos ejes constituyen las
                                                                tensiones principales y se usa el artículo 23.9.4(a). Si,
                                                                como lo señala la Figura C 23.2.6b(ii), la cara de una zona
                                                                nodal no es perpendicular al eje del puntal, se producen
                                                                tanto tensiones de corte como tensiones normales en la
                                                                cara de la zona nodal. Generalmente, estas tensiones se
                                                                reemplazan por la tensión normal (principal a compresión)
                                                                que actúa en el área transversal Anz del puntal, tomada
                                                                perpendicularmente al eje del puntal como se indica en el
                                                                artículo 23.9.4(a).


<a id="c23.9.5"></a>
### 23.9.5 En un modelo puntal-tensor tridimensional, el  <sub>p.457</sub>

área de cada cara de una zona nodal no debe ser
menor a la dada en el artículo 23.9.4, y la forma de
cada cara de la zona nodal debe ser similar a la
forma de la proyección del extremo del puntal sobre
la cara correspondiente de la zona nodal.


<a id="c23.10"></a>
### 23.10 NODOS CON BARRAS CURVAS                                  C 23.10. NODOS CON BARRAS CURVAS  <sub>p.457</sub>



<a id="c23.10.1"></a>
### 23.10.1 Los nodos con barras curvas deben                      C 23.10.1. Un nodo de barra curva es formado por la  <sub>p.457</sub>

diseñarse y detallarse de acuerdo con esta sección.             región doblada de una barra, o barras, de armadura
                                                                continuas donde dos tensores que se extienden desde la
                                                                región del doblez son intersectados por un puntal (o la
                                                                resultante de dos o más puntales) (Figura C 23.10.5), o
                                                                donde un solo tensor es anclado por medio de un doblez de
                                                                180º (Figura C 23.10.2).


<a id="c23.10.2"></a>
### 23.10.2 Si el recubrimiento libre especificado normal          C 23.10.2. La ecuación (23.10.2a) tiene como intención  <sub>p.457</sub>

al plano del doblez es 2db o mayor, el radio del                evitar un fce que exceda el límite para nodos C-T-T dado
doblez rb debe cumplir con (a) o (b), pero no debe              en el artículo 23.9.2 (Klein, 2008). bs es el ancho del
ser menor que la mitad del diámetro de doblado                  puntal transversal al plano del modelo puntal-tensor. La
especificado en el artículo 25.3.                               ecuación (23.10.2a) aplica ya sea que las fuerzas del tensor
                                                                en el nodo sean iguales o diferentes; cuando las fuerzas del
(a) Los nodos con barras curvas con dobleces de                 tensor son diferentes, se debe cumplir también con el cb


<!-- page 457 -->

                          REGLAMENTO                                           COMENTARIO

                                                          requerido por el artículo 23.10.6.
                2 Ats fy
        rb ≥                            (23.10.2a)        Los tensores anclados por dobleces de 180º pueden
                 bs f´c
                                                          utilizarse en nodos C-C-T ó C-T-T. Las ramas rectas
                                                          paralelas de la barra o barras que se extienden dentro del
(b) Los tensores anclados por medio de dobleces de
                                                          elemento constituyen un solo tensor, donde Ats se toma
    180º:
                                                          como el área total de la armadura que se extiende desde
                 Ats fy                                   ambos extremos de la curvatura. La ecuación (23.10.2b)
         rb ≥                          (23.10.2b)         tiene como intención asegurarse que fce no excede el
                wt f´c
                                                          límite para nodos C-T-T dado en el artículo 23.9.2. El
                                                          ancho wt es el ancho efectivo del tensor como se ilustra
                                                          en la Figura C 23.10.2.

                                                          Figura C 23.10.2. Nodo CCT utilizando tensores anclados
                                                          con dobleces de 180º.


<a id="c23.10.3"></a>
### 23.10.3 Si el recubrimiento libre especificado normal    C 23.10.3. Se requieren mayores radios de doblez de las  <sub>p.458</sub>

al plano del doblez es menos de 2db , el valor de rb      barras en nodos de barras curvas para reducir la posibilidad
requerido por el artículo 23.10.2 debe multiplicarse      fallas por hendimiento lateral donde el recubrimiento de
por la relación 2db / cc , donde cc es el recubrimiento   hormigón perpendicular al plano del doblez está limitado.
libre especificado de la cara lateral.


<a id="c23.10.4"></a>
### 23.10.4 Si los nodos de barras curvas están              C 23.10.4. La Figura C 23.10.4 ilustra el uso de un nodo  <sub>p.458</sub>

formados por más de una capa de armadura, Ats             de barra curva con dos capas de barras de armadura. En
debe tomarse como el área total de armadura del           esos casos, el área total de armadura del tensor contribuye
tensor, y rb debe ser el radio del doblez de la capa      a la tensión de compresión sobre la cara de la zona nodal
de armadura localizada más adentro.                       (cara ab en la Figura C 23.10.4).

                                                          Figura C 23.10.4. Nodo de barra curva con dos capas de
                                                          armadura (la zona nodal está sombreada).

Reglamento CIRSOC 201-25                                                                                 Cap. 23 - 426


<!-- page 458 -->

                    REGLAMENTO                                                       COMENTARIO


<a id="c23.10.5"></a>
### 23.10.5 En las esquinas de pórticos, el nudo y la              C 23.10.5. El radio del doblez debería ser congruente con  <sub>p.459</sub>

armadura deben colocarse de tal manera que el                   la geometría del reticulado usado en el modelo puntal-
centro de curvatura de la barra esté ubicado dentro             tensor. La Figura C 23.10.5 ilustra la región en la cual el
del nudo.                                                       centro de curvatura debe localizarse para una esquina
                                                                típica del pórtico.

                                                                Figura C 23.10.5. Zona donde debe localizarse el centro
                                                                de curvatura en un nodo de barra curva en la esquina de
                                                                un pórtico.


<a id="c23.10.6"></a>
### 23.10.6 La longitud cb debe ser suficiente para               C 23.10.6. Las fuerzas de tracción en los tensores son  <sub>p.459</sub>

anclar cualquier diferencia en fuerza entre los tramos          desiguales cuando el puntal (o la resultante de dos o más
rectos de las barras que se extiendan hacia afuera              puntales) no es la bisectriz del ángulo formado por los dos
de la región del doblez.                                        tensores en cada extremo del doblez. La Figura C 23.10.6
                                                                muestra un nodo de barra curva en el cual la diferencia en
                                                                las fuerzas del tensor se desarrolla en la región del doblez
                                                                de la zona nodal. La armadura de compresión radial que
                                                                actúa en el nodo varía, y la tensión de adherencia
                                                                circunferencial se desarrolla a lo largo de la barra.

                                                                La diferencia en fuerza entre los dos tensores que se
                                                                extienden del doblez se desarrolla sobre la longitud del
                                                                doblez cb (la longitud de arco de la barra entre c y b en
                                                                la Figura C 23.10.6). La siguiente ecuación para cb
                                                                puede ser utilizada en dobleces de 90º:

                                                                                    cb > d (1 - tan c )

                                                                donde c es el menor de los dos ángulos entre los ejes del
                                                                puntal (o la resultante de dos o más puntales) y los tensores
                                                                que se extienden fuera del nodo de barra curva, y d es la
                                                                longitud de desarrollo calculada de acuerdo con el artículo
                                                                25.4.2.2 ó el artículo 25.4.2.3 utilizando los factores de
                                                                modificación aplicables del artículo 25.4.2.4.


<!-- page 459 -->

                   REGLAMENTO                                             COMENTARIO

                                                      Figura C 23.10.6. Fuerzas que actúan en un nodo de
                                                      barra curva donde hay una diferencia en las fuerzas de los
                                                      tensores.


<a id="c23.11"></a>
### 23.11 DISEÑO SISMORRESISTENTE           USANDO       C 23.11. DISEÑO SISMORRESISTENTE USANDO  <sub>p.460</sub>

       EL MODELO PUNTAL-TENSOR                                 EL MODELO PUNTAL-TENSOR

Las regiones de un sistema de resistencia ante
fuerzas sísmicas diseñadas con el método de puntal-
tensor deben cumplir con lo que estipula el
Reglamento INPRES-CIRSOC 103 - Parte II - 2026.

Reglamento CIRSOC 201-25                                                                            Cap. 23 - 428


<!-- page 460 -->

                    REGLAMENTO                                                       COMENTARIO
