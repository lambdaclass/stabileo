# INPRES-CIRSOC 103 Parte I (2018) — CAPÍTULO 6. MÉTODO ESTÁTICO

> Source: `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` · PDF pages 65–72
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

<a id="c6.0"></a>
### 6.0 SIMBOLOGÍA  <sub>p.65</sub>


 AB       superficie de la planta.

 Awi      sección transversal del tabique i.

 C        coeficiente sísmico de diseño.

 Ca       parámetro característico del espectro de diseño.

 Cd       coeficiente de amplificación de deformaciones.

 Cu       coeficiente para límite superior del periodo calculado.

 Cr       coeficiente para la determinación del periodo fundamental aproximado.

 Cw       coeficiente para la determinación del periodo fundamental aproximado.

 Fi       fuerza sísmica en la masa rotacional i.

 Fk       fuerza sísmica en la masa o nivel k.

 Fn       fuerza sísmica en la masa o nivel n.

 Fv       fuerza sísmica vertical hacia abajo.

 Fvup     fuerza sísmica vertical hacia arriba.

 H        altura total de la construcción desde el nivel de referencia, en metros.

 Imi      momento de inercia de la masa i alrededor del eje horizontal de rotación.

 Lwi      largo del tabique i.

 Mci      momento de la cupla de eje horizontal aplicada en el centro de gravedad de la
          masa i.

 Mta k    momento torsor accidental en el nivel k.

 Nv       factor por cercanía de fallas sismogénicas.

 R        factor de reducción global.

 Sa       ordenada espectral para el Estado Límite Último.

 T        período fundamental de la construcción.

 T2       período característico del espectro.

 Ta       período fundamental aproximado.

 Vo       esfuerzo de corte en la base de la construcción.

 W        carga gravitatoria total de la construcción sobre el nivel de referencia.

Reglamento INPRES-CIRSOC 103, Parte I                                                 Cap. 6 - 47


<!-- page 65 -->

 Wi        carga gravitatoria supuesta concentrada en la masa o nivel i.

 Wk        carga gravitatoria supuesta concentrada en la masa o nivel k.

 Wn        carga gravitatoria supuesta concentrada en la masa o nivel n.

 as        aceleración efectiva del suelo correspondiente a cada zona sísmica.

 de        desplazamiento para las acciones sísmicas de diseño (acciones elásticas reducidas
           por el factor de reducción R).

 du        desplazamiento último de la construcción.

 dubk      desplazamiento horizontal último del nivel k, medido en el borde más desfavorable
           de la construcción.

 dubk-1 desplazamiento horizontal último del nivel k-1, medido en el borde más
           desfavorable de la construcción.

 eak       excentricidad accidental del nivel k.

 g         aceleración de la gravedad.

 hi        altura de la masa o nivel i medida desde el nivel de referencia.

 hk        altura de la masa o nivel k medida desde el nivel de referencia.

 hn        altura de la masa o nivel n medida desde el nivel de referencia.

 hsk       altura del nivel o piso k.

 hwi       altura del tabique i.

 n         número de pisos o masas; número de tabiques de la construcción que aportan
           resistencia a fuerzas laterales en la dirección de estudio.

 ri        radio de giro de la masa i con relación al eje horizontal que pasa por el centro de
           gravedad de la masa y es perpendicular a la dirección analizada.

 x         coeficiente para calcular el período fundamental aproximado.

 ∆sk       diferencia entre desplazamientos horizontales correspondiente a cabeza y pie del
           nivel k, medidos en el borde más desfavorable de la construcción.
   si     desplazamiento absoluto de la masa i.
  r       factor de riesgo.

  i       rotación de la masa i.

 θsk       distorsión horizontal de piso del nivel k.


<!-- page 66 -->


<a id="c6.1"></a>
### 6.1 ACCIONES SÍSMICAS  <sub>p.67</sub>


La acción sísmica se considera equivalente a la acción de un sistema de fuerzas, paralelo a
la dirección analizada y aplicada en los centros de las masas que conforman el modelo
estructural. La resultante de ese sistema y la distribución de fuerzas se determinan según lo
establecido en este capítulo.


