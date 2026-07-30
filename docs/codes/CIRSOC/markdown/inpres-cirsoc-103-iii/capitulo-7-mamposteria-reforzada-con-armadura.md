# INPRES-CIRSOC 103 Parte III (2018) — CAPÍTULO 7. MAMPOSTERÍA                            REFORZADA          CON   ARMADURA

> Source: `INPRES-CIRSOC-103_Parte_III-Reglamento.pdf` · PDF pages 60–65
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

DISTRIBUIDA


<a id="c7.0"></a>
### 7.0 SIMBOLOGÍA  <sub>p.60</sub>


 Ag       área bruta de la sección horizontal del muro, determinada sin considerar revoques
          ni alas constituidas por muros transversales, en mm2.
 Ahm      sección de armadura horizontal por metro de altura del muro, en mm2/m.
 Avm      sección de armadura vertical por metro de longitud del muro, en mm2/m.
 Es       módulo de elasticidad longitudinal del acero, en MPa.
 L        longitud del muro considerado, en mm.
 Md       resistencia de diseño a flexión del muro, en Nmm.
 Mn       resistencia nominal a flexión del muro, en Nmm.
 Mu       momento flector requerido o último sobre el muro, en Nmm.
 Vd       resistencia de diseño de corte del muro, en N.
 Vn       resistencia nominal de corte del muro, en N.
 Vu       esfuerzo de corte requerido o último sobre el muro, en N.
 fy       tensión de fluencia especificada de la armadura (corresponde al límite de fluencia
          nominal de la Norma IRAM-IAS), en MPa.
 f´m      resistencia especificada a la compresión de la mampostería, en MPa.
 f´v      resistencia especificada al corte de la mampostería, en MPa.
 hn       altura total máxima del muro, medida desde el borde superior de la fundación hasta
          el nivel extremo superior (techo), en mm.
 t        espesor del muro, sin considerar revoques, en mm.
 𝝆hm      cuantía de armadura horizontal mínima, en 1/m.
 𝝆vm      cuantía de armadura vertical mínima, en 1/m.
 ϕ        factor de reducción de resistencia.


<a id="c7.1"></a>
### 7.1 DEFINICIÓN Y REQUISITOS DE ESTRUCTURACIÓN  <sub>p.60</sub>


La mampostería reforzada con armadura distribuida es aquélla en la que se dispone
armadura horizontal y vertical distribuida en todo el muro, colocada de manera tal que los
mampuestos, mortero, hormigón y acero actúan en forma conjunta para resistir las
solicitaciones. En esta clase de mampostería no es necesaria la colocación de columnas de
encadenado, las vigas de encadenado deben cumplir lo establecido en los artículos
4.1.4.1.(a), 4.1.4.1.(b), 4.1.4.1.(c) y 4.1.4.2.
Reglamento INPRES-CIRSOC 103, Parte III                                            Cap. 7 - 47


<!-- page 60 -->


<a id="c7.2"></a>
### 7.2 DISEÑO DEL MURO  <sub>p.61</sub>



<a id="c7.2.1"></a>
### 7.2.1 Diseño a corte en el plano del muro  <sub>p.61</sub>


La resistencia de diseño de corte de un muro Vd deberá ser mayor o igual que el esfuerzo
de corte requerido o último Vu determinado según las combinaciones de estados de carga
establecidas en el artículo 1.4.

                                           Vd = ϕ Vn ≥ Vu                             [7 - 1]

La resistencia nominal de corte del muro se determinará con la siguiente expresión:

                                               L
                                 Vn = Ahm          f ≤ 3,0 f´v Ag                     [7 - 2]
                                              1000 y

La sección de armadura vertical por metro de longitud del muro Avm , cumplirá con las
siguientes condiciones:
                                                             hn
                                  Avm ≥ (1,45 - 0,45            ) Ahm                 [7 - 3]
                                                             L

                                     1/3 Ahm ≤ Avm ≤ Ahm                              [7 - 4]


<a id="c7.2.2"></a>
### 7.2.2 Resistencia a flexocompresión en el plano del muro  <sub>p.61</sub>


La resistencia de diseño a flexión de un muro Md (considerando el efecto de la carga axial),
deberá ser mayor o igual que el momento flector requerido o último Mu determinado según
las combinaciones de estados de carga establecidas en el artículo 1.4.

                                          Md = ϕ Mn ≥ Mu                              [7 - 5]

La resistencia nominal a flexión del muro Mn , para muros reforzados con armadura
distribuida, se debe fundamentar en las siguientes hipótesis y debe satisfacer las
condiciones de equilibrio y de compatibilidad de las deformaciones.

(a) Existe perfecta adherencia entre las barras de armadura, el hormigón o mortero que las
     rodea y la mampostería.

(b) Las deformaciones específicas en la mampostería y en las armaduras se deben
     suponer directamente proporcionales a la distancia al eje neutro.


<!-- page 61 -->

(c) La deformación máxima de la mampostería en la fibra extrema más comprimida será de
     0,0035 para mampostería con mampuestos macizos y 0,0025 para mampostería con
     bloques huecos cerámicos o de hormigón.

(d) La tensión en la armadura se debe calcular como Es veces la deformación de la
     armadura, siempre que dicha tensión resulte menor que la tensión de fluencia
     especificada fy. Para deformaciones mayores que la correspondiente a fy, la tensión en
     el acero se debe considerar independiente de la deformación, e igual a fy.

(e) Se desprecia la resistencia a tracción de la mampostería en dirección perpendicular al
     plano de asiento de los mampuestos.

(f) Se admite suponer una distribución rectangular equivalente de tensiones en la
     mampostería de valor igual a 0,80 f´m , distribuida uniformemente en una zona de
     compresión limitada por los bordes de la sección y por una línea recta paralela al eje
     neutro, ubicada a una distancia de 0,80 c a partir de la fibra más comprimida. La
     distancia c, entre la fibra más comprimida y el eje neutro, se debe medir en dirección
     perpendicular a dicho eje.

     Alternativamente, la relación entre la tensión de compresión en la mampostería y la
     deformación de la mampostería se establecerá como resultado de ensayos.

                                                    0,0025 a
                            t                        0,0035         0,80 f´m

                                                                                  a/2
                                                          a=0,80c
                                             c                                 0,80 f´mt a

                                   d

                          AS                                                    T= A S f y

                                          ε1 > εy                 Bloque
                                                                rectangular
                                           Deformación          equivalente

       Figura 7.1. Bloque rectangular equivalente de tensiones.


<a id="c7.2.3"></a>
### 7.2.3 Resistencia para acciones perpendiculares al plano del muro  <sub>p.62</sub>


La verificación de resistencia para acciones perpendiculares al plano del muro se realizará
de acuerdo a lo establecido en el Capítulo 8 de esta Parte III.

Reglamento INPRES-CIRSOC 103, Parte III                                                      Cap. 7 - 49


<!-- page 62 -->


<a id="c7.3"></a>
### 7.3 PRESCRIPCIÓN SOBRE ARMADURAS  <sub>p.63</sub>



<a id="c7.3.1"></a>
### 7.3.1 Prescripciones generales  <sub>p.63</sub>


(a) Todo espacio que contenga una barra de armadura tendrá una dimensión transversal
     mínima de 50 mm y una sección transversal mínima de 3000 mm2.

(b) La distancia libre mínima entre una barra y las paredes interiores del mampuesto no
     podrá ser menor que una vez y media el diámetro de la barra, ni que 15mm.

(c) Se dispondrán como mínimo, dos barras de 8mm de diámetro en las zonas sísmicas 1 y
     2, ó dos barras de 10mm de diámetro en las zonas sísmicas 3 y 4, en agujeros
     verticales consecutivos ubicados en las siguientes posiciones:

         ● Bordes libres de muros

         ● Intersección de muros

         ● Cada 3m de longitud de muro

(d) La armadura horizontal deberá ser continua en toda la longitud del muro y
     reglamentariamente anclada en sus extremos.

(e) Cuando el muro esté compuesto por dos hojas de mampuestos con un alma de
     hormigón, la armadura se podrá colocar en el espacio entre las capas, que deberá
     rellenarse con hormigón de gravilla. El espesor mínimo del alma de hormigón será
     mayor o igual al 30% de la suma de los espesores de los mampuestos, pero no menos
     de 70mm. Las capas de mampuestos deberán unirse por ganchos de diámetro mínimo
     6mm, con un espaciamiento máximo de 4 unidades por metro cuadrado.

(f) Cuando un muro se componga de un alma de mampuestos enchapados con hormigón
     por una o ambas caras, el espesor mínimo de cada capa de hormigón será de 30mm, el
     hormigón puede ser proyectado, las armaduras de borde deberán conformar una
     columna que abarque el espesor del muro, según lo especificado en el artículo 4.5.1.
     Las capas de hormigón deberán unirse por ganchos de diámetro mínimo 6mm, con un
     espaciamiento máximo de 4 unidades por metro cuadrado.

(g) La distancia máxima entre las barras que conforman la armadura horizontal o vertical no
     deberá exceder 6 veces el espesor del muro o 1200mm. En los casos particulares (e) y
     (f) la separación máxima será de 300mm.


<!-- page 63 -->


<a id="c7.3.2"></a>
### 7.3.2 Armaduras mínimas  <sub>p.64</sub>


(a) Armadura horizontal:

     La cuantía de armadura horizontal mínima 𝝆hm se determinará según la siguiente
     expresión:
                                            Ahm
                                   𝝆hm =          ≥ 0,0013                       [7 - 6]
                                           1000 t

(b) Armadura vertical:

     La cuantía de armadura vertical mínima 𝝆vm se determinará según la siguiente
     expresión:
                                            Avm
                                   𝝆vm =          ≥ 0,0007                       [7 - 7]
                                           1000 t


<a id="c7.3.3"></a>
### 7.3.3 Anclajes de armaduras  <sub>p.64</sub>


El anclaje de las armaduras se realizará de acuerdo con las prescripciones establecidas en
el artículo 4.6. esta Parte III.


<a id="c7.3.4"></a>
### 7.3.4 Empalme de armaduras  <sub>p.64</sub>


El empalme de las armaduras verticales dentro de los huecos de los bloques tendrá una
longitud mínima de 40 veces el menor diámetro de las barras a empalmar.

El empalme de las armaduras horizontales dentro de las juntas de mortero tendrá una
longitud mínima de 40 veces el menor diámetro de las barras a empalmar.

Reglamento INPRES-CIRSOC 103, Parte III                                         Cap. 7 - 51


<!-- page 64 -->



<!-- page 65 -->
