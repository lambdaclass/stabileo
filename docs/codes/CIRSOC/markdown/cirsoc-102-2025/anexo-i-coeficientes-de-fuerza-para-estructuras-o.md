# CIRSOC 102 (2025) — ANEXO I. COEFICIENTES DE FUERZA PARA ESTRUCTURAS O

> Source: `CIRSOC 102-2025.pdf` · PDF pages 265–275
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

ELEMENTOS ESTRUCTURALES CON SECCIÓN TRANS-
                      VERSAL UNIFORME

I.1. INTRODUCCIÓN

Las cargas de viento sobre estructuras o partes de estructuras con relaciones de esbeltez 8  /b < 40 se
determinarán utilizando las siguientes expresiones:

                                 F = GCf Ke Af qz                  [N]                          (I.1)
                                 Fx = GCfx Ke Af qz                [N]                          (I.2)
                                 Fy = GCfy Ke Af qz                [N]                          (I.3)

siendo:

qz     la presión dinámica evaluada a la altura z del baricentro del área Af usando la exposición definida en el
       artículo 5.6.3.2.
G      el factor de efecto de ráfaga del artículo 5.8.
Cf     el coeficiente de fuerza neta de las Tablas I.1 y I.2.
Cfx ,Cfy     los coeficientes de fuerza en la dirección de los ejes x , y de la estructura o elemento estructural de
             las Tablas I.3A , I.3B y I.4.
Af     el área proyectada normal al viento = b·
b      la dimensión transversal definida en las Tablas I.1 a I.5.
      la longitud de la estructura o elemento.
Ke     el factor de corrección por esbeltez de la Tabla I.6.

I.2. FORMAS PRISMÁTICAS CON SECCIONES TRANSVERSALES REDONDEADAS EN LAS ARISTAS

Los coeficientes de fuerza para formas prismáticas con secciones transversales redondeadas en las aristas se
obtendrán de Tabla I.1 en función de Vz·b. Para valores intermedios de Vz·b se acepta la interpolación lineal.
La velocidad Vz a la altura z se calcula mediante:

                                                                   z ̂
                                                         Vz = (      ) V
                                                                  10
siendo:

Vz     la velocidad de ráfaga a la altura z.
z      la altura del baricentro del área Af , en metros.
V      la velocidad básica del viento obtenida de las Figuras 1.5-1 A-D.

̂      la inversa del exponente  para la ley potencial de la velocidad de ráfaga de 3 segundos de la Tabla
       1.9-1.


<!-- page 265 -->

Tabla I.1 - Coeficientes de fuerza para formas prismáticas redondeadas
                                                                     Coeficiente de fuerza Cf
               Forma de la sección transversal
                                                                Vz·b < 4 m2/s        Vz·b > 10 m2/s

                                   Rugosa o con salientes           1,2                   1,2

      V
                               b

                                   Lisa                             1,2                   0,6

                           d                     Elipse

      V                                                             0,7                   0,3
                                                  b 1
                                           b       
                                                  d 2

                           d
                                                 Elipse

        V                                                           1,7                   1,5
                                                  b
                                   b                2
                                                  d

                                               b      r 1
                                                 1 ;              1,2                   0,6
    V                                          d      b 3
                   r
                                       b

                                               b      r   1
                                                 1 ;              1,3                   0,7
                                               d      b 16

                           d

                                               b 1        r 1
        V                                            ;            0,4                   0,3
                                               d 2        b 2
                       r                   b

Reglamento CIRSOC 102-25                                                                        Anexo I - 248


<!-- page 266 -->

 Tabla I.1 - (Continuación)
                                                                                    Coeficiente de fuerza Cf
                 Forma de la sección transversal
                                                                               Vz·b < 4 m2/s        Vz·b > 10 m2/s

                                                    b 1          r 1
                                                            ;    
                                                    d 2          b 6
         V                                                                         0,7                   0,7
                          r                 b

                                                b           r   1
                                                  2 ;        
                                                d           b 12
     V                                                                             1,9                   1,9
                      r
                                        b

                                                    b            r 1
                                                      2 ;        
                                                    d            b 4
             V
                     r                                                             1,6                   0,6
                                            b

                                                       r 1                         1,2                   0,5
                                                        
                                                       a 3

                 a
                                                      r   1
         V
                                                                                  1,6                   1,6
                          r                           a 12
                                                b
                              45º

                                                       r   1                       1,6                   1,6
                                                         
                              d                        a 48


<!-- page 267 -->

