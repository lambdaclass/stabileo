# CIRSOC 201 (2025) — CAPÍTULO 5. CARGAS

> Source: `CIRSOC 201-2025.pdf` · PDF pages 119–124
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c5.1"></a>
### 5.1 ALCANCE  <sub>p.119</sub>


Este capítulo debe aplicarse para la selección de las
combinaciones y factores de carga empleados en el
diseño, exceptuando lo que se permite en el
Capítulo 27.


<a id="c5.2"></a>
### 5.2 GENERALIDADES                                                    C 5.2. GENERALIDADES  <sub>p.119</sub>



<a id="c5.2.1"></a>
### 5.2.1 Las cargas deben incluir el peso propio, las                   C 5.2.1. Las disposiciones de este Reglamento se deben  <sub>p.119</sub>

cargas aplicadas y los efectos debidos al pretensado,                 utilizar con las cargas permanentes y sobrecargas mínimas
las restricciones a los cambios de volumen y los                      de diseño especificadas en el Reglamento CIRSOC 101-
asentamientos diferenciales.                                          2025 y con las cargas debidas al sismo, al viento y a la
                                                                      nieve, indicadas en los Reglamentos INPRES-CIRSOC
                                                                      103 - Parte II - 2026, CIRSOC 102-2025 y CIRSOC 104-
                                                                      2026, respectivamente. Estos Reglamentos, con excepción
                                                                      del INPRES-CIRSOC 103 - Parte II - 2026, han sido
                                                                      desarrollados en base al ASCE/SEI 7-10.


<a id="c5.2.2"></a>
### 5.2.2 Las estructuras sometidas a acciones sísmicas  <sub>p.119</sub>

se deben diseñar de acuerdo con las prescripciones
establecidas en el Reglamento INPRES-CIRSOC
103 - Parte II - 2026.


<a id="c5.2.3"></a>
### 5.2.3 Se permiten reducciones de sobrecarga de  <sub>p.119</sub>

acuerdo con el CIRSOC 101-2025.


<a id="c5.3"></a>
### 5.3 COMBINACIONES Y FACTORES DE CARGA                             C 5.3. COMBINACIONES              Y     FACTORES         DE  <sub>p.119</sub>

                                                                             CARGA


<a id="c5.3.1"></a>
### 5.3.1 La resistencia requerida U debe ser por lo                     C 5.3.1. La resistencia requerida U se expresa en términos  <sub>p.119</sub>

menos igual al efecto de las cargas mayoradas de la                   de cargas mayoradas. Las cargas mayoradas son las cargas
Tabla 5.3.1, con las excepciones y adiciones de los                   especificadas en el CIRSOC 101-25 multiplicadas por los
artículos 5.3.3 hasta 5.3.13.                                         factores de carga apropiados. Si los efectos de las cargas,
                                                                      tales como fuerzas y momentos internos, están
                                                                      relacionados linealmente con las cargas, la resistencia
Tabla 5.3.1. Combinaciones de carga                                   requerida U puede expresarse en términos de los efectos de
                                                                      las cargas multiplicado por el factor de carga apropiado
                                                                      con el mismo resultado. Si los efectos de las cargas están
                                                          Carga
       Combinación de carga                  Ecuación                 relacionados con las cargas de forma no lineal, tal como
                                                         primaria
                                                                      los efectos P-delta en una estructura (Rogowsky and
                U = 1,4D                      (5.3.1a)       D
                                                                      Wight, 2010) las cargas se mayoran antes de determinar
    U = 1,2D + 1,6L + 0,5(Lr o S o R)         (5.3.1b)       L        sus efectos. La práctica usual para el diseño de fundaciones
