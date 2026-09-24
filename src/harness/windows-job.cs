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
  // STARTUPINFOEX is STARTUPINFO plus the attribute list that carries the pseudoconsole.
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPEX { public STARTUP startup; public IntPtr attributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS { public IntPtr process, thread; public uint pid, tid; }
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int Length; public IntPtr SecurityDescriptor; public bool InheritHandle; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref LIMIT info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, ref LIMIT info, uint size, IntPtr length);
  [DllImport("kernel32.dll", EntryPoint="QueryInformationJobObject", SetLastError=true)] static extern bool QueryAccounting(IntPtr job, int kind, ref ACCOUNTING info, uint size, IntPtr length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string cwd, ref STARTUPEX startup, out PROCESS process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool all, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern int CreatePseudoConsole(COORD size, IntPtr input, IntPtr output, uint flags, out IntPtr pseudoconsole);
  [DllImport("kernel32.dll", SetLastError=true)] static extern void ClosePseudoConsole(IntPtr pseudoconsole);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnSize);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES attributes, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(IntPtr file, byte[] buffer, uint toRead, out uint read, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(IntPtr file, byte[] buffer, uint toWrite, out uint written, IntPtr overlapped);
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
  static void CloseIfSet(ref IntPtr handle) { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
  // The pseudoconsole host owns one end of each pipe; drain the other end so a
  // console write can never block the worker on a full pipe.
  static void Drain(IntPtr handle) {
    byte[] buffer = new byte[8192]; uint read;
    try { while (ReadFile(handle, buffer, (uint)buffer.Length, out read, IntPtr.Zero) && read > 0) { } } catch { }
  }
  // Feeds a runtime prompt to the worker's stdin, then closes the write end so
  // the worker observes EOF. Runs on its own thread because an anonymous pipe
  // stalls once its buffer is full until the worker drains it, and the guardian
  // must stay free to wait on the job.
  static void WriteStdin(IntPtr handle, byte[] payload) {
    try {
      int offset = 0;
      while (offset < payload.Length) {
        int remaining = payload.Length - offset;
        byte[] slice = new byte[remaining];
        System.Buffer.BlockCopy(payload, offset, slice, 0, remaining);
        uint written;
        if (!WriteFile(handle, slice, (uint)remaining, out written, IntPtr.Zero) || written == 0) break;
        offset += (int)written;
      }
    } catch { }
    finally { CloseHandle(handle); }
  }
  /**
   * Attaches the worker to a windowless pseudoconsole instead of letting it (and
   * every descendant) allocate a console that a default terminal could hand off
   * to a visible window. On success the caller owns the returned handles and
   * must close the pseudoconsole and the pipe ends when the job settles; on any
   * failure nothing is leaked and the caller falls back to the classic flags.
   */
  static bool TryPseudoconsole(out IntPtr pseudoconsole, out IntPtr attributeList, out IntPtr consoleInput, out IntPtr drainRead, out System.Threading.Thread drain) {
    pseudoconsole = IntPtr.Zero; attributeList = IntPtr.Zero; consoleInput = IntPtr.Zero; drainRead = IntPtr.Zero; drain = null;
    IntPtr inputRead = IntPtr.Zero, inputWrite = IntPtr.Zero, outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero;
    bool attached = false;
    try {
      SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES();
      attributes.Length = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
      attributes.InheritHandle = true;
      if (!CreatePipe(out inputRead, out inputWrite, ref attributes, 0)) return false;
      if (!CreatePipe(out outputRead, out outputWrite, ref attributes, 0)) return false;
      // Our ends must not leak into the worker, or the drain never sees EOF.
      SetHandleInformation(inputWrite, 1, 0);
      SetHandleInformation(outputRead, 1, 0);
      COORD size = new COORD(); size.X = 120; size.Y = 30;
      if (CreatePseudoConsole(size, inputRead, outputWrite, 0, out pseudoconsole) != 0) return false;
      CloseIfSet(ref inputRead);
      CloseIfSet(ref outputWrite);
      IntPtr bytes = IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref bytes);
      if (bytes == IntPtr.Zero) return false;
      attributeList = Marshal.AllocHGlobal(bytes);
      if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref bytes)) return false;
      if (!UpdateProcThreadAttribute(attributeList, 0, new IntPtr(0x00020016), pseudoconsole, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero)) return false;
      consoleInput = inputWrite; inputWrite = IntPtr.Zero;
      drainRead = outputRead; outputRead = IntPtr.Zero;
      IntPtr handle = drainRead;
      System.Threading.Thread thread = new System.Threading.Thread(() => Drain(handle));
      thread.IsBackground = true; thread.Start();
      drain = thread;
      attached = true;
      return true;
    } catch {
      return false;
    } finally {
      if (!attached) {
        CloseIfSet(ref inputRead); CloseIfSet(ref inputWrite);
        CloseIfSet(ref outputRead); CloseIfSet(ref outputWrite);
        CloseIfSet(ref consoleInput); CloseIfSet(ref drainRead);
        if (attributeList != IntPtr.Zero) { DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); attributeList = IntPtr.Zero; }
        pseudoconsole = IntPtr.Zero;
      }
    }
  }
  public static long PeakMemory;
  public static bool ParentLost;
  public static bool Pseudoconsole;
  public static uint Run(string command, string[] args, string cwd, IntPtr parent, ulong memoryBytes, string stopPath, string stdinPayload) {
    stopPath = ExtendedPath(stopPath);
    IntPtr job = IntPtr.Zero; PROCESS child = new PROCESS();
    IntPtr pseudoconsole = IntPtr.Zero, attributeList = IntPtr.Zero, consoleInput = IntPtr.Zero, drainRead = IntPtr.Zero;
    IntPtr stdinRead = IntPtr.Zero, stdinWrite = IntPtr.Zero;
    System.Threading.Thread drain = null;
    try {
      job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
      LIMIT limit = new LIMIT(); limit.BasicLimitInformation.LimitFlags = 0x2000;
      if (memoryBytes > 0) { limit.BasicLimitInformation.LimitFlags |= 0x200; limit.JobMemoryLimit = new UIntPtr(memoryBytes); }
      Check(SetInformationJobObject(job, 9, ref limit, (uint)Marshal.SizeOf(typeof(LIMIT))));
      if (WaitForMultipleObjects(1, new IntPtr[] { parent }, false, 0) == 0) { ParentLost = true; return 125; }
      if (System.IO.File.Exists(stopPath)) return 130;
      STARTUPEX startup = new STARTUPEX();
      startup.startup.flags = 0x100;
      startup.startup.stdin = GetStdHandle(-10); startup.startup.stdout = GetStdHandle(-11); startup.startup.stderr = GetStdHandle(-12);
      // A prompt payload gets its own pipe so the worker reads it as stdin,
      // independent of the guardian's own stdin (which carries the spec).
      if (stdinPayload != null) {
        SECURITY_ATTRIBUTES stdinAttributes = new SECURITY_ATTRIBUTES();
        stdinAttributes.Length = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
        stdinAttributes.InheritHandle = true;
        Check(CreatePipe(out stdinRead, out stdinWrite, ref stdinAttributes, 0));
        SetHandleInformation(stdinWrite, 1, 0);
        startup.startup.stdin = stdinRead;
      }
      uint flags = 4;
      if (TryPseudoconsole(out pseudoconsole, out attributeList, out consoleInput, out drainRead, out drain)) {
        startup.attributeList = attributeList;
        startup.startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPEX));
        flags |= 0x080000; // EXTENDED_STARTUPINFO_PRESENT
        Pseudoconsole = true;
      } else {
        startup.startup.cb = (uint)Marshal.SizeOf(typeof(STARTUP));
        flags |= 0x08000000; // CREATE_NO_WINDOW
        Pseudoconsole = false;
      }
      StringBuilder line = new StringBuilder(Quote(command)); foreach(string arg in args) { line.Append(' '); line.Append(Quote(arg)); }
      Check(CreateProcess(null, line, IntPtr.Zero, IntPtr.Zero, true, flags, IntPtr.Zero, cwd, ref startup, out child));
      Check(AssignProcessToJobObject(job, child.process));
      Check(ResumeThread(child.thread) != 0xffffffff);
      if (stdinPayload != null) {
        CloseIfSet(ref stdinRead);
        IntPtr write = stdinWrite; stdinWrite = IntPtr.Zero;
        byte[] payloadBytes = new UTF8Encoding(false).GetBytes(stdinPayload);
        System.Threading.Thread writer = new System.Threading.Thread(() => WriteStdin(write, payloadBytes));
        writer.IsBackground = true; writer.Start();
      }
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
      if (pseudoconsole != IntPtr.Zero) ClosePseudoConsole(pseudoconsole);
      if (attributeList != IntPtr.Zero) { DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); }
      // Closing the pseudoconsole ends the pty output stream, so the drain reaches EOF.
      if (drain != null) drain.Join(1000);
      CloseIfSet(ref consoleInput);
      CloseIfSet(ref drainRead);
      CloseIfSet(ref stdinRead);
      CloseIfSet(ref stdinWrite);
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
        object stdinObject;
        string stdinPayload = spec.TryGetValue("stdin", out stdinObject) && stdinObject != null ? (string)stdinObject : null;
        uint code = Run((string)spec["command"], args, (string)spec["cwd"], parent, Convert.ToUInt64(spec["memoryBytes"]), stopPath, stdinPayload);
        WriteAtomicJson(resultPath, new { exit_code = code, peak_memory_bytes = PeakMemory, controller_lost = ParentLost, settled = true, pseudoconsole = Pseudoconsole }, json);
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
