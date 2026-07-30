# CIRSOC 201 (2025) — CAPÍTULO 24. REQUISITOS DE COMPORTAMIENTO EN SERVICIO

> Source: `CIRSOC 201-2025.pdf` · PDF pages 461–474
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c24.1"></a>
### 24.1 ALCANCE                                                   C 24.1. ALCANCE  <sub>p.461</sub>



<a id="c24.1.1"></a>
### 24.1.1 Este capítulo aplica al diseño de elementos             Los requisitos de comportamiento en servicio de este  <sub>p.461</sub>

para que cumplan los requisitos mínimos de                      capítulo son los especificados en otras secciones del
comportamiento en servicio, incluyendo (a) hasta (d):           Reglamento, y otros que es prudente tener en cuenta para
                                                                lograr un buen desempeño de los elementos estructurales.
(a) Flechas debidas a cargas gravitacionales en                 Este capítulo no debe tomarse como una compilación
    servicio (artículo 24.2).                                   coherente y completa de los requisitos para el
                                                                comportamiento en servicio relacionadas con el diseño de
(b) Distribución de la armadura de flexión en losas             los elementos estructurales. Este capítulo no contiene
    en una dirección y para control de fisuración en            requisitos específicos para vibraciones.
    vigas (artículo 24.3).
                                                                La experiencia muestra que los sistemas de entrepiso
(c) Armadura para         contracción     y   temperatura       construidos in situ y diseñados de acuerdo con los
    (artículo 24.4).                                            espesores mínimos y requisitos para flechas de los
                                                                artículos 7.3, 8.3, 9.3 y 24.2, en general, han tenido un
(d) Tensiones admisibles en elementos de hormigón               comportamiento adecuado ante vibraciones para el confort
    pretensado sometidos a flexión (artículo 24.5).             humano bajo condiciones típicas de servicio. No obstante,
                                                                puede haber situaciones donde las condiciones de servicio
                                                                pueden no ser satisfactorias, por ejemplo:

                                                                (a) Luces grandes y plantas abiertas.

                                                                (b) Entrepisos donde puede haber requisitos de comporta-
                                                                    miento ante vibraciones muy estrictos, como pueden
                                                                    ser espacios de fabricación de precisión y espacios
                                                                    para laboratorios.

                                                                (c) Espacios sometidos a cargas rítmicas o equipos
                                                                    mecánicos que vibren.

                                                                Los sistemas de entrepiso pretensados no están obligados a
                                                                cumplir con los espesores mínimos de los artículos 7.3, 8.3
                                                                y 9.3 y son prefabricados, usualmente son sistemas confor-
                                                                mados por vanos simples. Por esta razón, estos sistemas de
                                                                entrepiso tienden a ser más susceptibles a vibraciones.

                                                                Las guías para la consideración de las vibraciones en el
                                                                diseño de sistemas de entrepiso y la evaluación de las
                                                                frecuencias de vibración y su amplitud para sistemas de
                                                                entrepiso de hormigón pueden encontrarse en PCI Design
                                                                Handbook (PCI MNL 120), ATC Design Guide 1 (Applied
                                                                Technology Council, 1999), Mast (2001), Fanella and
                                                                Mota (2014), y Wilford and Young (2006). Un ejemplo de
                                                                aplicación está descrito en West et al. (2008).


<a id="c24.2"></a>
### 24.2 FLECHAS DEBIDAS A CARGAS GRAVITA-                         C 24.2. FLECHAS DEBIDAS A CARGAS GRAVITA-  <sub>p.461</sub>

      CIONALES EN SERVICIO                                              CIONALES EN SERVICIO


<a id="c24.2.1"></a>
### 24.2.1 Los elementos sometidos a flexión deben                 El 24.2 cubre únicamente flechas o deformaciones que  <sub>p.461</sub>

diseñarse para que tengan una rigidez adecuada con              puedan ocurrir en condiciones de carga de servicio.
el fin de limitar cualquier flecha o deformación que            Cuando se calculen flechas dependientes del tiempo, deben
pudiese afectar adversamente la resistencia o el                considerarse únicamente la carga permanente y aquellas
comportamiento en servicio de la estructura.                    porciones de otras cargas que actúen en forma permanente.

                                                                El Reglamento contiene dos métodos para controlar las
                                                                flechas (Sabnis et al., 1974). Para losas en una dirección no
                                                                              y vigas no pretensadas, incluidos los


<!-- page 461 -->

                        REGLAMENTO                                                             COMENTARIO

                                                                         elementos compuestos, se deben seguir las disposiciones
                                                                         de altura o espesor total mínimo según los artículos 7.3.1 y
                                                                         9.3.1, y cumplir con los requisitos del Reglamento para
                                                                         elementos que no soporten ni estén ligados a elementos no
                                                                         estructurales susceptibles de sufrir daños debido a grandes
                                                                         flechas. Para construcción no pretensada de losas en dos
                                                                         direcciones, la altura mínima requerida en el artículo 8.3.1
                                                                         satisface los requisitos del Reglamento.

                                                                         Para elementos no pretensados que no cumplan con estos
                                                                         requisitos de altura o espesor mínimo o para elementos no
                                                                         pretensados en una dirección que soporten o estén ligados
                                                                         a elementos no estructurales susceptibles de sufrir daños
                                                                         debido a flechas grandes y para todos los elementos de
                                                                         hormigón pretensado a flexión, las flechas deben
                                                                         calcularse mediante los procedimientos descritos en los
                                                                         artículos 24.2.3 hasta 24.2.5. Las flechas calculadas están
                                                                         limitadas a los valores de la Tabla 24.2.2.


<a id="c24.2.2"></a>
### 24.2.2 Las flechas calculadas de acuerdo con los                        C 24.2.2. Debe notarse que las limitaciones dadas en la  <sub>p.462</sub>

artículos 24.2.3 hasta 24.2.5 no deben exceder los                       Tabla 24.2.2 se relacionan únicamente con elementos no
límites establecidos en la Tabla 24.2.2.                                 estructurales soportados o vinculados. Para aquellas
                                                                         estructuras en las que los elementos estructurales son
                                                                         susceptibles de ser afectados por las flechas o deformacio-
                                                                         nes de los elementos a los que están ligados, de tal manera
                                                                         que afecten adversamente la resistencia de la estructura,
                                                                         estas flechas y las fuerzas resultantes deberían considerarse
                                                                         explícitamente en el análisis y el diseño de la estructura,
                                                                         como lo dispone el artículo 24.2.1 (ACI 209R-08).

                                                                         Cuando se calculen flechas dependientes del tiempo, puede
                                                                         restarse la parte de la flecha que ocurre antes de ligar los
                                                                         elementos no estructurales. Al hacer esta corrección puede
                                                                         emplearse la gráfica de la Figura C 24.2.4.1 para elemen-
                                                                         tos de dimensiones y formas usuales.

Tabla 24.2.2. Flecha máxima calculada admisible

                                                                                                                            Límite de
      Elemento                          Condición                                    Flecha considerada
                                                                                                                              flecha

 Cubiertas planas                                                             Flecha inmediata debida a Lr , S y R            / 180 [1]
                        Que no soporten ni estén unidos a elementos
                        no estructurales susceptibles de sufrir daños
      Entrepisos                  debido a grandes flechas                        Flecha inmediata debida a L                  / 360

                                                Susceptibles de sufrir    La parte de la flecha total que ocurre después
                       Que soporten o estén
                                                  daños debido a          de que los elementos no estructurales se unan       / 480 [3]
      Cubiertas o                                 grandes flechas.         (la suma de la flecha a largo plazo debida a
                        unidos a elementos
      entrepisos                                                          todas las cargas de larga duración, y la flecha
                         no estructurales        No susceptibles de          inmediata debida a cualquier sobrecarga
                                                sufrir daños debido a                       adicional) [2]                    / 240 [4]
                                                  grandes flechas.
