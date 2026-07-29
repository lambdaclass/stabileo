# INPRES-CIRSOC 103 Parte I (2018) — CAPÍTULO 7. MÉTODOS DINÁMICOS

> Source: `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` · PDF pages 73–78
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c7.0"></a>
### 7.0 SIMBOLOGÍA  <sub>p.73</sub>


  Ca      parámetro característico del espectro de diseño.

  Cd      factor de amplificación de deformaciones.

  Cm      ordenada espectral reducida para el modo m.

  R       factor de reducción.

  Sam     ordenada espectral correspondiente al período del modo m.

  T       período fundamental de la construcción.

  Vod     corte basal obtenido del análisis dinámico.

  Vodi    corte basal obtenido del análisis dinámico para el acelerograma i.

  Voe     corte basal obtenido del método estático.

  amáx    aceleración máxima del acelerograma.

 de       desplazamiento elástico de la construcción.

 dem      desplazamiento elástico de la construcción para el modo m.

 du       desplazamiento último de la construcción.

 dum      desplazamiento último de la construcción para el modo m.

 dubk     desplazamiento horizontal último del nivel k, medido en el borde más desfavorable
          de la construcción.

 dubk-1 desplazamiento horizontal último del nivel k-1, medido en el borde más
          desfavorable de la construcción.

  hsk     altura del nivel o piso k.

 ∆sk      diferencia entre desplazamientos horizontales correspondiente a cabeza y pie del
          nivel k, medidos en el borde más desfavorable de la construcción.
  r      factor de riesgo.

  sk     distorsión horizontal de piso del nivel k.


<a id="c7.1"></a>
### 7.1 GENERALIDADES  <sub>p.73</sub>


Este reglamento considera los siguientes procedimientos para análisis dinámico: modal
espectral, de respuesta lineal en el tiempo.

Reglamento INPRES-CIRSOC 103, Parte I                                            Cap. 7 - 55


<!-- page 73 -->


<a id="c7.1.1"></a>
### 7.1.1 Aplicación de la excitación sísmica  <sub>p.74</sub>


La excitación sísmica se supondrá actuando en los apoyos del modelo vibratorio, según las
direcciones indicadas en el Capítulo 3.

Adicionalmente deberá considerarse la acción sísmica vertical en componentes de acuerdo
a lo establecido en 6.3 y 3.5.2.


<a id="c7.1.2"></a>
### 7.1.2 Modelo vibratorio de análisis  <sub>p.74</sub>


Para propósito de análisis se admite considerar estructura con base fija. Alternativamente se
permite considerar deformabilidad del suelo de fundación.

Deberá incluir un número de grados de libertad dinámicos acorde con las características de
la estructura para representar convenientemente los modos naturales más significativos de
la repuesta dinámica. Las masas asociadas a los grados de libertad se determinarán según
lo establecido en el Capítulo 3.

El modelo estructural deberá considerar el carácter espacial de la estructura. En estructuras
con diafragmas rígidos incluirá dos grados de libertad traslacionales y un grado de libertad
rotacional por diafragma. Las estructuras sin diafragmas rígidos deberán modelarse con
grados de libertad adicionales para representar la influencia de los movimientos relativos
entre las masas.

Las masas en estructuras de edificios se podrán discretizar en los niveles de losas de
entrepiso y techo y, cuando se considere la interacción suelo estructura, a nivel de platea o
manto de fundación.

Los grados de libertad dinámicos asociados con rotaciones alrededor de ejes horizontales
deberán ser especialmente tenidos en cuenta en las estructuras que requieran la
consideración del acoplamiento dinámico entre desplazamientos verticales y horizontales
para su evaluación. Se empleará la condición establecida en la Sección 6.6 para determinar
esa necesidad.

El modelo analítico debe incluir todos los elementos que puedan restringir la deformación de la
construcción, sean reglamentariamente considerados estructurales o no (ver 8.3.).


<a id="c7.1.3"></a>
### 7.1.3 Determinación de la respuesta  <sub>p.74</sub>


Para la determinación de la respuesta puede aplicarse cualquier procedimiento, siempre que
esté fundado en los principios de la dinámica estructural. El proyectista debe justificar la
aplicabilidad del método, la validez del modelo y la validez de los resultados.


<!-- page 74 -->


<a id="c7.2"></a>
### 7.2 PROCEDIMIENTO MODAL ESPECTRAL  <sub>p.75</sub>


El procedimiento modal espectral consiste en el análisis de un modelo matemático lineal de
la estructura para determinar las aceleraciones, fuerzas y desplazamientos máximos
resultantes de la respuesta dinámica al movimiento del suelo representado por el espectro
de diseño. Cuando la estructura presente doble simetría e irregularidad torsional baja
(renglón 1a, Tabla 2.3) se admite analizar cada dirección por separado con modelos planos.


<a id="c7.2.1"></a>
### 7.2.1 Determinación de los modos naturales de vibración  <sub>p.75</sub>


Para la determinación de los modos naturales de vibración, se admitirá que los materiales se
comportan en forma lineal elástica. Para la rigidez de elementos de hormigón y mampostería
se considerarán las secciones fisuradas de acuerdo con lo establecido en las Partes II y III
de este Reglamento.


<a id="c7.2.2"></a>
### 7.2.2 Determinación de la respuesta  <sub>p.75</sub>


La ordenada espectral para cada modo se determinará mediante:

                                        Cm  Sam r  R                            [7.1]


<a id="c7.2.3"></a>
### 7.2.3 Modos a considerar  <sub>p.75</sub>


Se incluirán todos los modos significativos. Esta condición es satisfecha si los modos
considerados representan la contribución de al menos el 90% de la masa total de la
construcción para cada una de las direcciones analizadas.


<a id="c7.2.4"></a>
### 7.2.4 Superposición modal  <sub>p.75</sub>


Para obtener el efecto total en una dirección de análisis, se utilizará el procedimiento de
superposición cuadrática completa (CQC). Si los períodos de los modos a superponer están
separados más del 10% del valor sucesivo se puede aplicar la superposición cuadrática
simple (SSRS: raíz cuadrada de la suma de los cuadrados de los efectos modales).


<a id="c7.2.5"></a>
### 7.2.5 Solicitaciones mínimas  <sub>p.75</sub>


Cuando el corte basal obtenido mediante el análisis modal espectral sea inferior al 85% del
corte basal obtenido por el método estático (según 6.2.), las solicitaciones de diseño
obtenidas por el método modal espectral se modificarán por el factor:

                                        0,85 Voe  Vod                             [7.2]


<a id="c7.2.6"></a>
### 7.2.6 Torsión Accidental  <sub>p.75</sub>


Para cada dirección de análisis, los efectos torsionales se tendrán en cuenta mediante el
desplazamiento de las masas una distancia igual a la excentricidad accidental definida en el
artículo 6.2.4.2.
Reglamento INPRES-CIRSOC 103, Parte I                                             Cap. 7 - 57


<!-- page 75 -->


<a id="c7.2.7"></a>
### 7.2.7 Deformaciones  <sub>p.76</sub>


Las deformaciones (θsk) se determinan a partir de los desplazamientos últimos de la
construcción (du), obtenidos como superposición de los desplazamientos últimos de cada
modo (dum) según el artículo 7.2.4.

Los desplazamientos últimos de la construcción en el modo m (dum) se obtendrán de los
desplazamientos elásticos de dicho modo (dem), multiplicados por el factor de amplificación
de deformaciones Cd y divididos por el factor de riesgo (  r ). Los desplazamientos elásticos
en el modo m (dem) provienen del análisis estructural con los espectros elásticos reducidos
por el factor de reducción R, según indica la expresión [7.1].

                                             dum  Cd d em  r                       [7.3]

La distorsión horizontal de piso θ sk provocada por la excitación sísmica se define como:

                                  sk  dubk  dubk -1  hsk  sk hsk              [7.4]

La distorsión se evaluará considerando el desplazamiento del borde más desfavorable de la
construcción.

La distorsión horizontal de piso máxima calculada no excederá los valores límites indicados
en 6.4.2.


<a id="c7.3"></a>
### 7.3 PROCEDIMIENTO DE RESPUESTA LINEAL EN EL TIEMPO  <sub>p.76</sub>


El procedimiento de respuesta lineal en el tiempo consiste en el análisis de un modelo
matemático lineal de la estructura para determinar su respuesta en el tiempo, a través de la
integración numérica como respuesta, a la excitación de acelerogramas compatibles con los
espectros de diseño de cada sitio.


<a id="c7.3.1"></a>
### 7.3.1 Acelerogramas a utilizar  <sub>p.76</sub>


Las características de cada acelerograma a emplear serán tales que se satisfagan las
siguientes condiciones:

a) La aceleración máxima será:                      amáx  r Ca                     [7.5]

b) Para los periodos comprendidos entre 0,2 T y 1,5 T , la media de las ordenadas de los
espectros de respuestas para los acelerogramas analizados no será inferior que la ordenada
correspondiente al espectro de diseño establecido en el Capítulo 3 amplificadas por r.

Se aplicará un mínimo de tres acelerogramas. Cuando no se dispongan de registros de
terremotos, podrán utilizarse acelerogramas obtenidos por simulación numérica que cumplan las


<!-- page 76 -->

mismas condiciones que los registros reales. Cuando la construcción se ubique en zonas
próximas a fallas se deberán incluir acelerogramas con pulsos largos e intensos de
aceleración.


<a id="c7.3.2"></a>
### 7.3.2 Solicitaciones  <sub>p.77</sub>


Las solicitaciones requeridas surgirán de promediar las correspondientes a las obtenidas por
la aplicación de cada acelerograma reducidas por R.

Cuando el corte basal obtenido mediante el análisis de respuesta en el tiempo Vodi de cada
acelerograma sea inferior al 85% del corte basal obtenido por el método estático (según
6.2.),   las   solicitaciones     para    cada     acelerograma    se    obtendrán   modificando     el
correspondiente parámetro de respuesta por el factor:
                                                 0,85 Voe  Vodi                            [7.6]


<a id="c7.3.3"></a>
### 7.3.3 Torsión Accidental  <sub>p.77</sub>


Para cada dirección de análisis, los efectos torsionales se tendrán en cuenta mediante el
desplazamiento de las masas una distancia igual a la excentricidad accidental definida en el
artículo 6.2.4.2.


<a id="c7.3.4"></a>
### 7.3.4 Deformaciones  <sub>p.77</sub>


Los desplazamientos elásticos (de) surgirán de promediar los correspondientes a los
obtenidos por la aplicación de cada acelerograma reducidos por R.

Para el control de deformaciones (θsk) se utilizarán los desplazamientos últimos de la
construcción (du). Estos se obtienen a partir de los desplazamientos elásticos (de),
multiplicados por el factor de amplificación de deformaciones (Cd) y reducidos por el factor
de riesgo (r).

                                         du  Cd d e R  r                              [7.7]

La distorsión horizontal de piso θ sk provocada por la excitación sísmica se define como:

                                 sk  dubk  dubk -1  hsk  sk hsk                      [7.8]

La distorsión se evaluará considerando el desplazamiento del borde más desfavorable de la
construcción.

La distorsión horizontal de piso máxima calculada no excederá los valores límites indicados
en 6.4.2.

Reglamento INPRES-CIRSOC 103, Parte I                                                      Cap. 7 - 59


<!-- page 77 -->



<!-- page 78 -->
