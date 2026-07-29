# INPRES-CIRSOC 103 Parte I (2018) — CAPÍTULO 8. ANÁLISIS ESTRUCTURAL

> Source: `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` · PDF pages 79–86
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c8.0"></a>
### 8.0 SIMBOLOGÍA  <sub>p.79</sub>


 Cd       factor de amplificación de deformaciones.

 CE       coeficiente de estabilidad.

 Es       módulo de deformación dinámica del suelo.

 Pk       carga gravitatoria total operante sobre el nivel k, incluido éste.

 R        factor de reducción.

 Se       solicitaciones para acción en estado elástico.

 Su       solicitaciones últimas reducidas obtenidas según este Reglamento.

 Vk       esfuerzo de corte en el nivel k.

 Vn       resistencia lateral de piso.

 Vni      resistencia nominal a corte del elemento i.

 Wi       carga gravitatoria operante en el nivel i.

 Yk       distancia de la construcción al eje medianero o al eje de la junta sísmica en el nivel
          k.

 Yke      distancia del eje de junta sísmica a la construcción existente en el nivel k.

 debk     máximo desplazamiento horizontal elástico de borde del nivel k de la construcción.

 dubk     desplazamiento horizontal último del nivel k, medido en el borde más desfavorable
          de la construcción.

 hk       altura del nivel o piso k medida desde el nivel de referencia.

 hsk      altura del nivel o piso k, comprendida entre los niveles k y k–1.

 n        número de niveles o masas.

  β       relación entre el corte de diseño y la capacidad a corte en los elementos ubicados
          entre el nivel k y el nivel k-1.

 ∆sk      diferencia entre desplazamientos horizontales correspondiente a cabeza y pie del
          nivel k, medidos en el borde más desfavorable de la construcción.
  r      factor de riesgo.
         coeficiente de amplificación por efecto P-D.

Reglamento INPRES-CIRSOC 103, Parte I                                                     Cap. 8 - 61


<!-- page 79 -->


<a id="c8.1"></a>
### 8.1 MÉTODOS DE ANÁLISIS ESTRUCTURAL  <sub>p.80</sub>


La estructura debe ser considerada, en general, como un conjunto espacial sometido a las
acciones determinadas según los distintos métodos mencionados en la sección 2.7. Se
admitirá el empleo de modelos bidimensionales si la estructura presenta doble simetría e
irregularidad torsional baja (renglón 1a, Tabla 2.3).


<a id="c8.1.1"></a>
### 8.1.1 Análisis elástico lineal  <sub>p.80</sub>


Se debe considerar la rigidez de la sección fisurada en el caso de materiales no
homogéneos (hormigón armado o mampostería), según lo establecido en las Partes II y III
de este Reglamento. Se admite una redistribución del corte de hasta un 30% entre los
elementos del sistema estructural, manteniendo el equilibrio.


<a id="c8.1.2"></a>
### 8.1.2 Otros métodos  <sub>p.80</sub>


Se aceptan otros métodos para el análisis estructural. En ese caso el proyectista debe
presentar una justificación de los procedimientos y de la interpretación de los resultados a
satisfacción de la Autoridad de Aplicación.


<a id="c8.2"></a>
### 8.2 MODELACIÓN ESTRUCTURAL  <sub>p.80</sub>



<a id="c8.2.1"></a>
### 8.2.1 Deformabilidad de los diafragmas  <sub>p.80</sub>


Se debe considerar la deformabilidad de los diafragmas, excepto en los casos establecidos
en 8.2.1.1. o en 8.2.1.2. para los que se admite la simplificación de no considerar la
influencia de la deformabilidad de los diafragmas. La condición de los diafragmas y el modo
de evaluar su deformabilidad deben constar específicamente en la memoria de la estructura.
En cualquier caso se deben cumplir también las condiciones constructivas establecidas en
las partes II, III y IV de este Reglamento.


<a id="c8.2.1.1"></a>
### 8.2.1.1 Diafragma rígido  <sub>p.80</sub>


Se aceptará considerar al diafragma como idealmente rígido si cumple simultáneamente:

a) El diafragma tiene forma de polígono convexo que puede inscribirse en un rectángulo de
relación de lados máxima 1:3.

b) Presenta entrantes (formas L, T, H, E, etc.) con dimensiones inferiores al 25% de la
longitud del lado paralelo del rectángulo que circunscribe la planta. En construcciones de
hasta 3 niveles el límite se extiende al 30%.

c) Los huecos o perforaciones (patios, escaleras, ascensores, etc.) con las siguientes
condiciones:


<!-- page 80 -->

       El área máxima de la suma de los huecos es 1/10 del área de la planta.

       La dimensión sumada de todos los huecos máxima en una dirección es 1/3 de la
        dimensión paralela de la planta en esa dirección.

       Cualquier hueco está separado de los bordes de la planta o de otros huecos como
        mínimo 1/4 de la dimensión de la planta en esa dirección.

       Dos o más huecos separados entre sí menos de 1/6 de la dimensión paralela de la
        planta o 1/2 de la dimensión del hueco menor serán considerados una única
        perforación a los fines de esta sección. Para la aplicación de esta disposición los
        huecos de forma irregular se podrán considerar rectángulos de dimensiones
        proporcionales a la relación de dimensiones paralelas del hueco equivalente.


<a id="c8.2.1.2"></a>
### 8.2.1.2 Diafragma totalmente flexible  <sub>p.81</sub>


El diafragma puede considerarse totalmente flexible si la máxima deflexión horizontal propia
excede el doble del promedio de los desplazamientos relativos (del nivel) de los dos
elementos verticales que menos se desplazan. Las deformaciones se calcularán para las
fuerzas sísmicas correspondientes. En ese caso, cada uno de los elementos verticales se
diseñaran para las acciones correspondientes a su área de influencia y no se considerarán
torsiones.


<a id="c8.2.2"></a>
### 8.2.2 Deformabilidad del suelo  <sub>p.81</sub>


Para construcciones de los grupos Ao, A se deberá considerar la influencia de la
deformabilidad del suelo y de las fundaciones en el modelo de análisis. El proyectista puede
considerar esta influencia en cualquier otro caso. Para estimar la influencia de la
deformabilidad del suelo se deben tomar valores del módulo de deformación del mismo para
acciones instantáneas correspondientes a condiciones dinámicas, Es. En las fundaciones
profundas se debe tomar en cuenta la interacción horizontal del suelo. Los métodos a utilizar
para evaluar la deformabilidad del suelo deben fundarse en principios aceptados de la
mecánica de suelos y deben ser fundamentados por el proyectista.

Las solicitaciones a considerar, cuando el análisis incluye la deformabilidad del suelo deben
ser iguales o mayores que el 85% de las solicitaciones obtenidas considerando la base fija.


<a id="c8.3"></a>
### 8.3 PARTICULARIDADES ESTRUCTURALES  <sub>p.81</sub>



<a id="c8.3.1"></a>
### 8.3.1 Influencia de las irregularidades estructurales  <sub>p.81</sub>



<a id="c8.3.1.1"></a>
### 8.3.1.1 Irregularidades extremas en planta o en altura  <sub>p.81</sub>


Las estructuras con irregularidad torsional extrema (línea 1c de la Tabla 2.3) y/o con
irregularidad de rigidez extrema (línea 1c de la Tabla 2.4), deben ser rediseñadas de manera

Reglamento INPRES-CIRSOC 103, Parte I                                              Cap. 8 - 63


<!-- page 81 -->

que presenten irregularidad torsional y de rigidez media o baja en los casos que se indican a
continuación:
                      En las zonas 3 y 4 para los destinos Ao, A y B,

                      En las zonas 0, 1 y 2 para el destino Ao.


<a id="c8.3.1.2"></a>
### 8.3.1.2 Discontinuidad de componentes en elementos sismorresistentes verticales  <sub>p.82</sub>


Los componentes que soportan otros elementos discontinuos deben diseñarse para las
solicitaciones que resultan de agotar la capacidad de los elementos interrumpidos.

Se deben aplicar los principios del diseño por capacidad para determinar dichas
solicitaciones de acuerdo con las partes II, III y IV de este Reglamento. Cuando sea
necesario se utilizará el factor de sobrerresistencia 0 de la Tabla 5.1.

Se admite también el estudio del mecanismo de plastificación local que incluya la
transferencia de todos los esfuerzos resistidos por el elemento interrumpido.


<a id="c8.3.1.3"></a>
### 8.3.1.3 Discontinuidad fuera del plano de elementos sismorresistentes  <sub>p.82</sub>


Todos los componentes estructurales involucrados en la transferencia de esfuerzos
provocados por la discontinuidad, incluido el diafragma, deben verificarse para la
combinación más desfavorable de las solicitaciones propias y de las derivadas de la
transferencia de esfuerzos.

Adicionalmente se debe verificar que la relación demanda-capacidad del nivel en que aparece
la discontinuidad es como mínimo el 90% de dicha relación en el nivel inmediato superior.


<a id="c8.3.1.4"></a>
### 8.3.1.4 Piso débil  <sub>p.82</sub>