[1]   Este límite no tiene por objeto constituirse en un resguardo contra la acumulación de agua. Esto último se debe verificar mediante
      cálculos de flechas, incluyendo las flechas debidas al agua estancada, y considerando los efectos a largo plazo de todas las cargas
      permanentes, la contraflecha, las tolerancias de construcción y la confiabilidad en las medidas tomadas para el drenaje.
[2]   Las flechas a largo plazo deben determinarse de acuerdo con 24.2.4 y se pueden reducir en la cantidad de flecha calculada que
      ocurra antes de ligar los elementos no estructurales. Esta cantidad se determina basándose en datos de ingeniería aceptables
      correspondiente a las características tiempo-flecha de elementos similares a los que se están considerando.
[3]   Este límite se puede exceder si se toman medidas adecuadas para prevenir daños en los elementos apoyados o unidos.
[4]   Este límite no puede exceder la tolerancia aportada para los elementos no estructurales.

Reglamento CIRSOC 201-25                                                                                                    Cap. 24 - 430


<!-- page 462 -->

                      REGLAMENTO                                                         COMENTARIO


<a id="c24.2.3"></a>
### 24.2.3 Cálculo de flechas inmediatas                               C 24.2.3. Cálculo de flechas inmediatas  <sub>p.463</sub>



<a id="c24.2.3.1"></a>
### 24.2.3.1 Las flechas inmediatas deben calcularse                   C 24.2.3.1. Para el cálculo de las flechas inmediatas de  <sub>p.463</sub>

mediante los métodos o fórmulas usuales para                        elementos prismáticos no fisurados pueden utilizarse los
flechas elásticas, teniendo en cuenta los efectos de                métodos o fórmulas usuales para las flechas elásticas, con
la fisuración y de la armadura en la rigidez del                    un valor constante de Ec Ig en toda la longitud de la viga.
elemento.                                                           Sin embargo, si el elemento está fisurado en una o más
                                                                    secciones, o si su altura varía a lo largo del vano, resulta
                                                                    necesario realizar un cálculo más riguroso.


<a id="c24.2.3.2"></a>
### 24.2.3.2 Al determinar las flechas debe tenerse en  <sub>p.463</sub>

cuenta el efecto de la variación de las propiedades
de la sección transversal, tal como el efecto de las
cartelas.


<a id="c24.2.3.3"></a>
### 24.2.3.3 Las flechas en los sistemas de losas en dos               C 24.2.3.3. El cálculo de flechas en losas de dos  <sub>p.463</sub>

direcciones deben calcularse teniendo en cuenta el                  direcciones es complejo, aun suponiendo un
tamaño y forma del panel, las condiciones de apoyo                  comportamiento lineal elástico. Para el cálculo de las
y la naturaleza de las restricciones en los bordes del              flechas inmediatas, pueden usarse los valores de Ec y Ie
panel.                                                              especificados en los artículos 24.2.3.4 y 24.2.3.5,
                                                                    respectivamente (ACI 209R-08). Sin embargo, pueden
                                                                    usarse otros valores para la rigidez Ec Ie si resultan en
                                                                    predicciones de flechas que concuerden razonablemente
                                                                    con los resultados de ensayos significativos.

<a id="c24.2.3.4"></a>
### 24.2.3.4 Se permite calcular el módulo de elasticidad  <sub>p.463</sub>

del hormigón, Ec , de acuerdo con el artículo 19.2.2.


<a id="c24.2.3.5"></a>
### 24.2.3.5 Para los elementos no pretensados, a                      C 24.2.3.5. La aproximación para el momento de inercia  <sub>p.463</sub>

menos que se obtengan por medio de un análisis                      efectivo, desarrollada por Bischoff (2005), ha demostrado
más completo, el momento de inercia efectivo, Ie ,                  que lleva a resultados de las flechas calculadas que tienen
debe calcularse de acuerdo con la Tabla 24.2.3.5                    suficiente precisión para un amplio intervalo de cuantías de
utilizando:                                                         armadura (Bischoff and Scalon, 2007). El Mcr se
                                                                    multiplica por dos tercios para considerar restricciones que
                      fr Ig                                         pueden reducir el momento de fisuración efectivo y para
             Mcr =                               (24.2.3.5)         tener en cuenta una resistencia reducida a la tracción del
                        yt
                                                                    hormigón durante la construcción que puede llevar a
                                                                    fisuración que posteriormente afecte las flechas de servicio
                                                                    (Scanlon and Bischoff, 2008).
Tabla 24.2.3.5. Momento de inercia efectivo, Ie
                                                                    En la edición previa a este reglamento, se utilizaba una
                               Momento efectivo                     ecuación diferente (Branson, 1965) para el cálculo de Ie .
 Momento en servicio
                               de inercia, Ie , mm4                 Se ha demostrado que la ecuación anterior subestimaba las
     Ma ≤ (2⁄3) Mcr                        Ig                 (a)   flechas de elementos con cuantías de armadura bajas, lo
                                                                    cual es usual en losas, y no consideraba el efecto de la
                                           Icr                      restricción. Para elementos con cuantías de armadura
     Ma > (2⁄3) Mcr                  (2⁄3) Mcr 2     I        (b)   superiores al 1 por ciento y momentos de servicio de al
                              1- (            ) (1 - cr )
                                        Ma           Ig             menos el doble del momento de fisuración, hay poca
                                                                    diferencia en las flechas calculadas utilizando los
                                                                    requisitos anteriores y los del presente Reglamento.


<a id="c24.2.3.6"></a>
### 24.2.3.6 Para losas continuas en una dirección y  <sub>p.463</sub>

vigas continuas, se permite tomar Ie como el prome-
dio de los valores obtenidos de la Tabla 24.2.3.5
para las secciones críticas de momento positivo y
negativo.


<a id="c24.2.3.7"></a>
### 24.2.3.7 Para losas en una dirección y vigas                       C 24.2.3.7. El empleo de las propiedades de la sección en  <sub>p.463</sub>

prismáticas, se permite tomar Ie como el valor                      el centro del vano para elementos prismáticos continuos es
obtenido de la Tabla 24.2.3.5 en el centro de la luz                considerado satisfactorio en cálculos aproximados,
para tramos simples y continuos y en el apoyo para                  principalmente porque la rigidez en el centro de la luz
voladizos.                                                          (incluyendo el efecto de la fisuración) tiene efecto


<!-- page 463 -->

                      REGLAMENTO                                                COMENTARIO

                                                           dominante sobre las flechas como lo muestra ACI 435.5R-
                                                           89, ACI Committee 435 (1978) y Sabnis et al. (1974).


<a id="c24.2.3.8"></a>
### 24.2.3.8 Para vigas y losas pretensadas Clase U,          C 24.2.3.8. Las flechas inmediatas de elementos de  <sub>p.464</sub>

definidas en el artículo 24.5.2, se permite calcular las   hormigón pretensado Clase U pueden calcularse por los
flechas considerando Ig .                                  métodos o fórmulas usuales para flechas elásticas,
                                                           utilizando el momento de inercia de la sección total de
                                                           hormigón (sin fisurar) y el módulo de elasticidad del
                                                           hormigón especificado en el artículo 19.2.2.1.


<a id="c24.2.3.9"></a>
### 24.2.3.9 Para las losas y vigas pretensadas Clase C       C 24.2.3.9. La ecuación del momento de inercia efectivo  <sub>p.464</sub>

