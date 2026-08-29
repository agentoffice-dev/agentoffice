namespace AgentOffice.API.Services;

public interface IWopiTokenService
{
    string GenerateToken(Guid fileId, string userId = "user1");
    (Guid fileId, string userId)? ValidateToken(string token);
}
