using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public interface IAuthService
{
    Task<(User? user, string? error)> RegisterAsync(string username, string email, string password);
    Task<(User? user, string? error)> LoginAsync(string email, string password);
    string GenerateToken(User user);
}
