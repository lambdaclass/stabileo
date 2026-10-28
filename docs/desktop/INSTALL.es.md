# Cómo instalar Stabileo para escritorio

*[Read in English](INSTALL.md)*

La app de escritorio es Stabileo en tu propia computadora: el mismo motor de cálculo que
[stabileo.com](https://stabileo.com), tus proyectos guardados como archivos `.ded` donde quieras, y
sin necesidad de internet para calcular.

Es una versión **alfa** para quienes la prueban. Descargas: las
[versiones preliminares de escritorio en GitHub](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true)
(la más nueva está arriba).

- [Antes de empezar: qué significa "sin firmar"](#antes-de-empezar-qué-significa-sin-firmar)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Verificar una descarga a mano](#verificar-una-descarga-a-mano)
- [Actualizaciones](#actualizaciones)
- [Problemas frecuentes](#problemas-frecuentes)
- [Desinstalar](#desinstalar)

## Antes de empezar: qué significa "sin firmar"

Windows y macOS esperan que las aplicaciones lleven una firma digital, hecha con un certificado que
quien las publica paga y registra ante Microsoft o Apple. La alfa todavía no está firmada, así que
la primera vez que la abrís el sistema avisa que no conoce al editor. El aviso es por la falta de
certificado, no por algo que haya encontrado en la app.

En lugar de la firma, cada versión publica la huella SHA-256 de cada archivo en `SHA256SUMS`. Los
comandos de instalación de abajo la verifican por vos antes de instalar nada; también podés
[verificarla a mano](#verificar-una-descarga-a-mano). La firma llega antes de la versión pública, y
con ella desaparecen los avisos.

El aviso hay que pasarlo **una sola vez**, la primera vez que la abrís. Las actualizaciones no
vuelven a preguntar.

## Windows

Windows 10 u 11, de 64 bits.

### Con un comando (recomendado)

1. Abrí **PowerShell**: menú Inicio, escribí `PowerShell` y apretá Enter. No hacen falta permisos
   de administrador.
2. Pegá esta línea y apretá Enter:

   ```powershell
   irm https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.ps1 | iex
   ```

3. Descarga la versión más nueva, verifica su huella y la instala para tu usuario. Cuando diga
   `Stabileo ... is installed`, abrí **Stabileo** desde el menú Inicio.

### O a mano

1. En la [versión preliminar más nueva](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
   en **Assets**, descargá `Stabileo_<versión>_x64-setup.exe`.
2. Ejecutalo. Si el navegador avisa que el archivo no se descarga con frecuencia, elegí
   **Conservar** (en Edge: **...** ▸ **Conservar** ▸ **Mostrar más** ▸ **Conservar de todos modos**).
3. Si aparece una ventana azul que dice **"Windows protegió su PC"** (SmartScreen), hacé clic en
   **Más información** y después en **Ejecutar de todas formas**.
4. Seguí el instalador. Instala solo para tu usuario; no hacen falta permisos de administrador.

## macOS

macOS 11 (Big Sur) o posterior, en Apple silicon (M1 en adelante) o Intel.

### Con Homebrew (recomendado)

Si usás [Homebrew](https://brew.sh), en la **Terminal**:

```sh
brew install --cask lambdaclass/tap/stabileo
```

Después abrí Stabileo la primera vez como se explica en [Primera apertura](#primera-apertura-en-macos).

### Sin Homebrew, con un comando

En la **Terminal** (Aplicaciones ▸ Utilidades ▸ Terminal):

```sh
curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh
```

Descarga la versión más nueva, verifica su huella y copia Stabileo a Aplicaciones.
Los archivos que descarga un comando de la terminal no quedan marcados como bajados de internet,
así que macOS no muestra el aviso de la primera apertura para esta copia.

### O a mano

1. En la [versión preliminar más nueva](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
   en **Assets**, descargá `Stabileo_<versión>_universal.dmg` (un solo archivo para Apple silicon e
   Intel).
2. Abrilo y arrastrá **Stabileo** a **Aplicaciones**.

### Primera apertura en macOS

Stabileo todavía no está firmado con un Apple Developer ID, así que la primera vez que lo abrís
macOS dice *No se abrió "Stabileo"* (o *Apple no pudo verificar que "Stabileo" no contenga
malware...*) y solo ofrece **OK** o **Trasladar a la papelera**. Elegí **OK**, no la papelera.
Después, una sola vez:

**macOS 15 (Sequoia) y posteriores**

1. Abrí **Configuración del Sistema** ▸ **Privacidad y seguridad**.
2. Bajá hasta *Se bloqueó "Stabileo" para proteger tu Mac* y hacé clic en **Abrir igualmente**.
3. Confirmá con **Abrir igualmente** otra vez y tu contraseña o Touch ID.

**macOS 14 (Sonoma) y anteriores**

En el **Finder** ▸ **Aplicaciones**, **clic derecho** (o Control-clic) en **Stabileo** ▸ **Abrir**,
y otra vez **Abrir** en el cuadro.

**Cualquier versión, en la Terminal**

```sh
xattr -dr com.apple.quarantine /Applications/Stabileo.app
```

A partir de ahí se abre normalmente, también después de actualizarse.

## Linux

Distribuciones de 64 bits (x86_64) de 2022 en adelante, aproximadamente: Ubuntu 22.04 o posterior,
Debian 12 o posterior, Fedora 36 o posterior, o similares.

### Con un comando (recomendado)

En una terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh
```

Descarga el AppImage más nuevo, verifica su huella, lo deja en `~/.local/bin/stabileo`, agrega
Stabileo al menú de aplicaciones y hace que los archivos `.ded` se abran con él. Se actualiza solo.

### O a mano

En la [versión preliminar más nueva](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
en **Assets**, descargá uno de estos:

- `Stabileo_<versión>_amd64.AppImage`: funciona en la mayoría de las distribuciones y se actualiza
  solo. Dale permiso de ejecución y ejecutalo:

  ```sh
  chmod +x Stabileo_*_amd64.AppImage
  ./Stabileo_*_amd64.AppImage
  ```

  (o en el administrador de archivos: clic derecho ▸ Propiedades ▸ Permisos ▸ *Permitir ejecutar
  como programa*). Los AppImage necesitan FUSE 2; en Debian y Ubuntu: `sudo apt install libfuse2`
  (`libfuse2t64` en Ubuntu 24.04).
- `Stabileo_<versión>_amd64.deb`: para Debian y Ubuntu, `sudo apt install ./Stabileo_*_amd64.deb`.
  Usa el WebKitGTK del sistema y **no se actualiza solo**: la app te avisa cuando hay una versión
  nueva y te lleva a ella.

## Verificar una descarga a mano

Los comandos de instalación lo hacen por vos. Si descargaste un archivo a mano, descargá también
`SHA256SUMS` de la misma versión en la misma carpeta y, en una terminal en esa carpeta:

- macOS: `shasum -a 256 -c SHA256SUMS --ignore-missing`
- Linux: `sha256sum -c SHA256SUMS --ignore-missing`

Cada archivo que tengas tiene que decir `OK`. En Windows, en PowerShell:

```powershell
(Get-FileHash .\Stabileo_<versión>_x64-setup.exe).Hash
```

y compará el resultado con la línea de ese archivo en `SHA256SUMS` (mayúsculas o minúsculas da
igual). Si no coinciden, no lo instales: descargalo de nuevo y, si sigue sin coincidir, avisanos.

## Actualizaciones

Stabileo busca una versión nueva cada vez que arranca, y cuando elegís **Ayuda ▸ Buscar
actualizaciones** (en macOS también **Stabileo ▸ Buscar actualizaciones**). Si hay una, muestra qué
cambió y te pregunta; la instala solo si aceptás, y nunca mientras hay un cálculo en curso. Las
actualizaciones están firmadas, y la app rechaza una cuya firma no coincide.

El `.deb` de Linux no se actualiza solo: instalá el `.deb` nuevo desde la página de la versión.

## Problemas frecuentes

**El navegador bloquea o borra la descarga.** Los archivos sin firmar son poco comunes y los
navegadores desconfían. Elegí **Conservar** en la lista de descargas (Edge: **...** ▸ **Conservar**
▸ **Mostrar más** ▸ **Conservar de todos modos**; Chrome: **Conservar**). O usá la instalación con
un comando, que no pasa por el navegador.

**macOS dice que la app está dañada y que hay que tirarla a la papelera.** Es la cuarentena de una
app sin firmar, no un daño. Ejecutá `xattr -dr com.apple.quarantine /Applications/Stabileo.app` y
abrila de nuevo.

**Windows: "Windows protegió su PC".** Hacé clic en **Más información** ▸ **Ejecutar de todas
formas**. Si no aparece el botón **Ejecutar de todas formas**, una política de sistemas de tu
organización bloquea las apps sin firmar; consultales, o esperá la versión firmada.

**Linux: el AppImage no arranca.** Ejecutalo desde una terminal para ver el mensaje. `dlopen():
error loading libfuse.so.2` significa que falta FUSE 2 (ver [Linux](#linux)); `libEGL.so.1: cannot
open shared object file` significa que faltan las bibliotecas gráficas del sistema (en Debian/Ubuntu:
`sudo apt install libegl1 libgl1`; los escritorios normalmente las tienen, las instalaciones mínimas
o de servidor puede que no). Como alternativa,
`./Stabileo_*.AppImage --appimage-extract-and-run` funciona sin FUSE.

**Linux: ventana en blanco, o la vista 3D en negro o parpadeando.** Suele ser que el controlador de
video y WebKitGTK (el motor web que usan las apps de Linux) no se llevan bien, muchas veces con
NVIDIA. Arrancala con una de estas líneas y fijate cuál ayuda:

```sh
WEBKIT_DISABLE_DMABUF_RENDERER=1 stabileo
WEBKIT_DISABLE_COMPOSITING_MODE=1 stabileo
```

Con el `.deb`, otra causa es un WebKitGTK viejo: necesita `libwebkit2gtk-4.1` (Ubuntu 22.04,
Debian 12 o posteriores). El AppImage trae el suyo.

**Dónde están los registros (logs).** Stabileo escribe advertencias y errores en `stabileo.log` (y
el anterior en `stabileo.old.log`):

- Windows: `%LOCALAPPDATA%\com.stabileo.desktop\logs` (pegalo en la barra de direcciones del
  Explorador de archivos)
- macOS: `~/Library/Logs/com.stabileo.desktop` (Finder ▸ **Ir** ▸ **Ir a la carpeta...**)
- Linux: `~/.local/share/com.stabileo.desktop/logs`

**Informar un problema.** En la app, **Ayuda ▸ Informar un problema...** abre en el navegador un
reporte nuevo en GitHub con la versión de la app, del motor y tu sistema ya completos. Contá qué
hiciste, qué esperabas y qué pasó; adjuntá `stabileo.log` y, si podés, el archivo `.ded`. Hace falta
una cuenta de GitHub para enviarlo. **Ayuda ▸ Acerca de Stabileo** (en macOS **Stabileo ▸ Acerca de
Stabileo**) muestra los mismos datos, con un botón para copiarlos.

## Desinstalar

Desinstalar nunca toca tus proyectos (archivos `.ded`).

- **Windows:** **Configuración** ▸ **Aplicaciones** ▸ **Aplicaciones instaladas** ▸ **Stabileo** ▸
  **Desinstalar**.
- **macOS:** con Homebrew, `brew uninstall --cask stabileo` (agregá `--zap` para borrar también su
  configuración y cachés). Si no, arrastrá **Stabileo** de Aplicaciones a la papelera.
- **Linux:** si usaste la instalación con un comando:

  ```sh
  curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh -s -- --uninstall
  ```

  Para el `.deb`: `sudo apt remove stabileo`. Para un AppImage que ejecutaste a mano, borrá el
  archivo.