<a id="c6.2"></a>
### 6.2 ACCIONES HORIZONTALES  <sub>p.67</sub>



<a id="c6.2.1"></a>
### 6.2.1 Esfuerzo de corte en la base  <sub>p.67</sub>


                                        Vo  C . W                                   [6.1]

                                        W   in1Wi                                 [6.2]


<a id="c6.2.2"></a>
### 6.2.2 Coeficiente sísmico de diseño  <sub>p.67</sub>


Se determina por las expresiones:

                           C  2,5 Ca  r  R        para T ≤ T2                     [6.3]

                           C  Sa  r  R            para T T2                      [6.4]

                           C  0,8 as Nv  R         para zonas sísmicas 3 y 4       [6.5]

                           C  0,11 Ca  r           para zonas sísmicas 0, 1 y 2    [6.6]


<a id="c6.2.3"></a>
### 6.2.3 Período fundamental de vibración de la estructura  <sub>p.67</sub>


El periodo a considerar para la determinación del coeficiente sísmico es el período
traslacional en la dirección considerada.

Este periodo se determinará considerando las propiedades de la estructura en la dirección
que se examina y aplicando los procedimientos de la dinámica estructural o alternativamente
de acuerdo con 6.2.3.1 y 6.2.3.2 para el caso de edificios regulares o con irregularidad
media.

La modelación para el análisis reflejará en forma adecuada la distribución de masas y
rigideces. Se supondrá que la estructura funciona en el campo elástico lineal.

Las características del suelo de fundación a utilizar serán compatibles con los niveles de
deformación asociados al terremoto de diseño y tendrán en consideración el estado
tensional inducido por las acciones gravitatorias simultáneas.

Las características de los distintos materiales serán las establecidas por los Reglamentos

Reglamento INPRES-CIRSOC 103, Parte I                                               Cap. 6 - 49


<!-- page 67 -->

correspondientes para acciones de corta duración. En construcciones de hormigón o de
mampostería se adoptarán las características de las secciones fisuradas, de acuerdo con
las Partes II y III de este Reglamento.

Independientemente del valor calculado, el período a utilizar en el análisis estructural no
excederá:
                                                     T  CuTa                         [6.7]

dónde Cu se establece en la Tabla 6.1. y Ta se determinará según los artículos 6.2.3.1 y
6.2.3.2.

             Tabla 6.1. Coeficiente para el límite superior del periodo de cálculo

                                               as                Cu

                                            ≥ 0,35              1,40

                                              0,25              1,45

                                              0,15              1,60

                                            ≤ 0,08              1,70

                                              Pueden interpolarse
                                              valores intermedios


<a id="c6.2.3.1"></a>
### 6.2.3.1 Período fundamental aproximado (procedimiento general)  <sub>p.68</sub>


El período fundamental aproximado Ta , en segundos, será determinado según la siguiente
expresión:
                                              Ta = Cr (H) x                           [6.8]

Los valores de Cr y x se obtienen de la Tabla 6.2.


<a id="c6.2.3.2"></a>
### 6.2.3.2 Periodo fundamental aproximado (edificios regulares con muros o tabiques)  <sub>p.68</sub>


Para mampostería y tabiques de hormigón armado en construcciones regulares o con
irregularidad baja o media:
                                                     0 .0062
                                            Ta              H                        [6.9]
                                                         Cw
dónde:
                                                       2
                                   100 n  H                Awi
                              Cw              
                                    AB i 1  hwi  
                                                                                      [6.10]
                                                                 hwi  
                                                                        2

                                                     1  0 ,83      
                                                               Lwi  


<!-- page 68 -->

      Tabla 6.2. Valores de Cr y x para la determinación del periodo fundamental
                                                    aproximado

                                Tipo Estructural                                                 Cr       x

          Sistemas tipo pórtico de acero que resisten el 100% del
          corte basal requerido sin incorporación de componentes
                                                                                                0,0724   0,80
          que   restrinjan   deformaciones            (p.            ej.         mampostería,
          diagonales).

          Sistemas tipo pórtico de hormigón armado que resisten el
          100% del corte basal sin incorporación de componentes
                                                                                                0,0466   0,90
          que   restrinjan   deformaciones            (p.            ej.         mampostería,
          diagonales).

          Sistemas tipo pórticos de acero con diagonales excéntricas
                                                                                                0,0731   0,75
          o diagonales de pandeo restringido.

          Otros sistemas estructurales                                                          0,0488   0,75


