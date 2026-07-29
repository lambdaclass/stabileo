# CIRSOC 102 (2025) — CAPÍTULO 6. PROCEDIMIENTO DE TÚNEL DE VIENTO

> Source: `CIRSOC 102-2025.pdf` · PDF pages 227–236
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c6.1"></a>
### 6.1 ALCANCE                                                      C 6.1. ALCANCE  <sub>p.227</sub>


El procedimiento de túnel de viento será usado                    El ensayo en túnel de viento se debe usar cuando una
donde sea necesario según los artículos 2.1.3, 4.1.3              estructura presenta cualquiera de las características
o 5.1.3. Se puede utilizar el procedimiento de túnel              definidas en los artículos 2.1.3, 4.1.3, 5.1.3, C.1.3, o
de viento para cualquier edificio o estructura en lugar           cuando el diseñador estructural desea determinar con
de los procedimientos de diseño especificados en el               mayor exactitud las cargas de viento. Para algunas formas
Capítulo 2 (SPRFV para edificios de todas las                     de edificios el ensayo en túnel de viento evita adoptar un
alturas y edificios de diafragma simple con h ≤ 10 m),            criterio excesivamente conservador, que está implícito en
Capítulo 4 (SPRFV para todas las demás                            las envolventes de cargas de viento inherentes a los
estructuras), y Capítulo 5 (componentes y                         procedimientos de los Capítulos 2, 4, 5 y Apéndice C.
revestimientos para todos los tipos de edificios y                También el ensayo en túnel de viento permite modelar los
otras estructuras).                                               efectos del entorno inmediato y determinar con mayor
                                                                  exactitud las cargas de viento para un edificio de forma
                                                                  compleja, que los procedimientos de los Capítulos 2 a 5.
                                                                  Es el propósito de este reglamento que el ensayo en túnel
                                                                  de viento se permita usar en cualquier edificio u otra
                                                                  estructura para determinar las cargas de viento.

                                                                  Diseño asistido por base de datos

                                                                  Hay investigadores que desarrollaron bases de datos de
                                                                  resultados en túneles de viento que contienen registros de
                                                                  presiones medidas sincrónicamente en gran cantidad de
                                                                  ubicaciones sobre la superficie exterior de modelos de
                                                                  edificios, por ejemplo, Simiu y asoc (2003), y Main and
                                                                  Fritz (2006). Tales bases de datos incluyen información
                                                                  que permite a un diseñador estructural determinar, sin
                                                                  ensayos específicos en túnel de viento, fuerzas y momentos
                                                                  inducidos por el viento sobre el SPRFV y C&R de tamaños
                                                                  y formas seleccionadas de edificios. Un conjunto de tales
                                                                  bases de datos de dominio público, registrados en ensayos
                                                                  llevados a cabo en la Universidad de Western Ontario (Ho
                                                                  y asoc, 2005; St. Pierre y asoc, 2005) para edificios con
                                                                  cubiertas de dos pendientes está disponible en el National
                                                                  Institute of Standards and Technology, NIST).
                                                                  www.nist.gov/wind.

                                                                  Se restringe el uso de bases de datos a aquellas que se
                                                                  hayan obtenido usando metodología de ensayo que cumpla
                                                                  con los requisitos para ensayos en túnel de viento
                                                                  especificados en este Capítulo 6.

Nota para el usuario: el Capítulo 6 siempre se puede utilizar en la obtención de las presiones de viento sobre
SPRFV y/o sobre C&R de cualquier edificio u otra estructura.
Se considera que este método produce las presiones de viento más precisas que cualquier otro método
especificado en este Reglamento.


<a id="c6.2"></a>
### 6.2 CONDICIONES DE ENSAYO                                        C 6.2. CONDICIONES DE ENSAYO  <sub>p.227</sub>


Los ensayos en túnel de viento o ensayos similares                Hasta tanto el INTI-CIRSOC disponga de un documento
empleando fluidos distintos del aire, usados para la              específico para ensayos en túnel de viento se dan los
obtención de cargas de viento de diseño para                      lineamientos mínimos en el artículo 6.2. En el caso de que
cualquier edificio, otra estructura, partes de la                 los ensayos en túnel de viento cumplan con la norma
estructura o componentes se llevarán a cabo de                    ASCE 49 se considerarán satisfechos los requisitos del
acuerdo con este capítulo.                                        artículo 6.2.


<!-- page 227 -->

                   REGLAMENTO                                                   COMENTARIO

Hasta tanto el INTI-CIRSOC publique un documento           Es práctica común recurrir a los ensayos en túnel de viento
específico, los ensayos en túnel de viento para la         cuando se requieren datos de diseño para las siguientes
obtención de fuerzas y presiones medias, fluctuantes       cargas inducidas por viento:
y pico, deben cumplir con los requerimientos que se
indican a continuación:                                    1.   Presiones resultantes de geometrías irregulares en
                                                                muros cortina.
a.   La capa límite atmosférica natural ha sido            2.   Cargas transversales al viento y/o de torsión.
     modelada para tener en cuenta la variación de la      3.   Cargas periódicas causadas por desprendimiento de
     velocidad del viento con la altura.                        vórtices.
                                                           4.   Cargas resultantes de inestabilidades, tales como
b.   Las escalas pertinentes de macro longitud                  flameo o galope.
     (integral) y micro longitud de la componente
     longitudinal de la turbulencia atmosférica están      Los túneles de viento de capa límite capaces de desarrollar
     modeladas aproximadamente a la misma escala           flujos que cumplen con las condiciones estipuladas en el
     que la usada para modelar el edificio u otra          artículo 6.2 por lo general tienen las dimensiones de la
     estructura.                                           sección de ensayo en el orden de 2 m de ancho y altura, y
                                                           una longitud de 8 veces esa medida. Las velocidades de
c.   El edificio u otra estructura modelada y las          viento máximas están comúnmente en el intervalo de 10 a
     estructuras y topografía circundantes son             45 m/s. El túnel de viento puede ser de circuito abierto o de
     geométricamente similares a sus contrapartes          circuito cerrado, sin preferencia por uno u otro tipo.
     en escala natural, excepto que, para edificios de
     baja altura que reúnan los requisitos del artículo    Comúnmente se usan tres tipos básicos de modelos de
     2.1.2, se permitirán ensayos para el edificio         ensayo en túnel de viento. Éstos se designan:
     modelado en un único sitio de exposición tal
     como se define en el artículo 1.7.3.                  1.   modelo de presión rígido (PM),
                                                           2.   modelo rígido con balanza de alta frecuencia en la
d.   El área proyectada del edificio u otra estructura y        base (H-FBBM),
     alrededores modelados es menor que el 8 % del         3.   modelo aeroelástico (AM).
     área de la sección transversal de ensayo a
     menos que se haga una corrección por bloqueo.         Se puede emplear uno o más de los modelos para obtener
                                                           cargas de diseño para un dado edificio o estructura. El PM
e.   Se ha tenido en cuenta el gradiente de presión        provee presiones para el diseño de C&R y para la
     longitudinal en la sección de ensayo del túnel de     determinación de cargas globales.
     viento.
                                                           El H-FBBM mide cargas fluctuantes totales (admitancia
f.   Los efectos del número de Reynolds sobre las          aerodinámica) para la determinación de respuestas
     presiones y las fuerzas están minimizados.            dinámicas. Cuando el movimiento de un edificio o
                                                           estructura influye en la carga de viento, se emplea el AM
g.   Las características de respuesta del instrumental     para la medición directa de cargas totales, desviaciones y
     del túnel de viento son consistentes con las          aceleraciones.
     mediciones requeridas.
                                                           Cada uno de estos modelos, junto con un modelo del
                                                           entorno (modelo de proximidad), puede proveer
                                                           información adicional a las cargas de viento, tales como
                                                           cargas de nieve sobre cubiertas complejas, datos de viento
                                                           para evaluar el impacto ambiental sobre peatones, y
                                                           concentraciones de emisiones contaminantes del aire para
                                                           la determinación del impacto ambiental. Varias referencias
                                                           dan guía e información detallada para la determinación de
                                                           cargas de viento y otros tipos de datos de diseño mediante
                                                           ensayos en túnel de viento (Cermak, 1977; Reinhold, 1982;
                                                           ASCE, 1999; y Boggs and Peterka, 1989).


<a id="c6.3"></a>
### 6.3 RESPUESTA DINÁMICA  <sub>p.228</sub>


Los ensayos realizados con el propósito de obtener
la respuesta dinámica de un edificio, otra estructura,
partes de una estructura o componentes deben
respetar los requisitos del artículo 6.2. El modelo
estructural y el análisis asociado deben tener en
cuenta la distribución de masa, rigidez y

Reglamento CIRSOC 102-25                                                                                    Cap. 6 - 210


<!-- page 228 -->

                     REGLAMENTO                                                       COMENTARIO

amortiguamiento.


<a id="c6.4"></a>
### 6.4 EFECTOS DE CARGA ESPECÍFICOS DEL                         C 6.4. EFECTOS DE CARGA ESPECÍFICOS DEL  <sub>p.229</sub>

         SITIO PARA EDIFICIOS, OTRAS ESTRUC-                             SITIO PARA EDIFICIOS, OTRAS ESTRUC-
         TURAS Y COMPONENTES                                             TURAS Y COMPONENTES

Cuando se realicen ensayos en túnel de viento para
establecer los efectos de carga en edificios, otras
estructuras, partes de estructuras y componentes, los
resultados serán únicamente aplicables para el
emplazamiento específico considerado en el estudio,
a menos que se apliquen las prescripciones del
artículo 6.5. Los ensayos deben cumplir los
requerimientos de los artículos 6.2 y 6.3.


<a id="c6.4.1"></a>
### 6.4.1 Intervalos de recurrencia media de los                  C 6.4.1. Intervalos de recurrencia media de los efectos  <sub>p.229</sub>

          efectos de carga                                                 de carga

El efecto de carga requerido por el Diseño por                    En la literatura se describen ejemplos de métodos de
Resistencia se debe obtener para el mismo intervalo               análisis para combinar datos direccionales del túnel de
de recurrencia media que corresponde a la categoría               viento con los datos direccionales meteorológicos o los
de riesgo definida en el artículo 1.14, utilizando un             modelos probabilísticos, al respecto ver Lepage and Irwin
método de análisis racional, definido en la bibliografía          (1985), Rigato y asoc (2001), Isyumov y asoc (2003),
reconocida, para combinar los datos direccionales                 Irwin y asoc (2005), Simiu and Filliben (2005) y Simiu and
del túnel de viento con los datos direccionales                   Miyata (2006).
meteorológicos o modelos probabilísticos basados en
ellos.