y Clase T, como se definen en el artículo 24.5.2, los      del artículo 24.2.3.5 fue modificada en este Reglamento.
cálculos de flecha deben basarse en un análisis            La ecuación modificada no es aplicable a elementos
considerando la sección fisurada transformada. Los         pretensados. La ecuación (24.2.3.9a) mantiene los
cálculos se pueden basar en una relación momento-          requisitos de ediciones anteriores del Reglamento para
flecha bilineal o en un momento efectivo de inercia,       estos tipos de elementos. El PCI Design Handbook (PCI
Ie , como lo define la ecuación (24.2.3.9a):               MNL 120) da información sobre los cálculos de flecha
                                                           usando una relación momento-flecha bilineal y un
        Mcr 3             Mcr 3                            momento de inercia efectivo. Mast (1998) presenta
  Ie = (    ) Ig + [1 - (    ) ] Icr      (24.2.3.9a)      información adicional sobre la flecha de elementos de
         Ma               Ma
                                                           hormigón pretensado fisurados.
donde Mcr se calcula con:                                  Shaikh and Branson (1970) demuestran que el método
                                                           basado en Ie puede ser empleado para calcular las flechas
          (fr + fpe ) Ig                                   de elementos pretensados Clases C y T cargados más allá
  Mcr =                                   (24.2.3.9b)      de la carga de fisuración. Para este caso, el momento de
                yt
                                                           fisuración debería considerar el efecto de pretensado como
                                                           indica la ecuación (24.2.3.9).

                                                           En Shaikh and Branson (1970) se presenta un método para
                                                           predecir el efecto del acero de tracción no pretensado en la
                                                           reducción de la flecha por fluencia lenta, y de forma
                                                           aproximada en ACI 209R y Branson (1970).


<a id="c24.2.4"></a>
### 24.2.4 Cálculo de flechas dependientes del              C 24.2.4. Cálculo de flechas dependientes del tiempo  <sub>p.464</sub>

          tiempo


<a id="c24.2.4.1"></a>
### 24.2.4.1 Elementos no pretensados                         C 24.2.4.1. Elementos no pretensados  <sub>p.464</sub>



<a id="c24.2.4.1.1"></a>
### 24.2.4.1.1 A menos que los valores se obtengan             La contracción y la fluencia lenta causan flechas a largo  <sub>p.464</sub>

mediante un análisis más completo, la flecha               plazo adicionales a las flechas elásticas que ocurren
adicional dependiente del tiempo, resultante de la         cuando las cargas se aplican por primera vez a la estruc-
fluencia lenta y la contracción en elementos a flexión,    tura. Estas flechas están afectadas por: la temperatura, la
debe determinarse multiplicando la flecha inmediata        humedad, las condiciones de curado, la edad en el
causada por la carga persistente por el factor  .        momento de la carga, la cantidad de armadura a
                                                           compresión y la magnitud de la carga persistente. La
                                                          expresión dada en esta sección se considera satisfactoria
        =                              (24.2.4.1.1)      para usarse con los procedimientos del Reglamento para
              1 + 50 ´
                                                           calcular las flechas inmediatas y con los límites dados en la
                                                           Tabla 24.2.2. La flecha calculada de acuerdo con esta

<a id="c24.2.4.1.2"></a>
### 24.2.4.1.2 En la ecuación (24.2.4.1.1), ´ es el valor  <sub>p.464</sub>

                                                           sección es la flecha adicional a largo plazo, debida a la
en la mitad de la luz para vanos simples y continuos,
                                                           carga persistente y a las porciones de otras cargas
y en el apoyo para voladizos.
                                                           persistentes durante un período suficiente para provocar
                                                           flechas significativas en el tiempo.

<a id="c24.2.4.1.3"></a>
### 24.2.4.1.3 En la ecuación (24.2.4.1.1), los valores  <sub>p.464</sub>

para el factor dependiente del tiempo para cargas          La ecuación (24.2.4.1.1) se desarrolló en Branson (1971).
persistentes,  , se encuentran definidos en la Tabla      En la ecuación (24.2.4.1.1), el término (1 + 50´) tiene en
24.2.4.1.3.                                                cuenta el efecto de la armadura a compresión para reducir
                                                           las flechas a largo plazo.  = 2,0 representa un factor
                                                           nominal dependiente del tiempo para 5 años de duración
                                                           de la carga. Para períodos de carga de menos de 5 años

Reglamento CIRSOC 201-25                                                                                   Cap. 24 - 432


<!-- page 464 -->

                     REGLAMENTO                                                      COMENTARIO

Tabla 24.2.4.1.3. Factor dependiente del tiempo                 puede emplearse la curva de la Figura C 24.2.4.1 para
para cargas de larga duración                                   estimar valores de  .

  Tiempo de la carga de        Factor dependiente del           Cuando se desea considerar por separado la fluencia lenta
  larga duración, meses               tiempo,                  y la contracción, pueden usarse las ecuaciones aproxima-
                                                                das que se presentan en Branson (1965, 1971, 1977) y ACI
             3                            1,0
                                                                Committee 435 (1966).
             6                            1,2
             12                           1,4                   Dado que la información disponible sobre flechas a largo
          60 ó más                        2,0
                                                                plazo en losas en dos direcciones es muy limitada como
                                                                para justificar un procedimiento más elaborado, se permite
                                                                usar los factores dados en el artículo 24.2.4.1.3 con la
                                                                ecuación (24.2.4.1.1) para calcular las flechas adicionales
                                                                de largo plazo para losas en dos direcciones.

                                                                Figura C 24.2.4.1. Factor multiplicador para las flechas
                                                                a largo plazo.


<a id="c24.2.4.2"></a>
### 24.2.4.2 Elementos pretensados                                 C 24.2.4.2. Elementos pretensados  <sub>p.465</sub>



<a id="c24.2.4.2.1"></a>
### 24.2.4.2.1 La flecha adicional dependiente del                 C 24.2.4.2.1. El cálculo de las flechas a largo plazo en  <sub>p.465</sub>

tiempo en elementos de hormigón pretensado debe                 elementos de hormigón pretensado sometidos a flexión es
calcularse teniendo en cuenta las tensiones, en el              complejo. Los cálculos deberían tener en cuenta no sólo el
hormigón y en el acero, bajo carga permanente e                 incremento de las flechas debido a los esfuerzos por
incluyendo los efectos de fluencia lenta y contracción          flexión, sino también las flechas adicionales a largo plazo
del hormigón, así como la relajación del acero                  que son el resultado del acortamiento del elemento por la
pretensado.                                                     flexión.

                                                                El hormigón pretensado se acorta más con el tiempo que
                                                                otros elementos no pretensados semejantes, debido a la
                                                                precompresión en la losa o la viga, la cual produce fluencia
                                                                lenta. Esta fluencia lenta, junto con la contracción del
                                                                hormigón, tiene como resultado un acortamiento signifi-
                                                                cativo de los elementos sometidos a flexión que continúa
                                                                durante varios años después de la construcción y debería
                                                                tomarse en consideración en el diseño. El acortamiento
                                                                tiende a reducir las tensiones en la armadura de pretensado,
                                                                disminuyendo de esta manera la precompresión en el
                                                                elemento y, en consecuencia, produciendo incrementos en
                                                                las flechas a largo plazo.

                                                                Otro factor que puede influir en las flechas a largo plazo de
                                                                los elementos pretensados, solicitados a flexión, es el
                                                                hormigón o la albañilería adyacente, no pretensados, en la
                                                                misma dirección del elemento. Estos elementos pueden
                                                                consistir en una losa no pretensada en la misma dirección
                                                                que la viga, adyacente a una viga pretensada, o a un
                                                                sistema de losas no pretensadas. Puesto que el elemento
                                                                pretensado tiende a tener mayor contracción y mayor
                                                                fluencia lenta que el hormigón adyacente no pretensado, la


<!-- page 465 -->

                   REGLAMENTO                                                 COMENTARIO

                                                         estructura tenderá a lograr una compatibilidad de los
                                                         efectos de acortamiento. Esto da como resultado una
                                                         reducción de la precompresión en el elemento pretensado,
                                                         pues el hormigón adyacente absorbe la compresión. La
                                                         reducción en la precompresión del elemento pretensado,
                                                         que puede ocurrir a lo largo de un período de años, da
                                                         lugar a flechas adicionales a largo plazo y a un aumento de
                                                         tensiones de tracción en el elemento pretensado.

                                                         Se puede utilizar cualquier método adecuado para calcular
                                                         las flechas a largo plazo de elementos pretensados, siempre
                                                         y cuando se tomen en cuenta todos los efectos. Se puede
                                                         obtener información en ACI 209R-08, ACI Committee 435
                                                         (1963), Branson et al. (1970), y Ghali and Favre (1986).


<a id="c24.2.5"></a>
### 24.2.5 Cálculo de las flechas de construcción en        C 24.2.5. Cálculo de las flechas de construcción en  <sub>p.466</sub>

        hormigón compuesto                                         hormigón compuesto


<a id="c24.2.5.1"></a>
### 24.2.5.1 Si los elementos compuestos sometidos a         Los elementos compuestos de hormigón se deben diseñar  <sub>p.466</sub>

flexión se apuntalan durante su construcción de tal      para cumplir con los requisitos de resistencia a corte
forma que después de retirar los apoyos temporales       horizontal del artículo 16.4. Dado que se han hecho pocos
la carga permanente es soportada por la sección          ensayos para estudiar las flechas inmediatas y a largo plazo
compuesta total, para el cálculo de la flecha el         de elementos compuestos, las reglas dadas en esta sección
elemento compuesto se puede considerar equiva-           se basan en el criterio acumulado en Estados Unidos con
lente a un elemento construido monolíticamente.          este tipo de estructuras.


<a id="c24.2.5.2"></a>
### 24.2.5.2 Si los elementos compuestos sometidos a         En el artículo 22.3.3.3 se establece que no debe hacerse  <sub>p.466</sub>

flexión no se apuntalan durante su construcción,         distinción entre elementos apuntalados y sin apuntalar.
debe investigarse la magnitud y duración de la carga     Esto se refiere a los cálculos de resistencia y no a las
antes del inicio efectivo de la acción compuesta para    flechas. Los documentos de construcción deberían indicar
calcular las flechas a largo plazo.                      si el diseño de los elementos compuestos de hormigón se
                                                         basa en construcción apuntalada o sin apuntalar, como lo

<a id="c24.2.5.3"></a>
### 24.2.5.3 Se deben tener en cuenta las flechas que        exige el artículo 26.11.1.1.  <sub>p.466</sub>

resultan de la contracción diferencial entre los
componentes prefabricados y los construidos en obra
y los efectos de la fluencia lenta de los elementos de
hormigón pretensado.


<a id="c24.3"></a>
### 24.3 DISTRIBUCIÓN DE LA ARMADURA A                      C 24.3. DISTRIBUCIÓN DE LA ARMADURA A  <sub>p.466</sub>

      FLEXIÓN EN VIGAS Y LOSAS EN UNA                            FLEXIÓN EN VIGAS Y LOSAS EN UNA
      DIRECCIÓN                                                  DIRECCIÓN


<a id="c24.3.1"></a>
### 24.3.1 La armadura con adherencia debe estar            C 24.3.1. Cuando las cargas de servicio llevan a tensiones  <sub>p.466</sub>

distribuida para controlar la fisuración en las zonas    elevadas en la armadura, deberían esperarse fisuras visibles
en tracción por flexión de losas y vigas no              y tomarse precauciones al detallar la armadura para
pretensadas, y pretensadas Clase C reforzadas para       controlar la fisuración. Por razones de durabilidad y
resistir flexión en una sola dirección.                  estética, son preferibles muchas fisuras muy finas que
                                                         pocas fisuras anchas. Las prácticas de detallado de la
                                                         armadura generalmente conducirán a un adecuado control
                                                         de la fisuración si se utiliza acero con fy = 420 MPa para
                                                         la armadura.

                                                         Los exhaustivos trabajos de laboratorio (Gergely and Lutz
                                                         1968; Kaar 1966; Base et al. 1966) realizados con barras
                                                         conformadas, confirmaron que el ancho de las fisuras
                                                         debidas a las cargas de servicio es proporcional a la tensión
                                                         en el acero. Se encontró que las variables significativas
                                                         afectadas por el detallado de la armadura son el espesor del
                                                         recubrimiento de hormigón y la separación de la armadura.

Reglamento CIRSOC 201-25                                                                                 Cap. 24 - 434


<!-- page 466 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                El ancho de fisura refleja inherentemente una amplia
                                                                dispersión, incluso en el trabajo cuidadoso de laboratorio,
                                                                y está influenciado por la contracción y otros efectos que
                                                                dependen del tiempo. El mejor control de fisuración se
                                                                obtiene cuando la armadura está bien distribuida en la zona
                                                                de máxima tracción en el hormigón. Varias barras con una
                                                                separación moderada son mucho más efectivas para
                                                                controlar la fisuración que una o dos barras de mayor
                                                                diámetro de área equivalente.


<a id="c24.3.2"></a>
### 24.3.2 La separación de la armadura con adherencia             C 24.3.2. La separación de la armadura se limita para  <sub>p.467</sub>

más cercana a la cara traccionada, no debe exceder              controlar la fisuración (Beeby 1979; Frosch 1999; ACI
los valores de la Tabla 24.3.2, donde cc es la menor            Committee 318 1999). Para el caso de una viga con
distancia desde la superficie de la armadura confor-            armadura de acero fy = 420 MPa, 50 mm de recubrimiento
mada o de pretensado, a la cara traccionada. La                 libre de la armadura principal y con fs = 280 MPa, la
tensión calculada en la armadura conformada, fs , y             separación máxima es 250 mm.
el cambio calculado en la tensión en la armadura de
pretensado con adherencia, fps , debe cumplir con              Los anchos de fisura en estructuras son muy variables. Los
los artículos 24.3.2.1 y 24.3.2.2, respectivamente.             requisitos actuales del Reglamento para separación
                                                                intentan limitar la fisuración superficial a un ancho que es
                                                                generalmente aceptable en la práctica, pero que puede
Tabla 24.3.2. Separación máxima de la armadura                  variar ampliamente dentro de una misma estructura.
con adherencia en vigas y losas en una dirección
pretensadas Clase C y no pretensadas                            La influencia de las fisuras en la corrosión es un tema
                                                                controvertido. Las investigaciones (Darwin et al. 1985;
                                                                Oesterle 1997) muestran que la corrosión no está
   Tipo de                                                      claramente relacionada con el ancho de las fisuras
                         Separación máxima, s , mm
  armadura
                                                                superficiales en los rangos de las tensiones normalmente
                                       280                      encontrados en la armadura a nivel de cargas de servicio.
                                  380 (     ) - 2,5cc
    Barras o                            fs                      Por esta razón, el Reglamento no hace distinción entre
                 Menor
    alambres
  conformados
                  de:                      280                  exposición interior y exterior.
                                      300 (     )
                                             fs
                                2         280                   Solamente la armadura de tracción más cercana a la cara
 Armadura de                   ( ) [380 (      ) - 2,5cc]       traccionada necesita ser considerada para seleccionar el
  pretensado     Menor          3        fps
                                                                valor de cc que se usa para calcular los requisitos de
      con         de:               2         280
  adherencia                      ( ) [300 (       )]           separación. Para armadura pretensada, por ejemplo,
                                    3         fps
                                                                cordones, los cuales poseen características de adherencia
  Combinación                   5         280                   menos efectivas que la armadura conformada, se aplica un
   de barras o                 ( ) [380 (      ) - 2,5cc]
                                6        fps                   factor de efectividad de dos tercios en la Tabla 24.3.2.
    alambres
 conformados y   Menor
  armadura de     de:              5         280                Para elementos postesados diseñados como elementos
   pretensado                     ( ) [300 (     )]
                                   6        fps                fisurados, en general, es ventajoso controlar la fisuración
       con
   adherencia                                                   mediante el uso de armadura conformada, para lo cual se
                                                                pueden usar los requisitos para barras y alambres
                                                                conformados de la Tabla 24.3.2. La armadura con
                                                                adherencia exigida por otras disposiciones de este
                                                                Reglamento también puede ser usada como armadura para
                                                                el control de la fisuración.


<a id="c24.3.2.1"></a>
### 24.3.2.1 La tensión calculada fs en la armadura                C 24.3.2.1. Para aplicaciones en las cuales el control de  <sub>p.467</sub>

conformada más cercana a la cara traccionada para               fisuración es crítico, el diseñador puede considerar reducir
cargas de servicio, debe obtenerse considerando el              el valor de fs para ayudar a controlar la fisuración.
momento no mayorado, o se debe permitir tomar fs
como (2/3) fy .


<a id="c24.3.2.2"></a>
### 24.3.2.2 La variación en la tensión, fps , en la              C 24.3.2.2. Es conservador considerar la tensión de des-  <sub>p.467</sub>

armadura de pretensado con adherencia, para                     compresión fdc igual a la tensión efectiva en el acero de
cargas de servicio, debe ser igual a la tensión                 pretensado, fse . El límite máximo de 250 MPa para fps
calculada considerando sección fisurada menos la                tiene la intención de hacerlo similar a la máxima tensión
tensión de descompresión fdc . Se puede considerar              admisible para la armadura de acero con fy = 420 MPa
fdc igual a la tensión efectiva en el acero de preten-          (fs = 280 MPa).   La exención para los elementos con fps


<!-- page 467 -->

                   REGLAMENTO                                                  COMENTARIO

sado fse . La magnitud de fps no debe exceder 250        menor a 140 MPa refleja que muchas estructuras diseñadas
MPa. Cuando fps es menor o igual a 140 MPa, no           usando métodos de tensiones de trabajo y con niveles bajos
                                                          de tensión se desempeñaron bien para las funciones para
hay necesidad de cumplir los requisitos de separa-
                                                          las cuales se diseñaron mostrando poca fisuración por
ción de la Tabla 24.3.2.
                                                          flexión.


<a id="c24.3.3"></a>
### 24.3.3 Si solo hay una barra con adherencia, cordón  <sub>p.468</sub>

pretesado o cordón con adherencia cerca de la cara
traccionada extrema, el ancho de la cara traccionada
extrema no debe exceder el valor de s determinado
de acuerdo con la Tabla 24.3.2.


<a id="c24.3.4"></a>
### 24.3.4 Si el ala de una viga T está traccionada, la      C 24.3.4. En una viga T, la distribución de la armadura  <sub>p.468</sub>

porción de la armadura traccionada por flexión, que       negativa para el control de la fisuración debería tener en
no esté localizada sobre el alma de la viga, debe         cuenta dos condiciones: 1) una separación grande de la
distribuirse dentro del menor valor entre el ancho        armadura en el ancho efectivo del ala puede provocar la
efectivo del ala como se define de acuerdo con el         formación de fisuras anchas en la losa cerca del alma, y 2)
artículo 6.3.2 y n / 10 . Si n / 10 controla, se debe   una separación pequeña en la vecindad del alma deja sin
colocar armadura longitudinal con adherencia adicio-      protección las zonas exteriores del ala. La limitación de un
nal, que cumpla con el artículo 24.4.3.1, en las zonas    décimo sirve para evitar que haya una separación muy
más externas del ala.                                     grande, al tiempo que aporta un poco de armadura
                                                          adicional necesaria para proteger las zonas más externas
                                                          del ala.

                                                          Para vigas T diseñadas para resistir momentos negativos
                                                          debido a cargas de gravedad y viento, toda la armadura de
                                                          tracción requerida para resistencia se coloca dentro del
                                                          menor valor entre el ancho efectivo de ala y n / 10 . La
                                                          práctica usual es colocar más de la mitad de la armadura
                                                          sobre el alma de la viga. Para vigas T que resistan combi-
                                                          naciones de carga que incluyan efectos sísmicos, dirigirse
                                                          al Reglamento INPRES-CIRSOC 103 - Parte II - 2026.


<a id="c24.3.5"></a>
### 24.3.5 La separación de la armadura con                  C 24.3.5. A pesar de que se han realizado numerosos  <sub>p.468</sub>

adherencia, sometida a flexión, en vigas y losas en       estudios, no se dispone de evidencia experimental clara
una dirección pretensadas Clase C y no preten-            respecto al ancho de fisura a partir del cual existe peligro
sadas, sometidas a fatiga, diseñadas para ser             de corrosión (ACI 222R). Las pruebas de exposición
impermeables o expuestas a un ambiente agresivo,          indican que la calidad del hormigón, la compactación
se debe seleccionar considerando investigaciones y        adecuada y el apropiado recubrimiento de hormigón,
precauciones especiales para esas condiciones y no        pueden ser más importantes para la protección contra la
debe exceder los límites dados en el artículo 24.3.2.     corrosión que el ancho de fisura en la superficie del
                                                          hormigón (Schießl and Raupach, 1997).

                                                          Los requisitos relacionados con un mayor recubrimiento de
                                                          hormigón y durabilidad del acero de armaduras se
                                                          encuentran en el artículo 20.5, y las relacionadas con la
                                                          durabilidad del hormigón se encuentran en el artículo 19.3.


<a id="c24.4"></a>
### 24.4 ARMADURA DE CONTRACCIÓN Y TEM-                      C 24.4. ARMADURA DE CONTRACCIÓN Y TEM-  <sub>p.468</sub>

      PERATURA                                                    PERATURA


<a id="c24.4.1"></a>
### 24.4.1 En losas estructurales en una dirección           C 24.4.1. Se requiere armadura de contracción y  <sub>p.468</sub>

donde la armadura a flexión se extiende en una sola       temperatura perpendicular a la armadura principal, para
dirección, se debe colocar armadura en dirección          minimizar la fisuración y con el fin de garantizar que la
perpendicular a la armadura de flexión para resistir      estructura actúe como se supone en el proyecto. Los
las tensiones debidas a contracción y temperatura,        requisitos de esta sección se refieren sólo a losas
de acuerdo con los artículos 24.4.3 y 24.4.4.             estructurales y no a las losas apoyadas sobre el terreno.


<a id="c24.4.2"></a>
### 24.4.2 Cuando los movimientos por contracción y          C 24.4.2. El área de armadura por contracción y  <sub>p.468</sub>

temperatura están restringidos, deben considerarse        temperatura requerida por el artículo 24.4.3.2 ha sido
                                                                                los movimientos por contracción y

Reglamento CIRSOC 201-25                                                                                 Cap. 24 - 436


<!-- page 468 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                temperatura no están restringidos. Cuando existan tabiques
                                                                estructurales o columnas que generen una restricción
                                                                significativa a los movimientos por contracción y tempera-
                                                                tura, la restricción a los cambios de volumen provoca
                                                                tracción en las losas y desplazamientos, esfuerzos de corte
                                                                y momentos en las columnas o tabiques. En estos casos
                                                                puede ser necesario incrementar la cantidad de armadura
                                                                de la losa requerida en el artículo 24.4.3.2 debido a la
                                                                contracción y los efectos térmicos en las dos direcciones
                                                                principales (PCI MNL 120; Gilbert, 1992). Tanto la
                                                                armadura inferior como la superior son efectivas para
                                                                controlar la fisuración. Las fajas de control dejadas durante
                                                                el período de construcción para permitir la contracción
                                                                inicial sin que se generen incrementos en las tensiones son
                                                                también efectivas para reducir la fisuración causada por la
                                                                restricción.

                                                                La capa superior de hormigón también sufre tracción
                                                                debido a la restricción del diferencial de contracción entre
                                                                el mismo y los elementos prefabricados o tableros
                                                                permanentes de acero (que no tienen contracción) la cual
                                                                debería ser considerada al armar la losa. Se deberían tener
                                                                en cuenta las demandas de deformación unitaria en la
                                                                armadura que cruza las juntas de elementos prefabricados,
                                                                donde ocurre la mayoría de la liberación del diferencial de
                                                                contracción.


<a id="c24.4.3"></a>
### 24.4.3 Armadura no pretensada                                  C 24.4.3. Armadura no pretensada  <sub>p.469</sub>



<a id="c24.4.3.1"></a>
### 24.4.3.1 La armadura conformada, empleada como  <sub>p.469</sub>

armadura de contracción y temperatura, debe
colocarse de acuerdo con el artículo 24.4.3.2 hasta
24.4.3.5.


<a id="c24.4.3.2"></a>
### 24.4.3.2 La cuantía de armadura conformada de                  C 24.4.3.2. La cuantía mínima para barras conformadas o  <sub>p.469</sub>

contracción y temperatura calculada con respecto al             armadura electrosoldada de alambre, calculada con
área bruta de hormigón debe ser mayor o igual a                 respecto al área bruta de hormigón de 0,0018 es empírica,
0,0018.                                                         pero se ha utilizado satisfactoriamente durante muchos
                                                                años. El área de armadura resultante puede distribuirse
                                                                cerca de la cara superior o inferior de la losa, o puede
                                                                localizarse entre las dos caras de la losa según se considere
                                                                apropiado para las condiciones específicas. Ediciones
                                                                anteriores del Reglamento permitían una reducción en la
                                                                armadura de contracción y temperatura con resistencias de
                                                                fluencia mayores de 420 MPa. No obstante, la mecánica de
                                                                fisuración sugiere que las resistencias a fluencia mayores
                                                                no conducen a ningún beneficio para el control de
                                                                fisuración. Si el ancho de las fisuras o el control de filtra-
                                                                ciones es un estado límite de diseño, se puede consultar el
                                                                ACI 224R o ACI 350 respecto a las cuantías recomendadas
                                                                hasta tanto se emita un documento al respecto.


<a id="c24.4.3.3"></a>
### 24.4.3.3 La separación de la armadura conformada  <sub>p.469</sub>

de contracción y temperatura no debe exceder el
menor de 5h y 450 mm.


<a id="c24.4.3.4"></a>
### 24.4.3.4 En todas las secciones donde se requiera,             C 24.4.3.4. Los empalmes y anclajes terminales de la  <sub>p.469</sub>

la armadura conformada de contracción y tempera-                armadura de contracción y temperatura deben diseñarse
tura debe ser capaz de desarrollar fy en tracción.              para desarrollar la resistencia a la fluencia especificada del
                                                                acero de armadura, de acuerdo con el Capítulo 25.


<!-- page 469 -->

                   REGLAMENTO                                                 COMENTARIO


<a id="c24.4.3.5"></a>
### 24.4.3.5 Para losas prefabricadas en una dirección y    C 24.4.3.5. En elementos de hormigón pretensado prefa-  <sub>p.470</sub>

paneles de muro prefabricados y pretensados en una       bricados, de ancho no mayor a 3,7 m, como losas
dirección, no se requiere la armadura de contracción     alveolares, losas macizas o losas con nervaduras poco
y temperatura en dirección perpendicular a la arma-      espaciadas, usualmente no se necesita colocar armadura
dura para flexión si se cumplen (a) hasta (c).           transversal para soportar tensiones de contracción y
                                                         variación de temperatura en la dirección corta. Esto es
(a) Los elementos prefabricados no son más anchos        también generalmente cierto para losas de entrepiso y
    que 3,7 m.                                           cubierta prefabricadas no pretensadas. El ancho de 3,7 m es
                                                         menor que aquel en el cual las tensiones por contracción y
(b) Los elementos prefabricados no están conecta-        variación de temperatura pueden alcanzar una magnitud
    dos mecánicamente como para causar una               que requiera armadura transversal. Adicionalmente, la
    restricción en la dirección transversal.             mayor parte de la contracción se produce antes de que los
                                                         elementos sean vinculados a la estructura. Una vez en la
(c) La armadura no se requiere para resistir tensio-     estructura final, usualmente, los elementos no están
    nes transversales de flexión.                        conectados en sentido transversal tan rígidamente como el
                                                         hormigón monolítico, y por esta razón las tensiones por
                                                         restricción transversal debidas a contracción y variación de
                                                         temperatura se reducen significativamente.

                                                         Esta excepción no aplica donde la armadura se requiere
                                                         para resistir tensiones de flexión como ocurre en alas
                                                         delgadas de vigas T sencillas y dobles.


<a id="c24.4.4"></a>
### 24.4.4 Armadura de pretensado                           C 24.4.4. Armadura de pretensado  <sub>p.470</sub>



<a id="c24.4.4.1"></a>
### 24.4.4.1 La armadura de pretensado, empleada            C 24.4.4.1. Los requisitos de armadura de pretensado se  <sub>p.470</sub>

como armadura de contracción y temperatura, debe         han seleccionado para aportar una fuerza efectiva a la losa,
cumplir con el artículo 20.3.2.2, y su tensión prome-    aproximadamente igual a la resistencia a la fluencia de la
dio de compresión mínima, después de las pérdidas,       armadura no pretensada de contracción y temperatura. Esta
debe ser al menos 0,7 MPa sobre el área bruta del        cantidad de armadura de pretensado con una tensión
hormigón.                                                promedio mínimo de 0,7 MPa sobre el área total del
                                                         hormigón, se ha utilizado exitosamente en un gran número
                                                         de proyectos.

                                                         Se deberían evaluar los efectos del acortamiento de la losa
                                                         para asegurar una acción apropiada. En la mayoría de los
                                                         casos, el bajo nivel de pretensado recomendado no debería
                                                         causar dificultades en una estructura detallada adecua-
                                                         damente. Puede requerirse atención especial cuando los
                                                         efectos térmicos o la restricción sean significativos.


<a id="c24.5"></a>
### 24.5 TENSIONES ADMISIBLES EN ELEMENTOS                  C 24.5. TENSIONES ADMISIBLES EN ELEMEN-  <sub>p.470</sub>

      DE HORMIGÓN PRETENSADOS SOMETI-                            TOS DE HORMIGÓN PRETENSADOS
      DOS A FLEXIÓN                                              SOMETIDOS A FLEXIÓN