Tabla I.1 - (Continuación)
                                                                      Coeficiente de fuerza Cf
               Forma de la sección transversal
                                                                 Vz·b < 4 m2/s        Vz·b > 10 m2/s

                                            r 1
                                                                    1,2                   0,5
                                            b 4

          V                                  r   1
                         r           b         
                                             b 12                    1,4                   1,4

                                             r   1
                                                                    1,3                   1,3
                                             b 48

                                              r 1
                                               
      V                                       b 4                    1,3                   0,5
                     r           b

                                            1 r  1
                                              
                                           12 b 48
                                                                     2,1                   2,1

Notas:

<a id="c1"></a>
### 1 Los valores en Tabla I.1 se han derivado de los ensayos en túnel de viento que se describen en el  <sub>p.268</sub>

   trabajo Delaney, N.K. y Sorensen, N.E., “Low-speed Drag of Cylinders of Various Shapes”, National
   Advisory Committee for Aeronautics, Technical Note 3038, 1953.

<a id="c2"></a>
### 2 Los coeficientes de fuerza para formas prismáticas con secciones transversales redondeadas en las  <sub>p.268</sub>

   aristas dependen del número de Reynolds (Re):

                                                        Vb
                                                 Re =
                                                        

     siendo:
            V    la velocidad básica del viento en m/s de las Figuras 1.5-1 A-D.
            b    una dimensión de la sección transversal, en m.
                la viscosidad cinemática

<a id="c3"></a>
### 3 Para aire a presión y temperatura constantes, Re es proporcional a V·b . En flujo turbulento de gran  <sub>p.268</sub>

   escala el número de Reynolds “crítico” varía en un amplio rango en el cual se puede interpolar
   linealmente.

Reglamento CIRSOC 102-25                                                                         Anexo I - 250


<!-- page 268 -->

I.3. FORMAS PRISMÁTICAS CON SECCIONES TRANSVERSALES DE ARISTAS VIVAS

Los coeficientes de fuerza para formas prismáticas con secciones transversales de aristas vivas, con excepción
de los prismas rectangulares, se obtendrán de la Tabla I.2.

Nota: Los coeficientes de fuerza para secciones de aristas vivas son independientes del número de Reynolds.
La Tabla I.2 presenta los valores para las secciones transversales poligonales más comunes, con excepción de
los prismas rectangulares, que se tratan separadamente en el artículo I.4.

I.4. PRISMAS DE SECCION RECTANGULAR

Los coeficientes de fuerza Cfx y Cfy para prismas de sección rectangular se obtendrán de Tablas I.3A y I.3B.
Para estructuras con relaciones d/b > 1, inclinadas con respecto al viento un ángulo   15º, los valores de Cfx
obtenidos de Tabla I.3A deberán incrementarse por el factor [1 + (d/b) tg ].
Para estructuras con relaciones d/b  1, inclinadas con respecto al viento un ángulo   15º no se requiere
incrementar los valores Cfx.

I.5. PERFILES ESTRUCTURALES

Los coeficientes de fuerza Cfx y Cfy para secciones de perfiles, simples o compuestas, se obtienen de Tabla I.4.
En la misma, el ángulo  de dirección del viento debe medirse siempre en sentido antihorario.

I.6. COEFICIENTES DE FUERZA PARA TIRANTES, CABLES Y TUBERÍAS DE ESBELTEZ INFINITA

Los coeficientes de fuerza Cf para tirantes, cables y tuberías de esbeltez infinita se obtendrán de la Tabla I.5.

I.7. CORRECCIONES POR ESBELTEZ

Los factores de corrección por esbeltez Ke se obtendrán de Tabla I.6, donde la relación de esbeltez de la
estructura o elemento estructural es mayor que 8,0.

Nota:
Cuando la esbeltez de la estructura o elemento estructural se reduce se facilita el flujo de aire alrededor de sus
extremos. Este trayecto adicional de aire reduce la magnitud de la fuerza promedio actuante.


<!-- page 269 -->

Tabla I.2 - Coeficientes de fuerza para prismas con aristas vivas

                                                                                          Coeficiente de fuerza
                            Forma de la sección
                                                                                                   Cf
                                            Cuadrado con cara frente al viento

        V
                                                                                                   2,2
                                    b

                           b

            V                               Cuadrado con arista frente al viento                   1,5

                                            Triángulo equilátero con arista frente al
                                                viento
            V
                                                                                                   1,2
                                b

                                                Triángulo equilátero con cara frente al
                                                viento
        V
                                                                                                   2,0
                                b

                                                Triángulo rectángulo

            V
                            b                                                                     1,55

                                                Octógono

            V                                                                                      1,4
                                        b

    V                               b          Dodecágono                                          1,3

