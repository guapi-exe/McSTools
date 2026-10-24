param(
    [Parameter(Mandatory = $true)][int]$AppProcessId,
    [ValidateSet('Inspect', 'SetFileName', 'InvokeButton')][string]$Action = 'Inspect',
    [string]$DialogTitle,
    [long]$DialogHandle,
    [string]$Value,
    [string]$AutomationId
)

# Only touch a native dialog owned by this checkout's explicitly selected test
# process. Do not send global keystrokes or activate unrelated applications.
$ErrorActionPreference = 'Stop'
$expectedExecutable = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src-tauri/target/debug/mcstools.exe'))
$appProcess = Get-Process -Id $AppProcessId
if ($appProcess.Path -ne $expectedExecutable) {
    throw "Refusing to control a process outside the test executable: $($appProcess.Path)"
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$processCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $AppProcessId)
$windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children, $processCondition)
if ($DialogHandle) {
    $owned = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$DialogHandle)
    if ($owned.Current.ProcessId -ne $AppProcessId) { throw 'Dialog belongs to a different process.' }
    $windows = @($owned)
}
$dialogs = @($windows | Where-Object {
    $_.Current.ClassName -eq '#32770' -and (!$DialogTitle -or $_.Current.Name -eq $DialogTitle)
})
if ($Action -eq 'Inspect') {
    $result = foreach ($window in $windows) {
        $controls = @()
        if ($window.Current.ClassName -eq '#32770') {
            $controls = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                [System.Windows.Automation.Condition]::TrueCondition) | Where-Object {
                $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or
                ($_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $_.Current.AutomationId -notlike 'System.*')
            } | Select-Object -First 60 | ForEach-Object {
                [pscustomobject]@{name=$_.Current.Name; id=$_.Current.AutomationId; type=$_.Current.ControlType.ProgrammaticName; enabled=$_.Current.IsEnabled}
            })
        }
        [pscustomobject]@{title=$window.Current.Name; class=$window.Current.ClassName; handle=$window.Current.NativeWindowHandle; controls=$controls}
    }
    $result | ConvertTo-Json -Depth 5
    exit 0
}
if ($dialogs.Count -ne 1) { throw "Expected exactly one matching native dialog; found $($dialogs.Count). Inspect and supply its exact title." }
$dialog = $dialogs[0]
if ($Action -eq 'SetFileName') {
    if (!$Value) { throw 'A filename is required.' }
    $fileNameId = if ($AutomationId) { $AutomationId } else { '1001' }
    $control = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.AndCondition]::new(
            [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $fileNameId),
            [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
    if (!$control -or $control.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) {
        throw 'Filename edit control not found; inspect this dialog before continuing.'
    }
    $control.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($Value)
} else {
    if (!$AutomationId) { throw 'An explicit button automation ID is required.' }
    $control = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.AndCondition]::new(
            [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $AutomationId),
            [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
    if (!$control -or $control.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) {
        throw 'Requested button not found; inspect this dialog before continuing.'
    }
    $control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}
