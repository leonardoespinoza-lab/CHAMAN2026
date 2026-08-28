param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('HardenDirectory', 'HardenFile', 'VerifyDirectory', 'VerifyFile')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$targetPath = [Environment]::GetEnvironmentVariable('CHAMAN_ACL_TARGET_PATH', 'Process')
if ([string]::IsNullOrWhiteSpace($targetPath)) { throw 'Falta CHAMAN_ACL_TARGET_PATH.' }
$resolved = [System.IO.Path]::GetFullPath($targetPath)
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User

function Set-RestrictedDirectory([string]$Path, $Sid) {
  if (-not [System.IO.Directory]::Exists($Path)) { throw 'El directorio ACL no existe.' }
  $security = New-Object System.Security.AccessControl.DirectorySecurity
  $security.SetOwner($Sid)
  $security.SetAccessRuleProtection($true, $false)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $Sid,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$security.AddAccessRule($rule)
  [System.IO.Directory]::SetAccessControl($Path, $security)
}

function Set-RestrictedFile([string]$Path, $Sid) {
  if (-not [System.IO.File]::Exists($Path)) { throw 'El archivo ACL no existe.' }
  $security = New-Object System.Security.AccessControl.FileSecurity
  $security.SetOwner($Sid)
  $security.SetAccessRuleProtection($true, $false)
  $rights = [System.Security.AccessControl.FileSystemRights]'Read, Write, Delete, ReadPermissions, ChangePermissions'
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $Sid,
    $rights,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$security.AddAccessRule($rule)
  [System.IO.File]::SetAccessControl($Path, $security)
}

function Assert-RestrictedAcl([string]$Path, $Sid, [bool]$IsDirectory) {
  $security = if ($IsDirectory) {
    [System.IO.Directory]::GetAccessControl($Path)
  } else {
    [System.IO.File]::GetAccessControl($Path)
  }
  if (-not $security.AreAccessRulesProtected) { throw 'ACL conserva herencia.' }
  $owner = $security.GetOwner([System.Security.Principal.SecurityIdentifier])
  if ($owner.Value -ne $Sid.Value) { throw 'Owner ACL inesperado.' }
  $rules = @($security.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1) { throw "ACL efectiva contiene $($rules.Count) reglas; se esperaba una." }
  $rule = $rules[0]
  if ($rule.IdentityReference.Value -ne $Sid.Value) { throw 'ACL concede acceso a otro SID.' }
  if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw 'ACL contiene una regla no permitida.'
  }
  if ($rule.IsInherited) { throw 'ACL efectiva contiene regla heredada.' }
  if ($IsDirectory) {
    $required = [System.Security.AccessControl.FileSystemRights]::FullControl
  } else {
    $required = [System.Security.AccessControl.FileSystemRights]'Read, Write, Delete'
  }
  if (($rule.FileSystemRights -band $required) -ne $required) { throw 'ACL no concede los permisos minimos al operador.' }
  [pscustomobject]@{
    ok = $true
    kind = if ($IsDirectory) { 'directory' } else { 'file' }
    ownerSid = $Sid.Value
    rules = $rules.Count
    protected = $security.AreAccessRulesProtected
  } | ConvertTo-Json -Compress
}

switch ($Action) {
  'HardenDirectory' { Set-RestrictedDirectory $resolved $currentSid; Assert-RestrictedAcl $resolved $currentSid $true }
  'HardenFile' { Set-RestrictedFile $resolved $currentSid; Assert-RestrictedAcl $resolved $currentSid $false }
  'VerifyDirectory' { Assert-RestrictedAcl $resolved $currentSid $true }
  'VerifyFile' { Assert-RestrictedAcl $resolved $currentSid $false }
}