Reglamento CIRSOC 102-25                                                                                 Anexo I - 252


<!-- page 270 -->

 Tabla I.3A - Coeficientes de fuerza Cfx para prismas rectangulares

                                                                             Fx
                                                  b
                              

                         Dirección del viento
                                                                d

                                       Relación de
                                       dimensiones              Coeficiente de fuerza
                                            d                            Cfx
                                           ( )
                                            b
                                             0,10                          2,2

                                             0,65                          3,0

                                              1                            2,2

                                              2                            1,6

                                              4                            1,3

                                              10                          1,1


<!-- page 271 -->

 Tabla I.3B - Coeficientes de fuerza Cfy para prismas rectangulares

                                                                       Fy

                                                   b
                                   

                               Dirección del viento
                                                                d

                                 Relación de
                                 dimensiones           Coeficiente de fuerza
                                      d                         Cfy
                                     ( )
                                      b
                                       0,5                      1,2

                                       1,5                      0,8
                                       2,5                      0,6

                                        4                       0,8

                                        20                     1,0

   Notas:

<a id="c1"></a>
### 1 Los datos de la Tabla I.3A se tomaron de Jancauskas, E.D., “The Cross-Wind Exitation of Bluff  <sub>p.272</sub>

      Structuras”, Ph.D.Thesis, Monash University, 1983. El valor máximo de Cfx que se obtiene para
      secciones con relaciónes d/b alrededor de 0,65, fueron presentados por primera vez por Nakaguchi,
      N., Hashimoto, K.. y Muto, S. “An Experimental Study on Aerodynamic Drag of Rectangular
      Cylinders”, Journal Japan Society for Aeronautical and Space Sciences, Vol.16, 1968.

<a id="c2"></a>
### 2 La Tabla I.3B contiene valores máximos de Cfy para ángulos  < 20º. Este tipo de variación puede  <sub>p.272</sub>

      ocurrir en flujo turbulento nominalmente paralelo a una cara.

<a id="c3"></a>
### 3 Para direcciones oblicuas de viento  > 20º, se necesita de información más detallada o el consejo  <sub>p.272</sub>

      de especialistas.

Reglamento CIRSOC 102-25                                                                          Anexo I - 254


<!-- page 272 -->

 Tabla I.4 – Coeficientes de fuerza Cfx , Cfy para perfiles estructurales

      θ              Cfx              Cfy             Cfx             Cfy           Cfx     Cfy
      0°             +1,9            +0,95            +1,8            +1,8         +1,75   +0,1
     45°             +1,8            +0,8             +2,1            +1,8         +0,85   +0,85
     90°             +2,0            +1,7             -1,9            -1,0         +0,1    +1,75
     135°            -1,8             -0,1            -2,0            +0,3         -0,75   +0,75
     180°            -2,0            +0,1             -1,4            -1,4         -1,75    -0,1

      θ               Cfx             Cfy             Cfx             Cfy           Cfx    Cfy
      0°             +1,6              0              +2,0             0           +2,05    0
     45°             +1,5             -0,1            +1,2           +0,9          +1,85   +0,6
     90°             -0,95           +0,7             -1,6           +2,15           0     +0,6
     135°             -0,5           +1,05            -1,1           +2,4           -1,6   +0,4
     180°             -1,5             0              -1,7           ±2,1           -1,8    0

       θ              Cfx             Cfy             Cfx             Cfy          Cfx      Cfy
      0°             +2,05             0              +1,6             0           +1,4     0
      45°            +1,95            +0,6            +1,5            +1,5         +1,2    +1,6
      90°            ±0,5             +0,9             0              +1,9          0      +2,2


<!-- page 273 -->

 Tabla I.4 - Continuación

 Nota:
 Estos datos no se publicaron y aparecen por primera vez en las normas suizas SIA Technische Normen
 Nr.160, “Normen für Belastungsannahmen, die Inbetriebnahme und die Uberwachung Bauten”, 1956. Se
 debe notar que la dimensión b utilizada en la definición de los coeficientes de fuerza no siempre es normal
 a la dirección del flujo.

