# MCP registry boundary

This directory is reserved for the platform-owned MCP gateway and user-managed MCP connection schemas.

The gateway will distinguish built-in trusted servers from user-provided servers. A connection record must include transport, endpoint or command, encrypted secret references, workspace scope, enabled tools, approval policy, and health status. User-provided stdio servers must never execute in the API or agent-worker container.