<a id="c24.5.1"></a>
### 24.5.1 Generalidades                                    C 24.5.1. Generalidades  <sub>p.470</sub>



<a id="c24.5.1.1"></a>
### 24.5.1.1 Se deben limitar las tensiones en el           C 24.5.1.1. Las tensiones admisibles en el hormigón se  <sub>p.470</sub>

hormigón en elementos pretensados sometidos a            incluyeron para controlar el comportamiento en servicio,
flexión de acuerdo con los requisitos de los artículos   pero no para garantizar una resistencia estructural adecua-
24.5.2 hasta 24.5.4, a menos que se demuestre            da, la cual debería verificarse de acuerdo con otros
mediante ensayos o análisis que no se perjudica el       requisitos del Reglamento.
comportamiento.
                                                         Este Reglamento contiene un procedimiento por medio del
                                                         cual los límites de las tensiones no inhiban el desarrollo de
                                                         nuevos productos, materiales y técnicas de construcción de
                                                         hormigón pretensado. La aprobación del diseño debería
                                                         cumplir con el artículo 1.4 del Reglamento.


<a id="c24.5.1.2"></a>
### 24.5.1.2 En el cálculo de las tensiones en la etapa  <sub>p.470</sub>

de transferencia del pretensado, bajo cargas de

Reglamento CIRSOC 201-25                                                                                 Cap. 24 - 438


<!-- page 470 -->

                          REGLAMENTO                                                 COMENTARIO

servicio y en el estado correspondiente a cargas de
fisuración, se debe emplear la teoría elástica
cumpliendo con las hipótesis (a) y (b).

(a) Las deformaciones unitarias varían linealmente
    con la distancia al eje neutro de acuerdo con el
    artículo 22.2.1.

(b) En secciones fisuradas el hormigón no resiste
    tracción.


<a id="c24.5.2"></a>
### 24.5.2 Clasificación de los elementos preten-            C 24.5.2. Clasificación de los elementos pretensados  <sub>p.471</sub>

              sados sometidos a flexión                                   sometidos a flexión


<a id="c24.5.2.1"></a>
### 24.5.2.1 Los elementos pretensados sometidos a                 C 24.5.2.1. Se definen tres clases de comportamiento de  <sub>p.471</sub>

flexión deben clasificarse como Clase U, Clase T o              los elementos pretensados sometidos a flexión. Para los
Clase C de acuerdo con la Tabla 24.5.2.1, en                    elementos de la Clase U se supone un comportamiento
función de ft ,correspondiente a la tensión calculada           como elementos no fisurados. Para los elementos Clase C
en la fibra traccionada extrema en la zona tracciona-           se supone un comportamiento como elementos fisurados.
da precomprimida, calculada para cargas de servicio,            El comportamiento de los elementos de Clase T se supone
suponiendo la sección como no fisurada.                         como una transición entre los fisurados y los no fisurados.
                                                                Estas clases aplican a elementos sometidos a flexión con
                                                                pretensado con adherencia y sin adherencia pero, para los
Tabla 24.5.2.1. Clasificación de los elementos                  sistemas de losas pretensadas en dos direcciones, se
pretensados sometidos a flexión basada en ft                    requiere que sean diseñadas como Clase U con
                                                                 ft ≤ 0,5√f´c .
 Comportamiento
                           Clase         Límites de ft          Los requisitos de comportamiento en servicio para cada
    supuesto
                                                                clase se resumen en la Tabla C 24.5.2.1. A los efectos de
         No fisurado        U [1]         ft ≤ 0,62√f´c         una comparación, la Tabla C 24.5.2.1 también contiene los
       Transición entre                                         requisitos correspondientes para elementos no pretensados.
        fisurado y no        T         0,62√f´c < ft ≤ √f´c     Debido a la ausencia de compatibilidad de deformaciones
           fisurado
                                                                unitarias, no es congruente incluir el área de armadura de
          Fisurado           C               ft > √f´c          pretensado sin adherencia en el cálculo de propiedades de
 [1]    Los sistemas de losas pretensadas en dos direcciones    la sección bruta o fisurada, pero la fuerza efectiva de
        deben ser diseñadas como Clase U con ft ≤ 0,5√f´c .     pretensado debería considerarse para determinar la
                                                                ubicación del eje neutro. Así mismo, en el cálculo de las
                                                                propiedades de la sección debería considerarse el área de
                                                                vacíos creados por las envolturas o vainas para la armadura
                                                                de pretensado sin adherencia. Un procedimiento para eva-
                                                                luar tensiones, flechas y control de fisuración en elementos
                                                                pretensados fisurados, se presenta en Mast (1998).

                                                                La zona precomprimida traccionada es la porción de un
                                                                elemento pretensado donde ocurre tracción por flexión,
                                                                bajo cargas permanentes y sobrecargas no mayoradas,
                                                                calculada utilizando las propiedades de la sección bruta,
                                                                como si la fuerza de pretensado no estuviera presente. El
                                                                hormigón pretensado se diseña generalmente de manera
                                                                que la fuerza de pretensado introduzca compresión en
                                                                dicha zona, reduciendo efectivamente la magnitud de la
                                                                tensión de tracción.

                                                                En ambientes corrosivos, definidos como un ambiente en
                                                                el cual ocurre ataque químico (tal como el proveniente de
                                                                agua marina, atmósferas industriales corrosivas o gases de
                                                                alcantarillados) la fisuración bajo cargas de servicio se
                                                                vuelve crítica a los efectos del desempeño a largo plazo.
                                                                Para estas condiciones, deberían incrementarse el
                                                                recubrimiento de hormigón de acuerdo con el artículo
                                                                20.5.1.4 y las tensiones de tracción reducirse para
                                                                minimizar una posible fisuración bajo cargas de servicio.


<!-- page 471 -->

                          REGLAMENTO                                                         COMENTARIO

                                                           Tabla C 24.5.2.1. Requisitos de diseño comportamiento en servicio

                                                                   Pretensado
                                                                                                                No pretensado
                                              Clase U                Clase T               Clase C
                                                                Transición entre no
  Comportamiento supuesto                    No fisurado                                   Fisurado                 Fisurado
                                                                fisurado y fisurado
  Propiedades de la sección para
                                           Sección bruta           Sección bruta       Sección fisurada
  calcular las tensiones bajo cargas de                                                                        No hay requisitos
                                             24.5.2.2                24.5.2.2             24.5.2.3
  servicio
  Tensión admisible en la transferencia        24.5.3                 24.5.3                24.5.3             No hay requisitos
  Tensión de compresión admisible
                                               24.5.4                 24.5.4           No hay requisitos       No hay requisitos
  basado en la sección no fisurada
  Tensión a tracción bajo cargas de
  servicio 24.5.2.1                          ≤ 0,62√f´c         0,62√f´c < ft ≤ √f´c   No hay requisitos       No hay requisitos
                                                                 24.2.3.9, 24.2.4.2    24.2.3.9, 24.2.4.2      24.2.3, 24.2.4.1
                                          24.2.3.8, 24.2.4.2
  Base para el cálculo de las flechas                            Sección fisurada,     Sección fisurada,      Momento de inercia
                                            Sección bruta
                                                                      bilineal              bilineal               efectivo
  Control de fisuración                   No hay requisitos      No hay requisitos           24.3                      24.3
  Cálculo de fps o fs para el control                                                   Análisis de        M / (As × brazo de palanca)
                                                 ---                    ---
  de fisuración                                                                        sección fisurada              ó (2/3) fy
  Armadura superficial                    No hay requisitos      No hay requisitos          9.7.2.3                  9.7.2.3


