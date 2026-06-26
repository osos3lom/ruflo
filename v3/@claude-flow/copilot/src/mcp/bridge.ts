/**
 * @claude-flow/copilot - MCP bridge / call audit
 *
 * Per-session bookkeeping for MCP tool invocations made by a Copilot
 * session. The orchestrator reads `events()` after a run to feed the
 * shared telemetry sink described in ADR-146 P5.
 */

export interface CopilotMcpCallEvent {
  /** Stable session ID assigned at bridge creation */
  sessionId: string;
  /** MCP server name from the session's `mcpServers` map */
  serverId: string;
  /** Fully-qualified tool name */
  toolName: string;
  /** Anonymized input payload — caller decides what to log */
  inputSummary?: string;
  /** Whether the tool returned ok or threw */
  outcome: 'allowed' | 'denied' | 'errored';
  /** Optional error message (sanitized — never raw token-bearing payloads) */
  error?: string;
  /** Unix-ms timestamp */
  ts: number;
}

/**
 * Per-session collector. Cheap; one instance per `createSession()` call.
 */
export class CopilotMcpBridge {
  private readonly events_: CopilotMcpCallEvent[] = [];

  constructor(public readonly sessionId: string) {}

  /**
   * Record a tool call event.
   */
  record(event: Omit<CopilotMcpCallEvent, 'sessionId' | 'ts'>): void {
    this.events_.push({
      sessionId: this.sessionId,
      ts: Date.now(),
      ...event,
    });
  }

  /**
   * Return a snapshot of all events recorded so far.
   */
  events(): readonly CopilotMcpCallEvent[] {
    return [...this.events_];
  }

  /**
   * Total event count.
   */
  count(): number {
    return this.events_.length;
  }

  /**
   * Drop all recorded events. Used between iterations of `/loop`.
   */
  clear(): void {
    this.events_.length = 0;
  }
}