<a id="c6.2.4"></a>
### 6.2.4 Distribución de acciones sísmicas  <sub>p.69</sub>


Las fuerzas sísmicas se distribuirán entre los elementos resistentes de acuerdo a lo
establecido en el Capítulo 8.


<a id="c6.2.4.1"></a>
### 6.2.4.1 Distribución en altura  <sub>p.69</sub>


La fuerza sísmica horizontal Fk aplicada en el baricentro de la carga gravitatoria Wk ubicada
en el nivel k , se determinará mediante la siguiente expresión:

                                                Wk hk Vo
                                         Fk          n
                                                                                                                 [6.11]
                                                    W h
                                                    i 1
                                                                 i       i

Cuando el período fundamental T , sin el límite dado por la expresión [6.7], resulte mayor
que 2T2 , la distribución en altura se realizará mediante las siguientes expresiones:

                    para masas intermedias:

                                               0 ,9 Wk hk Vo
                                        Fk            n
                                                                                                                 [6.12]
                                                      W h
                                                      i 1
                                                                     i       i

                    para la última masa:

                                          0 ,9 Wn hn Vo
                                  Fn           n
                                                                                  0,1 Vo                        [6.13]
                                               W h
                                               i 1
                                                             i       i

Reglamento INPRES-CIRSOC 103, Parte I                                                                           Cap. 6 - 51


<!-- page 69 -->


<a id="c6.2.4.2"></a>
### 6.2.4.2 Torsión accidental  <sub>p.70</sub>


A la torsión inherente se le deberá adicionar un momento torsor accidental Mta k que se
determinará en cada nivel con la siguiente expresión:

                                             Mta k  Fk eak                                          [6.14]

                                   Tabla 6.3. Excentricidad Accidental

            Irregularidad Torsional (Ver Tabla 2.3.)           Excentricidad Accidental e ak

            Estructura torsionalmente regular o con
                                                              0 (cero)
            irregularidad torsional baja

                                                               5% de la longitud de la planta
            Estructura con irregularidad torsional            en el nivel k, perpendicular a la
            media                                             dirección de aplicación de las
                                                              fuerzas.

                                                               10% de la longitud de la planta
            Estructura con irregularidad torsional            en el nivel k perpendicular a la
            extrema                                           dirección de aplicación de las
                                                              fuerzas. Ver 8.3.1.1.


<a id="c6.3"></a>
### 6.3 ACCIONES SÍSMICAS VERTICALES EN COMPONENTES  <sub>p.70</sub>


Adicionalmente a las acciones sísmicas verticales establecidas en 3.5.2, se considerarán
acciones sísmicas verticales en componentes sensibles a vibraciones verticales tales como:

a) Voladizos, balcones y aleros,

b) Vigas de hormigón pretensado con luces superiores a 10m y esbelteces geométricas
( L h ) superiores a 20. Losas de hormigón pretensado con luz superior a 8m y esbeltez
geométrica superior a 30. Estructuras que apean columnas o similares.

c) Estructuras sensibles a acciones verticales, estructuras con salientes o similares no
incluidas en a) o en b) con período de vibración vertical comprendido entre 0,2 y 1,2 seg.

Las fuerzas hacia abajo, se evaluarán según la expresión 6.15 y no se superpondrán con Ev.

                                             Fv  Ca r Wi
                                                                                                     [6.15]

Además se diseñarán para resistir una fuerza vertical hacia arriba no inferior a:

                                             Fvup   Ca Wi
                                                                                                     [6.16]


<!-- page 70 -->


<a id="c6.4"></a>
### 6.4 DEFORMACIONES  <sub>p.71</sub>


Las deformaciones (θsk) se determinan a partir de los desplazamientos últimos de la
construcción (du), obtenidos de los desplazamientos para las acciones sísmicas de diseño
(de), multiplicados por el factor de amplificación de deformaciones Cd y divididos por el factor
de riesgo (  r ). Los desplazamientos de diseño (de) provienen del análisis estructural con los
espectros elásticos reducidos por el factor de reducción R determinado según el capítulo 5.

                                        d u  Cd d e / r                              [6.17]


<a id="c6.4.1"></a>
### 6.4.1 Determinación de la distorsión horizontal de piso  <sub>p.71</sub>


La distorsión horizontal de piso θsk provocada por la excitación sísmica se define como:

                               θsk  dubk  dubk -1  hsk  Δsk hsk                   [6.18]

La distorsión se evaluará considerando el desplazamiento del borde más desfavorable de la
construcción. Para el cálculo de las deformaciones se permitirá utilizar el periodo de la
construcción sin considerar el límite que impone la expresión [6.7].


<a id="c6.4.2"></a>
### 6.4.2 Control de deformaciones  <sub>p.71</sub>


La distorsión horizontal de piso máxima calculada según 6.4.1. no excederá los valores
límites indicados en la Tabla 6.4 de acuerdo al grupo de construcción a que pertenece la
estructura y de las condiciones siguientes:

Condición D: existen elementos no estructurales que pueden ser dañados por las
deformaciones impuestas por la estructura.

Condición ND: cuando los elementos no estructurales están vinculados a la estructura de
forma que no sufran daños por las deformaciones de ésta.

               Tabla 6.4. Valores límite de la distorsión horizontal de piso sk

                                                Grupo de la construcción
                      Condición
                                               Ao o A                   B

                           D                    0,01                   0,015

                          ND                   0,015                   0,025

La verificación de la distorsión horizontal de piso no será exigible en estructuras del grupo C.

Reglamento INPRES-CIRSOC 103, Parte I                                                 Cap. 6 - 53


<!-- page 71 -->


<a id="c6.5"></a>
### 6.5 PARTES DE LA CONSTRUCCIÓN Y COMPONENTES NO ESTRUCTURALES  <sub>p.72</sub>


El análisis de estabilidad, resistencia, anclajes y conexiones de los componentes
considerados como partes de la construcción o no estructurales se efectuará de acuerdo
con lo indicado en el Capítulo 10.


<a id="c6.6"></a>
### 6.6 INFLUENCIA DE ROTACIONES DE MASAS ALREDEDOR DE EJES  <sub>p.72</sub>

     HORIZONTALES

Cuando las masas tengan inercia rotacional significativa y se produzcan en ellas rotaciones
alrededor de ejes horizontales como consecuencia de las deformaciones de la estructura, se
debe considerar la influencia de los grados de libertad rotacionales. Es el caso de
estructuras “tipo péndulo invertido”, en las que la masa está concentrada en el extremo
de un soporte y puede tener dimensiones considerables. Por ejemplo: tanques hongo, torres
antena con equipos pesados en la cima, tanques sobre un soporte único.


<a id="c6.6.1"></a>
### 6.6.1 Casos de consideración obligatoria  <sub>p.72</sub>


Es obligatorio considerar dicha influencia si, aplicando las fuerzas estáticas definidas en 6.1,
se cumple que:

                                      in1 I m i i2  0 ,1  in1Wi  si2 g          [6.19]


<a id="c6.6.2"></a>
### 6.6.2 Evaluación estática de la influencia rotacional  <sub>p.72</sub>


Si el sistema tiene hasta dos masas se puede realizar un análisis estático. Para tomar en
cuenta la influencia de la rotación se aplicará una cupla de eje horizontal en cada masa con
el mismo sentido que el giro de la masa, determinada por la siguiente expresión:

                                           Mci  1,5 Fi ri2 i  si
                                                                                       [6.20]

En todo otro caso se debe realizar un análisis dinámico, en cuyo modelo se incluirán los
grados de libertad rotacionales que correspondan.


<a id="c6.7"></a>
### 6.7 LIMITACIONES DE APLICACIÓN DEL MÉTODO ESTÁTICO  <sub>p.72</sub>


La aplicación del método estático se limita en función de la altura de la construcción y las
condiciones de regularidad en planta y altura de acuerdo a lo especificado en 2.7.2.


<!-- page 72 -->
