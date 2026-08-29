using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace AgentOffice.API.Services;

public class WopiTokenService : IWopiTokenService
{
    private record TokenData(Guid FileId, string UserId, DateTime Expiry);

    private readonly ConcurrentDictionary<string, TokenData> _tokens = new();

    public string GenerateToken(Guid fileId, string userId = "user1")
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        _tokens[token] = new TokenData(fileId, userId, DateTime.UtcNow.AddHours(24));
        CleanupExpired();
        return token;
    }

    public (Guid fileId, string userId)? ValidateToken(string token)
    {
        if (_tokens.TryGetValue(token, out var data) && data.Expiry > DateTime.UtcNow)
            return (data.FileId, data.UserId);
        return null;
    }

    private void CleanupExpired()
    {
        var expired = _tokens.Where(kv => kv.Value.Expiry <= DateTime.UtcNow).Select(kv => kv.Key).ToList();
        foreach (var key in expired)
            _tokens.TryRemove(key, out _);
    }
}