Los componentes que producen la discontinuidad de rigidez o resistencia deben ser
diseñados en condición elástica. Por lo tanto las solicitaciones reducidas obtenidas a partir
de los Capítulos 6 y 7, deberán ser corregidas según:
                                                    Su R
                                            Se                                         [8.1]
                                                    1,5
Excepción: La condición anterior no se aplica a estructuras de hasta 2 pisos si la
resistencia lateral del nivel inferior es al menos 65% de la resistencia lateral del nivel
superior.

Para justificar la clasificación de la regularidad de resistencia en altura (Tabla 2.4, línea 5a),
la resistencia lateral es la suma de las resistencias de todos los componentes verticales del
piso.

                                            Vn   Vni                                  [8.2]


<!-- page 82 -->

El proyectista debe presentar un estudio del mecanismo de plastificación para evaluar la
resistencia lateral. Alternativamente se admite la determinación de Vni según los
procedimientos indicados en las partes II, III o IV de este Reglamento.


<a id="c8.3.2"></a>
### 8.3.2 Sistemas o componentes estructurales no considerados parte de la estructura  <sub>p.83</sub>

       sismorresistente

Los componentes o sistemas cuya participación en la resistencia para acciones sísmicas
fuera considerada despreciable u omitida por cualquier motivo pero que forman parte de
sistemas resistentes para otras acciones, deben ser verificados para las solicitaciones
inducidas por la deformación de la estructura. En particular se debe verificar que el
componente en cuestión es capaz de soportar la deformación última impuesta sin perder
estabilidad y manteniendo su capacidad para el propósito al que está destinado.


<a id="c8.3.3"></a>
### 8.3.3 Componentes o sistemas considerados no estructurales  <sub>p.83</sub>


Se deben comprobar las posibles influencias desfavorables de la interacción entre
componentes o elementos considerados no estructurales y los elementos o componentes
estructurales, durante la deformación de la construcción por las acciones sísmicas.


<a id="c8.3.4"></a>
### 8.3.4 Influencia de rellenos en pórticos  <sub>p.83</sub>



<a id="c8.3.4.1"></a>
### 8.3.4.1 Pórticos con relleno sin interferencias  <sub>p.83</sub>


Sólo se podrán prescindir de la influencia de los rellenos de mampostería cuando estén
diseñados de modo que permitan la libre deformación del pórtico sin interferencias. Los
rellenos, sus vínculos y en particular su estabilidad lateral se deberán verificar conforme al
Capítulo 10.


<a id="c8.3.4.2"></a>
### 8.3.4.2 Pórticos con rellenos con interferencias  <sub>p.83</sub>


Cuando los rellenos interfieran con la estructura principal, el conjunto estructural deberá
analizarse con y sin la presencia de los rellenos y será diseñada para la envolvente de
ambas situaciones. En las zonas próximas a los nudos de las piezas concurrentes se debe
comprobar la capacidad a corte para soportar los esfuerzos que provoque la acción del
relleno.


<a id="c8.3.5"></a>
### 8.3.5 Entrepisos sin vigas  <sub>p.83</sub>


Sólo se admiten como diafragmas. No se permiten como parte del sistema sismorresistente
principal.

Reglamento INPRES-CIRSOC 103, Parte I                                                 Cap. 8 - 65


<!-- page 83 -->


<a id="c8.4"></a>
### 8.4 DEFORMACIONES  <sub>p.84</sub>



<a id="c8.4.1"></a>
### 8.4.1 Control de la regularidad estructural  <sub>p.84</sub>


En cada dirección en estudio se determinarán los desplazamientos horizontales en los
bordes más alejados y su promedio en cada nivel para verificar las condiciones de
regularidad en planta según 2.6.1, aplicando la excentricidad accidental requerida.


<a id="c8.4.2"></a>
### 8.4.2 Control de la distorsión horizontal de piso en las construcciones edilicias  <sub>p.84</sub>


Se ajustará a lo indicado para cada método o procedimiento: método estático (Cap. 6),
procedimiento modal espectral o de respuesta lineal en el tiempo (Cap.7).


<a id="c8.4.3"></a>
### 8.4.3 Comprobación de las condiciones de regularidad en altura  <sub>p.84</sub>


Las distorsiones de los pisos sucesivos se emplearán para verificar las condiciones de
regularidad en altura supuestas según 2.6.2.


<a id="c8.4.4"></a>
### 8.4.4 Efecto P- Delta (Efecto de 2° orden)  <sub>p.84</sub>


Corresponden a las solicitaciones y deformaciones adicionales provocadas por las cargas
gravitatorias sobre la estructura deformada por las acciones sísmicas.


<a id="c8.4.4.1"></a>
### 8.4.4.1 Consideración del efecto P-Delta  <sub>p.84</sub>


Los efectos P-Delta deberán tomarse en cuenta en las deformaciones y solicitaciones en los
componentes cuando en algún nivel el coeficiente de estabilidad CE verifique la siguiente
condición:
                                                    Pk sk  r
                                            CE                ≥0 ,10                  [8.3]
                                                    Vk hsk Cd
                                                               n
Con                                                 Pk   Wi                          [8.4]
                                                              i k

Cuando el valor del coeficiente de estabilidad CE supera el valor máximo dado por la
expresión 8.5, la estructura es potencialmente inestable y debe ser rediseñada.
                                                             0.5
                                            CEMÁX                 0 ,25               [8.5]
                                                              Cd

Donde β es la relación entre el corte de diseño y la capacidad a corte en los elementos
ubicados entre el nivel k y el nivel k-1. En forma conservadora se admite tomar   1,0 .


<a id="c8.4.4.2"></a>
### 8.4.4.2 Evaluación de los efectos P-Delta  <sub>p.84</sub>


Cuando el coeficiente de estabilidad CE sea mayor que 0.10 pero menor o igual que CEMÁX
el factor incremental relativo a los efectos P-D sobre los desplazamientos y solicitaciones en
los componentes deberá ser determinado por medio de un análisis racional.


<!-- page 84 -->

En forma alternativa se admite la forma simplificada de considerar los efectos P-Delta
mediante la amplificación las deformaciones y los esfuerzos por el coeficiente de
amplificación siguiente:
                                                  1,0
                                                                                   [8.6]
                                              ( 1,0 - CE )


<a id="c8.4.5"></a>
### 8.4.5 Efectos de martilleo, separaciones y juntas sísmicas  <sub>p.85</sub>


Para controlar los efectos de impacto entre construcciones adyacentes o entre cuerpos
estructuralmente independientes de una misma construcción, se deberán proyectar y
construir separaciones y juntas sísmicas de ancho suficiente.


<a id="c8.4.5.1"></a>
### 8.4.5.1 Separación entre construcciones nuevas y existentes  <sub>p.85</sub>


Toda nueva construcción deberá proyectarse y construirse separada de las construcciones
existentes.

Excepción: Se permitirá la continuidad de las construcciones adyacentes cuando se cumpla
simultáneamente:

a) El conjunto estudiado como una única estructura espacial satisface todos los
requerimientos del Reglamento.

b) La vinculación entre ambas construcciones tiene la capacidad necesaria para soportar las
acciones resultantes de la unión.

c) Los niveles de los diafragmas horizontales difieren hasta el 30% del canto del
componente vertical más débil en la dirección de la unión.

d) Los períodos propios de las construcciones adyacentes (supuestas independientes)
difieren hasta el 15%.


<a id="c8.4.5.2"></a>
### 8.4.5.2 Separación de una construcción en bloques  <sub>p.85</sub>


Las construcciones irregulares en planta o elevación se proyectarán como cuerpos regulares
por medio de separaciones sísmicas que deben cumplir lo indicado en 8.4.5.3, salvo que se
compruebe satisfactoriamente la posibilidad de funcionamiento conjunto y se apliquen los
procedimientos correspondientes de acuerdo a 2.7. No es necesario prolongar las juntas o
separaciones por debajo del nivel de suelo (fundaciones) si éstas tienen por objeto la
separación dinámica de las construcciones.


<a id="c8.4.5.3"></a>
### 8.4.5.3 Dimensionamiento de separaciones y juntas sísmicas  <sub>p.85</sub>


La distancia Yk de la construcción al eje medianero o al eje de la junta sísmica en cada nivel
deberá cumplir simultáneamente las condiciones siguientes:

Reglamento INPRES-CIRSOC 103, Parte I                                               Cap. 8 - 67


<!-- page 85 -->

                      a)     Yk  1,05d ubk                                     [8.7]

                      b)     Yk  2 ,5cm                                        [8.8]

En el caso de construcciones existentes, se define como eje de la junta sísmica a
una línea que dista de dicha construcción:

                      c)     Yke  2 ,5 cm                                      [8.9]

                      d)     Yke  1,05d ubke                                   [8.10]

El subíndice “e” indica “existente”. En sustitución de la evaluación de los
desplazamientos de la construcción existente se aceptará:

                      e)     Yke  0 ,025hk                                     [8.11]

El desplazamiento dubk es el máximo desplazamiento horizontal último de borde del nivel k
de la construcción, reducido por r.

                              dubk  Cd d ebk /  r                             [8.12]


<!-- page 86 -->
