param(
  [string]$Source = (Join-Path $PSScriptRoot '..\public\images\chaman-mark.png'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\favicon'),
  [string]$ImagesDirectory = (Join-Path $PSScriptRoot '..\public\images')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$background = [System.Drawing.Color]::FromArgb(255, 7, 43, 42)
$mark = [System.Drawing.Color]::FromArgb(255, 202, 255, 61)
$sourceImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))

try {
  $minX = $sourceImage.Width
  $minY = $sourceImage.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $sourceImage.Height; $y++) {
    for ($x = 0; $x -lt $sourceImage.Width; $x++) {
      if ($sourceImage.GetPixel($x, $y).A -gt 8) {
        $minX = [Math]::Min($minX, $x)
        $minY = [Math]::Min($minY, $y)
        $maxX = [Math]::Max($maxX, $x)
        $maxY = [Math]::Max($maxY, $y)
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    throw 'La marca fuente no contiene pixeles visibles.'
  }

  $bounds = [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)

  function New-ChamanIcon {
    param(
      [int]$Size,
      [string]$FileName,
      [double]$MarkCoverage = 0.64,
      [string]$Directory = $OutputDirectory,
      [bool]$Transparent = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $resizedMark = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $markGraphics = [System.Drawing.Graphics]::FromImage($resizedMark)

    try {
      $graphics.Clear($(if ($Transparent) { [System.Drawing.Color]::Transparent } else { $background }))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

      $markGraphics.Clear([System.Drawing.Color]::Transparent)
      $markGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $markGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $markGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $markGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

      $maxWidth = [Math]::Floor($Size * $MarkCoverage)
      $maxHeight = [Math]::Floor($Size * $MarkCoverage)
      $scale = [Math]::Min($maxWidth / $bounds.Width, $maxHeight / $bounds.Height)
      $targetWidth = [Math]::Max(1, [Math]::Round($bounds.Width * $scale))
      $targetHeight = [Math]::Max(1, [Math]::Round($bounds.Height * $scale))
      $targetX = [Math]::Round(($Size - $targetWidth) / 2)
      $targetY = [Math]::Round(($Size - $targetHeight) / 2)
      $destination = New-Object System.Drawing.Rectangle($targetX, $targetY, $targetWidth, $targetHeight)

      $markGraphics.DrawImage(
        $sourceImage,
        $destination,
        $bounds.X,
        $bounds.Y,
        $bounds.Width,
        $bounds.Height,
        [System.Drawing.GraphicsUnit]::Pixel
      )

      for ($y = 0; $y -lt $Size; $y++) {
        for ($x = 0; $x -lt $Size; $x++) {
          $alpha = $resizedMark.GetPixel($x, $y).A
          if ($alpha -gt 0) {
            $resizedMark.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $mark.R, $mark.G, $mark.B))
          }
        }
      }

      $graphics.DrawImageUnscaled($resizedMark, 0, 0)
      $outputPath = Join-Path $Directory $FileName
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      return $bitmap.Clone()
    }
    finally {
      $markGraphics.Dispose()
      $resizedMark.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  $icon16 = New-ChamanIcon -Size 16 -FileName 'favicon-16x16.png' -MarkCoverage 0.72
  $icon32 = New-ChamanIcon -Size 32 -FileName 'favicon-32x32.png' -MarkCoverage 0.70
  $icon180 = New-ChamanIcon -Size 180 -FileName 'apple-touch-icon.png'
  $icon192 = New-ChamanIcon -Size 192 -FileName 'android-chrome-192x192.png'
  $icon512 = New-ChamanIcon -Size 512 -FileName 'android-chrome-512x512.png'
  $maskable512 = New-ChamanIcon -Size 512 -FileName 'maskable-512x512.png' -MarkCoverage 0.58
  $transparentMark = New-ChamanIcon -Size 512 -FileName 'chaman-mark-fluor.png' -MarkCoverage 0.92 -Directory $ImagesDirectory -Transparent $true

  try {
    $iconHandle = $icon32.GetHicon()
    $favicon = [System.Drawing.Icon]::FromHandle($iconHandle)
    $stream = [System.IO.File]::Create((Join-Path $OutputDirectory 'favicon.ico'))
    try {
      $favicon.Save($stream)
    }
    finally {
      $stream.Dispose()
      $favicon.Dispose()
    }
  }
  finally {
    $icon16.Dispose()
    $icon32.Dispose()
    $icon180.Dispose()
    $icon192.Dispose()
    $icon512.Dispose()
    $maskable512.Dispose()
    $transparentMark.Dispose()
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Host "Iconos PWA generados en $OutputDirectory"
