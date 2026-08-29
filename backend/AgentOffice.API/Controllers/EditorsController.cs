using Microsoft.AspNetCore.Mvc;
using System.Xml.Linq;

namespace AgentOffice.API.Controllers;

[ApiController]
[Route("api/editors")]
public class EditorsController(
    IHttpClientFactory httpFactory,
    IConfiguration config,
    ILogger<EditorsController> logger) : ControllerBase
{
    /// <summary>
    /// Returns the WOPI action URL for the configured editor.
    /// Reads Editors:InternalUrl and Editors:PublicUrl from configuration.
    /// </summary>
    [HttpGet("action")]
    public async Task<IActionResult> GetAction([FromQuery] string ext)
    {
        var internalUrl = config["Editors:InternalUrl"]
            ?? throw new InvalidOperationException("Editors:InternalUrl not configured");
        var publicUrl = config["Editors:PublicUrl"] ?? internalUrl;

        try
        {
            using var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(10);

            var discovery = await http.GetStringAsync($"{internalUrl}/hosting/discovery");
            var xml = XDocument.Parse(discovery);
            var normalizedExt = ext.TrimStart('.').ToLowerInvariant();

            var action = xml.Descendants("action")
                .FirstOrDefault(a =>
                    (string?)a.Attribute("ext") == normalizedExt &&
                    (string?)a.Attribute("name") == "edit");

            if (action is null)
                return NotFound(new { error = $"No editor action found for '.{normalizedExt}'" });

            var urlsrc = (string?)action.Attribute("urlsrc") ?? string.Empty;

            // Replace Docker-internal hostname with the browser-accessible public URL.
            if (!string.Equals(internalUrl, publicUrl, StringComparison.OrdinalIgnoreCase))
            {
                var internalOrigin = new Uri(internalUrl).GetLeftPart(UriPartial.Authority);
                var publicOrigin   = new Uri(publicUrl).GetLeftPart(UriPartial.Authority);
                urlsrc = urlsrc.Replace(internalOrigin, publicOrigin, StringComparison.OrdinalIgnoreCase);
            }

            return Ok(new { url = urlsrc });
        }
        catch (TaskCanceledException)
        {
            logger.LogWarning("WOPI editor discovery timed out ({Url})", internalUrl);
            return StatusCode(504, new { error = "Editor did not respond in time." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to fetch WOPI editor discovery ({Url})", internalUrl);
            return StatusCode(502, new { error = "Could not reach editor." });
        }
    }
}
