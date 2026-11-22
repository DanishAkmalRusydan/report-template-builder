# Convert a .docx to PDF with Microsoft Word (COM), refreshing the table of contents first.
# Opens read-only, never saves the .docx, and doesn't add it to Word's recent files.
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$noSave = 0
try {
    # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles) – Word's COM API wants [ref] args in PowerShell 5.1.
    $file = $In; $confirm = $false; $readOnly = $true; $recent = $false
    $doc = $word.Documents.Open([ref]$file, [ref]$confirm, [ref]$readOnly, [ref]$recent)
    foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
    $doc.Repaginate()
    # 17 = wdExportFormatPDF
    $doc.ExportAsFixedFormat($Out, 17)
    $doc.Close([ref]$noSave)
}
finally {
    $word.Quit([ref]$noSave)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
