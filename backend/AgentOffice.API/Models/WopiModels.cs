using System.Text.Json.Serialization;

namespace AgentOffice.API.Models;

public class WopiLock
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    public required string LockValue { get; set; }
    public DateTime Expiry { get; set; }
}

public class WopiCheckFileInfo
{
    [JsonPropertyName("BaseFileName")]
    public required string BaseFileName { get; set; }

    [JsonPropertyName("OwnerId")]
    public string OwnerId { get; set; } = "system";

    [JsonPropertyName("Size")]
    public long Size { get; set; }

    [JsonPropertyName("UserId")]
    public string UserId { get; set; } = "user1";

    [JsonPropertyName("UserFriendlyName")]
    public string UserFriendlyName { get; set; } = "User";

    [JsonPropertyName("Version")]
    public required string Version { get; set; }

    [JsonPropertyName("LastModifiedTime")]
    public string? LastModifiedTime { get; set; }

    [JsonPropertyName("ReadOnly")]
    public bool ReadOnly { get; set; } = false;

    [JsonPropertyName("UserCanWrite")]
    public bool UserCanWrite { get; set; } = true;

    [JsonPropertyName("UserCanNotWriteRelative")]
    public bool UserCanNotWriteRelative { get; set; } = true;

    [JsonPropertyName("SupportsLocks")]
    public bool SupportsLocks { get; set; } = true;

    [JsonPropertyName("SupportsUpdate")]
    public bool SupportsUpdate { get; set; } = true;

    [JsonPropertyName("SupportsGetLock")]
    public bool SupportsGetLock { get; set; } = true;

    [JsonPropertyName("SupportsDeleteFile")]
    public bool SupportsDeleteFile { get; set; } = false;

    [JsonPropertyName("SupportsRename")]
    public bool SupportsRename { get; set; } = false;

    [JsonPropertyName("IsAnonymousUser")]
    public bool IsAnonymousUser { get; set; } = false;

    [JsonPropertyName("PostMessageOrigin")]
    public string? PostMessageOrigin { get; set; }
}
