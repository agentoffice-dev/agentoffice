using Microsoft.AspNetCore.Mvc;
using AgentOffice.API.Services;

namespace AgentOffice.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService auth) : ControllerBase
{
    public record RegisterRequest(string Username, string Email, string Password);
    public record LoginRequest(string Email, string Password);

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var (user, error) = await auth.RegisterAsync(req.Username, req.Email, req.Password);
        if (error is not null) return BadRequest(new { error });

        var token = auth.GenerateToken(user!);
        return Ok(new { token, user = new { user!.Id, user.Username, user.Email } });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var (user, error) = await auth.LoginAsync(req.Email, req.Password);
        if (error is not null) return Unauthorized(new { error });

        var token = auth.GenerateToken(user!);
        return Ok(new { token, user = new { user!.Id, user.Username, user.Email } });
    }
}