U = 1,2D + 1,6(Lr o S o R) + (1,0L o 0,5W)    (5.3.1c)   Lr o S o R   se describe en el artículo C 13.2.6.1. El análisis no lineal
U = 1,2D + 1,0W + 1,0L + 0,5(Lr o S o R)      (5.3.1d)      W
                                                                      por medio de elementos finitos utilizando casos de cargas
                                                                      mayoradas se discute en el artículo C 6.9.3.
       U = 1,2D + 1,0E + 1,0L + 0,2S          (5.3.1e)       E
             U = 0,9D + 1,0W                  (5.3.1f)      W         El factor asignado a cada carga está influenciado por el
             U = 0,9D + 1,0E                  (5.3.1g)       E        grado de precisión con el cual normalmente se puede
                                                                      calcular la carga y por las variaciones esperadas para dicha
                                                                      carga durante la vida de la estructura. Por esta razón, a las
                                                                      cargas permanentes que se determinan con mayor precisión
                                                                      y son menos variables se les asigna un factor de carga más
                                                                      bajo que a las sobrecargas. Los factores de carga también
                                                                      toman en cuenta variabilidades inherentes del análisis
                                                                      estructural empleado para calcular los momentos y cortes.


<!-- page 119 -->

                   REGLAMENTO                                              COMENTARIO

                                                      El Reglamento presenta factores de carga para
                                                      combinaciones específicas de cargas. En cierta medida, se
                                                      toma en consideración la probabilidad de la ocurrencia
                                                      simultánea al asignar factores a las combinaciones de
                                                      carga. Aunque las combinaciones de cargas más usuales
                                                      están incluidas, el proyectista no debe suponer que estén
                                                      cubiertos todos los casos.

                                                      Debe darse la debida consideración al signo (positivo o
                                                      negativo) en la determinación de U en las combinaciones
                                                      de carga, dado que un tipo de carga puede producir efectos
                                                      en sentido opuesto al de los producidos por otro tipo. Las
                                                      combinaciones de carga con 0,9D están específicamente
                                                      incluidas para el caso en el cual una carga permanente más
                                                      alta reduce los efectos de otras cargas. Esta condición de
                                                      carga puede ser crítica también para columnas controladas
                                                      por tracción. En dicho caso, una reducción de la carga
                                                      axial de compresión y desarrollo de tracción, con o sin, un
                                                      incremento del momento puede producir una combinación
                                                      critica de carga más desfavorable.

                                                      Deben considerarse las diversas combinaciones de carga
                                                      con el fin de determinar la condición de diseño crítica. Esto
                                                      resulta particularmente cierto cuando la resistencia
                                                      depende de más de un efecto de carga, tal como la
                                                      resistencia a flexión y carga axial combinadas, o la
                                                      resistencia a corte, en elementos con carga axial.

                                                      Si algunas circunstancias inusuales requieren mayor
                                                      confiabilidad en la resistencia de algún elemento en
                                                      particular, distinta de aquella que se encuentra en la
                                                      práctica habitual, puede resultar apropiada para dichos
                                                      elementos una disminución en los factores de reducción de
                                                      resistencia  o un aumento en los factores de carga
                                                      estipulados.

                                                      El factor de carga por lluvia R en las ecuaciones (5.3.1b),
                                                      (5.3.1c) y (5.3.1d) debería responder por todas las posibles
                                                      acumulaciones de agua. Las cubiertas se deberían diseñar
                                                      con suficiente pendiente o contraflecha con el fin de
                                                      asegurar un drenaje adecuado debiendo considerarse
                                                      cualquier flecha adicional a largo plazo de la cubierta
                                                      debido a las cargas permanentes. Si la deformación de los
                                                      elementos de cubierta pueda originar acumulación de agua,
                                                      y esta a su vez producir incrementos en la deformación y
                                                      mayor acumulación de agua, el diseño de la cubierta
                                                      debería asegurar que este proceso se autolimite en algún
                                                      punto.

                                                      Con respecto a las combinaciones que incluyen la acción
                                                      sísmica se debe consultar el Reglamento INPRES-
                                                      CIRSOC 103 - Parte II - 2026.