<a id="c24.5.2.2"></a>
### 24.5.2.2 Para los elementos Clase U y Clase T, se  <sub>p.472</sub>

permite calcular las tensiones para cargas de servicio
usando la sección no fisurada.


<a id="c24.5.2.3"></a>
### 24.5.2.3 Para los elementos Clase C, las tensiones                   C 24.5.2.3. Los elementos pretensados se clasifican según  <sub>p.472</sub>

bajo cargas de servicio se deben calcular usando la                   la magnitud de la tensión en la zona precomprimida
sección transformada fisurada.                                        sometida a tracción, calculada suponiendo que la sección
                                                                      se mantiene sin fisurar. Una vez que se ha determinado que
                                                                      un elemento es Clase C, con ft > √f´c , se permite
                                                                      calcular las tensiones para cargas de servicio usando la
                                                                      sección transformada fisurada.


<a id="c24.5.3"></a>
### 24.5.3 Tensiones admisibles en el hormigón                           C 24.5.3. Tensiones admisibles en el hormigón después  <sub>p.472</sub>

        después de la aplicación del pretensado                                 de la aplicación del pretensado

                                                                      En esta etapa, las tensiones en el hormigón son causadas
                                                                      por el peso del elemento y la fuerza en el acero de
                                                                      pretensado, después del gateo, reducida por las pérdidas
                                                                      debidas al asentamiento del anclaje y el acortamiento
                                                                      elástico del hormigón. Generalmente, la contracción, la
                                                                      fluencia lenta y los efectos de relajación no se incluyen en
                                                                      esta etapa. Estas tensiones se aplican tanto al hormigón
                                                                      pretesado como al postesado, con las modificaciones
                                                                      adecuadas para las pérdidas durante la transferencia.


<a id="c24.5.3.1"></a>
### 24.5.3.1 Las tensiones en la fibra comprimida                        C 24.5.3.1. Las tensiones a compresión admisibles en la  <sub>p.472</sub>

extrema calculadas inmediatamente después de la                       transferencia son mayores en los extremos de los
aplicación del pretensado, antes de que ocurran las                   elementos simplemente apoyados que en otras ubicaciones;
pérdidas de pretensado que dependen del tiempo, no                    esto se basa en la investigación y en las prácticas
deben exceder los límites de la Tabla 24.5.3.1.                       industriales del hormigón prefabricado y pretensado
                                                                      (Castro et al., 2004; Dolan and Krohn (2007); Hale and
                                                                      Russell (2006)).

Reglamento CIRSOC 201-25                                                                                                  Cap. 24 - 440


<!-- page 472 -->

                     REGLAMENTO                                                      COMENTARIO

Tabla 24.5.3.1. Límites para las tensiones a com-
presión en el hormigón después de la aplicación
del pretensado

                                  Límite de la tensión de
         Ubicación
                                       compresión
 En los extremos de elementos
                                           0,70 f´ci
    simplemente apoyados
     En otras ubicaciones                  0,60 f´ci


<a id="c24.5.3.2"></a>
### 24.5.3.2 Las tensiones de tracción calculadas inme-            C 24.5.3.2. Los límites de las tensiones a tracción de  <sub>p.473</sub>

diatamente después de la aplicación del pretensado,              0,25√f´ci y 0,5√f´ci se refiere a tensiones de tracción
antes de las pérdidas de pretensado que dependen                que se localizan fuera de la zona traccionada
del tiempo, no deben exceder los límites de la Tabla            precomprimida. Cuando las tensiones de tracción exceden
24.5.3.2, excepto en lo que se permite en el artículo           los valores admisibles, se puede calcular la fuerza total en
24.5.3.2.1.                                                     la zona de tensiones de tracción y se puede diseñar la
                                                                armadura considerando esta fuerza, para una tensión de
                                                                0,6 fy , pero no mayor de 210 MPa. Los efectos de la
Tabla 24.5.3.2. Límites para las tensiones de                   fluencia lenta y contracción comienzan a reducir la tensión
tracción en el hormigón después de la aplicación                de tracción casi inmediatamente, no obstante, algo de
del pretensado, sin armadura adicional con adhe-                tracción permanece en esta zona después de que han
rencia en la zona traccionada                                   ocurrido todas las pérdidas del pretensado.

                                 Límite de la tensión de
       Ubicación
                                tracción en el hormigón
    En los extremos de
  elementos simplemente                 0,5√f´ci
         apoyados
   En otras ubicaciones                 0,25√f´ci


<a id="c24.5.3.2.1"></a>
### 24.5.3.2.1 Se permite exceder los límites de la Tabla  <sub>p.473</sub>

24.5.3.2 cuando se coloca armadura adicional con
adherencia, en la zona traccionada para resistir la
fuerza total de tracción en el hormigón, calculada
bajo la hipótesis de sección no fisurada.


<a id="c24.5.4"></a>
### 24.5.4 Tensiones admisibles en el hormigón                     C 24.5.4. Tensiones admisibles en el hormigón sometido  <sub>p.473</sub>

        sometido a compresión bajo cargas de                              a compresión bajo cargas de servicio
        servicio


<a id="c24.5.4.1"></a>
### 24.5.4.1 En elementos pretensados sometidos a                  C 24.5.4.1. El límite para la tensión a compresión se  <sub>p.473</sub>

flexión Clases U y T, las tensiones en el hormigón              estableció de manera conservadora en 0,45 f´c para
bajo cargas de servicio, después de que han ocurrido            disminuir la probabilidad de falla de elementos de
todas las pérdidas de pretensado, no deben exceder              hormigón pretensado debido a cargas repetidas. Este límite
los límites de la Tabla 24.5.4.1.                               parece razonable para evitar deformaciones excesivas por
                                                                fluencia lenta bajo compresión. A valores de tensión
                                                                mayores, las deformaciones unitarias por fluencia lenta
Tabla 24.5.4.1. Límite para las tensiones de                    tienden a incrementarse más rápidamente de lo que se
compresión bajo cargas de servicio                              incrementa la tensión aplicada.

                              Límite de la tensión a            Los ensayos de fatiga realizados en vigas de hormigón
  Condición de carga                                            pretensado han demostrado que las fallas por compresión
                            compresión en el hormigón
  Pretensado más cargas
                                                                del hormigón no constituyen un criterio de control. Por lo
    permanentes en el                   0,45 f´c                tanto, el límite de tensiones de 0,60 f´c permite un incre-
          tiempo                                                mento de un tercio en la tensión admisible a compresión
  Pretensado más todas
                                        0,60 f´c                para elementos sometidos a cargas transitorias.
        las cargas
                                                                La sobrecarga sostenida en el tiempo es cualquier porción
                                                                de la sobrecarga de servicio que se mantendrá por un
                                                                período suficiente  para generar flechas significativas


<!-- page 473 -->

                   REGLAMENTO                       COMENTARIO

                                dependientes del tiempo. Así, cuando las cargas
                                permanentes y sobrecargas sostenidas en el tiempo son un
                                porcentaje alto de la carga de servicio total, el límite de
                                0,45f´c de la Tabla 24.5.4.1 puede controlar la verifi-
                                cación. Por otra parte, cuando una parte apreciable de la
                                carga de servicio total consiste en una sobrecarga de
                                servicio transitoria o temporal, el límite de tensión
                                incrementado de 0,60 f´c controla la verificación.

                                El límite a la tensión de compresión de 0,45 f´c para
                                pretensado más cargas de larga duración continuará
                                controlando el comportamiento a largo plazo de elementos
                                pretensados.

Reglamento CIRSOC 201-25                                                      Cap. 24 - 442


<!-- page 474 -->

                    REGLAMENTO                                                      COMENTARIO
