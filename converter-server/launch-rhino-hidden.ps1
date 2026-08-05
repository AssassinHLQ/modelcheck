param(
    [Parameter(Mandatory = $true)][string]$RhinoExe,
    [Parameter(Mandatory = $true)][string]$RunScript,
    [int]$TimeoutSec = 600,
    [switch]$Minimized
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RhinoLauncher {
    public static int LastErr = 0;
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr CreateDesktop(string lpszDesktop, IntPtr lpszDevice, IntPtr pDevmode, int dwFlags, uint dwDesiredAccess, IntPtr lpsa);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CreateProcess(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);
    [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);
    [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct STARTUPINFO {
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    public static bool CreateProcessEx(string cmdLine, string desktop, bool minimized, ref PROCESS_INFORMATION pi) {
        var si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        if (desktop != null) si.lpDesktop = desktop;
        if (minimized) { si.dwFlags = 0x1; si.wShowWindow = 6; }
        bool ok = CreateProcess(null, cmdLine, IntPtr.Zero, IntPtr.Zero, false, 0x0400, IntPtr.Zero, null, ref si, out pi);
        LastErr = Marshal.GetLastWin32Error();
        return ok;
    }
}
"@

$desk = [IntPtr]::Zero
if (-not $Minimized) {
    $desk = [RhinoLauncher]::CreateDesktop("RhinoHiddenDesktop", [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x0100, [IntPtr]::Zero)
    if ($desk -eq [IntPtr]::Zero) {
        Write-Error ("CreateDesktop failed, Win32Error=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
        exit 2
    }
}

try {
    $pi = New-Object RhinoLauncher+PROCESS_INFORMATION
    $escapedScript = $RunScript.Replace('"', '\"')
    $cmdLine = '"' + $RhinoExe + '" -nosplash -runscript="' + $escapedScript + '"'

    $desktopName = $null
    if (-not $Minimized) { $desktopName = "RhinoHiddenDesktop" }
    $ok = [RhinoLauncher]::CreateProcessEx($cmdLine, $desktopName, $Minimized, [ref]$pi)
    if (-not $ok) {
        Write-Error ("CreateProcess failed, Win32Error=" + [RhinoLauncher]::LastErr)
        exit 3
    }

    $waited = [RhinoLauncher]::WaitForSingleObject($pi.hProcess, $TimeoutSec * 1000)
    if ($waited -eq 258) {
        [RhinoLauncher]::TerminateProcess($pi.hProcess, 1) | Out-Null
        [RhinoLauncher]::CloseHandle($pi.hProcess) | Out-Null
        [RhinoLauncher]::CloseHandle($pi.hThread) | Out-Null
        exit 124
    }
    $code = 0
    [RhinoLauncher]::GetExitCodeProcess($pi.hProcess, [ref]$code) | Out-Null
    [RhinoLauncher]::CloseHandle($pi.hProcess) | Out-Null
    [RhinoLauncher]::CloseHandle($pi.hThread) | Out-Null
    exit $code
} finally {
    if ($desk -ne [IntPtr]::Zero) {
        [RhinoLauncher]::CloseDesktop($desk) | Out-Null
    }
}