Para edificios que son sensibles a posibles
variaciones en los valores de los parámetros
dinámicos, se necesitarán estudios de esa
sensibilidad para aportar una base racional a las
recomendaciones de diseño.

Para la evaluación de requisitos de comportamiento
en servicio, solamente, el efecto de la carga de
viento se podrá calcular para velocidades asociadas
a intervalos de recurrencia media menores.


<a id="c6.4.2"></a>
### 6.4.2 Limitaciones a las velocidades de viento                   C 6.4.2. Limitaciones a las velocidades de viento  <sub>p.229</sub>


Las velocidades de viento y las estimaciones                      El artículo 6.4.2 especifica que los métodos estadísticos
probabilísticas basadas en ellas están sujetas a las              usados para analizar datos históricos de dirección y
limitaciones descriptas en el artículo 1.5.3.                     velocidades de viento para estudios en túnel de viento
                                                                  deben estar sujetos a las mismas limitaciones especificadas
                                                                  en el artículo 1.5.3 que se aplica al Método Analítico.


<a id="c6.4.3"></a>
### 6.4.3 Direccionalidad del viento                                 C 6.4.3. Direccionalidad del viento  <sub>p.229</sub>


No se permiten variaciones de la velocidad básica de              La variabilidad de la velocidad del viento determinada para
viento con la dirección a menos que el análisis para              intervalos de azimut particulares es más grande que aquella
velocidades de viento satisfaga los requisitos de este            de la velocidad de viento determinada sin tener en cuenta
artículo.                                                         la dirección de viento (Isyumov y asoc., 2013).
                                                                  Consecuentemente las cargas de viento y los efectos
La direccionalidad del viento, basada en datos                    inducidos por el viento determinados modelando la
registrados o simulados, se podrá considerar para                 direccionalidad de viento son inherentemente menos
obtener las cargas de viento y los datos deben ser                precisos. Actualmente hay en uso varios métodos para
presentados como parte del reporte a la Autoridad                 combinar datos de modelos en túnel de viento con datos de
Jurisdiccional. El método para combinar los datos del             velocidad y dirección de viento en el sitio de
modelo con la información de velocidad y dirección                emplazamiento (Isyumov y asoc., 2013; Yeo and Simiu,
del viento en el sitio del proyecto será claramente               2011; Simiu, 2011).


<!-- page 229 -->

                   REGLAMENTO                                                   COMENTARIO

indicado en el reporte. Se debe considerar la
variación en la velocidad del viento, basada en la         Cualquiera sea el método usado, debe ser cuidadosamente
incertidumbre de los datos climáticos, al calcular las     descripto para permitir el escrutinio por parte del diseñador
cargas de viento; la carga de viento de diseño debe        y por parte de la autoridad jurisdiccional. Un abordaje
estar basada en los mayores valores que resulten de        frecuente para tratar con las incertidumbres en las
esta incertidumbre.                                        direcciones de viento es rotar la distribución de
                                                           velocidades de viento asociadas a las distintas direcciones
No se requiere considerar la incertidumbre en la           en relación a la orientación del edificio o estructura. Esta
dirección del viento para la obtención de efectos          rotación de la distribución de viento en el emplazamiento
relacionados con el comportamiento en servicio.            del edificio busca asegurar que las cargas de viento
                                                           determinadas para el diseño no sean subestimadas, y no
                                                           debe soslayarse, independientemente del método usado
                                                           para llegar a las velocidades de viento de diseño. La
                                                           magnitud apropiada de la rotación varía dependiendo de la
                                                           calidad y resolución de los datos de viento direccionales en
                                                           el emplazamiento del proyecto.

                                                           Atendiendo a las dificultades para acceder a datos
                                                           climatológicos locales de calidad en Argentina para aplicar
                                                           a estudios de direccionalidad, CIRSOC 102 dispone
                                                           considerar la misma velocidad básica para todas las
                                                           direcciones, a menos que esté garantizada la calidad de los
                                                           datos climatológicos.


<a id="c6.4.4"></a>
### 6.4.4 Limitaciones en las cargas                          C 6.4.4. Limitaciones en las cargas  <sub>p.230</sub>


Las cargas para el sistema principal resistente a la       Los ensayos en túnel de viento con frecuencia miden
fuerza del viento obtenidas mediante ensayos en            cargas de viento que son significativamente menores que
túnel de viento se deben limitar de forma que las          las requeridas por los Capítulos 1 al 5 debido a la forma
cargas principales totales en las direcciones x e y no     del edificio, la probabilidad de que las velocidades más
sean menores que el 80 % de aquellas que se                altas de viento ocurran en direcciones donde los
obtendrían de la Parte 1 del Capítulo 2 o el Capítulo      coeficientes de presión o forma del edificio sean menores
4.                                                         que sus valores máximos, edificios específicos incluidos en
                                                           un modelo de proximidad detallado que pueden proveer
