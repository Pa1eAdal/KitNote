param(
  [string]$SourcePng = "C:\Users\RuaKo\Documents\P_project\assets\app-icon.png",
  [string]$SourceIco = "C:\Users\RuaKo\Documents\P_project\assets\app-icon.ico",
  [string]$OutputDir = "src-tauri\icons"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourcePng)) {
  throw "Missing source PNG icon: $SourcePng"
}

if (-not (Test-Path -LiteralPath $SourceIco)) {
  throw "Missing source ICO icon: $SourceIco"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Add-Type -AssemblyName System.Drawing

function Save-ResizedPng {
  param(
    [string]$InputPath,
    [string]$OutputPath,
    [int]$Size
  )

  $source = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $InputPath))
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($source, 0, 0, $Size, $Size)
      } finally {
        $graphics.Dispose()
      }
      $bitmap.Save((Join-Path (Resolve-Path -LiteralPath (Split-Path $OutputPath)) (Split-Path $OutputPath -Leaf)), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Save-ResizedPng -InputPath $SourcePng -OutputPath (Join-Path $OutputDir "32x32.png") -Size 32
Save-ResizedPng -InputPath $SourcePng -OutputPath (Join-Path $OutputDir "128x128.png") -Size 128
Save-ResizedPng -InputPath $SourcePng -OutputPath (Join-Path $OutputDir "128x128@2x.png") -Size 256
Copy-Item -LiteralPath $SourceIco -Destination (Join-Path $OutputDir "icon.ico") -Force

Write-Host "Generated KitNote icons in $OutputDir"
