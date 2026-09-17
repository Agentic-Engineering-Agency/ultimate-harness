using System;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class UHJob {
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct LIMIT { public BASIC BasicLimitInformation; public IO IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime; public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUP { public uint cb; public string reserved, desktop, title; public uint x,y,xSize,ySize,xCount,yCount,fill,flags; public ushort show, reservedSize; public IntPtr reservedBytes, stdin, stdout, stderr; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS { public IntPtr process, thread; public uint pid, tid; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref LIMIT info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, ref LIMIT info, uint size, IntPtr length);
  [DllImport("kernel32.dll", EntryPoint="QueryInformationJobObject", SetLastError=true)] static extern bool QueryAccounting(IntPtr job, int kind, ref ACCOUNTING info, uint size, IntPtr length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUP startup, out PROCESS process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool all, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  // Normalize separators before applying the verbatim prefix.
  static string ExtendedPath(string value) {
    value = value.Replace('/', '\\');
    if (value.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase)) return value;
    if (value.StartsWith(@"\\", StringComparison.Ordinal)) return @"\\?\UNC\" + value.Substring(2);
    if (value.Length >= 3 && value[1] == ':' && (value[2] == '\\' || value[2] == '/')) return @"\\?\" + value;
    return value;
  }
  static string Quote(string arg) {
    StringBuilder result = new StringBuilder("\""); int slashes = 0;
    foreach(char ch in arg) {
      if (ch == '\\') { slashes++; continue; }
      if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append(ch); slashes = 0; continue; }
      result.Append('\\', slashes); slashes = 0; result.Append(ch);
    }
    result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
  }
  public static long PeakMemory;
  public static bool ParentLost;
  public static uint Run(string command, string[] args, string cwd, IntPtr parent, ulong memoryBytes, string stopPath) {
    stopPath = ExtendedPath(stopPath);
    IntPtr job = IntPtr.Zero; PROCESS child = new PROCESS();
    try {
      job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
      LIMIT limit = new LIMIT(); limit.BasicLimitInformation.LimitFlags = 0x2000;
      if (memoryBytes > 0) { limit.BasicLimitInformation.LimitFlags |= 0x200; limit.JobMemoryLimit = new UIntPtr(memoryBytes); }
      Check(SetInformationJobObject(job, 9, ref limit, (uint)Marshal.SizeOf(typeof(LIMIT))));
      if (WaitForMultipleObjects(1, new IntPtr[] { parent }, false, 0) == 0) { ParentLost = true; return 125; }
      if (System.IO.File.Exists(stopPath)) return 130;
      STARTUP startup = new STARTUP(); startup.cb = (uint)Marshal.SizeOf(typeof(STARTUP)); startup.flags = 0x100;
      startup.stdin = GetStdHandle(-10); startup.stdout = GetStdHandle(-11); startup.stderr = GetStdHandle(-12);
      StringBuilder line = new StringBuilder(Quote(command)); foreach(string arg in args) { line.Append(' '); line.Append(Quote(arg)); }
      Check(CreateProcess(null, line, IntPtr.Zero, IntPtr.Zero, true, 4 | 0x08000000, IntPtr.Zero, cwd, ref startup, out child));
      Check(AssignProcessToJobObject(job, child.process));
      Check(ResumeThread(child.thread) != 0xffffffff);
      uint waited;
      do { waited = WaitForMultipleObjects(2, new IntPtr[] { child.process, parent }, false, 100); }
      while (waited == 258 && !System.IO.File.Exists(stopPath));
      ParentLost = waited == 1;
      uint exit = ParentLost ? 125u : 130u;
      if (waited == 0) Check(GetExitCodeProcess(child.process, out exit));
      else Check(waited == 1 || waited == 258);
      Check(QueryInformationJobObject(job, 9, ref limit, (uint)Marshal.SizeOf(typeof(LIMIT)), IntPtr.Zero));
      PeakMemory = (long)limit.PeakJobMemoryUsed.ToUInt64();
      Check(TerminateJobObject(job, exit));
      ACCOUNTING accounting = new ACCOUNTING();
      for (int remaining = 1000; remaining > 0; remaining--) {
        Check(QueryAccounting(job, 1, ref accounting, (uint)Marshal.SizeOf(typeof(ACCOUNTING)), IntPtr.Zero));
        if (accounting.ActiveProcesses == 0) return exit;
        System.Threading.Thread.Sleep(10);
      }
      throw new TimeoutException("Owned Windows job did not settle");
    } finally {
      if (job != IntPtr.Zero) { TerminateJobObject(job, 125); CloseHandle(job); }
      if (child.process != IntPtr.Zero) { TerminateProcess(child.process, 125); CloseHandle(child.process); }
      if (child.thread != IntPtr.Zero) CloseHandle(child.thread);
    }
  }

  static void WriteAtomicJson(string destination, object value, System.Web.Script.Serialization.JavaScriptSerializer json) {
    string temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
    try {
      byte[] bytes = new UTF8Encoding(false).GetBytes(json.Serialize(value));
      using (var file = new System.IO.FileStream(temporary, System.IO.FileMode.CreateNew, System.IO.FileAccess.Write)) {
        file.Write(bytes, 0, bytes.Length); file.Flush(true);
      }
      if (System.IO.File.Exists(destination)) System.IO.File.Replace(temporary, destination, null);
      else System.IO.File.Move(temporary, destination);
    } finally { if (System.IO.File.Exists(temporary)) System.IO.File.Delete(temporary); }
  }
  public static int Main() {
    try {
      var json = new System.Web.Script.Serialization.JavaScriptSerializer();
      json.MaxJsonLength = 64 * 1024 * 1024;
      System.Collections.Generic.Dictionary<string, object> spec;
      using (var input = new System.IO.StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), false, 1024, true)) {
        spec = (System.Collections.Generic.Dictionary<string, object>)json.DeserializeObject(input.ReadToEnd());
      }
      int parentPid = Convert.ToInt32(spec["parentPid"]);
      using (var controller = System.Diagnostics.Process.GetProcessById(parentPid)) {
        IntPtr parent = controller.Handle;
        string[] args = Array.ConvertAll((object[])spec["args"], value => Convert.ToString(value));
        string stopPath = ExtendedPath((string)spec["stopPath"]);
        string resultPath = ExtendedPath((string)spec["resultPath"]);
        object controlPathObject;
        string controlPath = null;
        if (spec.TryGetValue("controlPath", out controlPathObject) && controlPathObject != null) controlPath = ExtendedPath((string)controlPathObject);
        uint code = Run((string)spec["command"], args, (string)spec["cwd"], parent, Convert.ToUInt64(spec["memoryBytes"]), stopPath);
        WriteAtomicJson(resultPath, new { exit_code = code, peak_memory_bytes = PeakMemory, controller_lost = ParentLost, settled = true }, json);
        if (ParentLost && controlPath != null && System.IO.File.Exists(controlPath)) {
          var control = (System.Collections.Generic.Dictionary<string, object>)json.DeserializeObject(System.IO.File.ReadAllText(controlPath));
          if (Convert.ToInt32(control["controller_pid"]) == parentPid && (string)control["status"] == "running") {
            control["status"] = "failed";
            control["heartbeat_at"] = DateTime.UtcNow.ToString("o");
            control["stop_reason"] = "Controller exited before run settlement; its Windows job was terminated";
            control["stop_code"] = "controller_lost";
            control["settlement_confirmed"] = true;
            control["peak_memory_bytes"] = PeakMemory;
            WriteAtomicJson(controlPath, control, json);
          }
        }
        return unchecked((int)code);
      }
    } catch (Exception error) {
      Console.Error.WriteLine("UH Windows job failed: " + error.Message);
      return 125;
    }
  }
}
