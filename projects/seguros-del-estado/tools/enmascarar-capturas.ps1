# Enmascara datos personales de usuarios QA en COPIAS de capturas PNG (OCR de Windows, sin servicios externos).
# Uso (lo invoca sde/privacidad.ts): powershell -NoProfile -File enmascarar-capturas.ps1 -Entrada <dir> -Salida <dir>
# Fragmentos a ocultar: variable de entorno SDE_TOKENS_OCULTAR (separados por "|"); nunca se imprimen.
# Se oculta cada palabra que contenga un fragmento o un correo, y las palabras de nombre propio contiguas en la misma línea
# (nombre completo). Salida: una línea JSON por imagen con el número de zonas ocultadas (sin el texto reconocido).
param([Parameter(Mandatory = $true)][string]$Entrada, [Parameter(Mandatory = $true)][string]$Salida)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
function Normalizar([string]$s) { ($s.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', '').ToLowerInvariant() }
# Forma canónica tolerante al OCR: solo letras/dígitos y caracteres que el OCR confunde unificados (o/0, i/l/1, s/5).
function Canonica([string]$s) { ((Normalizar $s) -replace '[^a-z0-9]', '' -replace '0', 'o' -replace '[l1]', 'i' -replace '5', 's') }

$tokens = @(($env:SDE_TOKENS_OCULTAR -split '\|') | Where-Object { $_.Length -ge 4 } | ForEach-Object { Canonica $_ } | Where-Object { $_.Length -ge 4 })
if ($tokens.Count -eq 0) { throw 'SDE_TOKENS_OCULTAR vacío: no hay qué ocultar.' }
$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $motor) { throw 'OCR de Windows no disponible.' }
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$escala = 2

foreach ($archivo in Get-ChildItem -Path $Entrada -Filter *.png | Sort-Object Name) {
  $original = [System.Drawing.Bitmap]::FromFile($archivo.FullName)
  $ampliada = [System.Drawing.Bitmap]::new([int]($original.Width * $escala), [int]($original.Height * $escala))
  $g = [System.Drawing.Graphics]::FromImage($ampliada)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($original, 0, 0, $ampliada.Width, $ampliada.Height); $g.Dispose()
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("ocr-" + [Guid]::NewGuid().ToString('N') + '.png')
  $ampliada.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $ampliada.Dispose()
  try {
    $sf = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
    $flujo = Esperar ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flujo)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Esperar ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Esperar ($motor.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $flujo.Dispose()
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }

  $zonas = New-Object System.Collections.Generic.List[System.Drawing.RectangleF]
  foreach ($linea in $res.Lines) {
    $p = @($linea.Words)
    $marca = New-Object bool[] $p.Count
    for ($i = 0; $i -lt $p.Count; $i++) {
      if ($p[$i].Text.Contains('@')) { $marca[$i] = $true; continue }
      $n = Canonica $p[$i].Text
      if ($n.Length -lt 4) { continue }
      # La palabra contiene un fragmento, o es un trozo largo (6+) de un fragmento que el OCR separó (p. ej. «NIT» + dígitos).
      foreach ($t in $tokens) { if ($n.Contains($t) -or ($n.Length -ge 6 -and $t.Contains($n))) { $marca[$i] = $true; break } }
    }
    # Nombre completo: palabras con mayúscula inicial contiguas (poco espacio entre ellas) a una palabra marcada.
    $esNombre = { param($w) $w.Text -cmatch '^\p{Lu}\p{Ll}+$' }
    $cambio = $true
    while ($cambio) {
      $cambio = $false
      for ($i = 0; $i -lt $p.Count; $i++) {
        if ($marca[$i]) { continue }
        foreach ($j in @(($i - 1), ($i + 1))) {
          if ($j -lt 0 -or $j -ge $p.Count -or -not $marca[$j]) { continue }
          $a = $p[[Math]::Min($i, $j)].BoundingRect; $b = $p[[Math]::Max($i, $j)].BoundingRect
          if ((& $esNombre $p[$i]) -and ($b.X - ($a.X + $a.Width)) -lt (1.2 * $a.Height)) { $marca[$i] = $true; $cambio = $true; break }
        }
      }
    }
    for ($i = 0; $i -lt $p.Count; $i++) {
      if (-not $marca[$i]) { continue }
      $r = $p[$i].BoundingRect
      $zonas.Add([System.Drawing.RectangleF]::new([single]($r.X / $escala - 3), [single]($r.Y / $escala - 3), [single]($r.Width / $escala + 6), [single]($r.Height / $escala + 6)))
    }
  }

  $copia = [System.Drawing.Bitmap]::new($original)
  $original.Dispose()
  $g = [System.Drawing.Graphics]::FromImage($copia)
  $pincel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 90, 90, 90))
  foreach ($z in $zonas) { $g.FillRectangle($pincel, $z) }
  $pincel.Dispose(); $g.Dispose()
  $copia.Save((Join-Path $Salida $archivo.Name), [System.Drawing.Imaging.ImageFormat]::Png); $copia.Dispose()
  [Console]::Out.WriteLine((@{ archivo = $archivo.Name; zonas = $zonas.Count } | ConvertTo-Json -Compress))
}
