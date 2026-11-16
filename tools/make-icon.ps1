$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Add-RoundRect($path, [single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

function New-IconPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [single]($size * 0.085)
  $w = [single]($size - $pad * 2)
  $rect = New-Object System.Drawing.RectangleF($pad, $pad, $w, $w)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundRect $path $pad $pad $w $w ([single]($size * 0.215))

  $c1 = [System.Drawing.Color]::FromArgb(255, 92, 184, 255)
  $c2 = [System.Drawing.Color]::FromArgb(255, 0, 94, 235)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [single]60)
  $g.FillPath($brush, $path)

  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236, 255, 255, 255))
  $sunR = [single]($w * 0.098)
  $g.FillEllipse($white, [single]($pad + $w * 0.255), [single]($pad + $w * 0.225), $sunR * 2, $sunR * 2)

  $base = [single]($pad + $w * 0.735)
  $mountain = New-Object System.Drawing.Drawing2D.GraphicsPath
  $mountain.AddPolygon(@(
    (New-Object System.Drawing.PointF([single]($pad + $w * 0.145), $base)),
    (New-Object System.Drawing.PointF([single]($pad + $w * 0.405), [single]($pad + $w * 0.475))),
    (New-Object System.Drawing.PointF([single]($pad + $w * 0.545), [single]($pad + $w * 0.605))),
    (New-Object System.Drawing.PointF([single]($pad + $w * 0.715), [single]($pad + $w * 0.405))),
    (New-Object System.Drawing.PointF([single]($pad + $w * 0.865), $base))
  ))
  $g.FillPath($white, $mountain)

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  $mountain.Dispose()
  $white.Dispose()
  $brush.Dispose()
  $path.Dispose()
  $g.Dispose()
  $bmp.Dispose()
  return ,$bytes
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @{}
foreach ($s in $sizes) { $images[$s] = New-IconPng $s }

[System.IO.File]::WriteAllBytes((Join-Path $outDir 'app-icon.png'), $images[256])

$icoPath = Join-Path $outDir 'app.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $data = $images[$s]
  $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
  $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$data.Length)
  $bw.Write([UInt32]$offset)
  $offset += $data.Length
}
foreach ($s in $sizes) {
  $data = $images[$s]
  $bw.Write($data)
}
$bw.Dispose()
$fs.Dispose()

Write-Output "icon written: $icoPath"
