# OCR local. El texto reconocido queda SOLO en el directorio privado de trabajo; no se imprime.
param([Parameter(Mandatory=$true)][string]$Entrada, [Parameter(Mandatory=$true)][string]$Salida)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op,[Type]$tipo) { $t=$asTask.MakeGenericMethod($tipo).Invoke($null,@($op)); $t.Wait(-1) | Out-Null; $t.Result }
$motor=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if(-not $motor){throw 'OCR local no disponible: no se genera una copia supuestamente anonimizada.'}
New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$i=0
foreach($archivo in Get-ChildItem -LiteralPath $Entrada -Filter *.png | Sort-Object Name){
  $sf=Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($archivo.FullName)) ([Windows.Storage.StorageFile])
  $flujo=Esperar ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $dec=Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flujo)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp=Esperar ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res=Esperar ($motor.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $lineas=@(foreach($l in $res.Lines){ ,@(foreach($w in $l.Words){ @{texto=$w.Text;x=$w.BoundingRect.X;y=$w.BoundingRect.Y;w=$w.BoundingRect.Width;h=$w.BoundingRect.Height} }) })
    @{archivo=$archivo.Name;lineas=$lineas} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $Salida ($archivo.BaseName+'.json')) -Encoding UTF8
  } finally { $flujo.Dispose() }
  $i++; if(($i % 10) -eq 0){[Console]::Out.WriteLine("OCR local: $i imagenes procesadas")}
}
[Console]::Out.WriteLine("OCR terminado: $i imagenes. No se publica texto reconocido.")