La carga principal total se debe basar en el momento       protección en exceso respecto de la implicada por las
de vuelco para edificios flexibles y en el corte en la     categorías de exposición, y el necesario criterio
base para otros edificios. La carga principal total para   conservador al envolver los coeficientes de carga
otras estructuras se debe basar en el momento de           contenidos en las Tablas y Figuras de los restantes
vuelco para estructuras flexibles y en el corte en la      capítulos.
base para estructuras que no califiquen como
flexibles.                                                 En algunos casos, las estructuras adyacentes pueden
                                                           proteger la estructura lo suficiente como para que la
Las presiones para componentes y revestimientos            remoción de una o dos estructuras pudiera incrementar
obtenidas    mediante      simulación física  o            significativamente las cargas de viento. La realización de
computacional se deben limitar a no menos que el           ensayos adicionales en túnel de viento sin edificios
80 % de aquellas calculadas para Zona 4 para               cercanos específicos (o con edificios agregados si éstos
paredes y Zona 1 para cubiertas usando el                  pudieran causar cargas incrementadas debidas a
procedimiento del Capítulo 5.                              canalización o flameo) es un método efectivo para
                                                           determinar la influencia de edificios adyacentes.
Estas Zonas se refieren a aquellas mostradas en las
Figuras 5.3-1, 5.3-2A-F, 5.3-3, 5.3-4, 5.3-5A-B,           Por esta razón, el reglamento limita la reducción que se
5.3-6, 5.4-1, 5.5-1, 5.5-2, 5.5-3.                         puede aceptar a partir de los ensayos en túnel de viento al
                                                           80 % de los resultados obtenidos del Capítulo 2, del
Los valores límites del 80 % se pueden reducir a           Capítulo 5, o del Apéndice C, en un caso general. Para
50 % para el sistema principal resistente a la fuerza      reducciones mayores se distinguen dos casos dependiendo
del viento y 65 % para componentes y revestimientos        de si el modelo de proximidad del túnel de viento incluyera
si se aplica cualquiera de las siguientes condiciones:     cualquier edificio u otros objetos con influencia específica
                                                           que, a juicio del ingeniero de vientos con experiencia,
• No hay edificios u objetos con influencia                tengan una probable influencia substancial en los
  específica dentro del modelo de proximidad               resultados, más allá de aquellas características del medio
  detallada.                                               circundante general.

Reglamento CIRSOC 102-25                                                                                    Cap. 6 - 212


<!-- page 230 -->

                     REGLAMENTO                                                        COMENTARIO

• Los resultados de los ensayos incluyen las cargas               Si no hay tales edificios u objetos el límite es 50 % para
  y presiones obtenidas con el modelo de                          SPRFV y 65 % para C&R.
  proximidad que contenga edificios u objetos con
  influencia específica y las cargas y presiones                  Si hay tales edificios u objetos, se pueden ejecutar ensayos
  obtenidas de ensayos suplementarios para todas                  suplementarios para cuantificar su efecto sobre los
  las direcciones significativas de viento en las                 resultados originales y justificar un límite más bajo que 80
  cuales los edificios u objetos con influencia                   %, quitándolos del modelo de proximidad detallado y
  específica son reemplazados por la rugosidad                    reemplazándolos con la rugosidad del terreno característica
  representativa de la condición de rugosidad                     consistente con la rugosidad adyacente. Un edificio u
  adyacente, pero no más rugoso que la exposición                 objeto con influencia específica es aquel que sobresale
  B.                                                              muy por encima de sus alrededores, o está inusualmente
                                                                  cerca al edificio en estudio, o puede de otra manera causar
                                                                  un efecto de protección substancial o una magnificación de
                                                                  las cargas de viento. Cuando estos resultados de ensayos
                                                                  suplementarios se incluyen con los resultados originales,
                                                                  los resultados aceptables se consideran entonces que son
                                                                  los más altos de ambas condiciones.

                                                                  Se permite una reducción mayor para SPRFV porque las
                                                                  cargas para componentes y revestimientos están más
                                                                  sujetas a cambios debido a los efectos de canalización local
                                                                  cuando los alrededores cambian y puede ser fácil y
                                                                  dramáticamente incrementada cuando se construye un
                                                                  nuevo edificio adyacente. No obstante, dado que las
                                                                  consecuencias de una subestimación de cargas para el
                                                                  SPRFV son distintas que para C&R, se recomienda
                                                                  proceder con cautela al aplicar las reducciones sobre el
                                                                  SPRFV.

                                                                  También se reconoce que las fallas de revestimientos son
                                                                  mucho más comunes que las fallas de SPRFV. Agregado a
                                                                  esto, para el caso de SPRFV se demuestra fácilmente que
                                                                  el coeficiente total de arrastre para ciertas formas comunes
                                                                  de edificios, tales como cilindros circulares, especialmente
                                                                  con cubiertas redondas o en cúpula, es la mitad o menos
                                                                  del coeficiente de arrastre para prismas rectangulares que
                                                                  forman la base de los Capítulos 2, 5 y Apéndice C.

                                                                  Para componentes y revestimientos, el límite de 80 % está
                                                                  definido por las zonas interiores 1 y 4 en las Figuras 5.3-1,
                                                                  5.3-2A-F, 5.3-3, 5.3-4, 5.3-5A-B, 5.3-6, 5.4-1, 5.5-1, 5.5-2
                                                                  y 5.5-3. Esta limitación reconoce que las presiones en las
                                                                  zonas de borde son las más probables de ser reducidas
                                                                  debido a la geometría específica de edificios reales
                                                                  comparados con los edificios prismáticos rectangulares
                                                                  supuestos en el Capítulo 5.

                                                                  Por lo tanto, se permite que las presiones en las zonas de
                                                                  borde y esquina sean tan bajas como el 80 % de las
                                                                  presiones interiores del Capítulo 5, sin ensayos
                                                                  suplementarios. El límite de 80 % basado en la zona 1 se
                                                                  aplica directamente a todas las áreas de cubierta, y el límite
                                                                  de 80 % basado en la zona 4 es directamente aplicable a
                                                                  todas las áreas de pared.

                                                                  La limitación sobre las cargas de SPRFV es más compleja
                                                                  porque los efectos de carga (es decir desviaciones,
                                                                  tensiones o fuerzas en elementos) en cualquier punto, son
                                                                  el efecto combinado de un vector de cargas aplicadas en
                                                                  vez de un simple valor escalar.

                                                                  En general, la relación de fuerzas o momentos o esfuerzos
                                                                  de torsión (excentricidad de fuerzas) en varios pisos a


