using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AgentOffice.API.Data;
using AgentOffice.API.Models;

namespace AgentOffice.API.Services;

public class AuthService(AppDbContext db, IConfiguration config) : IAuthService
{
    private readonly PasswordHasher<User> _hasher = new();

    public async Task<(User? user, string? error)> RegisterAsync(string username, string email, string password)
    {
        if (await db.Users.AnyAsync(u => u.Email == email))
            return (null, "This email is already in use");

        if (await db.Users.AnyAsync(u => u.Username == username))
            return (null, "This username is already taken");

        var user = new User { Username = username, Email = email, PasswordHash = string.Empty };
        user.PasswordHash = _hasher.HashPassword(user, password);

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (user, null);
    }

    public async Task<(User? user, string? error)> LoginAsync(string email, string password)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null) return (null, "Incorrect email or password");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed) return (null, "Incorrect email or password");

        return (user, null);
    }

    public string GenerateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiryHours = config.GetValue<int>("Jwt:ExpiryHours", 24);

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim("username", user.Username),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ],
            expires: DateTime.UtcNow.AddHours(expiryHours),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
