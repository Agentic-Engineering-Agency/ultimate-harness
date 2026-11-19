param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
# PowerShell is only the compiler; the detached native guardian owns and settles the job.
Add-Type -Path $Source -OutputAssembly $Output -OutputType ConsoleApplication -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll
