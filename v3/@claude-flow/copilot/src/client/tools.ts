/**
 * @claude-flow/copilot - Tool / function-calling adapter
 *
 * Thin adapter over the SDK's tool-calling protocol. v1 keeps a
 * platform-neutral registry so other adapters (or tests) can compose
 * tools without taking a hard dependency on `@github/copilot-sdk`.
 */

/**
 * JSON-Schema parameter spec passed to the SDK as a tool's
 * input contract. We accept any object shape — the SDK validates.
 */
export type CopilotToolParameters = Record<string, unknown>;

/**
 * Function called when the Copilot session invokes the tool.
 */
export type CopilotToolHandler = (input: unknown) => Promise<unknown>;

/**
 * Single registered tool entry.
 */
export interface CopilotTool {
  name: string;
  description: string;
  parameters: CopilotToolParameters;
  handler: CopilotToolHandler;
}

/**
 * Define a tool. The returned object is the shape passed to
 * `createSession({ tools: [...] })`.
 */
export function defineCopilotTool(
  name: string,
  description: string,
  parameters: CopilotToolParameters,
  handler: CopilotToolHandler,
): CopilotTool {
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    throw new Error(
      `Invalid Copilot tool name "${name}". Use lowercase letters, digits, underscores, hyphens.`,
    );
  }
  if (!description.trim()) {
    throw new Error(`Tool "${name}" requires a non-empty description.`);
  }
  return { name, description, parameters, handler };
}

/**
 * Per-session tool registry. Used by `CopilotClient.createSession`.
 */
export class CopilotToolRegistry {
  private readonly tools = new Map<string, CopilotTool>();

  register(tool: CopilotTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  list(): CopilotTool[] {
    return Array.from(this.tools.values());
  }

  get(name: string): CopilotTool | undefined {
    return this.tools.get(name);
  }

  size(): number {
    return this.tools.size;
  }

  /**
   * Invoke a registered tool. Throws if unknown. Errors from the
   * handler propagate — the caller (SDK shim) is responsible for
   * translating them into the tool-call error shape.
   */
  async invoke(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown Copilot tool "${name}".`);
    }
    return tool.handler(input);
  }
}