<!-- page 231 -->

                   REGLAMENTO                                                  COMENTARIO

                                                          través de todo el edificio usando un estudio en túnel de
                                                          viento, no será la misma que aquellas razones obtenidas
                                                          aplicando los Capítulos 2 o Apéndice C, y por lo tanto la
                                                          comparación entre los dos métodos no está bien definida.

                                                          Al requerirse que cada efecto de carga de un ensayo en
                                                          túnel de viento sea no menor que 80 % del mismo efecto
                                                          resultante de los Capítulos 2 y Apéndice C, es poco
                                                          práctico e innecesariamente complejo y detallado comparar
                                                          valor a valor, dada la naturaleza aproximada del valor del
                                                          80 %.

                                                          En cambio, el propósito de la limitación efectivamente se
                                                          implementa aplicándolo solo a un simple índice que
                                                          caracteriza la carga completa. Para edificios flexibles
                                                          (altos), el índice más descriptivo de la carga completa es el
                                                          momento de vuelco en la base. Para otros edificios, el
                                                          momento de vuelco puede ser una caracterización pobre de
                                                          la carga total, se recomienda entonces el corte en la base.
                                                          En el caso de los edificios bajos este control se podría
                                                          hacer sobre la fuerza de levantamiento de la cubierta.


<a id="c6.4.5"></a>
### 6.4.5 Limitaciones en las cargas de viento para          C 6.4.5. Limitaciones en las cargas de viento para  <sub>p.232</sub>

       paneles solares fijos montados sobre el                     paneles solares fijos montados sobre el
       terreno                                                     terreno

Para sistemas de paneles solares fijos montados           Los límites establecidos en otros artículos referidos a
sobre el terreno que cumplan las limitaciones y           cargas sobre edificios no necesariamente son aplicables a
requerimientos del artículo 4.5.5.1, la carga de viento   sistemas de paneles fijos montados sobre el terreno. Para
de diseño mínima obtenida del ensayo no debe ser          este tipo de sistemas las limitaciones están en el artículo
menor que el 65 % para componentes y                      6.4.5.
revestimientos y que el 50 % para el SPRFV de los
valores que resultan del artículo 4.5.5, sujeto a las     Los límites a los resultados de ensayos que se establecen
condiciones del artículo 6.4.3.                           en el artículo 6.4.5 se refieren a los valores de diseño
                                                          especificados en las Figuras 4.5-10 y 4.5-11. Los valores
Se permitirán valores de carga menores a estos            de la Figura 4.5-10 representan una envolvente de las
límites cuando se realice una revisión independiente      cargas de viento estáticas medidas en el túnel de viento. En
del ensayo, de acuerdo con el artículo 6.6. La            cambio, los valores que se muestran en la Figura 4.5-11
revisión independiente podrá omitirse cuando se trate     representan una envolvente de las cargas de viento
de instalaciones de categoría de riesgo I según el        dinámicas derivadas de los datos del sistema de presiones
artículo 1.14.1.                                          del túnel de viento, lo cual incluye necesariamente
                                                          hipótesis simplificativas (conservadoras) tocantes a la
La fuerza mínima de diseño basada en ensayos en           estructura de soporte y las propiedades dinámicas del
túnel de viento para paneles solares fijos montados       sistema. Hay instalaciones con geometría o sistemas de
sobre el terreno no necesita cumplir con el requisito     soporte específicos que pueden dar cargas más bajas que
de una presión neta mínima de 0,80 kN/m2 del              aquellas de las Figuras 4.5-10 y 4.5-11; los límites son
artículo 5.2.2.                                           para impedir que haya demasiada desviación respecto de
                                                          los resultados envolventes.

                                                          Los sistemas de paneles solares fotovoltaicos fijos
                                                          montados sobre el terreno pueden tener cargas de viento
                                                          basadas en túnel de viento menores que los umbrales
                                                          límites inferiores indicados en el artículo 6.4.5. Para usar
                                                          estos valores más bajos cuando se trate de instalaciones de
                                                          Categoría de Riesgo II, III o IV se requiere una evaluación
                                                          por pares del ensayo y del informe

Reglamento CIRSOC 102-25                                                                                   Cap. 6 - 214


<!-- page 232 -->

                     REGLAMENTO                                                       COMENTARIO


<a id="c6.5"></a>
### 6.5 EFECTOS DE CARGA PARA EDIFICIOS,                           C 6.5. EFECTOS DE CARGA PARA EDIFICIOS,  <sub>p.233</sub>

       OTRAS ESTRUCTURAS Y COMPONENTES                                   OTRAS ESTRUCTURAS Y COMPONENTES
       USADOS EN MÚLTIPLES EMPLAZAMIEN-                                  USADOS EN MÚLTIPLES EMPLAZAMIEN-
       TOS                                                               TOS

Este artículo se refiere a los estudios destinados a
edificios, otras estructuras o componentes que se
diseñen para ser usados en emplazamientos no
identificados a priori sino con posibilidad de ser
montados o construidos en distintos lugares a partir
de un diseño tipo, para lo cual deberán ser
verificados para las condiciones específicas del
emplazamiento en el que se instale cada ejemplar.
Ejemplos      de   esta    categoría   pueden      ser
construcciones industrializadas, paneles solares, etc.


<a id="c6.5.1"></a>
### 6.5.1 Cargas de viento                                           C 6.5.1. Cargas de viento  <sub>p.233</sub>


Las cargas de viento en edificios, otras estructuras,             En CIRSOC 102 los requisitos para los ensayos en túnel de
partes de estructuras o componentes usados en                     viento se redefinieron para tener en cuenta los ensayos de
múltiples emplazamientos, se podrán obtener                       edificios genéricos, otras estructuras y componentes que se
mediante simulaciones a partir del cálculo de                     usan en múltiples emplazamientos o en múltiples
coeficientes de carga para usar con las expresiones               estructuras. Paneles solares montados sobre cubiertas son
de análisis del Procedimiento Direccional en los                  un ejemplo, aunque no es el único. Otros ejemplos
Capítulos 2 y 4 para el SPRFV y en la Parte 4 del                 comprenden componentes que van montados sobre
Capítulo 5 para C&R.                                              edificios tales como parasoles, unidades externas de aire
                                                                  acondicionado, mamparas; o podrían ser unidades
Alternativamente se permitirá especificar las cargas              independientes, tales como paneles solares montados sobre
mediante un método de análisis definido en el reporte             el terreno, gazebos y vallas.
del ensayo.
                                                                  Al establecer cargas de viento sobre edificios genéricos,
No se requiere incluir edificios cercanos específicos             otras estructuras y componentes, el abordaje debe ser
en la simulación cuando los resultados vayan a ser                similar al usado para desarrollar los gráficos de (GCp) en
usados en múltiples sitios.                                       este reglamento, modelando los edificios genéricos con
                                                                  características variadas, para poder capturar un rango
Las simulaciones deben cumplir con los requisitos de              amplio de efectos. No se deben incluir edificios vecinos ni
los artículos 6.2 y 6.3.                                          rasgos particulares del terreno, a menos que vayan a ser
                                                                  parte de cada aplicación de diseño de tales edificios,
El análisis de los datos debe considerar las cargas               componentes u otras estructuras.
de viento para todas las direcciones. Los coeficientes
genéricos de carga serán calculados paras ser                     Los ensayos en túnel de viento deben incluir una matriz de
consistentes con los coeficientes de los Capítulos 2,             ensayo suficientemente grande como para abordar un
4 y 5, o serán definidos para ser aplicados con un                rango apropiado de variables relevantes que afecten las
procedimiento de análisis especificado en el reporte              cargas de viento, como se lista en los requisitos. ASCE 49
de ensayo.                                                        (ASCE 2012) es una guía para realizar ensayos. Las cargas
                                                                  de viento, en este caso, se expresan como coeficientes que
El reporte del ensayo debe incluir los métodos de                 se pueden usar con los Capítulos 2, 4 y 5 para producir
recolección de datos, de análisis de los datos, de                cargas en unidades de ingeniería. Alternativamente se
modelado del campo de viento, detalles del modelo,                puede usar una formulación diferente de coeficientes de
cargas de viento medidas, conversión de los datos                 carga adimensionales siempre y cuando el procedimiento
en coeficientes genéricos, y condiciones de                       de análisis esté claramente definido en el informe del
aplicabilidad de los resultados.                                  ensayo.

Los    resultados     no    serán    extrapolados a
configuraciones geométricas que no sean las
previstas en el reporte del estudio.
Las limitaciones del estudio deben ser claramente
informadas


<!-- page 233 -->

                   REGLAMENTO                                                  COMENTARIO


<a id="c6.5.2"></a>
### 6.5.2 Limitaciones en las cargas de viento para          C 6.5.2. Limitaciones en las cargas de viento para  <sub>p.234</sub>

       paneles solares montados en cubiertas                       paneles solares montados en cubiertas

Para sistemas de paneles fotovoltaicos que cumplen        En lo que hace a paneles solares montados sobre cubierta,
las limitaciones y requerimientos geométricos de la       las presiones mínimas para componentes y revestimientos
Figura 4.5-7, la carga de viento mínima de diseño         que se indican en este reglamento son en principio
basada en ensayos no debe ser menor que el 65 %           aplicables a la envolvente de los edificios, y no son
de los valores resultantes de 4.5-7, sujeto a las         aplicables a colectores solares sobre cubiertas. Las
condiciones del artículo 6.4.3. La fuerza de viento de    limitaciones contenidas aquí están orientadas a establecer
diseño mínima basada en estudios de simulación            el límite inferior de presiones de viento para estudios en
para sistemas de paneles solares montados en              túnel de viento, en condiciones similares a las abordadas
cubiertas no necesita cumplir con la presión neta         en la Figura 4.5-7. Los límites a los resultados de túnel de
mínima de 0,80 kN/m2 que se establece en el               viento que se muestran en la Figura 4.5-7 representan una
artículo 5.2.2.                                           envolvente de cargas de viento medidas en túnel de viento
                                                          sin los deflectores ni accesorios que se usan comúnmente
                                                          para disminuir las cargas de viento. Algunas instalaciones
                                                          o     geometrías     específicas   pueden     dar     cargas
                                                          significativamente más bajas que las de la Figura 4.5-7;
                                                          los límites se imponen para impedir que haya demasiada
                                                          desviación respecto de los resultados de la envolvente.
                                                          Sistemas de paneles solares que tienen dispositivos
                                                          aerodinámicos o perfiles más eficientes pueden tener
                                                          cargas de viento basadas en modelos menores que los
                                                          umbrales límites inferiores indicados en el artículo 6.5.2.
                                                          Para usar estos valores más bajos se requiere una revisión
                                                          por pares del ensayo y del informe.


<a id="c6.5.3"></a>
### 6.5.3 Requerimiento de revisión por pares para           C 6.5.3. Requerimiento de revisión por pares para  <sub>p.234</sub>

       ensayos de edificios, otras estructuras y                   ensayos de edificios, otras estructuras y
       componentes     usados     en   múltiples                   componentes    usados      en    múltiples
       emplazamientos                                              emplazamientos

Para cargas de viento en edificios, otras estructuras y   En esta revisión del reglamento se agregó el alcance de los
componentes usados en múltiples emplazamientos            ensayos en túnel de viento de edificios, componentes y
obtenidas por ensayos en túnel de viento, excepto         otras estructuras que se usan en múltiples emplazamientos.
paneles solares montados en cubiertas, se deberá          Se requiere revisión por pares para el uso de este abordaje,
realizar una revisión por pares independiente del         excepto para los paneles solares montados sobre cubierta
estudio, de acuerdo con el artículo 6.6.                  comprendidos en el artículo 6.5.2. También se requiere una
                                                          revisión por pares en este último caso cuando las cargas
Para sistemas de paneles solares fotovoltaicos que        caen por debajo del umbral mínimo especificado en 6.5.2.
cumplan    las    limitaciones   y    requerimientos
geométricos de la Figura 4.5-7, se permitirán valores
de cargas menores que los indicados en el artículo
6.5.2 cuando se realice una revisión por pares
independiente del estudio, de acuerdo con el artículo
6.6.


<a id="c6.6"></a>
### 6.6 REQUISITOS DE REVISIÓN POR PARES                   C 6.6. REQUISITOS DE REVISIÓN POR PARES  <sub>p.234</sub>

       PARA ENSAYOS EN TÚNEL DE VIENTO                           PARA ENSAYOS EN TÚNEL DE VIENTO

Cuando se requiera una revisión por pares                 Este artículo especifica los requisitos para revisiones por
independiente según los artículos 6.1, 6.4.5, 6.5.3 o     pares de estudios en túnel de viento. Las calificaciones y
6.7, esta deberá ser una revisión técnica objetiva        requisitos de los pares revisores se incluyen para promover
llevada a cabo por uno o más revisores reconocidos,       la consistencia entre las varias jurisdicciones, de tal manera
con experiencia en la realización de estudios de          que la revisión por pares pueda ser aceptada por múltiples
viento en edificios y sistemas similares y en flujos de   organismos de control. Se pretende que las calificaciones
capa límite atmosférica o campos de viento                del par revisor sean la de un especialista en Ingeniería de
apropiadamente simulados. Las calificaciones              Viento familiarizado con ensayos de edificios y la
mínimas del revisor deben incluir lo siguiente:           aplicabilidad de las especificaciones de CIRSOC 102 para
                                                          determinar los coeficientes de diseño.

Reglamento CIRSOC 102-25                                                                                    Cap. 6 - 216


<!-- page 234 -->

                     REGLAMENTO                                                        COMENTARIO

• El revisor debe ser independiente del laboratorio
   que realizó el estudio y el reporte, y no debe tener
   conflicto de interés.

• El revisor debe tener experiencia técnica en la
   aplicación de estudios de viento en edificios, otras
   estructuras o componentes, similares al revisado.

• El revisor debe tener experiencia en realizar o
   evaluar estudios de flujos de capa límite
   atmosférica y debe estar familiarizado con los
   aspectos técnicos y regulatorios de este
   reglamento, tal como se aplica al edificio, otra
   estructura o componente bajo consideración.

El revisor debe evaluar el reporte del estudio
incluyendo, pero no limitado a, los métodos de
recolección de datos, el análisis de los datos, el
modelado del campo de viento, las cargas de viento
resultantes, la conversión de los datos en valores de
diseño, las condiciones de aplicabilidad de los
resultados y otros aspectos relevantes que
identifique.

El revisor debe enviar un reporte escrito a la
Autoridad Jurisdiccional y al cliente. El reporte debe
incluir, como mínimo, declaraciones sobre los
aspectos siguientes: alcance de la revisión con
definición de las limitaciones, el estado del estudio de
viento al momento de la revisión, conformidad del
estudio de viento con los requerimientos del artículo
6.2 y del artículo 6.5.1, conclusiones del revisor
identificando áreas que necesitan una revisión
adicional,      investigación       o      aclaraciones,
recomendaciones y si, en opinión del revisor, las
cargas de viento derivadas del estudio están de
acuerdo con el uso previsto en este reglamento.


<a id="c6.7"></a>
### 6.7 SIMULACIONES COMPUTACIONALES                                 C 6.7. SIMULACIONES COMPUTACIONALES  <sub>p.235</sub>


El uso de la dinámica de fluidos computacional para               El uso de las simulaciones de dinámica de fluidos
propósitos de ingeniería de viento deberá ser, en                 computacional (CFD por sus siglas en inglés:
cada caso, verificado y validado por comparación con              Computational Fluid Dynamics) en aplicaciones de
resultados de ensayos físicos en túnel de viento que              Ingeniería de Viento está creciendo. La dinámica de
cumplan el artículo 6.2, por estudios a escala natural,           fluidos computacional es una herramienta compleja que
o por literatura reconocida, y será sometido a una                viene evolucionando desde hace años, pero su aplicación
revisión de pares independiente según el artículo 6.6.            práctica para propósitos de ingeniería de viento (CWE por
Además de los requisitos enumerados en el artículo                Computational Wind Engineering), y en particular la
6.6, el revisor deberá acreditar solvencia en los                 obtención de cargas de diseño de estructuras, es reciente.
aspectos propios de la dinámica de fluidos                        Al igual que la realización de ensayos en túnel de viento, la
computacional.                                                    simulación computacional para obtener cargas de viento
                                                                  requiere una gran experiencia, conocimientos y recursos
                                                                  que pueden estar fuera del alcance habitual del proyectista
                                                                  de estructuras. La aparente simplicidad que pueden mostrar
                                                                  las interfaces de los programas comerciales no debe llevar
                                                                  a subestimar la dificultad que implica obtener resultados
                                                                  con el nivel de confiabilidad requerida para el diseño. Por
                                                                  lo tanto, se debe advertir que esta metodología debe ser
                                                                  usada con extremo cuidado y por equipos con al menos un
                                                                  ingeniero experto (Blocken, 2014; Tamura and Van Phuc,
                                                                  2015).


<!-- page 235 -->

                   REGLAMENTO                        COMENTARIO

                                El uso de túneles de viento computacionales en la forma
                                que están siendo promovidos por los desarrolladores de
                                software es útil para dar una idea de cómo funciona desde
                                el punto de vista aerodinámico el edificio y su entorno. Sin
                                embargo, para producir información cuantitativa, tal como
                                cargas de diseño, son aplicables los requisitos que se
                                describen en ASCE 49 para el modelado físico en túnel de
                                viento más los específicos de la técnica computacional. Por
                                ejemplo, en los modelos numéricos también se necesita un
                                flujo incidente apropiado, geometría precisa, la inclusión
                                de estructuras próximas significativas y la consideración
                                del potencial de excitación modal y efectos aeroelásticos.
                                Una vez validado contra un caso base de modelado físico,
                                la simulación CFD puede ayudar a resolver detalles que no
                                se pueden medir en el modelo físico y/o permite realizar
                                análisis de sensibilidad a cambios paramétricos. En
                                ausencia de esta validación, la simulación computacional
                                sólo se puede considerar información cualitativa (Bruno y
                                asoc., 2023).

                                Mientras no se disponga de un estándar que documente los
                                procedimientos necesarios para obtener cargas de viento
                                confiables y precisas usando herramientas de CFD,
                                cualquier uso de CFD para determinar cargas de viento
                                sobre sistemas principales resistentes a la fuerza del viento
                                (SPRFV), componentes y revestimientos (C&R) u otras
                                estructuras requiere una revisión de pares y un estudio de
                                verificación y validación (V&V) en el sentido definido por
                                Yeo (2020). A tal fin, resultan útiles bases de datos de
                                resultados de referencia tales como las de AIJ (2016),
                                ERCOFTAC QNET-CFD
                                (https://www.ercoftac.org/products_and_services/wiki) o
                                Tokyo Polytechnic University Aerodynamic Database
                                (http://wind.arch.t-kougei.ac.jp/system/eng/contents/code/
                                tpu). En ausencia de un estándar, esto es necesario para el
                                aseguramiento de la calidad y el control de calidad de este
                                método.

                                Los requisitos a aplicar en la validación deben ser los
                                descritos en ASCE 49 en todo lo referido a aspectos físicos
                                del problema, más los indicados en guías internacionales
                                de ingeniería eólica internacionales de CFD – CWE, tales
                                como ERCOFTAC (Casey and Wintergerste, 2000); COST
                                (2007), CNR (2019), Franke y asoc. (2004), Tamura y
                                asoc. (2008), Tominaga y asoc. (2008), NF EN 1991-1-4 y
                                otras publicaciones sobre aspectos específicos tales como
                                la discretización espacial, temporal, tratamiento de la
                                turbulencia, generación de condiciones de contorno, entre
                                otros.

Reglamento CIRSOC 102-25                                                         Cap. 6 - 218


<!-- page 236 -->

                                             APÉNDICES

APÉNDICE A –                            En blanco intencionalmente