Tabla I.5 - Coeficientes de fuerza para cables, tirantes y tuberías

                     Características del flujo de
                                                       Características de la superficie              Cf
                                 aire

                                                                Trenzados finos                     1,20
                             Vz b < 0,6 m2/s
                                                              Trenzados gruesos                     1,30
     CABLES
                                                                Trenzados finos                     0,90
                             Vz b  0,6 m2/s
                                                              Trenzados gruesos                     1,10

                                                                      Lisa                          1,20
                             Vz b < 0,6 m2/s
   TIRANTES Y                                               Moderadamente rugosa                    1,20
    TUBERÍAS                                                          Lisa                          0,50
                             Vz b  0,6 m2/s
                                                            Moderadamente rugosa                    0,70

 Tabla I.6 - Factor de corrección por relación de esbeltez

                              Relación de esbeltez          Factor de corrección
                                       
                                      ( )                            Ke
                                       b
                                          8                           0,7
                                         14                           0,8
                                         30                           0,9
                                     40 o más                         1,0

 Nota: Para valores intermedios de la relación de esbeltez ( / b), se permite la interpolación lineal.

Reglamento CIRSOC 102-25                                                                                  Anexo I - 256


<!-- page 274 -->

TABLA: Referencia cruzada de prescripciones de CIRSOC 102-2005 a
       CIRSOC 102-2025
Las equivalencias son conceptuales y de tratamiento, no textuales. CIRSOC 102-2025 incluye además un
volumen significativo de prescripciones que no están en CIRSOC 102-2005.

                       Edición 2005                                                     Edición 2025

CAPÍTULO 1. REQUISITOS GENERALES                                 -


<a id="c1.1"></a>
### 1.1 CAMPO DE VALIDEZ                                            -  <sub>p.275</sub>


<a id="c1.2"></a>
### 1.2 PROCEDIMIENTOS ADMITIDOS                                    1.1.2.    Procedimientos permitidos  <sub>p.275</sub>


<a id="c1.3"></a>
### 1.3 PRESIONES DE VIENTO QUE ACTÚAN SOBRE LAS                    1.4.3.    Presiones de viento actuando sobre caras opuestas  <sub>p.275</sub>

     CARAS OPUESTAS DE CADA SUPERFICIE DEL                                 de cada superficie del edificio
     EDIFICIO

<a id="c1.4"></a>
### 1.4 CARGA DE VIENTO DE DISEÑO MÍNIMA                            2.1.5.    Cargas de viento de diseño mínimas  <sub>p.275</sub>

                                                                 4.8.      CARGAS DE VIENTO DE DISEÑO MÍNIMAS
                                                                 5.2.2.    Presiones de viento de diseño mínimas

CAPÍTULO 2. DEFINICIONES                                         1.2. DEFINICIONES

CAPÍTULO 3. SIMBOLOGÍA                                           1.3. SIMBOLOGÍA

CAPÍTULO 4.       MÉTODO     1        -    PROCEDIMIENTO         2.5.     PARTE 2:    EDIFICIOS          CERRADOS,
                  SIMPLIFICADO                                                PARCIALMENTE        CERRADOS      O
                                                                              PARCIALMENTE ABIERTOS DE DIAFRAGMA
                                                                              SIMPLE CON ALTURA MENOR O IGUAL QUE
                                                                              10 m – PROCEDIMIENTO SIMPLIFICADO
                                                                 5.13.    PARTE 6:    EDIFICIOS DE BAJA ALTURA –
                                                                              PROCEDIMIENTO SIMPLIFICADO

CAPÍTULO 5.       MÉTODO    2         -    PROCEDIMIENTO         -
                  ANALÍTICO


<a id="c5.1"></a>
### 5.1 CAMPO DE VALIDEZ                                            2.1.2. Condiciones  <sub>p.275</sub>

                                                                 4.1.2. Condiciones
                                                                 5.1.2. Condiciones

<a id="c5.2"></a>
### 5.2 LIMITACIONES                                                2.1.3. Limitaciones  <sub>p.275</sub>

                                                                 4.1.3. Limitaciones
                                                                 5.1.3. Limitaciones

<a id="c5.3"></a>
### 5.3 PROCEDIMIENTO DE DISEÑO                                     Figura 1.1-1. Lineamientos del proceso para evaluar las  <sub>p.275</sub>

                                                                 cargas de viento.

<a id="c5.4"></a>
### 5.4 VELOCIDAD BÁSICA DEL VIENTO                                 1.5. MAPA DE RIESGO DE VIENTO  <sub>p.275</sub>


<a id="c5.5"></a>
### 5.5 FACTOR DE IMPORTANCIA                                       No se aplica este factor  <sub>p.275</sub>


<a id="c5.6"></a>
### 5.6 CATEGORÍAS DE EXPOSICIÓN                                    1.7.3. Categorías de exposición  <sub>p.275</sub>


<a id="c5.7"></a>
### 5.7 EFECTOS TOPOGRÁFICOS                                        1.8. EFECTOS TOPOGRÁFICOS  <sub>p.275</sub>