<a id="c5.3.2"></a>
### 5.3.2 Debe investigarse el efecto de una o más  <sub>p.120</sub>

cargas que no actúen simultáneamente.


<a id="c5.3.3"></a>
### 5.3.3 Se permite reducir a 0,5 el factor de          C 5.3.3. La modificación al factor de carga de este  <sub>p.120</sub>

sobrecarga L en las ecuaciones (5.3.1c), (5.3.1d) y   requisito es diferente a las reducciones de sobrecarga
(5.3.1e), excepto para (a), (b) o (c):                basadas en el área cargada que permite el CIRSOC 101-25.
                                                      La reducción de sobrecarga, basada en el área de carga,
(a) Estacionamientos.                                 ajusta la sobrecarga nominal (L0 en el CIRSOC 101-25) a

Reglamento CIRSOC 201-25                                                                                Cap. 5 - 88


<!-- page 120 -->

                    REGLAMENTO                                                       COMENTARIO

                                                                L. La reducción de sobrecarga, como se especifica en el
(b) Áreas definidas       como     lugares    de   reunión      CIRSOC 101-25, puede ser usada en combinación con el
    pública.                                                    factor de carga 0,5 especificado en este requisito.

(c) En todas las áreas donde L sea mayor a
    5 kN/m2.


<a id="c5.3.4"></a>
### 5.3.4 Cuando corresponda, L debe incluir (a) hasta  <sub>p.121</sub>

(f):

(a) Sobrecargas concentradas.

(b) Cargas vehiculares.

(c) Cargas de puente grúas.

(d) Cargas de pasamanos, guardarrail y sistemas de
    barrera vehicular.

(e) Efectos de impacto.

(f)   Efectos de vibración.


<a id="c5.3.5"></a>
### 5.3.5 Cuando W defina las cargas de viento a nivel             C 5.3.5. En el CIRSOC 102-05, las cargas de viento están  <sub>p.121</sub>

de servicio, debe utilizarse 1,6W en vez de 1,0W en             definidas para el nivel de diseño de servicio, y un factor de
las ecuaciones (5.3.1d) y (5.3.1f), y 0,8W en vez del           carga para viento de 1,6 es apropiado para ser utilizado en
0,5W en la ecuación (5.3.1c).                                   las ecuaciones (5.3.1d) y (5.3.1f) y un factor de carga de
                                                                0,8 es apropiado para ser utilizado en la ecuación (5.3.1c).
                                                                El nuevo proyecto CIRSOC 102-25 prescribe las cargas de
                                                                viento al nivel de cálculo por resistencia y por lo tanto el
                                                                factor de carga para fuerzas de viento es la unidad (1,0).
                                                                Las velocidades básicas de viento para el nivel de diseño
                                                                de resistencia se definen basándose en una ráfaga de viento
                                                                de 3 segundos a 10 m sobre el nivel del terreno, para la
                                                                categoría de exposición C, con un intervalo medio de
                                                                recurrencia de 300, 700 y 1700 años, dependiendo de la
                                                                categoría de riesgo de la estructura. Los factores de carga
                                                                más altos en el artículo 5.3.5 se aplican cuando se utilizan
                                                                para el cálculo de cargas de viento a nivel de servicio,
                                                                correspondientes a un intervalo medio de recurrencia de 50
                                                                años.


<a id="c5.3.6"></a>
### 5.3.6 Los efectos estructurales de las fuerzas                 C 5.3.6. Existen varias estrategias para tener en cuenta  <sub>p.121</sub>

