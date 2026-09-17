export default function denialExtension(pi) {
  pi.on("tool_call", async () => ({
    block: true,
    reason: "CONTRACT: acceptance denial budget",
  }));
}