<a id="c5.8"></a>
### 5.8 FACTOR DE EFECTO DE RÁFAGA                                  1.9. EFECTOS DE RÁFAGA  <sub>p.275</sub>


<a id="c5.9"></a>
### 5.9 CLASIFICACIÓN DE CERRAMIENTOS                               1.10. CLASIFICACIÓN DE CERRAMIENTO  <sub>p.275</sub>


<a id="c5.10"></a>
### 5.10 PRESIÓN DINÁMICA                                           1.13.2. Presión dinámica  <sub>p.275</sub>


<a id="c5.11"></a>
### 5.11 COEFICIENTES DE PRESIÓN Y FUERZA                           Distribuido en los artículos correspondientes a cada tipología  <sub>p.275</sub>

                                                                 constructiva en Capítulos 2, 4 y 5.

<a id="c5.12"></a>
### 5.12 CARGAS DE VIENTO DE DISEÑO EN EDIFICIOS                  Distribuido en los artículos correspondientes a cada tipología  <sub>p.275</sub>

        CERRADOS Y PARCIALMENTE CERRADOS                         constructiva en Capítulos 2 y 5.

<a id="c5.13"></a>
### 5.13 CARGAS DE VIENTO DE DISEÑO SOBRE                         Distribuido en los artículos correspondientes a cada tipología  <sub>p.275</sub>

        EDIFICIOS ABIERTOS Y OTRAS ESTRUCTURAS                   constructiva en Capítulos 2, 4 y 5.

CAPÍTULO 6.       MÉTODO 3 - PROCEDIMIENTO DEL                   CAPÍTULO 6.       PROCEDIMIENTO          DE    TÚNEL       DE
                  TÚNEL DE VIENTO                                                  VIENTO


<a id="c6.1"></a>
### 6.1 CAMPO DE VALIDEZ                                            6.1. ALCANCE  <sub>p.275</sub>


<a id="c6.2"></a>
### 6.2 CONDICIONES DE ENSAYO                                       6.2. CONDICIONES DE ENSAYO  <sub>p.275</sub>


<a id="c6.3"></a>
### 6.3 RESPUESTA DINÁMICA                                          6.3. RESPUESTA DINÁMICA  <sub>p.275</sub>

                                                                                                                      (Continúa)


<!-- page 275 -->

                    Edición 2005                                       Edición 2025


<a id="c6.4"></a>
### 6.4 LIMITACIONES                                -  <sub>p.276</sub>


FIGURAS Y TABLAS

Figura 1 A                                       Figura 1.5-1A a Figura 1.5-1C
Figura 1 B                                       Figura 1.5-D
Figura 2                                         Figura 1.8-1
Figura 3                                         Figura 2.4-1
Figura 4                                         Figura AC.3-1
Figura 5 A                                       Figura 5.3-1
Figura 5 B                                       Figura 5.3-2A a Figura 5.3-2G
Figura 5 C                                       Figura 5.3-3
Figura 6                                         Figura 5.3-4
Figura 7 A                                       Figura 5.3-5A y Figura 5.3-5B
Figura 7 B                                       Figura 5.3-6
Figura 8                                         Figura 5.4-1
Figura 9                                         Figura 2.4-8
Tabla 1                                          -
Tabla 2                                          Tabla 2.5-2
Tabla 3 A                                        Tabla 5.13-2
Tabla 4                                          Tabla 1.9-1
Tabla 5                                          Tabla 1.13-1
Tabla 6                                          Tabla 1.6-1
Tabla 7                                          Tabla 1.11-1
Tabla 8                                          Figura 2.4-3 y Figura 5.3-8
Tabla 9                                          -
Tabla 10                                         Figura 4.5-1
Tabla 11                                         Figura 4.4-1
Tabla 12                                         Figura 4.5-2
Tabla 13                                         Figura 4.5-3

APÉNDICES Y ANEXOS

APÉNDICE A -    CLASIFICACIÓN DE EDIFICIOS   Y   Tabla 1.14-1. Categoría de riesgo para edificios y otras
                OTRAS ESTRUCTURAS                estructuras

APÉNDICE B -    COMBINACIONES DE CARGAS QUE      APÉNDICE B -     COMBINACIONES DE CARGAS QUE
                INCLUYEN CARGA DE VIENTO                          INCLUYEN CARGA DE VIENTO

ANEXO I - CUBIERTAS AISLADAS                     2.4.3. Edificios abiertos o cubiertas aisladas, de vertiente
                                                        única o a dos aguas con diedro positivo o negativo
                                                 5.5.   PARTE 3: EDIFICIOS ABIERTOS