debidas a las restricciones por cambios de volumen y            movimientos causados por cambios volumétricos y
asentamiento diferencial, T, deben considerarse en              asentamientos diferenciales. Las restricciones de estos
combinación con otras cargas cuando los efectos de              movimientos pueden inducir fuerzas y momentos
T puedan afectar adversamente la seguridad                      significativos en los elementos, como tracción en losas, y
estructural o el desempeño de la estructura. El factor          momentos y esfuerzos de corte en los elementos verticales.
de carga para T debe establecerse considerando la               Las fuerzas debidas a efectos T rutinariamente no se
incertidumbre asociada con la magnitud esperada de              calculan ni combinan con otros efectos. Los proyectistas
T, la probabilidad de que el máximo efecto ocurra               prefieren usar técnicas que han funcionado bien en el
simultáneamente con otras cargas aplicadas, y las               pasado como es el uso de elementos y conexiones dúctiles
consecuencias potencialmente adversas en caso de                que se acomoden al asentamiento diferencial y al
que el efecto T sea mayor que el supuesto. El factor            movimiento causado por cambios volumétricos,
de carga de T no puede ser menor que la unidad                  suministrando al mismo tiempo la resistencia requerida
(1,0).                                                          para las cargas gravitacionales y laterales. Para limitar los
                                                                efectos de los cambios volumétricos se utilizan juntas de
                                                                expansión y fajas de control que se han desempeñado
                                                                adecuadamente en estructuras similares. La armadura de
                                                                contracción y temperatura generalmente se determina
                                                                considerando el área de la sección bruta de hormigón y no
                                                                según fuerzas calculadas.


<!-- page 121 -->

                   REGLAMENTO                                                COMENTARIO

                                                         Cuando los movimientos de la estructura puedan producir
                                                         daño en elementos de baja ductilidad, el cálculo de la
                                                         fuerza estimada debería tener en cuenta la variabilidad
                                                         inherente del movimiento esperado y de la respuesta de la
                                                         estructura.

                                                         Un estudio a largo plazo sobre los cambios volumétricos
                                                         en estructuras prefabricadas (Klein and Lindenberg, 2009),
                                                         contiene recomendaciones de procedimientos para tener en
                                                         cuenta la rigidez de las conexiones, la exposición térmica,
                                                         el ablandamiento de los elementos debido a la deformación
                                                         diferida y otros factores que influyen en las fuerzas T.

                                                         Fintel et al. (1986) presenta información sobre las
                                                         magnitudes de los efectos de los cambios volumétricos en
                                                         estructuras altas y recomienda procedimientos para incluir
                                                         las fuerzas resultantes de esos efectos en el diseño.


<a id="c5.3.7"></a>
### 5.3.7 Cuando la carga de fluidos F esté presente,  <sub>p.122</sub>

debe incluirse en las ecuaciones de combinación de
carga del artículo 5.3.1 de acuerdo con lo indicado en
(a), (b), (c) o (d):

(a) Cuando F actúa sola o incremente los efectos de
    D, se debe incluir con un factor de carga de 1,4
    en la ecuación (5.3.1a).

(b) Cuando F incremente la carga primaria, se debe
    incluir con un factor de carga de 1,2 en las
    ecuaciones (5.3.1b) hasta (5.3.1e).

(c) Cuando el efecto de F sea permanente y
    contrarreste la carga primaria, se debe incluir
    con un factor de carga de 0,9 en la ecuación
    (5.3.1g).

(d) Cuando el efecto de F no es permanente, pero
    cuando está presente contrarresta el efecto de la
    carga primaria, F no se debe incluir en las
    ecuaciones (5.3.1a) hasta (5.3.1g).


<a id="c5.3.8"></a>
### 5.3.8 Cuando el empuje lateral del suelo, H, esté       C 5.3.8. El factor de carga requerido para presión lateral  <sub>p.122</sub>

presente, se debe incluir en las combinaciones de        proveniente del empuje del suelo, agua en el suelo y otros
carga del artículo 5.3.1, con factores de carga que se   materiales refleja su variabilidad y la posibilidad que el
ajusten a lo indicado en (a), (b), o (c):                material pueda ser removido. El comentario del CIRSOC
                                                         101-25 incluye una discusión muy útil con respecto a los
(a) Cuando H actúe solo o incremente el efecto de        factores de carga para H.
    otras cargas, debe incluirse con un factor de
    carga de 1,6.

(b) Cuando el efecto de H sea permanente y
    contrarreste el efecto de la carga primaria,
    deberá incluirse con un factor de carga de 0,9.

(c) Cuando el efecto de H no es permanente, pero
    cuando está presente contrarresta el efecto de la
    carga primaria, no se debe incluir H.


<a id="c5.3.9"></a>
### 5.3.9 Cuando una estructura esté ubicada en una         C 5.3.9. Cuando el emplazamiento de una obra se ubique  <sub>p.122</sub>

zona inundable, el Proyectista o Diseñador               en una zona sujeta a inundación, se recomienda que el
Estructural deberá evaluar y definir las cargas          Proyectista o Diseñador Estructural consulte sobre la

Reglamento CIRSOC 201-25                                                                                  Cap. 5 - 90


<!-- page 122 -->

                    REGLAMENTO                                                       COMENTARIO

debidas a inundación y las combinaciones de carga               frecuencia e intensidad del fenómeno para adoptar los
correspondientes hasta tanto se emita un documento              recaudos pertinentes, hasta tanto se pueda desarrollar en el
específico que las contemple.                                   CIRSOC, un mapa de riesgo de inundación en la
                                                                Argentina, similar al desarrollado en el documento
                                                                ASCE/SEI 7-10.


<a id="c5.3.10"></a>
### 5.3.10 Cuando una estructura esté sujeta a  <sub>p.123</sub>

esfuerzos provocados por cargas de hielo
atmosférico se deberán utilizar las cargas de hielo y
las combinaciones de carga correspondientes,
especificadas en el Reglamento CIRSOC 104-2026.


<a id="c5.3.11"></a>
### 5.3.11 La resistencia requerida U debe incluir los             C 5.3.11. Para estructuras estáticamente indeterminadas,  <sub>p.123</sub>

efectos internos debidos a las reacciones inducidas             los momentos debidos a las reacciones inducidas por las
por el pretensado con un factor de carga de 1,0.                fuerzas de pretensado, algunas veces llamados momentos
                                                                secundarios, pueden ser importantes (Bondy, 2003; Lin
                                                                and Thornton, 1972; Collins and Mitchell, 1997).


<a id="c5.3.12"></a>
### 5.3.12 En el diseño de áreas de anclaje de                     C 5.3.12. El factor de carga 1,2 para la máxima fuerza  <sub>p.123</sub>

postesado, se debe aplicar un factor de carga de 1,2            aplicada por el gato al cordón da como resultado una carga
a la fuerza máxima del gato de tesado.                          de proyecto de aproximadamente un 113 % de la
                                                                resistencia especificada a la fluencia del acero de
                                                                pretensado, pero no mayor a 96 % de la resistencia
                                                                nominal a tracción del acero de pretensado. Esto se
                                                                compara bien con la máxima resistencia del anclaje, la cual
                                                                es al menos 95 % de la resistencia nominal a tracción de la
                                                                armadura de pretensado.


<a id="c5.3.13"></a>
### 5.3.13 Los factores de carga para los efectos de  <sub>p.123</sub>

pretensado utilizados con el método de puntal tensor
deben incluirse en las ecuaciones de combinación de
carga del artículo 5.3.1 de acuerdo con (a) o (b):

(a) Debe aplicarse un factor de carga de 1,2 a los
    efectos del pretensado donde los efectos del
    pretensado aumenten la fuerza neta en los
    puntales o tensores.

(b) Se debe aplicar un factor de carga de 0,9 a los
    efectos del pretensado donde éstos reducen la
    fuerza neta en los puntales o los tensores.


<!-- page 123 -->

                   REGLAMENTO    COMENTARIO

Reglamento CIRSOC 201-25                            Cap. 5 - 92


<!-- page 124 -->

                    REGLAMENTO                                                        COMENTARIO
